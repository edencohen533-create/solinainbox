// @vitest-environment node
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.unmock("@/lib/organization-context");
const { credentials, organizations } = vi.hoisted(() => ({ credentials: vi.fn(), organizations: vi.fn() }));
vi.mock("@/lib/system-database", () => ({ systemDatabase: { providerCredential: { findMany: credentials }, organization: { findFirst: organizations } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { providerCredential: { update: vi.fn().mockResolvedValue({}) } } }));
import { requireOrganizationId } from "@/lib/organization-context";
import { MetaWhatsAppProvider } from "@/server/providers/meta-whatsapp-provider";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
const credential = (id: string) => ({ id, organizationId: `org-${id}`, phoneNumberId: id, provider: "meta_whatsapp_cloud_api", isActive: false,
  config: { phoneNumberId: id, appSecret: `secret-${id}`, webhookVerifyToken: `verify-${id}`, accessToken: "never-output-this-token" } });
const payload = (ids: string[]) => ({ object: "whatsapp_business_account", entry: [{ changes: ids.map((id) => ({ field: "messages", value: { metadata: { phone_number_id: id }, statuses: [] } })) }] });
function request(ids: string[], secret: string) {
  const body = JSON.stringify(payload(ids));
  return new Request("https://qa/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex") } });
}
const received: string[] = [];
beforeEach(() => {
  vi.restoreAllMocks(); received.length = 0; credentials.mockReset(); organizations.mockReset(); organizations.mockResolvedValue({ isActive: true });
  vi.spyOn(MetaWhatsAppProvider.prototype, "receiveWebhook").mockImplementation(async () => { received.push(requireOrganizationId()); });
});
describe("signed webhook tenant routing", () => {
  it("routes verified events to their credential owner, including receipts after disconnect", async () => {
    credentials.mockResolvedValue([credential("123")]);
    const response = await POST(request(["123"], "secret-123"));
    expect(response.status).toBe(200); expect(received).toEqual(["org-123"]);
    expect(credentials).toHaveBeenCalledWith({ where: { provider: "meta_whatsapp_cloud_api", phoneNumberId: { in: ["123"] } } });
    expect(await response.text()).not.toContain("secret");
  });
  it("verifies every matching credential before any business mutation", async () => {
    credentials.mockResolvedValue([credential("123"), credential("456")]);
    expect((await POST(request(["123", "456"], "secret-123"))).status).toBe(401);
    expect(received).toEqual([]);
  });
  it("rejects bad signatures and ignores disabled organizations", async () => {
    credentials.mockResolvedValue([credential("123")]);
    expect((await POST(request(["123"], "wrong"))).status).toBe(401);
    organizations.mockResolvedValue(null);
    expect((await POST(request(["123"], "secret-123"))).status).toBe(200);
    expect(received).toEqual([]);
  });
  it("returns only the verified handshake challenge", async () => {
    credentials.mockResolvedValue([credential("123")]);
    const result = await GET(new Request("https://qa/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=hello"));
    expect(result.status).toBe(200); expect(await result.text()).toBe("hello");
    credentials.mockResolvedValue([]);
    expect((await GET(new Request("https://qa/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=hello"))).status).toBe(403);
  });
});
