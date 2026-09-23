import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function templateFingerprint(template: { body: string; language: string; name: string; providerAccountId: string | null; providerTemplateId: string | null }) {
  return createHash("sha256").update(JSON.stringify([template.body, template.language, template.name, template.providerAccountId, template.providerTemplateId])).digest("hex");
}
export async function activeSenderSnapshot() {
  const active = await prisma.providerCredential.findFirst({ where: { isActive: true } });
  if (!active) return "mock";
  if (active.sendingBlocked) return `blocked:${active.id}`;
  // Updating credentials, changing numbers or reconnecting requires a new draft.
  return `${active.id}:${createHash("sha256").update(JSON.stringify(active.config)).digest("hex")}`;
}
