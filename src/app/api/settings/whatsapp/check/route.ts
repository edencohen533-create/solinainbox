import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMetaConnection, MetaConnectionError } from "@/server/services/meta-connection-service";
import type { MetaWhatsAppConfig } from "@/server/providers/meta-whatsapp-provider";
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const active = await prisma.providerCredential.findFirst({ where: { isActive: true, provider: "meta_whatsapp_cloud_api" } });
  if (!active) return Response.json({ error: "Meta אינו מחובר; המערכת במצב דמו" }, { status: 409 });
  try {
    const report = await checkMetaConnection(active.config as unknown as MetaWhatsAppConfig);
    await prisma.providerCredential.update({ where: { id: active.id }, data: { lastCheckedAt: new Date(), lastConnectionError: null } });
    return Response.json(report);
  }
  catch (error) {
    await prisma.providerCredential.update({ where: { id: active.id }, data: { lastCheckedAt: new Date(), lastConnectionError: "אימות הגישה נכשל. בדוק Token והרשאות" } });
    return Response.json({ error: error instanceof MetaConnectionError ? error.message : "בדיקת החיבור נכשלה" }, { status: 502 }); }
}

export const maxDuration = 60;
