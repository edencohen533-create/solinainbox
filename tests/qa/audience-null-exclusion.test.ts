import { afterAll, expect, it } from "vitest";
import { withOrganization } from "@/lib/organization-context";
import { systemDatabase } from "@/lib/system-database";
import { prisma } from "@/lib/prisma";
import { saveDistributionList } from "@/server/services/distribution-list-service";
import { previewAudience } from "@/server/services/audience-service";
import { createCampaign } from "@/server/services/campaign-service";
afterAll(async () => { await systemDatabase.$disconnect(); });
it("keeps contacts with missing source when excluding a source segment, matching the frozen draft", async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Isolated QA required");
  const org = `qa-null-audience-${Date.now()}`;
  await systemDatabase.organization.create({ data: { id: org, name: "Nullable audience QA" } });
  await withOrganization(org, async () => {
    const actor = await prisma.user.create({ data: { name: "QA", email: `${org}@example.test`, role: "ADMIN", passwordHash: "not-a-login-hash" } });
    const contacts = await prisma.contact.createManyAndReturn({ data: [
      { name: "Missing source", phone: "+972509888991", source: null, consentStatus: "OPTED_IN" },
      { name: "Excluded web", phone: "+972509888992", source: "web", consentStatus: "OPTED_IN" },
      { name: "Other opted out", phone: "+972509888993", source: "other", consentStatus: "OPTED_OUT" },
    ] });
    const list = await saveDistributionList({ name: "All", contactIds: contacts.map((c) => c.id) }, actor.id);
    const excluded = await saveDistributionList({ name: "Exclude web", contactIds: [], segment: { field: "source", operator: "equals", value: "web" } }, actor.id);
    const preview = await previewAudience({ listId: list.id, excludedListIds: [excluded.id] });
    expect(preview).toMatchObject({ matched: 3, excluded: 1, remaining: 2, eligible: 1, ineligible: 1 });
    expect(preview.samples.map((c) => c.name).sort()).toEqual(["Missing source", "Other opted out"]);
    expect((await previewAudience({ segment: { field: "marketingEligible", operator: "is", value: false } })).matched).toBe(1);
    expect((await previewAudience({ segment: { field: "lastInbound", operator: "never" } })).matched).toBe(3);
    const template = await prisma.template.create({ data: { name: "null_test", language: "he", body: "QA", variables: [], status: "APPROVED" } });
    const draft = await createCampaign({ name: "No activation", listId: list.id, excludedListIds: [excluded.id], templateId: template.id, variables: {} }, actor.id);
    expect(draft.audienceExcludedCount).toBe(preview.excluded);
    expect(await prisma.campaignRecipient.count({ where: { campaignId: draft.id, status: "QUEUED" } })).toBe(preview.remaining);
    expect(await prisma.message.count()).toBe(0);
  });
});
