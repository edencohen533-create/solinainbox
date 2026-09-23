import { prisma } from "@/lib/prisma";
import type { MessageStatus } from "@prisma/client";
import { publishMessageStatus } from "@/lib/realtime/publish";

export function previousStatuses(status: MessageStatus): MessageStatus[] {
  if (status === "READ") return ["QUEUED", "SENT", "DELIVERED"];
  if (status === "DELIVERED") return ["QUEUED", "SENT"];
  if (status === "FAILED") return ["QUEUED", "SENT"];
  if (status === "SENT") return ["QUEUED"];
  return [];
}
export async function updateProviderMessageStatus(providerMessageId: string, status: MessageStatus, timestamp: Date) {
  // Predicates make repeated/out-of-order callbacks harmless.
  const messages = await prisma.message.findMany({ where: { providerMessageId, direction: "OUTBOUND" }, select: { id: true, conversationId: true } });
  for (const message of messages) {
    const updated = await prisma.message.updateMany({ where: { id: message.id, status: { in: previousStatuses(status) } }, data: {
      status,
      ...(status === "DELIVERED" ? { deliveredAt: timestamp } : {}),
      ...(status === "READ" ? { readAt: timestamp } : {}),
    } });
    if (updated.count) await publishMessageStatus({ type: "message_status", conversationId: message.conversationId, messageId: message.id, status });
  }
}
