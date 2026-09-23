import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { withOrganization } from "@/lib/organization-context";
import { systemDatabase } from "@/lib/system-database";
import { prisma } from "@/lib/prisma";
import { createInboundMessage, createOutboundMessage } from "@/server/services/message-service";
import { startConversation, getConversationForUser, assignConversation } from "@/server/services/conversation-service";
import { activateMetaProvider, updateProvider } from "@/server/services/provider-credential-service";
import { activeSenderSnapshot } from "@/server/services/campaign-snapshot";
import { createCampaign, campaignPreflight } from "@/server/services/campaign-service";
import { setUserTeam } from "@/server/services/user-service";
import { setRealtimePublisher } from "@/lib/realtime/publish";
const org = "qa-numbers";
const scoped = (fn: () => Promise<void>) => () => withOrganization(org, fn);
const session = (id: string, role: string, teamId: string | null = null) => ({ user: { id, role, teamId, organizationId: org }, expires: "2099-01-01" }) as Session;
const admin = session("numbers-admin", "ADMIN"), agent = session("numbers-agent", "AGENT", "numbers-team-a");
const config = { accessToken: "qa-token", phoneNumberId: "qa-number-one", businessAccountId: "qa-waba", appSecret: "qa-secret", webhookVerifyToken: "qa-verify" };
let first: string, second: string, thread: string, otherThread: string, campaign: string;
const urls: string[] = [];
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get("schema") !== "solina_qa_20260923") throw new Error("Isolated QA required");
  await systemDatabase.organization.create({ data: { id: org, name: "QA numbers" } });
  await withOrganization(org, async () => {
    await prisma.user.createMany({ data: [{ id: admin.user.id, name: "Admin", email: "numbers-admin@example.test", passwordHash: "qa-not-a-login-hash", role: "ADMIN" }, { id: agent.user.id, name: "Agent", email: "numbers-agent@example.test", passwordHash: "qa-not-a-login-hash", role: "AGENT" }] });
    await prisma.team.createMany({ data: [{ id: "numbers-team-a", name: "A" }, { id: "numbers-team-b", name: "B" }] });
    await setUserTeam(agent.user.id, "numbers-team-a", admin.user.id);
    await prisma.contact.create({ data: { id: "numbers-contact", name: "Synthetic QA", phone: "+972509998877", consentStatus: "OPTED_IN" } });
    setRealtimePublisher({ publish: async () => {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, options?: RequestInit) => {
      const target = String(url);
      if (!target.startsWith("https://graph.facebook.com/")) throw new Error("Unexpected network");
      if (target.includes("/phone_numbers")) return Response.json({ data: [{ id: config.phoneNumberId, display_phone_number: "+972509998871" }, { id: "qa-number-two", display_phone_number: "+972509998872" }] });
      if (target.includes("/message_templates")) return Response.json({ data: [] });
      if (target.endsWith("/subscribed_apps")) return Response.json({ data: [{ id: "qa-app" }] });
      if (target.endsWith("/messages") && options?.method === "POST") { urls.push(target); return Response.json({ messages: [{ id: `wamid.numbers.${urls.length}` }] }); }
      throw new Error("Unmocked Graph operation");
    }));
    first = (await activateMetaProvider(config, admin.user.id, { teamId: "numbers-team-a" })).id;
    second = (await activateMetaProvider({ ...config, phoneNumberId: "qa-number-two" }, admin.user.id, { teamId: "numbers-team-b" })).id;
  });
});
afterAll(async () => { vi.unstubAllGlobals(); await withOrganization(org, async () => { await prisma.providerCredential.updateMany({ data: { isActive: false, isDefault: false } }); }); await systemDatabase.$disconnect(); });
it("routes one contact into separate number threads and rejects other-team direct access", scoped(async () => {
  const one = await createInboundMessage({ contactId: "numbers-contact", providerCredentialId: first, source: "WHATSAPP", providerMessageId: "wamid.numbers.in-one", body: "Hello A" });
  const two = await createInboundMessage({ contactId: "numbers-contact", providerCredentialId: second, source: "WHATSAPP", providerMessageId: "wamid.numbers.in-two", body: "Hello B" });
  thread = one.conversation.id; otherThread = two.conversation.id;
  expect(thread).not.toBe(otherThread);
  expect(await getConversationForUser(agent, thread)).not.toBeNull();
  expect(await getConversationForUser(agent, otherThread)).toBeNull();
  expect(await assignConversation(otherThread, agent.user.id, admin.user.id)).toBeNull();
  await expect(startConversation(agent, "numbers-contact", undefined, second)).rejects.toThrow("צוות");
  await expect(createOutboundMessage({ conversationId: otherThread, body: "Denied", sentByUserId: agent.user.id })).rejects.toThrow("הרשאה");
  expect(urls).toHaveLength(0);
}));
it("keeps campaign and conversation senders pinned when the default changes", scoped(async () => {
  const snapshot = await activeSenderSnapshot(first);
  const template = await prisma.template.create({ data: { name: "numbers_utility", language: "he", body: "Hello", variables: [], status: "APPROVED", category: "UTILITY", providerAccountId: config.businessAccountId, providerTemplateId: "qa-template" } });
  const list = await prisma.distributionList.create({ data: { name: "Synthetic QA", members: { create: { contactId: "numbers-contact" } } } });
  campaign = (await createCampaign({ name: "QA pinned", listId: list.id, templateId: template.id, variables: {}, providerCredentialId: first }, admin.user.id)).id;
  await updateProvider(second, { action: "default" }, admin.user.id);
  expect(await activeSenderSnapshot(first)).toBe(snapshot);
  expect((await campaignPreflight(campaign)).blockers).toEqual([]);
  await createOutboundMessage({ conversationId: thread, body: "Reply A", sentByUserId: agent.user.id });
  expect(urls.at(-1)).toContain("/qa-number-one/messages");
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: thread } })).providerCredentialId).toBe(first);
}));
it("disconnects only the selected number, preserves history and blocks its scheduled campaign", scoped(async () => {
  await updateProvider(first, { action: "disconnect" }, admin.user.id);
  await expect(createOutboundMessage({ conversationId: thread, body: "Stopped", sentByUserId: admin.user.id })).rejects.toThrow("נותק");
  expect((await campaignPreflight(campaign)).blockers.length).toBeGreaterThan(0);
  await createOutboundMessage({ conversationId: otherThread, body: "Reply B", sentByUserId: admin.user.id });
  expect(urls.at(-1)).toContain("/qa-number-two/messages");
  await updateProvider(first, { action: "reconnect" }, admin.user.id);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: thread } })).providerCredentialId).toBe(first);
  expect(await prisma.message.count({ where: { conversationId: thread } })).toBe(2);
}));
it("releases incompatible assignments on team changes and rejects mixed active WABAs", scoped(async () => {
  expect(await assignConversation(thread, agent.user.id, admin.user.id)).not.toBeNull();
  await updateProvider(first, { action: "details", teamId: "numbers-team-b" }, admin.user.id);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: thread } })).assignedAgentId).toBeNull();
  expect(await getConversationForUser(agent, thread)).toBeNull();
  await expect(activateMetaProvider({ ...config, businessAccountId: "different-waba" }, admin.user.id)).rejects.toThrow("אותו חשבון");
  await expect(prisma.providerCredential.update({ where: { id: first }, data: { isDefault: true } })).rejects.toMatchObject({ code: "P2002" });
}));
