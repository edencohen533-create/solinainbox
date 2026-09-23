import { beforeEach, describe, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {
  providerCredential: { findFirst: vi.fn() }, template: { create: vi.fn(), update: vi.fn() },
} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { submitMetaTemplate } from "@/server/services/template-submit-service";
import { submitTemplateSchema } from "@/lib/validation/template";
import { checkMetaConnection } from "@/server/services/meta-connection-service";
const config = { accessToken: "secret", phoneNumberId: "123", businessAccountId: "456", webhookVerifyToken: "verify", appSecret: "secret" };
const input = { name: "welcome", language: "he", category: "UTILITY", body: "שלום {{1}}", examples: { "1": "דנה" } };
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals();
  db.providerCredential.findFirst.mockResolvedValue({ config });
  db.template.create.mockResolvedValue({ id: "local" });
});
describe("template submission", () => {
  it("requires positional contiguous placeholders and example values", () => {
    expect(submitTemplateSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ body: "{{name}}" }, { body: "{{2}}" }, { body: "{{1" }, { examples: {} }, { name: "Upper Case" }, { category: "AUTHENTICATION" }]) expect(submitTemplateSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("submits examples to Meta and persists pending status, never marks unapproved content sendable", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "789", status: "PENDING" }) }); vi.stubGlobal("fetch", request);
    await submitMetaTemplate(input);
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ components: [{ type: "BODY", text: input.body, example: { body_text: [["דנה"]] } }] });
    expect(db.template.update).toHaveBeenCalledWith({ where: { id: "local" }, data: { providerTemplateId: "789", status: "PENDING_APPROVAL", syncError: null } });
  });
  it("refuses submissions in mock mode", async () => {
    db.providerCredential.findFirst.mockResolvedValue(null);
    await expect(submitMetaTemplate(input)).rejects.toThrow("לחבר");
    expect(db.template.create).not.toHaveBeenCalled();
  });
  it("does not repeat ambiguous submissions after timeout", async () => {
    const request = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", request);
    await expect(submitMetaTemplate(input)).rejects.toThrow("לסנכרן");
    db.template.create.mockRejectedValue({ code: "P2002" });
    await expect(submitMetaTemplate(input)).rejects.toThrow("כבר קיימת");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("sanitizes provider errors and preserves rejected state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: 100, message: "token secret" } }) }));
    await expect(submitMetaTemplate(input)).rejects.toThrow("קוד 100");
    expect(db.template.update.mock.calls[0][0].data).toMatchObject({ status: "REJECTED" });
    expect(db.template.update.mock.calls[0][0].data.syncError).not.toContain("secret");
  });
});
describe("Meta connection preflight", () => {
  it("checks ownership, template permission and webhook subscription without sending messages", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "123", display_phone_number: "+972500000000" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", request);
    expect(await checkMetaConnection(config)).toMatchObject({ hasSubscribedApp: false });
    expect(request.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });
  it("rejects a phone number outside the specified account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "other" }] }) }));
    await expect(checkMetaConnection(config)).rejects.toThrow("אינו שייך");
  });
  it("rejects expired credentials without returning remote secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(checkMetaConnection(config)).rejects.toThrow("לא ניתן לאמת");
  });
});
