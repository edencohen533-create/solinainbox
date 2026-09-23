const { currentSession } = vi.hoisted(() => ({ currentSession: { user: { id: "tenant-a-user", role: "ADMIN", organizationId: "qa-tenant-a" }, expires: "2099-01-01" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => currentSession }));
import { GET as contactGET } from "@/app/api/contacts/[id]/route";
import { POST as messagePOST } from "@/app/api/conversations/[id]/messages/route";
import { GET as exportGET } from "@/app/api/contacts/export/route";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { systemDatabase } from "@/lib/system-database";
import { withOrganization } from "@/lib/organization-context";
const scope = <T>(id: string, fn: () => Promise<T>) => withOrganization(`qa-tenant-${id}`, fn);

beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("QA namespace required");
  for (const id of ["a", "b"]) {
    await systemDatabase.organization.upsert({ where: { id: `qa-tenant-${id}` }, update: {}, create: { id: `qa-tenant-${id}`, name: `Synthetic tenant ${id}` } });
    await scope(id, async () => {
      await prisma.user.upsert({ where: { id: `tenant-${id}-user` }, update: {}, create: { id: `tenant-${id}-user`, email: `tenant-${id}@example.test`, name: id, role: "ADMIN", passwordHash: "not-a-login-hash" } });
      // The same person may legitimately belong to two unrelated businesses.
      await prisma.contact.upsert({ where: { id: `tenant-${id}-contact` }, update: {}, create: { id: `tenant-${id}-contact`, name: `Synthetic business ${id} contact`, phone: "+972509998899" } });
      await prisma.conversation.upsert({ where: { id: `tenant-${id}-conversation` }, update: {}, create: { id: `tenant-${id}-conversation`, contactId: `tenant-${id}-contact`, assignedAgentId: `tenant-${id}-user` } });
      await prisma.providerCredential.upsert({ where: { id: `tenant-${id}-credential` }, update: {}, create: { id: `tenant-${id}-credential`, provider: "mock", isActive: true, config: { private: id } } });
    });
  }
}, 120000);

afterAll(async () => { await systemDatabase.$disconnect(); });

describe("PostgreSQL business isolation (real database, synthetic records)", () => {
  it("enforces SELECT, UPDATE and DELETE in the database including raw SQL", async () => {
    await scope("a", async () => {
      expect((await prisma.contact.findMany()).every((row) => row.organizationId === "qa-tenant-a")).toBe(true);
      expect(await prisma.contact.findUnique({ where: { id: "tenant-b-contact" } })).toBeNull();
      expect((await prisma.contact.updateMany({ where: { id: "tenant-b-contact" }, data: { name: "attack" } })).count).toBe(0);
      expect((await prisma.contact.deleteMany({ where: { id: "tenant-b-contact" } })).count).toBe(0);
      expect(await prisma.$queryRaw`SELECT id FROM "Contact" WHERE id = 'tenant-b-contact'`).toEqual([]);
      expect(await prisma.providerCredential.findUnique({ where: { id: "tenant-b-credential" } })).toBeNull();
      const role = await prisma.$queryRaw<Array<{ current_user: string; schema: string }>>`SELECT current_user, current_schema() AS schema`;
      expect(role[0].schema).toBe("solina_qa_20260923");
      expect(role[0].current_user).toBe("solina_runtime");
    });
  });
  it("rejects forged tenant ownership and cross-tenant foreign keys including nested writes", async () => {
    await scope("a", async () => {
      await expect(prisma.contact.create({ data: { organizationId: "qa-tenant-b", name: "forged", phone: "+972509998800" } })).rejects.toThrow();
      await expect(prisma.conversation.create({ data: { contactId: "tenant-b-contact" } })).rejects.toThrow();
      await expect(prisma.conversation.update({ where: { id: "tenant-a-conversation" }, data: { assignedAgentId: "tenant-b-user" } })).rejects.toThrow();
      await expect(prisma.note.create({ data: { conversationId: "tenant-b-conversation", authorId: "tenant-a-user", body: "forged nested relationship" } })).rejects.toThrow();
      await expect(prisma.message.create({ data: { conversationId: "tenant-a-conversation", direction: "OUTBOUND", type: "TEXT", providerCredentialId: "tenant-b-credential" } })).rejects.toThrow();
    });
  });
  it("keeps relation includes and concurrent pooled requests scoped and clears transaction-local role", async () => {
    const results = await Promise.all(["a", "b", "a", "b"].map((id) => scope(id, async () => {
      const rows = await prisma.conversation.findMany({ include: { contact: true, assignedAgent: true } });
      expect(rows).toHaveLength(1);
      expect(rows[0].contact.organizationId).toBe(`qa-tenant-${id}`);
      expect(rows[0].assignedAgent?.organizationId).toBe(`qa-tenant-${id}`);
      return rows[0].organizationId;
    })));
    expect(results).toEqual(["qa-tenant-a", "qa-tenant-b", "qa-tenant-a", "qa-tenant-b"]);
    await expect(prisma.contact.count()).rejects.toThrow("context is required");
    const result = await systemDatabase.$queryRaw<Array<{ tenant: string | null; current_user: string }>>`SELECT NULLIF(current_setting('solina.organization_id', true), '') as tenant, current_user`;
    expect(result[0].tenant).toBeNull();
    expect(result[0].current_user).not.toBe("solina_runtime");
  });
  it("enforces isolation through actual API handlers with authenticated session fixtures", async () => {
    const foreign = await contactGET(new Request("https://qa/api/contacts/tenant-b-contact"), { params: Promise.resolve({ id: "tenant-b-contact" }) });
    expect(foreign.status).toBe(404);
    const send = await messagePOST(new Request("https://qa/api/conversations/tenant-b-conversation/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "must not send", requestKey: "cross-tenant-qa" }) }), { params: Promise.resolve({ id: "tenant-b-conversation" }) });
    expect(send.status).toBe(404);
    const csv = await exportGET(new Request("https://qa/api/contacts/export"));
    expect(csv.status).toBe(200);
    const text = await csv.text();
    expect(text).toContain("Synthetic business a contact");
    expect(text).not.toContain("Synthetic business b contact");
  });
  it("denies all rows and writes when the runtime role has no tenant context", async () => {
    await systemDatabase.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE solina_runtime`;
      expect(await tx.contact.count()).toBe(0);
      await expect(tx.contact.create({ data: { name: "missing tenant", phone: "+972509998801" } })).rejects.toThrow();
    });
  });
});
