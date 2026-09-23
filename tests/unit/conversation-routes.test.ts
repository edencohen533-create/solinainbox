import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, auth, assignConversation, downloadMedia } = vi.hoisted(() => ({
  db: { conversation: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() }, user: { findFirst: vi.fn() }, conversationTag: { upsert: vi.fn(), deleteMany: vi.fn() }, messageAttachment: { findFirst: vi.fn() } },
  auth: vi.fn(), assignConversation: vi.fn(), downloadMedia: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/realtime/publish", () => ({ publishConversationUpdated: vi.fn() }));
vi.mock("@/server/services/automation-service", () => ({ evaluateTrigger: vi.fn() }));
vi.mock("@/server/providers/provider-registry", () => ({ getActiveProvider: async () => ({ downloadMedia }) }));
vi.mock("@/server/services/conversation-service", () => ({
  buildConversationScope: () => ({ OR: [{ assignedAgentId: "agent" }, { assignedAgentId: null }] }), getConversationForUser: vi.fn(), assignConversation,
}));
import { PATCH } from "@/app/api/conversations/[id]/route";
import { PATCH as assign } from "@/app/api/conversations/[id]/assign/route";
import { POST as addTag, DELETE as removeTag } from "@/app/api/conversations/[id]/tags/route";
import { GET as attachment } from "@/app/api/attachments/[id]/route";
import { GET as messages } from "@/app/api/conversations/[id]/messages/route";
const params = { params: Promise.resolve({ id: "other-conversation" }) };
const request = (body: unknown) => new Request("https://test/api/test", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ user: { id: "agent", role: "AGENT" } }); });
describe("conversation route isolation", () => {
  it("scopes status mutations and returns not found when the scope matches no row", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(request({ status: "CLOSED" }), params)).status).toBe(404);
    expect(db.conversation.updateMany.mock.calls[0][0].where).toHaveProperty("OR");
  });
  it("cannot claim another agent's conversation", async () => {
    db.user.findFirst.mockResolvedValue({ id: "agent" }); assignConversation.mockResolvedValue(null);
    expect((await assign(request({ agentId: "agent" }), params)).status).toBe(404);
    expect(assignConversation.mock.calls[0][3]).toHaveProperty("OR");
  });
  it("cannot change another agent's tags", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    expect((await addTag(request({ tagId: "t" }), params)).status).toBe(404);
    expect((await removeTag(request({ tagId: "t" }), params)).status).toBe(404);
    expect(db.conversationTag.upsert).not.toHaveBeenCalled(); expect(db.conversationTag.deleteMany).not.toHaveBeenCalled();
  });
  it("cannot fetch another agent's media or polling snapshot", async () => {
    db.messageAttachment.findFirst.mockResolvedValue(null); db.conversation.findFirst.mockResolvedValue(null);
    expect((await attachment(new Request("https://test/file"), params)).status).toBe(404);
    expect((await messages(new Request("https://test/messages"), params)).status).toBe(404);
    expect(db.messageAttachment.findFirst.mock.calls[0][0].where.message.conversation).toHaveProperty("OR");
    expect(downloadMedia).not.toHaveBeenCalled();
  });
});
