import { prisma } from "@/lib/prisma";
import { campaignActor } from "@/lib/campaign-auth";
import { campaignActionSchema } from "@/lib/campaigns";
import { CampaignError, changeCampaignStatus } from "@/server/services/campaign-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  const page = Math.max(1, Math.min(100000, Number(new URL(request.url).searchParams.get("page")) || 1));
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { id: "asc" }, take: 100, skip: (Math.floor(page) - 1) * 100, include: { contact: { select: { name: true, phone: true } } } });
  const messages = await prisma.message.findMany({ where: { id: { in: recipients.flatMap((r) => r.messageId ? [r.messageId] : []) } }, select: { id: true, status: true } });
  return Response.json({ recipients: recipients.map((r) => ({ ...r, deliveryStatus: messages.find((m) => m.id === r.messageId)?.status ?? null })) });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  const parsed = campaignActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "פעולה לא תקינה" }, { status: 400 });
  try {
    await changeCampaignStatus(id, parsed.data.action, parsed.data.scheduledAt);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CampaignError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
