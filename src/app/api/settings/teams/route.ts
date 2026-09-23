import { organizationRequest } from "@/lib/organization-request";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export const POST = organizationRequest(async function(request: Request) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "יש להזין שם צוות" }, { status: 400 });
  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({ data: parsed.data });
    await tx.auditLog.create({ data: { actorUserId: session.user.id, action: "team.created", entityType: "Team", entityId: created.id } });
    return created;
  });
  return Response.json({ team }, { status: 201 });
});
