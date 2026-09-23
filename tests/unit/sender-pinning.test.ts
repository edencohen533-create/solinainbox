import { beforeEach, expect, it, vi } from "vitest";
const { findFirst, findMany } = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { providerCredential: { findFirst, findMany } } }));
import { resolveSender, listSenderOptions } from "@/server/providers/provider-registry";
import { activeSenderSnapshot } from "@/server/services/campaign-snapshot";
import type { Session } from "next-auth";
beforeEach(() => { vi.resetAllMocks(); });
it("never redirects a disconnected pinned sender to the new default", async () => {
  findFirst.mockResolvedValue(null);
  await expect(resolveSender("disconnected")).rejects.toThrow("נותק");
  expect(findFirst).toHaveBeenCalledOnce();
  expect(findFirst.mock.calls[0][0].where).toEqual({ id: "disconnected", isActive: true });
});
it("blocks demo threads when a real sender is active", async () => {
  findFirst.mockResolvedValue({ id: "live" });
  await expect(resolveSender(null)).rejects.toThrow("הדגמה");
});
it("allows historical media lookup only on its original credential after disconnect", async () => {
  findFirst.mockResolvedValue({ id: "old", isActive: false, sendingBlocked: true });
  expect((await resolveSender("old", true))?.id).toBe("old");
  expect(findFirst.mock.calls[0][0].where).toEqual({ id: "old" });
});
it("keeps sender fingerprints stable on label/team/default changes but blocks disconnect", async () => {
  findFirst.mockResolvedValue({ id: "one", config: { phoneNumberId: "1" }, isActive: true, isDefault: true });
  const original = await activeSenderSnapshot("one");
  findFirst.mockResolvedValue({ id: "one", config: { phoneNumberId: "1" }, isActive: true, isDefault: false, teamId: "new", label: "renamed" });
  expect(await activeSenderSnapshot("one")).toBe(original);
  findFirst.mockResolvedValue({ id: "one", isActive: false });
  expect(await activeSenderSnapshot("one")).toBe("blocked:one");
});
it("filters sender choices by agent team and never selects stored secrets", async () => {
  findMany.mockResolvedValue([]);
  await listSenderOptions({ user: { id: "agent", role: "AGENT", teamId: "team-a" } } as Session);
  expect(findMany.mock.calls[0][0].where.OR).toEqual([{ teamId: null }, { teamId: "team-a" }]);
  expect(findMany.mock.calls[0][0].select).not.toHaveProperty("config");
});
