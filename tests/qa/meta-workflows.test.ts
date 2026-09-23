import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { startConversation, assignConversation, buildConversationScope, getConversationForUser } from "@/server/services/conversation-service";
import { createOutboundMessage } from "@/server/services/message-service";
import { getContact, listContacts } from "@/server/services/contact-service";
import { createCampaign, changeCampaignStatus } from "@/server/services/campaign-service";
import { processDueCampaigns } from "@/jobs/campaign-runner";
import { MetaWhatsAppProvider } from "@/server/providers/meta-whatsapp-provider";
import { submitMetaTemplate } from "@/server/services/template-submit-service";
import { syncMetaTemplates } from "@/server/services/template-sync-service";
import { activateMetaProvider } from "@/server/services/provider-credential-service";
import { setRealtimePublisher } from "@/lib/realtime/publish";
const session = (id: string, role: string) => ({ user: { id, role }, expires: "2099-01-01" }) as Session;
const admin = session("qa-admin", "ADMIN"), agentA = session("qa-agent-a", "AGENT"), agentB = session("qa-agent-b", "AGENT");
const config = { accessToken: "qa-fake-token", phoneNumberId: "123", businessAccountId: "456", webhookVerifyToken: "qa-verify", appSecret: "qa-secret" };
let remoteId = 0;
let templateStatus = "PENDING";
const sent: Array<Record<string, unknown>> = [];
let conversationId: string;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Refusing QA outside isolated schema");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "solina_qa_20260923"."Campaign", "solina_qa_20260923"."DistributionList", "solina_qa_20260923"."Conversation", "solina_qa_20260923"."Template", "solina_qa_20260923"."ProviderCredential" CASCADE');
  await prisma.template.create({ data: { id: "qa-template", name: "qa_welcome", language: "he", body: "שלום {{1}}, תודה שפנית אלינו.", variables: ["1"], status: "APPROVED" } });
  setRealtimePublisher({ publish: async () => {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, options?: RequestInit) => {
    const target = String(url);
    if (!target.startsWith("https://graph.facebook.com/")) throw new Error("Unexpected network request");
    if (target.includes("/phone_numbers")) return Response.json({ data: [{ id: "123" }] });
    if (target.endsWith("/subscribed_apps")) return Response.json({ data: [{ id: "qa-app" }] });
    if (target.endsWith("/messages")) { sent.push(JSON.parse(String(options?.body))); return Response.json({ messages: [{ id: `wamid.qa.${++remoteId}` }] }); }
    if (target.includes("message_templates") && options?.method === "POST") return Response.json({ id: "789", status: "PENDING" });
    if (target.includes("message_templates")) return Response.json({ data: [{ id: "789", name: "qa_submitted", language: "he", category: "UTILITY", status: templateStatus, components: [{ type: "BODY", text: "שלום {{1}}, הודעת בדיקה." }] }] });
    throw new Error("Unmocked Meta operation");
  }));
  await activateMetaProvider(config, "qa-admin");
});
afterAll(async () => {
  await prisma.providerCredential.deleteMany({ where: { provider: "meta_whatsapp_cloud_api" } });
  vi.unstubAllGlobals(); await prisma.$disconnect();
});
it("starts once under concurrent requests and enforces representative isolation on real PostgreSQL", async () => {
  const [first, second] = await Promise.all([startConversation(admin, "qa-contact-0", agentA.user.id), startConversation(admin, "qa-contact-0", agentA.user.id)]);
  conversationId = first.id;
  expect(second.id).toBe(first.id);
  expect(await getConversationForUser(agentB, first.id)).toBeNull();
  expect(await getContact("qa-contact-0", agentB)).toBeNull();
  expect((await listContacts(agentB)).some((contact) => contact.id === "qa-contact-0")).toBe(false);
  expect(await assignConversation(first.id, agentB.user.id, agentB.user.id, buildConversationScope(agentB))).toBeNull();
  await expect(startConversation(agentB, "qa-contact-0")).rejects.toThrow("אחר");
  expect(await getConversationForUser(agentA, first.id)).not.toBeNull();
});
it("submits for approval, blocks pending templates, syncs approval and sends a real-shaped Meta template request", async () => {
  const template = await submitMetaTemplate({ name: "qa_submitted", language: "he", category: "UTILITY", body: "שלום {{1}}, הודעת בדיקה.", examples: { "1": "דנה" } });
  expect(template.status).toBe("PENDING_APPROVAL");
  await expect(createOutboundMessage({ conversationId, body: "", templateId: template.id, templateVariables: { "1": "דנה" }, sentByUserId: agentA.user.id })).rejects.toThrow("מאושרת");
  await expect(createOutboundMessage({ conversationId, body: "hello", sentByUserId: agentA.user.id })).rejects.toThrow("חלון");
  templateStatus = "APPROVED"; await syncMetaTemplates();
  const result = await createOutboundMessage({ conversationId, body: "", templateId: template.id, templateVariables: { "1": "דנה" }, sentByUserId: agentA.user.id });
  expect(result.message.status).toBe("ACCEPTED");
  expect(sent.at(-1)).toMatchObject({ type: "template", to: "972509990000", template: { name: "qa_submitted", language: { code: "he" } } });
});
it("deduplicates inbound webhooks, opens the reply window and advances delivery monotonically", async () => {
  const provider = new MetaWhatsAppProvider(config);
  const value = { metadata: { phone_number_id: "123" }, messages: [{ id: "wamid.qa.inbound", from: "972509990000", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "שלום מהלקוח" } }] };
  const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value }] }] };
  await Promise.all([provider.receiveWebhook(payload), provider.receiveWebhook(payload)]);
  expect(await prisma.message.count({ where: { inboundKey: "wamid.qa.inbound" } })).toBe(1);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  expect(conversation.unreadCount).toBe(1); expect(conversation.assignedAgentId).toBe(agentA.user.id);
  const { message } = await createOutboundMessage({ conversationId, body: "מענה מהנציג", sentByUserId: agentA.user.id });
  expect(sent.at(-1)).toMatchObject({ type: "text", text: { body: "מענה מהנציג" } });
  for (const status of ["read", "delivered", "sent"]) await provider.receiveWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" }, statuses: [{ id: message.providerMessageId, status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
  expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("READ");
});
it("snapshots a list, schedules/pauses/resumes, excludes opt-outs and unknown consent, and sends each opted-in recipient once", async () => {
  const template = await prisma.template.findUniqueOrThrow({ where: { name_language: { name: "qa_submitted", language: "he" } } });
  const list = await prisma.distributionList.create({ data: { name: "QA distribution", members: { create: [0, 1, 2].map((i) => ({ contactId: `qa-contact-${i}` })) } } });
  const campaign = await createCampaign({ name: "QA campaign", templateId: template.id, listId: list.id, variables: { "1": "{name}" } }, admin.user.id);
  await prisma.distributionListMember.create({ data: { listId: list.id, contactId: "qa-contact-3" } });
  expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(3);
  await changeCampaignStatus(campaign.id, "start", new Date(Date.now() + 60000).toISOString());
  const before = sent.length; await processDueCampaigns(); expect(sent.length).toBe(before);
  await changeCampaignStatus(campaign.id, "pause"); await processDueCampaigns(); expect(sent.length).toBe(before);
  await changeCampaignStatus(campaign.id, "resume"); await Promise.all([processDueCampaigns(), processDueCampaigns()]);
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
  expect(recipients.filter((r) => r.status === "SENT")).toHaveLength(1);
  expect(recipients.filter((r) => r.status === "SKIPPED")).toHaveLength(2);
  expect(sent.length).toBe(before + 1);
  await processDueCampaigns(); expect(sent.length).toBe(before + 1);
});
it("keeps the assigned representative when a customer returns after closing a conversation, and honors STOP", async () => {
  await prisma.conversation.update({ where: { id: conversationId }, data: { status: "CLOSED" } });
  const provider = new MetaWhatsAppProvider(config);
  for (const [id, body] of [["return", "שלום שוב"], ["stop", "הסר"]]) await provider.receiveWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" }, messages: [{ id: `wamid.qa.${id}`, from: "972509990000", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }] } }] }] });
  const open = await prisma.conversation.findFirstOrThrow({ where: { contactId: "qa-contact-0", status: "OPEN" } });
  expect(open.assignedAgentId).toBe(agentA.user.id);
  await expect(createOutboundMessage({ conversationId: open.id, body: "אסור לשלוח", sentByUserId: agentA.user.id, requireOptIn: true })).rejects.toThrow("אינו מאשר");
  // Reset only the synthetic fixture for browser QA.
  await prisma.contact.update({ where: { id: "qa-contact-0" }, data: { consentStatus: "OPTED_IN" } });
});

