const { currentSession } = vi.hoisted(() => ({ currentSession: { user: { id: "audience-admin", role: "ADMIN", organizationId: "qa-audiences" }, expires: "2099-01-01" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => currentSession }));
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { systemDatabase } from "@/lib/system-database";
import { withOrganization } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";
import { audienceWhere, previewAudience } from "@/server/services/audience-service";
import { saveDistributionList } from "@/server/services/distribution-list-service";
import { createCampaign, changeCampaignStatus } from "@/server/services/campaign-service";
import { processDueCampaigns } from "@/jobs/campaign-runner";
import { POST as importCSV } from "@/app/api/distribution-lists/import/route";
import type { AudienceNode } from "@/lib/audiences";
const scope = (fn: () => Promise<void>) => () => withOrganization("qa-audiences", fn);
const rule: AudienceNode = { operator: "AND", conditions: [
  { field: "source", operator: "equals", value: "web" },
  { operator: "OR", conditions: [{ field: "tag", operator: "is", value: "audience-vip" }, { field: "custom", operator: "equals", key: "מוצר", value: "ספר" }] },
] };
let listId: string, excludedId: string;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Isolated QA required");
  await systemDatabase.organization.create({ data: { id: "qa-audiences", name: "Synthetic audience QA" } });
  await withOrganization("qa-audiences", async () => {
    await prisma.user.create({ data: { id: "audience-admin", name: "Audience QA", email: "audience-admin@example.test", passwordHash: "not-a-login-hash", role: "ADMIN" } });
    await prisma.tag.create({ data: { id: "audience-vip", name: "VIP" } });
    for (let i = 0; i < 4; i++) await prisma.contact.create({ data: {
      id: `audience-${i}`, name: `Audience ${i}`, phone: `+97250988888${i}`, source: i === 3 ? "other" : "web", consentStatus: "OPTED_IN",
      ...(i !== 1 ? { tags: { create: { tagId: "audience-vip" } } } : { customFields: { create: { key: "מוצר", value: "ספר" } } }),
    } });
    await prisma.template.create({ data: { id: "audience-template", name: "audience_test", language: "he", body: "שלום", variables: [], status: "APPROVED", category: "UTILITY" } });
    listId = (await saveDistributionList({ name: "Saved AND OR", contactIds: [], segment: rule }, "audience-admin")).id;
    excludedId = (await saveDistributionList({ name: "Excluded", contactIds: ["audience-2"] }, "audience-admin")).id;
  });
});
afterAll(async () => { await systemDatabase.$disconnect(); });
it("evaluates saved nested conditions and exclusions with accurate unique counts", scope(async () => {
  const preview = await previewAudience({ listId, excludedListIds: [excludedId] });
  expect(preview).toMatchObject({ matched: 3, excluded: 1, remaining: 2, eligible: 2, ineligible: 0 });
  expect(preview.samples.map((sample) => sample.name).sort()).toEqual(["Audience 0", "Audience 1"]);
  await expect(previewAudience({ listId, excludedListIds: ["foreign-list"] })).rejects.toThrow("נגישים");
  await expect(previewAudience({ segment: { field: "tag", operator: "is_not", value: "foreign-tag" } })).rejects.toThrow("אינו נגיש");
}));
it("freezes recipient and exclusion snapshots, then checks a later opt-out at dispatch", scope(async () => {
  const campaign = await createCampaign({ name: "Frozen audience", listId, excludedListIds: [excludedId], templateId: "audience-template", variables: {} }, "audience-admin");
  expect(campaign.audienceExcludedCount).toBe(1);
  await changeCampaignStatus(campaign.id, "start");
  await prisma.contact.update({ where: { id: "audience-0" }, data: { consentStatus: "OPTED_OUT" } });
  await prisma.contact.create({ data: { id: "audience-later", name: "Later", phone: "+972509888899", source: "web", consentStatus: "OPTED_IN", tags: { create: { tagId: "audience-vip" } } } });
  await saveDistributionList({ name: "Changed after schedule", contactIds: ["audience-later"] }, "audience-admin", listId);
  await processDueCampaigns();
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id }, orderBy: { contactId: "asc" } });
  expect(recipients.map((row) => row.contactId)).toEqual(["audience-0", "audience-1", "audience-2"]);
  expect(recipients.map((row) => row.status)).toEqual(["SKIPPED", "SENT", "SKIPPED"]);
  expect(await prisma.message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
  expect(await prisma.contact.count({ where: audienceWhere({ field: "campaign", operator: "is", value: campaign.id, result: "SENT" }) })).toBe(1);
}));
it("uses the latest message across threads rather than any historical matching date", scope(async () => {
  const old = await prisma.conversation.create({ data: { contactId: "audience-3", assignedAgentId: "audience-admin", messages: { create: { direction: "INBOUND", type: "TEXT", createdAt: new Date("2025-01-01T00:00:00Z") } } } });
  expect(await prisma.contact.count({ where: audienceWhere({ field: "lastInbound", operator: "before", value: "2026-01-01T00:00:00Z" }) })).toBe(1);
  await prisma.conversation.create({ data: { contactId: "audience-3", messages: { create: { direction: "INBOUND", type: "TEXT", createdAt: new Date("2026-08-01T00:00:00Z") } } } });
  expect(await prisma.contact.count({ where: audienceWhere({ field: "lastInbound", operator: "before", value: "2026-01-01T00:00:00Z" }) })).toBe(0);
  expect(await prisma.contact.count({ where: audienceWhere({ field: "lastInbound", operator: "after", value: "2026-01-01T00:00:00Z" }) })).toBe(1);
  expect(await prisma.contact.count({ where: audienceWhere({ field: "agent", operator: "is", value: "audience-admin" }) })).toBe(1);
  expect(old.contactId).toBe("audience-3");
}));
it("imports 10,000 rows into PostgreSQL and freezes a 10,000-recipient draft without sending", scope(async () => {
  const csv = "name,phone,consentStatus\n" + Array.from({ length: 10000 }, (_, i) => `Bulk ${i},+97250${String(i).padStart(7, "0")},OPTED_IN`).join("\n");
  const response = await importCSV(new Request("https://qa/api/distribution-lists/import", { method: "POST", body: JSON.stringify({ name: "Bulk QA", csv }) }));
  expect(response.status).toBe(201);
  const imported = await response.json(); expect(imported.created).toBe(10000);
  const repeated = await importCSV(new Request("https://qa/api/distribution-lists/import", { method: "POST", body: JSON.stringify({ name: "Never resubscribe", csv: "name,phone,consentStatus\nOld,+972509888880,OPTED_IN" }) }));
  expect(repeated.status).toBe(201); expect((await repeated.json()).existing).toBe(1);
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "audience-0" } })).consentStatus).toBe("OPTED_OUT");
  const preview = await previewAudience({ listId: imported.list.id }); expect(preview.matched).toBe(10000); expect(preview.eligible).toBe(10000);
  const campaign = await createCampaign({ name: "Bulk draft only", listId: imported.list.id, templateId: "audience-template", variables: {} }, "audience-admin");
  expect(campaign.status).toBe("DRAFT"); expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(10000);
  expect(await prisma.message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
}));
