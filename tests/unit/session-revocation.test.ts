import { beforeEach, describe, expect, it, vi } from "vitest";
const { findUnique, config } = vi.hoisted(() => ({ findUnique: vi.fn(), config: { current: null as unknown as { callbacks: { jwt: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> } } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("next-auth", () => ({ default: (options: typeof config.current) => { config.current = options; return {}; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
import "@/lib/auth";
beforeEach(() => vi.resetAllMocks());
describe("session revocation", () => {
  it("invalidates an existing token after password/account changes", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "AGENT", updatedAt: new Date(2000) });
    expect(await config.current.callbacks.jwt({ token: { id: "a", authenticatedAt: 1000 } })).toBeNull();
  });
  it("keeps sessions valid when the account has not changed", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "AGENT", teamId: null, updatedAt: new Date(500) });
    expect(await config.current.callbacks.jwt({ token: { id: "a", authenticatedAt: 1000 } })).toMatchObject({ id: "a", role: "AGENT" });
  });
  it("rejects disabled accounts even if the token is newly issued", async () => {
    findUnique.mockResolvedValue({ isActive: false, updatedAt: new Date(500) });
    expect(await config.current.callbacks.jwt({ token: { id: "a", authenticatedAt: 1000 } })).toBeNull();
  });
});
