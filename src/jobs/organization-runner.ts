import { systemDatabase } from "@/lib/system-database";
import { withOrganization } from "@/lib/organization-context";
/** Called only after cron authentication. Rotate workspaces so a busy tenant cannot starve others. */
export async function processOrganizations(kind: "campaign" | "automation", job: (deadline: number) => Promise<{ processed: number }>) {
  const deadline = Date.now() + 43_000;
  const field = kind === "campaign" ? "lastCampaignScanAt" : "lastAutomationScanAt";
  const organizations = await systemDatabase.organization.findMany({
    where: { isActive: true }, orderBy: [{ [field]: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 25, select: { id: true },
  });
  let processed = 0, scanned = 0, failed = 0;
  for (const organization of organizations) {
    if (Date.now() >= deadline) break;
    await systemDatabase.organization.update({ where: { id: organization.id }, data: { [field]: new Date() } });
    try {
      const result = await withOrganization(organization.id, () => job(deadline));
      processed += result.processed;
    } catch {
      // Do not log payloads/credentials, or let a broken tenant starve every other tenant.
      failed++;
      console.error("Organization worker failed", { organizationId: organization.id, kind });
    }
    scanned++;
  }
  return { processed, organizations: scanned, failed };
}
