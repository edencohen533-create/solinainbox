import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { csvRows } from "@/lib/csv-export";
import { buildContactScope } from "@/server/services/contact-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!hasRole(session, ROLES_ADMIN_MANAGER)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const search = (new URL(request.url).searchParams.get("search") ?? "").slice(0, 200);
  const contacts = await prisma.contact.findMany({ where: { AND: [buildContactScope(session!), search ? { OR: [
    { name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } },
  ] } : {}] }, orderBy: { id: "asc" }, take: 10001, select: { name: true, phone: true, email: true, source: true, consentStatus: true, isBlocked: true, consentAt: true, consentSource: true, consentScope: true } });
  if (contacts.length > 10000) return Response.json({ error: "הייצוא מוגבל ל־10,000 אנשי קשר; יש לצמצם את החיפוש" }, { status: 422 });
  await prisma.auditLog.create({ data: { actorUserId: session!.user.id, action: "contacts.exported", entityType: "Contact", entityId: "export", metadata: { count: contacts.length } } });
  return new Response(csvRows([
    ["name", "phone", "email", "source", "consentStatus", "isBlocked", "consentAt", "consentSource", "consentScope"],
    ...contacts.map((c) => [c.name, c.phone, c.email, c.source, c.consentStatus, c.isBlocked, c.consentAt?.toISOString(), c.consentSource, c.consentScope]),
  ]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contacts.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
