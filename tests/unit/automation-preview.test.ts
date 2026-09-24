import { afterEach, expect, it, vi } from "vitest";
const { template, sender, conversation } = vi.hoisted(() => ({
  template: { status: "APPROVED", body: "Hello", category: "UTILITY", providerTemplateId: "template-1", providerAccountId: "account-A" },
  sender: { provider: "meta_whatsapp_cloud_api", config: { businessAccountId: "account-B" } },
  conversation: { id: "c", providerCredentialId: "sender", source: "WHATSAPP", assignedAgentId: null, lastInboundAt: new Date(), contact: { name: "QA", consentStatus: "OPTED_IN", isBlocked: false, lastMarketingAt: null }, providerCredential: { teamId: null } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { template: { findUnique: async () => template, findUniqueOrThrow: async () => template }, conversation: { findUnique: async () => conversation } } }));
vi.mock("@/server/providers/provider-registry", () => ({ resolveSender: async () => sender }));
import { previewAutomation } from "@/server/services/automation-preview-service";
afterEach(() => { vi.unstubAllGlobals(); sender.provider = "meta_whatsapp_cloud_api"; });
it("reports a template from a different WABA without contacting Meta", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  const result = await previewAutomation({ name: "Test", trigger: "NEW_INBOUND_MESSAGE", triggerConfig: {}, actionType: "SEND_TEMPLATE", actionConfig: { templateId: "t" }, isActive: false }, "c");
  expect(result.allowedLocally).toBe(false); expect(result.reasons.join(" ")).toContain("חשבון Meta"); expect(request).not.toHaveBeenCalled();
});
it("does not treat an explicit mock credential as a live WhatsApp connection", async () => {
  sender.provider = "mock";
  const result = await previewAutomation({ name: "Test", trigger: "NEW_INBOUND_MESSAGE", triggerConfig: {}, actionType: "SEND_TEMPLATE", actionConfig: { templateId: "t" }, isActive: false }, "c");
  expect(result.allowedLocally).toBe(false); expect(result.reasons).toContain("חיבור WhatsApp נותק");
});