it("serializes representatives, retains request IDs and records ambiguous provider acceptance without resend", async () => {
  const conv = await startConversation(admin, "qa-contact-3", agentA.user.id);
  const template = await prisma.template.findUniqueOrThrow({ where: { name_language: { name: "qa_submitted", language: "he" } } });
  const input = { conversationId: conv.id, body: "", templateId: template.id, templateVariables: { "1": "QA" }, sentByUserId: agentA.user.id, requestKey: "qa-concurrent-request" };
  const before = sent.length;
  const outcomes = await Promise.allSettled([createOutboundMessage(input), createOutboundMessage(input)]);
  expect(outcomes.filter((o) => o.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
  expect(sent.length).toBe(before + 1);
  await createOutboundMessage(input); expect(sent.length).toBe(before + 1);
  vi.mocked(fetch).mockImplementationOnce(async () => { sent.push({ simulated: "provider accepted but response timed out" }); throw new Error("timeout after accept"); });
  await expect(createOutboundMessage({ ...input, requestKey: "qa-unknown" })).rejects.toThrow("timeout");
  expect((await prisma.message.findUniqueOrThrow({ where: { requestKey: "qa-unknown" } })).status).toBe("UNKNOWN");
  const after = sent.length;
  await expect(createOutboundMessage({ ...input, requestKey: "qa-unknown" })).rejects.toThrow("אינה ודאית");
  expect(sent.length).toBe(after);
});
it("blocks a revoked Meta token", async () => {
  const conv = await startConversation(admin, "qa-contact-3", agentA.user.id);
  const template = await prisma.template.findUniqueOrThrow({ where: { name_language: { name: "qa_submitted", language: "he" } } });
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: { code: 190, message: "Invalid access token" } }, { status: 401 }));
  const result = await createOutboundMessage({ conversationId: conv.id, body: "", templateId: template.id, templateVariables: { "1": "QA" }, sentByUserId: agentA.user.id });
  expect(result.message.status).toBe("FAILED");
  expect((await prisma.providerCredential.findFirstOrThrow({ where: { isActive: true } })).sendingBlocked).toBe(true);
  // Only this synthetic provider is reset, not production.
  await prisma.providerCredential.updateMany({ where: { isActive: true }, data: { sendingBlocked: false } });
});
it("loads only the newest 100 messages with stable ordering from a 205-message history", async () => {
  const contact = await prisma.contact.create({ data: { name: "QA history pagination", phone: "+972509990090" } });
  const conversation = await prisma.conversation.create({ data: { contactId: contact.id, assignedAgentId: "qa-agent-a", source: "MOCK" } });
  const createdAt = new Date("2026-09-01T10:00:00Z");
  await prisma.message.createMany({ data: Array.from({ length: 205 }, (_, index) => ({ id: `qa-history-${String(index).padStart(3, "0")}`, conversationId: conversation.id, direction: "INBOUND" as const, type: "TEXT" as const, body: `QA history ${String(index).padStart(3, "0")}`, status: "DELIVERED" as const, createdAt })) });
  const loaded = await getConversationForUser(agentA, conversation.id);
  expect(loaded?.messages).toHaveLength(100);
  expect(loaded?.messages[0].id).toBe("qa-history-105");
  expect(loaded?.messages.at(-1)?.id).toBe("qa-history-204");
  expect(await getConversationForUser(agentB, conversation.id)).toBeNull();
});
