import { beforeEach, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { campaign: { findUnique: vi.fn() }, providerCredential: { findFirst: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/campaign-snapshot", () => ({ activeSenderSnapshot: async () => "mock", templateFingerprint: () => "fingerprint" }));
import { campaignPreflight } from "@/server/services/campaign-service";
beforeEach(() => {
  vi.resetAllMocks();
  db.providerCredential.findFirst.mockResolvedValue(null);
  db.campaign.findUnique.mockResolvedValue({ senderSnapshot: "mock", templateSnapshot: "fingerprint", template: { status: "APPROVED", body: "שלום {{1}}" }, variables: { "1": "{name}" }, recipients: [
    { contact: { name: "דנה", phone: "+972501234567", consentStatus: "OPTED_IN" } },
    { contact: { name: "חסום", consentStatus: "OPTED_IN", isBlocked: true } },
    { contact: { name: "הוסר", consentStatus: "OPTED_OUT" } },
    { contact: { name: "מכסה", consentStatus: "OPTED_IN", lastMarketingAt: new Date() } },
  ] });
});
it("counts eligibility and exclusions against a known four-recipient dataset", async () => {
  const result = await campaignPreflight("c");
  expect(result.totalQueued).toBe(4); expect(result.eligible).toBe(1);
  expect(Object.values(result.exclusions).reduce((a,b) => a+b, 0)).toBe(3);
  expect(result.samples[0].body).toBe("שלום דנה"); expect(result.cost).toBeNull();
});
it("blocks a changed sender and a disabled template before activation", async () => {
  const campaign = await db.campaign.findUnique();
  campaign.senderSnapshot = "other-number"; campaign.template.status = "REJECTED";
  expect((await campaignPreflight("c")).blockers).toHaveLength(2);
});
