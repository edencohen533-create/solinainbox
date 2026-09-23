import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, provider } = vi.hoisted(() => ({
  db: {
    conversation: { findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    contact: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    template: { findUnique: vi.fn() },
    campaignRecipient: { update: vi.fn() },
  }, provider: { sendMessage: vi.fn(), sendTemplate: vi.fn(), requiresVerifiedInbound: false },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/providers/provider-registry", () => ({ getActiveProvider: async () => provider }));
vi.mock("@/server/services/automation-service", () => ({ evaluateTrigger: vi.fn(), scheduleNoReplyChecks: vi.fn() }));
vi.mock("@/lib/realtime/publish", () => ({ publishNewMessage: vi.fn(), publishConversationUpdated: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
import { createOutboundMessage } from "@/server/services/message-service";
const input = { conversationId: "c", body: "hello", sentByUserId: "u" };
beforeEach(() => {
  vi.resetAllMocks(); provider.requiresVerifiedInbound = false;
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.contact.updateMany.mockResolvedValue({ count: 1 });
  db.contact.findUniqueOrThrow.mockResolvedValue({ id: "p", consentStatus: "OPTED_IN" });
  db.conversation.findUniqueOrThrow.mockResolvedValue({ id: "c", lastInboundAt: new Date(), contact: { phone: "+972501234567", consentStatus: "OPTED_IN" } });
  db.message.create.mockResolvedValue({ id: "m" });
  db.message.update.mockResolvedValue({ id: "m", status: "SENT", createdAt: new Date() });
  provider.sendMessage.mockResolvedValue({ providerMessageId: "remote", status: "SENT" });
  provider.sendTemplate.mockResolvedValue({ providerMessageId: "remote", status: "SENT" });
});
describe("outbound message policies", () => {
  it("enforces the reply window at the service layer, including automations", async () => {
    db.conversation.findUniqueOrThrow.mockResolvedValue({ lastInboundAt: null, contact: { consentStatus: "OPTED_IN" } });
    await expect(createOutboundMessage(input)).rejects.toThrow("חלון המענה");
    expect(provider.sendMessage).not.toHaveBeenCalled();
  });
  it("rejects opted-out contacts before any provider request", async () => {
    db.conversation.findUniqueOrThrow.mockResolvedValue({ lastInboundAt: new Date(), contact: { consentStatus: "OPTED_OUT" } });
    await expect(createOutboundMessage({ ...input, requireOptIn: true })).rejects.toThrow("אינו מאשר");
    expect(db.message.create).not.toHaveBeenCalled();
  });
  it("persists the queued message before sending and retains it after an ambiguous timeout", async () => {
    provider.sendMessage.mockImplementation(async () => {
      expect(db.message.create).toHaveBeenCalled();
      throw new Error("timeout");
    });
    await expect(createOutboundMessage(input)).rejects.toThrow("timeout");
    expect(db.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "UNKNOWN" }) }));
    expect(provider.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("renders approved templates outside the reply window and stores TEMPLATE type", async () => {
    db.conversation.findUniqueOrThrow.mockResolvedValue({ lastInboundAt: null, contact: { consentStatus: "OPTED_IN", phone: "+972501234567" } });
    db.template.findUnique.mockResolvedValue({ status: "APPROVED", body: "שלום {{1}}" });
    await createOutboundMessage({ ...input, templateId: "t", templateVariables: { "1": "דנה" } });
    expect(db.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "TEMPLATE", body: "שלום דנה", status: "QUEUED" }) });
    expect(provider.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateVariables: { "1": "דנה" } }));
  });
});

it("never treats historical demo messages as a real Meta reply window", async () => {
  provider.requiresVerifiedInbound = true;
  db.message.findFirst.mockResolvedValue(null);
  await expect(createOutboundMessage(input)).rejects.toThrow("הודעת לקוח אמיתית");
  expect(provider.sendMessage).not.toHaveBeenCalled(); expect(db.message.create).not.toHaveBeenCalled();
});

it("rejects a second representative while a send lease is held", async () => {
  db.conversation.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(createOutboundMessage(input)).rejects.toThrow("הודעה אחרת");
  expect(provider.sendMessage).not.toHaveBeenCalled();
});
it("reuses an accepted request key without calling the provider twice", async () => {
  db.message.findUnique.mockResolvedValue({ id: "m", conversationId: "c", sentByUserId: "u", status: "ACCEPTED" });
  expect((await createOutboundMessage({ ...input, requestKey: "key" })).message.id).toBe("m");
  expect(provider.sendMessage).not.toHaveBeenCalled();
});
it("never retries an ambiguous request key", async () => {
  db.message.findUnique.mockResolvedValue({ conversationId: "c", sentByUserId: "u", status: "UNKNOWN" });
  await expect(createOutboundMessage({ ...input, requestKey: "key" })).rejects.toThrow("אינה ודאית");
  expect(provider.sendMessage).not.toHaveBeenCalled();
});
it("enforces the marketing reservation across automation and campaign sends", async () => {
  db.template.findUnique.mockResolvedValue({ status: "APPROVED", category: "MARKETING", body: "hello" });
  db.contact.updateMany.mockResolvedValue({ count: 0 });
  await expect(createOutboundMessage({ ...input, templateId: "t" })).rejects.toThrow("מגבלת דיוור");
  expect(provider.sendTemplate).not.toHaveBeenCalled();
});
it("checks opt-out again after a message is prepared", async () => {
  db.contact.findUniqueOrThrow.mockResolvedValue({ consentStatus: "OPTED_OUT" });
  await expect(createOutboundMessage({ ...input, requireOptIn: true })).rejects.toThrow("אינו מאשר");
  expect(provider.sendMessage).not.toHaveBeenCalled();
});
it("stores provider acceptance separately from sent", async () => {
  provider.sendMessage.mockResolvedValue({ providerMessageId: "remote", status: "ACCEPTED" });
  await createOutboundMessage(input);
  expect(db.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED", providerMessageId: "remote" }) }));
});
