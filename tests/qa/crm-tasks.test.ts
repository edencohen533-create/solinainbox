const { currentSession } = vi.hoisted(() => ({ currentSession: { user: { id: "", name: "QA", email: "qa@example.test", role: "ADMIN", organizationId: "", teamId: null }, expires: "2099-01-01" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => currentSession }));
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { withOrganization } from "@/lib/organization-context";
import { systemDatabase } from "@/lib/system-database";
import { prisma } from "@/lib/prisma";
import { POST, GET } from "@/app/api/tasks/route";
import { PATCH } from "@/app/api/tasks/[id]/route";
import { startConversation } from "@/server/services/conversation-service";
import { createOutboundMessage } from "@/server/services/message-service";
import { setRealtimePublisher } from "@/lib/realtime/publish";
const org = `qa-tasks-${Date.now()}`;
let admin: string, agent: string, otherAgent: string, contactId: string, conversationId: string, taskId: string;
const scope = (fn: () => Promise<void>) => () => withOrganization(org, fn);
const request = (body: unknown) => new Request("https://qa/api/tasks", { method: "POST", body: JSON.stringify(body) });
const patch = (id: string, data: unknown) => PATCH(request(data), { params: Promise.resolve({ id }) });
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Isolated QA required");
  await systemDatabase.organization.create({ data: { id: org, name: "Task QA" } });
  currentSession.user.organizationId = org;
  setRealtimePublisher({ publish: async () => {} });
  await withOrganization(org, async () => {
    const users = await prisma.user.createManyAndReturn({ data: [
      { name: "Admin", email: `${org}-admin@example.test`, role: "ADMIN", passwordHash: "not-a-password" },
      { name: "Agent", email: `${org}-agent@example.test`, role: "AGENT", passwordHash: "not-a-password" },
      { name: "Other agent", email: `${org}-other@example.test`, role: "AGENT", passwordHash: "not-a-password" },
    ] });
    admin = users.find((u) => u.name === "Admin")!.id; agent = users.find((u) => u.name === "Agent")!.id; otherAgent = users.find((u) => u.name === "Other agent")!.id;
    currentSession.user.id = admin;
    contactId = (await prisma.contact.create({ data: { name: "Opted-out service customer", phone: "+972509333331", consentStatus: "OPTED_OUT" } })).id;
    conversationId = (await prisma.conversation.create({ data: { contactId, assignedAgentId: agent, source: "MOCK", lastInboundAt: new Date() } })).id;
  });
});
afterAll(async () => { await systemDatabase.$disconnect(); });
it("creates idempotently through API, rejects stale edits, and preserves audit history", scope(async () => {
  const data = { contactId, conversationId, assignedToId: agent, title: "Call customer", dueAt: "2026-10-01T10:00:00+03:00", requestKey: randomUUID() };
  const [first, second] = await Promise.all([POST(request(data)), POST(request(data))]);
  expect(first.status).toBe(201); expect(second.status).toBe(201);
  taskId = (await first.json()).task.id; expect((await second.json()).task.id).toBe(taskId);
  expect(await prisma.contactTask.count()).toBe(1); expect(await prisma.auditLog.count({ where: { action: "task.created" } })).toBe(1);
  const done = await patch(taskId, { status: "DONE", version: 0 }); expect(done.status).toBe(200);
  expect((await done.json()).task).toMatchObject({ status: "DONE", version: 1 });
  expect((await patch(taskId, { title: "stale", version: 0 })).status).toBe(409);
  expect((await prisma.contactTask.findUniqueOrThrow({ where: { id: taskId } })).title).toBe("Call customer");
  const listed = await GET(new Request(`https://qa/api/tasks?contactId=${contactId}`)); expect(listed.status).toBe(200); expect((await listed.json()).total).toBe(1);
}));
it("enforces agent, business, assignee and conversation-contact boundaries", scope(async () => {
  currentSession.user.id = otherAgent; currentSession.user.role = "AGENT";
  expect((await GET(new Request(`https://qa/api/tasks?contactId=${contactId}`))).status).toBe(404);
  expect((await patch(taskId, { title: "forbidden", version: 1 })).status).toBe(404);
  currentSession.user.id = agent;
  expect((await patch(taskId, { assignedToId: otherAgent, version: 1 })).status).toBe(403);
  currentSession.user.role = "ADMIN"; currentSession.user.id = admin;
  const otherContact = await prisma.contact.create({ data: { name: "Other", phone: "+972509333332" } });
  expect((await POST(request({ contactId: otherContact.id, conversationId, assignedToId: agent, title: "Wrong contact", dueAt: new Date().toISOString(), requestKey: randomUUID() }))).status).toBe(404);
  await expect(prisma.contactTask.create({ data: { contactId: otherContact.id, conversationId, assignedToId: agent, createdById: admin, title: "Direct invalid relation", dueAt: new Date(), requestKey: randomUUID() } })).rejects.toMatchObject({ code: "P2003" });
  const foreign = `${org}-foreign`; await systemDatabase.organization.create({ data: { id: foreign, name: "Foreign" } });
  await withOrganization(foreign, async () => {
    expect(await prisma.contactTask.count()).toBe(0);
    expect((await prisma.contactTask.updateMany({ where: { id: taskId }, data: { title: "foreign" } })).count).toBe(0);
    expect((await prisma.contactTask.deleteMany({ where: { id: taskId } })).count).toBe(0);
    await expect(prisma.contactTask.create({ data: { contactId, conversationId, assignedToId: agent, createdById: admin, title: "Foreign insert", dueAt: new Date(), requestKey: randomUUID() } })).rejects.toMatchObject({ code: "P2003" });
  });
}));
it("opens an opted-out customer's service thread while still denying marketing and expired-window replies", scope(async () => {
  const session = currentSession as Session;
  expect((await startConversation(session, contactId, agent, null)).id).toBe(conversationId);
  const sent = await createOutboundMessage({ conversationId, sentByUserId: admin, body: "Service reply", requestKey: randomUUID() });
  expect(sent.message.status).toBe("SENT");
  const template = await prisma.template.create({ data: { name: "task_marketing", language: "he", body: "Marketing", variables: [], category: "MARKETING", status: "APPROVED" } });
  await expect(createOutboundMessage({ conversationId, sentByUserId: admin, body: "Marketing", templateId: template.id, templateVariables: {}, requestKey: randomUUID() })).rejects.toThrow("דיוור");
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastInboundAt: null } });
  await expect(createOutboundMessage({ conversationId, sentByUserId: admin, body: "Late reply", requestKey: randomUUID() })).rejects.toThrow("חלון");
  expect(await prisma.message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
}));
