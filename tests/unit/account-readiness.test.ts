import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, auth, activate, resetPassword } = vi.hoisted(() => ({ db: { user: { findMany: vi.fn() } }, auth: vi.fn(), activate: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/server/services/user-service", () => ({ setUserActive: activate, resetUserPassword: resetPassword }));
import { PATCH } from "@/app/api/settings/users/[id]/route";
import { activateMetaProvider } from "@/server/services/provider-credential-service";
import bcrypt from "bcryptjs";
const params = { params: Promise.resolve({ id: "admin" }) };
const request = (body: unknown) => new Request("https://test", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } }); });
describe("production account readiness", () => {
  it("blocks Meta activation while any active user still has the public demo password", async () => {
    db.user.findMany.mockResolvedValue([{ passwordHash: await bcrypt.hash("Password123!", 4) }]);
    await expect(activateMetaProvider({ accessToken: "x", phoneNumberId: "123", businessAccountId: "456", webhookVerifyToken: "x", appSecret: "x" }, "admin")).rejects.toThrow("סיסמאות הדמו");
  });
  it("prevents administrators disabling themselves", async () => {
    expect((await PATCH(request({ isActive: false }), params)).status).toBe(409);
    expect(activate).not.toHaveBeenCalled();
  });
  it("only admins can reset passwords and weak passwords are rejected", async () => {
    auth.mockResolvedValueOnce({ user: { id: "agent", role: "AGENT" } });
    expect((await PATCH(request({ password: "very-long-password" }), params)).status).toBe(403);
    expect((await PATCH(request({ password: "short" }), params)).status).toBe(400);
    expect(resetPassword).not.toHaveBeenCalled();
  });
  it("allows admin password changes without exposing a hash", async () => {
    resetPassword.mockResolvedValue({ id: "admin", isActive: true, passwordHash: "private" });
    const response = await PATCH(request({ password: "QA-new-password-2026" }), params);
    expect(response.status).toBe(200); expect(await response.text()).not.toContain("private");
  });
});
