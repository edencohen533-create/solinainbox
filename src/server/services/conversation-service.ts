import { prisma } from "@/lib/prisma";
import { AutomationTrigger, Role, type Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { evaluateTrigger } from "@/server/services/automation-service";

export interface ConversationListFilter {
  status?: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  assignedTo?: "me" | "unassigned" | "all";
  search?: string;
}

/**
 * Builds the Prisma where-clause for a conversation list query, scoped to
 * the requesting user's role. Agents only ever see conversations assigned
 * to them or unassigned ones — enforced here at the data layer, not just
 * hidden in the UI, so an Agent can't reach other agents' conversations by
 * manipulating query params.
 */
export function buildConversationScope(session: Session, filter: ConversationListFilter = {}): Prisma.ConversationWhereInput {
  const clauses: Prisma.ConversationWhereInput[] = [];

  if (session.user.role === Role.AGENT) {
    clauses.push({ OR: [{ assignedAgentId: session.user.id }, { assignedAgentId: null }] });
  }

  if (filter.status) {
    clauses.push({ status: filter.status });
  }

  if (filter.assignedTo === "me") {
    clauses.push({ assignedAgentId: session.user.id });
  } else if (filter.assignedTo === "unassigned") {
    clauses.push({ assignedAgentId: null });
  }

  if (filter.search) {
    clauses.push({
      OR: [
        { contact: { name: { contains: filter.search, mode: "insensitive" } } },
        { contact: { phone: { contains: filter.search } } },
        { contact: { email: { contains: filter.search, mode: "insensitive" } } },
        { messages: { some: { body: { contains: filter.search, mode: "insensitive" } } } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listConversations(session: Session, filter: ConversationListFilter = {}) {
  return prisma.conversation.findMany({
    where: buildConversationScope(session, filter),
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      assignedAgent: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" }, select: { body: true, direction: true } },
    },
    take: 100,
  });
}

export async function getConversationForUser(session: Session, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, ...buildConversationScope(session) },
    include: {
      contact: { include: { tags: { include: { tag: true } }, customFields: true } },
      assignedAgent: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { attachments: true, sentByUser: { select: { id: true, name: true } }, template: true },
      },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true } } } },
    },
  });

  return conversation;
}

export async function assignConversation(conversationId: string, agentId: string | null, actorUserId: string, scope: Prisma.ConversationWhereInput = {}) {
  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, ...scope }, data: { assignedAgentId: agentId },
  });
  if (!result.count) return null;
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "conversation.assigned",
      entityType: "Conversation",
      entityId: conversationId,
      conversationId,
      metadata: { assignedAgentId: agentId },
    },
  });

  if (agentId === null) {
    await evaluateTrigger(AutomationTrigger.CONVERSATION_UNASSIGNED, { conversationId });
  }

  return conversation;
}

export class ConversationStartError extends Error {}

/** Locks the contact so manual starts and inbound webhooks cannot create duplicate open threads. */
export async function startConversation(session: Session, contactId: string, agentId?: string | null) {
  const assignee = agentId === undefined ? session.user.id : agentId;
  if (session.user.role === Role.AGENT && assignee !== session.user.id) throw new ConversationStartError("נציג יכול לשייך שיחה חדשה לעצמו בלבד");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contactId} FOR UPDATE`;
    const contact = await tx.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new ConversationStartError("איש הקשר לא נמצא");
    if (contact.consentStatus === "OPTED_OUT") throw new ConversationStartError("איש הקשר סירב לקבל הודעות");
    const previous = await tx.conversation.findFirst({ where: { contactId }, orderBy: { createdAt: "desc" } });
    if (session.user.role === Role.AGENT && previous?.assignedAgentId && previous.assignedAgentId !== session.user.id) throw new ConversationStartError("הליד משויך לנציג אחר");
    if (assignee && !await tx.user.findFirst({ where: { id: assignee, isActive: true }, select: { id: true } })) throw new ConversationStartError("הנציג אינו פעיל");
    const existing = await tx.conversation.findFirst({ where: { contactId, status: { in: ["OPEN", "PENDING"] } }, orderBy: { createdAt: "desc" } });
    if (existing) {
      if (session.user.role === Role.AGENT && existing.assignedAgentId && existing.assignedAgentId !== session.user.id) throw new ConversationStartError("השיחה משויכת לנציג אחר");
      return existing;
    }
    const conversation = await tx.conversation.create({ data: { contactId, assignedAgentId: assignee, source: "MANUAL", lastMessageAt: new Date() } });
    await tx.auditLog.create({ data: { actorUserId: session.user.id, action: "conversation.started", entityType: "Conversation", entityId: conversation.id, conversationId: conversation.id, metadata: { assignedAgentId: assignee } } });
    return conversation;
  });
}
