import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, provider } = vi.hoisted(() => ({
  db: {
    conversation: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    message: { create: vi.fn(), update: vi.fn() },
    template: { findUnique: vi.fn() },
    campaignRecipient: { update: vi.fn() },
  }, provider: { sendMessage: vi.fn(), sendTemplate: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/providers/provider-registry", () => ({ getActiveProvider: async () => provider }));
vi.mock("@/server/services/automation-service", () => ({ evaluateTrigger: vi.fn(), scheduleNoReplyChecks: vi.fn() }));
vi.mock("@/lib/realtime/publish", () => ({ publishNewMessage: vi.fn(), publishConversationUpdated: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
import { createOutboundMessage } from "@/server/services/message-service";
const input = { conversationId: "c", body: "hello", sentByUserId: "u" };
beforeEach(() => {
  vi.resetAllMocks();
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
    db.conversation.findUniqueOrThrow.mockResolvedValue({ contact: { consentStatus: "OPTED_OUT" } });
    await expect(createOutboundMessage(input)).rejects.toThrow("אינו מאשר");
    expect(db.message.create).not.toHaveBeenCalled();
  });
  it("persists the queued message before sending and retains it after an ambiguous timeout", async () => {
    provider.sendMessage.mockImplementation(async () => {
      expect(db.message.create).toHaveBeenCalled();
      throw new Error("timeout");
    });
    await expect(createOutboundMessage(input)).rejects.toThrow("timeout");
    expect(db.message.update).not.toHaveBeenCalled();
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
