import { organizationRequest } from "@/lib/organization-request";
import { prisma } from "@/lib/prisma";
import { campaignActor } from "@/lib/campaign-auth";
import { distributionListSchema } from "@/lib/campaigns";

export const PUT = organizationRequest(async function(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await campaignActor()) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  const parsed = distributionListSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "רשימה לא תקינה" }, { status: 400 });
  if (!await prisma.distributionList.findUnique({ where: { id } })) return Response.json({ error: "לא נמצא" }, { status: 404 });
  if (await prisma.contact.count({ where: { id: { in: parsed.data.contactIds } } }) !== parsed.data.contactIds.length) return Response.json({ error: "איש קשר לא קיים" }, { status: 400 });
  const list = await prisma.distributionList.update({ where: { id }, data: {
    name: parsed.data.name, members: { deleteMany: {}, create: parsed.data.contactIds.map((contactId) => ({ contactId })) },
  } });
  return Response.json({ list });
});
