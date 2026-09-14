import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface AuditLogInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  conversationId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      conversationId: input.conversationId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}
