import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { findTemplate, updateMessage } = vi.hoisted(() => ({ findTemplate: vi.fn(), updateMessage: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { template: { findUnique: findTemplate }, message: { updateMany: updateMessage } } }));
vi.mock("@/server/services/message-service", () => ({ createInboundMessage: vi.fn() }));
import { MetaWhatsAppProvider } from "@/server/providers/meta-whatsapp-provider";
const config = { accessToken: "test", phoneNumberId: "123", webhookVerifyToken: "verify", appSecret: "secret" };
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("Meta provider", () => {
  it("rejects webhooks without a configured secret or valid signature", () => {
    const unsigned = new MetaWhatsAppProvider({ ...config, appSecret: undefined });
    expect(unsigned.verifyWebhook(new Headers(), "{}")).toBe(false);
    const provider = new MetaWhatsAppProvider(config);
    const signature = "sha256=" + crypto.createHmac("sha256", "secret").update("{}").digest("hex");
    expect(provider.verifyWebhook(new Headers({ "x-hub-signature-256": signature }), "{}")).toBe(true);
    expect(provider.verifyWebhook(new Headers({ "x-hub-signature-256": signature }), '{"changed":true}')).toBe(false);
  });
  it("sends template values in placeholder order", async () => {
    findTemplate.mockResolvedValue({ status: "APPROVED", body: "{{1}} {{2}}", name: "welcome", language: "he" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await new MetaWhatsAppProvider(config).sendTemplate({ conversationId: "c", to: "+972501234567", type: "TEMPLATE", templateId: "t", templateVariables: { "2": "second", "1": "first" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template.components[0].parameters).toEqual([{ type: "text", text: "first" }, { type: "text", text: "second" }]);
  });
  it("rejects templates that are no longer approved", async () => {
    findTemplate.mockResolvedValue({ status: "REJECTED" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const result = await new MetaWhatsAppProvider(config).sendTemplate({ conversationId: "c", to: "+972501234567", type: "TEMPLATE", templateId: "t" });
    expect(result.status).toBe("FAILED"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not downgrade read messages for delayed delivered callbacks", async () => {
    await new MetaWhatsAppProvider(config).receiveWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "m", status: "delivered" }] } }] }] });
    expect(updateMessage.mock.calls[0][0].where.status.in).not.toContain("READ");
  });
});
