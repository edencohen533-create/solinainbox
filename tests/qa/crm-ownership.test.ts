const { session } = vi.hoisted(() => ({ session: { user: { id: "", name: "QA", email: "qa@example.test", role: "ADMIN", organizationId: "", teamId: null }, expires: "2099-01-01" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => session }));
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { withOrganization } from "@/lib/organization-context";
import { systemDatabase } from "@/lib/system-database";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "@/app/api/contacts/[id]/route";
import { previewAudience, audienceWhere } from "@/server/services/audience-service";
const org = `qa-owner-${Date.now()}`;
let admin: string, agent: string, other: string, foreign: string, contact: string;
const scoped = (fn: () => Promise<void>) => () => withOrganization(org, fn);
const patch = (id: string, data: unknown) => PATCH(new Request("https://qa/api/contacts", { method: "PATCH", body: JSON.stringify(data) }), { params: Promise.resolve({ id }) });
const get = (id: string) => GET(new Request("https://qa/api/contacts"), { params: Promise.resolve({ id }) });
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Isolated QA required");
  await systemDatabase.organization.create({ data: { id: org, name: "Ownership QA" } });
  await systemDatabase.organization.create({ data: { id: `${org}-foreign`, name: "Foreign QA" } });
  foreign = await withOrganization(`${org}-foreign`, async () => (await prisma.user.create({ data: { name: "Foreign", email: `${org}-foreign@example.test`, passwordHash: "invalid" } })).id);
  session.user.organizationId = org;
  await withOrganization(org, async () => {
    const users = await prisma.user.createManyAndReturn({ data: ["Admin", "Agent", "Other"].map((name) => ({ name, email: `${org}-${name}@example.test`, passwordHash: "invalid", role: name === "Admin" ? "ADMIN" as const : "AGENT" as const })) });
    admin = users.find((u) => u.name === "Admin")!.id; agent = users.find((u) => u.name === "Agent")!.id; other = users.find((u) => u.name === "Other")!.id;
    session.user.id = admin;
    const created = await prisma.contact.create({ data: { name: "Lead", phone: "+972509334331", consentStatus: "OPTED_IN" } });
    contact = created.id; expect(created.leadStage).toBe("NEW");
  });
});
afterAll(async () => { await systemDatabase.$disconnect(); });
it("assigns an independent CRM owner and enforces agent visibility and transfer permissions", scoped(async () => {
  expect((await patch(contact, { ownerId: agent, leadStage: "QUALIFIED" })).status).toBe(200);
  session.user.id = other; session.user.role = "AGENT";
  expect((await get(contact)).status).toBe(404);
  expect((await patch(contact, { leadStage: "LOST" })).status).toBe(404);
  session.user.id = agent;
  expect((await get(contact)).status).toBe(200);
  expect((await patch(contact, { ownerId: null })).status).toBe(403);
  expect((await patch(contact, { leadStage: "CONTACTED" })).status).toBe(200);
  const thread = await prisma.conversation.create({ data: { contactId: contact, assignedAgentId: other, source: "MOCK" } });
  const owned = await (await get(contact)).json(); expect(owned.contact.conversations).toEqual([]);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: thread.id } })).assignedAgentId).toBe(other);
  expect(await prisma.auditLog.count({ where: { action: "contact.updated", entityId: contact } })).toBe(2);
}));
it("rejects foreign owners at API and database boundaries and invalid CRM stages", scoped(async () => {
  session.user.id = admin; session.user.role = "ADMIN";
  expect((await patch(contact, { ownerId: foreign })).status).toBe(400);
  expect((await patch(contact, { leadStage: "invented" })).status).toBe(400);
  await expect(prisma.contact.update({ where: { id: contact }, data: { ownerId: foreign } })).rejects.toMatchObject({ code: "P2003" });
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: contact } })).ownerId).toBe(agent);
  await withOrganization(`${org}-foreign`, async () => { expect(await prisma.contact.findUnique({ where: { id: contact } })).toBeNull(); });
}));
it("segments by owner and CRM stage, preserves nulls under exclusion, rejects foreign references", scoped(async () => {
  await prisma.contact.create({ data: { name: "Historical unclassified", phone: "+972509334332", leadStage: null, consentStatus: "OPTED_IN" } });
  const preview = await previewAudience({ segment: { operator: "AND", conditions: [{ field: "owner", operator: "is", value: agent }, { field: "leadStage", operator: "is", value: "CONTACTED" }] } });
  expect(preview.matched).toBe(1); expect(preview.eligible).toBe(1);
  expect(await prisma.contact.count({ where: { NOT: audienceWhere({ field: "owner", operator: "is", value: agent }) } })).toBe(1);
  expect(await prisma.contact.count({ where: { NOT: audienceWhere({ field: "leadStage", operator: "is", value: "CONTACTED" }) } })).toBe(1);
  await expect(previewAudience({ segment: { field: "owner", operator: "is", value: foreign } })).rejects.toThrow("אינו נגיש");
}));
