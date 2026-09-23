import { resolveSender, ProviderUnavailableError } from "@/server/providers/provider-registry";
import { activeSenderSnapshot, templateFingerprint } from "./campaign-snapshot";
import { prisma } from "@/lib/prisma";
import { campaignSchema, validateTemplateVariables, personalizeVariables, renderTemplate } from "@/lib/campaigns";
import type { z } from "zod";
import type { CampaignStatus } from "@prisma/client";

export class CampaignError extends Error {}

export async function createCampaign(input: z.infer<typeof campaignSchema>, actorUserId: string) {
  let sender;
  try { sender = await resolveSender(input.providerCredentialId); }
  catch (error) { if (error instanceof ProviderUnavailableError) throw new CampaignError(error.message); throw error; }
  const providerCredentialId = sender?.id ?? null;
  const senderSnapshot = await activeSenderSnapshot(providerCredentialId);
  return prisma.$transaction(async (tx) => {
    const template = await tx.template.findUnique({ where: { id: input.templateId } });
    if (!template || template.status !== "APPROVED") throw new CampaignError("יש לבחור תבנית מאושרת");
    if (sender?.provider === "meta_whatsapp_cloud_api" && template.providerAccountId !== (sender.config as Record<string, unknown>).businessAccountId) throw new CampaignError("התבנית אינה שייכת לחשבון WhatsApp של המספר השולח. יש לסנכרן תבניות");
    try { validateTemplateVariables(template.body, input.variables); }
    catch (error) { throw new CampaignError((error as Error).message); }
    const list = await tx.distributionList.findUnique({ where: { id: input.listId }, include: { members: true } });
    if (!list?.members.length) throw new CampaignError("רשימת התפוצה ריקה או לא קיימת");
    // Snapshot membership, so later list edits cannot silently expand a scheduled send.
    return tx.campaign.create({ data: {
      ...input, providerCredentialId, createdById: actorUserId, senderSnapshot, templateSnapshot: templateFingerprint(template),
      recipients: { create: list.members.map(({ contactId }) => ({ contactId })) },
    } });
  });
}

export async function changeCampaignStatus(id: string, action: "start" | "pause" | "resume" | "cancel", scheduledAt?: string) {
  if (action === "start" || action === "resume") {
    const review = await campaignPreflight(id);
    if (review.blockers.length) throw new CampaignError(review.blockers.join("; "));
    if (!review.eligible) throw new CampaignError("אין נמענים זכאים לשליחה כעת");
  }
  const from: Record<typeof action, CampaignStatus[]> = {
    start: ["DRAFT"], pause: ["SCHEDULED", "RUNNING"], resume: ["PAUSED"], cancel: ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"],
  };
  const date = scheduledAt ? new Date(scheduledAt) : new Date();
  if (scheduledAt && (action !== "start" || date.getTime() < Date.now())) {
    throw new CampaignError("מועד התזמון חייב להיות עתידי ולהיקבע בתחילת הקמפיין");
  }
  const status: CampaignStatus = action === "cancel" ? "CANCELLED" : action === "pause" ? "PAUSED" : "SCHEDULED";
  await prisma.$transaction(async (tx) => {
    const result = await tx.campaign.updateMany({
      where: { id, status: { in: from[action] } },
      data: { status, ...((action === "start" || action === "resume") ? { scheduledAt: date } : {}) },
    });
    if (!result.count) throw new CampaignError("לא ניתן לבצע פעולה זו במצב הנוכחי של הקמפיין");
    if (action === "cancel") {
      await tx.campaignRecipient.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", error: "הקמפיין בוטל", completedAt: new Date() } });
    }
  });
}

export async function listCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { list: { select: { name: true } }, template: { select: { name: true } }, _count: { select: { recipients: true } } },
  });
  const counts = await prisma.campaignRecipient.groupBy({
    by: ["campaignId", "status"], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: true,
  });
  return campaigns.map((campaign) => ({ ...campaign,
    counts: Object.fromEntries(counts.filter((c) => c.campaignId === campaign.id).map((c) => [c.status, c._count])),
  }));
}

/** A snapshot for review, never a promise of eligibility at dispatch time. */
export async function campaignPreflight(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id }, include: { template: true, recipients: { where: { status: "QUEUED" }, include: { contact: true } } } });
  if (!campaign) throw new CampaignError("הקמפיין לא נמצא");
  const sender = await activeSenderSnapshot(campaign.providerCredentialId);
  const blockers: string[] = [];
  if (!campaign.senderSnapshot || sender !== campaign.senderSnapshot || sender.startsWith("blocked:")) blockers.push("החיבור השתנה או חסום. צור טיוטה חדשה לאחר אימות החיבור");
  if (campaign.template.status !== "APPROVED" || templateFingerprint(campaign.template) !== campaign.templateSnapshot) blockers.push("התבנית השתנתה או אינה מאושרת. סנכרן תבניות וצור טיוטה חדשה");
  const exclusions: Record<string, number> = {};
  const samples: { name: string; phone: string; body: string }[] = [];
  let eligible = 0;
  for (const { contact } of campaign.recipients) {
    const reason = contact.isBlocked ? "חסימה מלאה" : contact.consentStatus !== "OPTED_IN" ? "אין הסכמה פעילה" : contact.lastMarketingAt && Date.now() - contact.lastMarketingAt.getTime() < 86400000 ? "מגבלת תדירות ל־24 שעות" : null;
    if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + 1; continue; }
    try {
      const variables = personalizeVariables(campaign.variables as Record<string, string>, contact.name);
      validateTemplateVariables(campaign.template.body, variables);
      eligible++;
      if (samples.length < 3) samples.push({ name: contact.name, phone: contact.phone, body: renderTemplate(campaign.template.body, variables) });
    } catch { exclusions["משתנים חסרים"] = (exclusions["משתנים חסרים"] ?? 0) + 1; }
  }
  const active = campaign.providerCredentialId ? await prisma.providerCredential.findUnique({ where: { id: campaign.providerCredentialId }, select: { provider: true, config: true, label: true, displayPhoneNumber: true } }) : null;
  const phoneNumberId = (active?.config as Record<string, unknown> | undefined)?.phoneNumberId;
  return { eligible, totalQueued: campaign.recipients.length, exclusions, blockers, samples, sender: active ? `${active.label || active.provider} · ${active.displayPhoneNumber || String(phoneNumberId ?? "")}` : "הדגמה בלבד", audiencePolicy: "קהל מוקפא ביצירת הטיוטה; זכאות נבדקת מחדש בכל שליחה", cost: null };
}
