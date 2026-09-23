import { Prisma } from "@prisma/client";
import { requireOrganizationId } from "@/lib/organization-context";
import bcrypt from "bcryptjs";
import { MetaConnectionError } from "./meta-connection-service";
import { checkMetaConnection } from "./meta-connection-service";
import { prisma } from "@/lib/prisma";
import type { MetaProviderConfigInput } from "@/lib/validation/provider";
import { writeAuditLog } from "@/lib/audit";

export async function getActiveProviderSummary() {
  const active = await prisma.providerCredential.findFirst({ where: { isActive: true } });
  if (!active || active.provider === "mock") {
    return { provider: "mock" as const, configured: true };
  }

  const config = active.config as unknown as Record<string, string>;
  return {
    provider: active.provider,
    configured: true,
    lastCheckedAt: active.lastCheckedAt?.toISOString() ?? null,
    lastConnectionError: active.lastConnectionError,
    sendingBlocked: active.sendingBlocked,
    phoneNumberId: config.phoneNumberId ?? null,
    businessAccountId: config.businessAccountId ?? null,
    accessTokenMasked: config.accessToken ? `${"•".repeat(Math.max(config.accessToken.length - 4, 4))}${config.accessToken.slice(-4)}` : null,
    hasAppSecret: Boolean(config.appSecret),
  };
}

export async function activateMetaProvider(input: MetaProviderConfigInput, actorUserId: string) {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { passwordHash: true } });
  for (const user of users) {
    if (await bcrypt.compare("Password123!", user.passwordHash)) throw new MetaConnectionError("לפני חיבור Meta יש להחליף את סיסמאות הדמו או להשבית את חשבונות ההדגמה בהגדרות המשתמשים");
  }
  await checkMetaConnection(input);
  const credential = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requireOrganizationId()}, 774291))`;
    await tx.providerCredential.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const existing = await tx.providerCredential.findFirst({ where: { provider: "meta_whatsapp_cloud_api", phoneNumberId: input.phoneNumberId } });
    return existing
      ? tx.providerCredential.update({ where: { id: existing.id }, data: { phoneNumberId: input.phoneNumberId, config: input, isActive: true, sendingBlocked: false, lastCheckedAt: new Date(), lastConnectionError: null } })
      : tx.providerCredential.create({ data: { provider: "meta_whatsapp_cloud_api", phoneNumberId: input.phoneNumberId, config: input, isActive: true, sendingBlocked: false, lastCheckedAt: new Date(), lastConnectionError: null } });
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new MetaConnectionError("המספר כבר משויך לחשבון אחר במערכת. נדרשת בדיקת בעלות לפני העברה");
    throw error;
  });

  await writeAuditLog({
    actorUserId,
    action: "provider.activated",
    entityType: "ProviderCredential",
    entityId: credential.id,
    metadata: { provider: "meta_whatsapp_cloud_api" },
  });

  return credential;
}

export async function activateMockProvider(actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requireOrganizationId()}, 774291))`;
    await tx.providerCredential.updateMany({ where: { isActive: true }, data: { isActive: false } });
  });

  await writeAuditLog({
    actorUserId,
    action: "provider.activated",
    entityType: "ProviderCredential",
    entityId: "mock",
    metadata: { provider: "mock" },
  });
}
