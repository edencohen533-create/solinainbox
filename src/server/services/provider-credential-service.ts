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
    phoneNumberId: config.phoneNumberId ?? null,
    businessAccountId: config.businessAccountId ?? null,
    accessTokenMasked: config.accessToken ? `${"•".repeat(Math.max(config.accessToken.length - 4, 4))}${config.accessToken.slice(-4)}` : null,
    hasAppSecret: Boolean(config.appSecret),
  };
}

export async function activateMetaProvider(input: MetaProviderConfigInput, actorUserId: string) {
  await prisma.providerCredential.updateMany({ where: { isActive: true }, data: { isActive: false } });

  const existing = await prisma.providerCredential.findFirst({ where: { provider: "meta_whatsapp_cloud_api" } });
  const credential = existing
    ? await prisma.providerCredential.update({
        where: { id: existing.id },
        data: { config: input, isActive: true },
      })
    : await prisma.providerCredential.create({
        data: { provider: "meta_whatsapp_cloud_api", config: input, isActive: true },
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
  await prisma.providerCredential.updateMany({ where: { isActive: true }, data: { isActive: false } });

  await writeAuditLog({
    actorUserId,
    action: "provider.activated",
    entityType: "ProviderCredential",
    entityId: "mock",
    metadata: { provider: "mock" },
  });
}
