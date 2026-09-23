import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { findTemplate, updateMessage, findMessages, upsertContact, inbound } = vi.hoisted(() => ({ findTemplate: vi.fn(), updateMessage: vi.fn(), findMessages: vi.fn(), upsertContact: vi.fn(), inbound: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { template: { findUnique: findTemplate }, message: { updateMany: updateMessage, findMany: findMessages }, contact: { upsert: upsertContact } } }));
vi.mock("@/server/services/message-service", () => ({ createInboundMessage: inbound }));
import { MetaWhatsAppProvider } from "@/server/providers/meta-whatsapp-provider";
const config = { accessToken: "test", phoneNumberId: "123", businessAccountId: "456", webhookVerifyToken: "verify", appSecret: "secret" };
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); findMessages.mockResolvedValue([{ id: "m", conversationId: "c" }]); updateMessage.mockResolvedValue({ count: 0 }); });
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
    findTemplate.mockResolvedValue({ status: "APPROVED", providerTemplateId: "remote-t", providerAccountId: "456", body: "{{1}} {{2}}", name: "welcome", language: "he" });
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
    await new MetaWhatsAppProvider(config).receiveWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" }, statuses: [{ id: "m", status: "delivered", timestamp: "1700000000" }] } }] }] });
    expect(updateMessage.mock.calls[0][0].where.status.in).not.toContain("READ");
  });
});

describe("Meta webhook routing", () => {
  const message = { id: "wamid.inbound", from: "972501234567", timestamp: "1700000000", type: "text", text: { body: "שלום" } };
  function payload(phoneNumberId = "123") { return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages: [message], contacts: [{ wa_id: "other", profile: { name: "Wrong" } }, { wa_id: message.from, profile: { name: "Correct" } }] } }] }] }; }
  it("ignores messages for another business number", async () => {
    await new MetaWhatsAppProvider(config).receiveWebhook(payload("999"));
    expect(upsertContact).not.toHaveBeenCalled();
  });
  it("uses the matching profile and forwards the message ID and original timestamp", async () => {
    upsertContact.mockResolvedValue({ id: "contact" });
    await new MetaWhatsAppProvider(config).receiveWebhook(payload());
    expect(upsertContact).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ name: "Correct" }) }));
    expect(inbound).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: "wamid.inbound", receivedAt: new Date(1700000000000) }));
  });
  it("rejects malformed webhook bodies", async () => {
    await expect(new MetaWhatsAppProvider(config).receiveWebhook({ entry: "invalid" })).rejects.toThrow("Invalid webhook");
  });
});

describe("Meta media payloads", () => {
  it("sends uploaded media by ID rather than treating the ID as a public URL", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.media" }] }) });
    vi.stubGlobal("fetch", request);
    await new MetaWhatsAppProvider(config).sendMessage({ conversationId: "c", to: "+972501234567", type: "DOCUMENT", mediaId: "12345", fileName: "invoice.pdf", body: "חשבונית" });
    expect(JSON.parse(request.mock.calls[0][1].body).document).toEqual({ id: "12345", filename: "invoice.pdf", caption: "חשבונית" });
  });
  it("does not leak authorization to an untrusted download URL", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://evil.example/file", file_size: 10 }) });
    vi.stubGlobal("fetch", request);
    await expect(new MetaWhatsAppProvider(config).downloadMedia("123")).rejects.toThrow("Invalid Meta media host");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

it("does not report success when Meta returns 200 without a provider message ID", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  await expect(new MetaWhatsAppProvider(config).sendMessage({ conversationId: "c", to: "+972501234567", type: "TEXT", body: "hello" })).rejects.toThrow("outcome unknown");
});
