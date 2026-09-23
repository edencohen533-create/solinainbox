import { organizationRequest } from "@/lib/organization-request";
import { prisma } from "@/lib/prisma";
import { campaignActor } from "@/lib/campaign-auth";
import { distributionListSchema } from "@/lib/campaigns";

export const GET = organizationRequest(async function() {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const lists = await prisma.distributionList.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { members: true } } } });
  return Response.json({ lists });
});
export const POST = organizationRequest(async function(request: Request) {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const parsed = distributionListSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "יש להזין שם ולבחור אנשי קשר" }, { status: 400 });
  const count = await prisma.contact.count({ where: { id: { in: parsed.data.contactIds } } });
  if (count !== parsed.data.contactIds.length) return Response.json({ error: "חלק מאנשי הקשר אינם קיימים" }, { status: 400 });
  const list = await prisma.distributionList.create({ data: { name: parsed.data.name, members: { create: parsed.data.contactIds.map((contactId) => ({ contactId })) } } });
  return Response.json({ list }, { status: 201 });
});
