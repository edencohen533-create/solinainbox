import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, user, processDueCampaigns } = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), processDueCampaigns: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: user } } }));
vi.mock("@/jobs/campaign-runner", () => ({ processDueCampaigns }));
import { campaignActor } from "@/lib/campaign-auth";
import { GET } from "@/app/api/cron/process-campaigns/route";
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("campaign access control", () => {
  it("rejects unauthenticated users", async () => {
    auth.mockResolvedValue(null); expect(await campaignActor()).toBeNull(); expect(user).not.toHaveBeenCalled();
  });
  it.each([{ role: "ADMIN", isActive: false }, { role: "AGENT", isActive: true }])("rechecks current permissions rather than trusting stale JWTs: %j", async (record) => {
    auth.mockResolvedValue({ user: { id: "u", role: "ADMIN" } }); user.mockResolvedValue({ id: "u", ...record });
    expect(await campaignActor()).toBeNull();
  });
  it("allows an active manager", async () => {
    auth.mockResolvedValue({ user: { id: "u" } }); user.mockResolvedValue({ id: "u", role: "MANAGER", isActive: true });
    expect(await campaignActor()).toHaveProperty("id", "u");
  });
  it("does not accept Bearer undefined when the cron secret is absent", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await GET(new Request("https://test/api/cron/process-campaigns", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
    expect(processDueCampaigns).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
