import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, send } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    template: { findUnique: vi.fn() },
    campaignRecipient: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    campaign: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    contact: { findUniqueOrThrow: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
  }, send: vi.fn(),
}));
vi.mock("@/server/services/campaign-snapshot", () => ({ activeSenderSnapshot: async () => "mock", templateFingerprint: () => "fingerprint" }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/message-service", () => ({ createOutboundMessage: send, MessagePolicyError: class extends Error {} }));
import { processDueCampaigns } from "@/jobs/campaign-runner";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.template.findUnique.mockResolvedValue({ status: "APPROVED" });
  db.campaignRecipient.updateMany.mockResolvedValue({ count: 1 });
  db.campaignRecipient.findMany.mockResolvedValue([{ id: "r", campaignId: "c", contactId: "p" }]);
  db.campaign.findUniqueOrThrow.mockResolvedValue({ id: "c", status: "RUNNING", senderSnapshot: "mock", templateSnapshot: "fingerprint", createdById: "u", templateId: "t", variables: { "1": "{name}" }, createdBy: { isActive: true, role: "MANAGER" } });
  db.contact.findUniqueOrThrow.mockResolvedValue({ id: "p", name: "דנה", consentStatus: "OPTED_IN" });
  db.conversation.findFirst.mockResolvedValue({ id: "conv" });
  send.mockResolvedValue({ message: { id: "m", status: "SENT" } });
});
describe("campaign worker", () => {
  it("does not send when another worker already claimed the recipient", async () => {
    db.campaignRecipient.updateMany.mockResolvedValue({ count: 0 });
    await processDueCampaigns();
    expect(send).not.toHaveBeenCalled();
  });
  it("rechecks opt-in immediately before dispatch", async () => {
    db.contact.findUniqueOrThrow.mockResolvedValue({ id: "p", consentStatus: "OPTED_OUT" });
    await processDueCampaigns();
    expect(send).not.toHaveBeenCalled();
    expect(db.campaignRecipient.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }));
  });
  it("stops when the campaign is paused after the claim", async () => {
    db.campaign.findUniqueOrThrow.mockResolvedValue({ status: "PAUSED" });
    await processDueCampaigns();
    expect(send).not.toHaveBeenCalled();
  });
  it("pauses if its creator has been deactivated", async () => {
    db.campaign.findUniqueOrThrow.mockResolvedValue({ id: "c", status: "RUNNING", createdBy: { isActive: false } });
    await processDueCampaigns();
    expect(send).not.toHaveBeenCalled();
    expect(db.campaign.updateMany).toHaveBeenCalledWith({ where: { id: "c", status: "RUNNING" }, data: { status: "PAUSED" } });
  });
  it("personalizes and records the message ID", async () => {
    await processDueCampaigns();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ templateVariables: { "1": "דנה" }, requireOptIn: true }));
    expect(db.campaignRecipient.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT", messageId: "m" }) }));
  });
  it("records ambiguous outcomes without automatically resending", async () => {
    send.mockRejectedValue(new Error("timeout"));
    await processDueCampaigns();
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.campaignRecipient.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "UNKNOWN" }) }));
  });
  it("marks stale claims unknown instead of returning them to the send queue", async () => {
    await processDueCampaigns();
    expect(db.campaignRecipient.updateMany.mock.calls[0][0]).toEqual(expect.objectContaining({ where: expect.objectContaining({ status: "PROCESSING" }), data: expect.objectContaining({ status: "UNKNOWN" }) }));
  });
});
it("pauses when the approved template is disabled before dispatch", async () => {
  db.template.findUnique.mockResolvedValue({ status: "REJECTED" });
  await processDueCampaigns();
  expect(send).not.toHaveBeenCalled();
  expect(db.campaign.updateMany).toHaveBeenCalledWith({ where: { id: "c", status: "RUNNING" }, data: { status: "PAUSED" } });
});
it("pauses legacy campaigns with no sender snapshot", async () => {
  const campaign = await db.campaign.findUniqueOrThrow();
  db.campaign.findUniqueOrThrow.mockResolvedValue({ ...campaign, senderSnapshot: null });
  await processDueCampaigns();
  expect(send).not.toHaveBeenCalled();
});
it("simulates 10,000 recipients through real bounded worker loops without a network provider", async () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `r${i}`, campaignId: "c", contactId: `p${i}`, status: "QUEUED" }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  db.campaignRecipient.findMany.mockImplementation(async () => rows.filter((r) => r.status === "QUEUED").slice(0, 20));
  db.campaignRecipient.updateMany.mockImplementation(async ({ where }: { where: { id?: string } }) => {
    const row = where.id ? byId.get(where.id) : null;
    if (!row || row.status !== "QUEUED") return { count: 0 };
    row.status = "PROCESSING"; return { count: 1 };
  });
  db.campaignRecipient.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: { status: string } }) => Object.assign(byId.get(where.id)!, data));
  for (let i = 0; i < 500; i++) await processDueCampaigns();
  expect(send).toHaveBeenCalledTimes(10000);
  expect(rows.filter((r) => r.status === "SENT")).toHaveLength(10000);
  await processDueCampaigns(); expect(send).toHaveBeenCalledTimes(10000);
});
