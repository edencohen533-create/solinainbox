import { beforeEach, expect, it, vi } from "vitest";
const { auth, findFirst, update, check } = vi.hoisted(() => ({ auth: vi.fn(), findFirst: vi.fn(), update: vi.fn(), check: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { providerCredential: { findFirst, update } } }));
vi.mock("@/server/services/meta-connection-service", () => ({ checkMetaConnection: check, MetaConnectionError: class extends Error {} }));
import { POST } from "@/app/api/settings/whatsapp/check/route";
const request = () => new Request("https://qa/check", { method: "POST", body: JSON.stringify({ credentialId: "selected" }) });
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ user: { role: "ADMIN" } }); });
it("denies agents without checking Graph", async () => {
  auth.mockResolvedValue({ user: { role: "AGENT" } });
  expect((await POST(request())).status).toBe(403); expect(check).not.toHaveBeenCalled();
});
it("cannot check an inaccessible or inactive number", async () => {
  findFirst.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(409);
  expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "selected", isActive: true });
  expect(check).not.toHaveBeenCalled();
});
it("blocks only the checked number after failed verification", async () => {
  findFirst.mockResolvedValue({ id: "selected", config: {} }); check.mockRejectedValue(new Error("private token detail"));
  const response = await POST(request()); expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private token");
  expect(update.mock.calls[0][0]).toMatchObject({ where: { id: "selected" }, data: { sendingBlocked: true } });
});
