import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContactScope, buildConversationScope } from "./conversation-service";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation/task";
export class TaskError extends Error { constructor(message: string, public status = 400) { super(message); } }
const include = { assignedTo: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } } satisfies Prisma.ContactTaskInclude;
export function taskScope(session: Session): Prisma.ContactTaskWhereInput {
  return session.user.role === "AGENT" ? { assignedToId: session.user.id, contact: buildContactScope(session), OR: [{ conversationId: null }, { conversation: buildConversationScope(session) }] } : {};
}
async function requireContext(tx: Prisma.TransactionClient, session: Session, contactId: string, conversationId?: string | null) {
  if (!await tx.contact.findFirst({ where: { id: contactId, ...buildContactScope(session) }, select: { id: true } })) throw new TaskError("הלקוח אינו נגיש", 404);
  if (conversationId && !await tx.conversation.findFirst({ where: { id: conversationId, contactId, ...buildConversationScope(session) }, select: { id: true } })) throw new TaskError("השיחה אינה נגישה או אינה שייכת ללקוח", 404);
}
async function requireAssignee(tx: Prisma.TransactionClient, session: Session, id: string, contactId: string, conversationId?: string | null) {
  if (session.user.role === "AGENT" && id !== session.user.id) throw new TaskError("נציג יכול לשייך משימת מעקב לעצמו בלבד", 403);
  const user = await tx.user.findFirst({ where: { id, isActive: true }, select: { id: true, role: true, teamId: true } });
  if (!user) throw new TaskError("הנציג אינו פעיל או אינו נגיש");
  try { await requireContext(tx, { ...session, user: { ...session.user, ...user } }, contactId, conversationId); }
  catch (error) { if (error instanceof TaskError) throw new TaskError("לנציג הנבחר אין גישה ללקוח או לשיחה. יש לבדוק שיוך שיחה וצוות"); throw error; }
}
export async function listContactTasks(session: Session, input: { contactId: string; conversationId?: string; page: number }) {
  return prisma.$transaction(async (tx) => {
    await requireContext(tx, session, input.contactId, input.conversationId);
    const where: Prisma.ContactTaskWhereInput = { AND: [taskScope(session), { contactId: input.contactId }, ...(input.conversationId ? [{ OR: [{ conversationId: input.conversationId }, { conversationId: null }] }] : [])] };
    const [tasks, total, assignees] = await Promise.all([
      tx.contactTask.findMany({ where, orderBy: [{ dueAt: "asc" }, { id: "asc" }], skip: (input.page - 1) * 50, take: 50, include }),
      tx.contactTask.count({ where }),
      tx.user.findMany({ where: { isActive: true, ...(session.user.role === "AGENT" ? { id: session.user.id } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { tasks, total, page: input.page, assignees };
  }, { timeout: 30000, isolationLevel: "RepeatableRead" });
}
export async function createContactTask(session: Session, input: CreateTaskInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${input.contactId} FOR UPDATE`;
    await requireContext(tx, session, input.contactId, input.conversationId);
    await requireAssignee(tx, session, input.assignedToId, input.contactId, input.conversationId);
    const previous = await tx.contactTask.findFirst({ where: { requestKey: input.requestKey } });
    if (previous) {
      if (previous.contactId !== input.contactId || previous.conversationId !== (input.conversationId ?? null) || previous.title !== input.title || previous.assignedToId !== input.assignedToId || previous.dueAt.getTime() !== new Date(input.dueAt).getTime()) throw new TaskError("מפתח הבקשה כבר משויך למשימה אחרת", 409);
      return tx.contactTask.findUniqueOrThrow({ where: { id: previous.id, AND: [taskScope(session)] }, include });
    }
    const task = await tx.contactTask.create({ data: { ...input, dueAt: new Date(input.dueAt), createdById: session.user.id }, include });
    await tx.auditLog.create({ data: { actorUserId: session.user.id, action: "task.created", entityType: "ContactTask", entityId: task.id, conversationId: task.conversationId, metadata: { contactId: task.contactId, assignedToId: task.assignedToId } } });
    return task;
  }, { timeout: 30000 });
}
export async function updateContactTask(session: Session, id: string, input: UpdateTaskInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.contactTask.findFirst({ where: { id, ...taskScope(session) } });
    if (!task) throw new TaskError("המשימה אינה נגישה", 404);
    if (input.assignedToId) await requireAssignee(tx, session, input.assignedToId, task.contactId, task.conversationId);
    const { version, ...changes } = input;
    const result = await tx.contactTask.updateMany({ where: { id, version, ...taskScope(session) }, data: { ...changes, ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}), ...(input.status ? { completedAt: input.status === "DONE" ? new Date() : null } : {}), version: { increment: 1 } } });
    if (!result.count) throw new TaskError("המשימה שונתה על ידי משתמש אחר. יש לרענן לפני שמירה", 409);
    await tx.auditLog.create({ data: { actorUserId: session.user.id, action: "task.updated", entityType: "ContactTask", entityId: id, conversationId: task.conversationId, metadata: { fields: Object.keys(changes), version: version + 1 } } });
    return tx.contactTask.findUniqueOrThrow({ where: { id }, include });
  }, { timeout: 30000 });
}
