import { describe, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { user: { findMany: vi.fn() }, contact: { findUnique: vi.fn() }, conversation: { findMany: vi.fn(), findFirst: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { listUsers } from "@/server/services/user-service";
import { getContact } from "@/server/services/contact-service";
import { listConversations, getConversationForUser } from "@/server/services/conversation-service";
import type { Session } from "next-auth";
const session = { user: { id: "a", role: "ADMIN" } } as Session;
describe("public user data projections", () => {
  it("selects safe fields before serializing the team to a client component", async () => {
    await listUsers();
    const select = db.user.findMany.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined(); expect(select.name).toBe(true);
  });
  it("only includes IDs and names for note authors and message senders", async () => {
    await getContact("c"); await listConversations(session); await getConversationForUser(session, "c");
    expect(db.contact.findUnique.mock.calls[0][0].include.notes.include.author.select).toEqual({ id: true, name: true });
    expect(db.conversation.findMany.mock.calls[0][0].include.assignedAgent.select).toEqual({ id: true, name: true });
    expect(db.conversation.findFirst.mock.calls[0][0].include.messages.include.sentByUser.select).toEqual({ id: true, name: true });
  });
});
