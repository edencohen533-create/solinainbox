import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, auth, campaignActor, createCampaign, evaluateTrigger } = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), $queryRaw: vi.fn(), conversation: { findFirst: vi.fn() }, note: { create: vi.fn() }, auditLog: { create: vi.fn() }, contact: { findMany: vi.fn() }, campaign: { findUnique: vi.fn() }, automationRule: { updateMany: vi.fn() }, automationRun: { updateMany: vi.fn() }, tag: { findUnique: vi.fn() }, conversationTag: { createMany: vi.fn() } },
  auth: vi.fn(), campaignActor: vi.fn(), createCampaign: vi.fn(), evaluateTrigger: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/campaign-auth", () => ({ campaignActor }));
vi.mock("@/server/services/campaign-service", () => ({ createCampaign, CampaignError: class extends Error {} }));
vi.mock("@/server/services/automation-service", () => ({ evaluateTrigger }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
import { POST as note } from "@/app/api/conversations/[id]/notes/route";
import { GET as messages } from "@/app/api/conversations/[id]/messages/route";
import { GET as exportContacts } from "@/app/api/contacts/export/route";
import { POST as stop } from "@/app/api/automations/stop/route";
import { POST as duplicate } from "@/app/api/campaigns/[id]/duplicate/route";
import { POST as tag } from "@/app/api/conversations/[id]/tags/route";
const params = { params: Promise.resolve({ id: "conv" }) };
const post = (body: unknown) => new Request("https://test/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ user: { id: "agent", role: "AGENT" } });
  db.$transaction.mockImplementation((fn) => fn(db));
});
describe("operational routes", () => {
  it("never writes a note into another agent's conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    expect((await note(post({ body: "internal" }), params)).status).toBe(404);
    expect(db.conversation.findFirst.mock.calls[0][0].where.AND).toEqual([{ OR: [{ assignedAgentId: "agent" }, { assignedAgentId: null }] }, { OR: [{ providerCredentialId: null }, { providerCredential: { teamId: null } }] }]);
    expect(db.note.create).not.toHaveBeenCalled();
  });
  it("links internal notes to the CRM contact without creating a WhatsApp message", async () => {
    db.conversation.findFirst.mockResolvedValue({ contactId: "contact" });
    db.note.create.mockResolvedValue({ id: "note" });
    expect((await note(post({ body: "internal" }), params)).status).toBe(201);
    expect(db.note.create.mock.calls[0][0].data).toMatchObject({ contactId: "contact", conversationId: "conv", authorId: "agent" });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("rejects invalid pagination and keeps both timestamp and id as page boundaries", async () => {
    expect((await messages(new Request("https://test/api?beforeId=foreign"), params)).status).toBe(400);
    expect(db.conversation.findFirst).not.toHaveBeenCalled();
    db.conversation.findFirst.mockResolvedValue({ messages: Array.from({ length: 101 }, (_, i) => ({ id: String(i) })), lastInboundAt: null });
    const response = await messages(new Request("https://test/api?before=2026-09-23T08:00:00.000Z&beforeId=cursor"), params);
    const data = await response.json();
    expect(data.hasMore).toBe(true); expect(data.messages).toHaveLength(100); expect(data.messages[0].id).toBe("99");
    expect(db.conversation.findFirst.mock.calls[0][0].select.messages.where.OR[1]).toEqual({ createdAt: new Date("2026-09-23T08:00:00Z"), id: { lt: "cursor" } });
  });
  it("denies agents export, bulk automation stop and campaign duplication", async () => {
    campaignActor.mockResolvedValue(null);
    expect((await exportContacts(new Request("https://test/export"))).status).toBe(403);
    expect((await stop()).status).toBe(403);
    expect((await duplicate(post({}), params)).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled(); expect(db.contact.findMany).not.toHaveBeenCalled();
  });
  it("stops rules and only pending runs together with an audit record", async () => {
    auth.mockResolvedValue({ user: { id: "manager", role: "MANAGER" } });
    db.automationRule.updateMany.mockResolvedValue({ count: 2 }); db.automationRun.updateMany.mockResolvedValue({ count: 4 });
    expect(await (await stop()).json()).toEqual({ stoppedRules: 2, cancelledPendingRuns: 4 });
    expect(db.automationRun.updateMany.mock.calls[0][0].where).toEqual({ status: "PENDING" });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("duplicates campaign content into a new draft, not its old delivery state", async () => {
    campaignActor.mockResolvedValue({ id: "manager" });
    db.campaign.findUnique.mockResolvedValue({ name: "Original", listId: "l", excludedListIds: ["excluded"], templateId: "t", variables: { "1": "{name}" }, status: "COMPLETED", scheduledAt: new Date() });
    createCampaign.mockResolvedValue({ id: "copy", status: "DRAFT" });
    expect((await duplicate(post({}), params)).status).toBe(201);
    expect(createCampaign).toHaveBeenCalledWith({ name: "Original — העתק", listId: "l", excludedListIds: ["excluded"], templateId: "t", variables: { "1": "{name}" } }, "manager");
  });
  it("does not re-trigger automation for an already attached tag", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: "conv" }); db.tag.findUnique.mockResolvedValue({ id: "tag" });
    db.conversationTag.createMany.mockResolvedValue({ count: 0 });
    expect((await tag(post({ tagId: "tag" }), params)).status).toBe(200);
    expect(evaluateTrigger).not.toHaveBeenCalled();
  });
});
