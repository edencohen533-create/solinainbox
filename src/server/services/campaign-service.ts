import { prisma } from "@/lib/prisma";
import { campaignSchema, validateTemplateVariables } from "@/lib/campaigns";
import type { z } from "zod";
import type { CampaignStatus } from "@prisma/client";

export class CampaignError extends Error {}

export async function createCampaign(input: z.infer<typeof campaignSchema>, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.template.findUnique({ where: { id: input.templateId } });
    if (!template || template.status !== "APPROVED") throw new CampaignError("יש לבחור תבנית מאושרת");
    try { validateTemplateVariables(template.body, input.variables); }
    catch (error) { throw new CampaignError((error as Error).message); }
    const list = await tx.distributionList.findUnique({ where: { id: input.listId }, include: { members: true } });
    if (!list?.members.length) throw new CampaignError("רשימת התפוצה ריקה או לא קיימת");
    // Snapshot membership, so later list edits cannot silently expand a scheduled send.
    return tx.campaign.create({ data: {
      ...input, createdById: actorUserId,
      recipients: { create: list.members.map(({ contactId }) => ({ contactId })) },
    } });
  });
}

export async function changeCampaignStatus(id: string, action: "start" | "pause" | "resume" | "cancel", scheduledAt?: string) {
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
