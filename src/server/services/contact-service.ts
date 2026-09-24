import { requireOrganizationId } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/lib/audit";
import type { ContactInput, ContactUpdateInput } from "@/lib/validation/contact";
import type { Session } from "next-auth";
import { buildConversationScope, buildContactScope } from "./conversation-service";
import type { Prisma } from "@prisma/client";

export class ContactUpdateError extends Error { constructor(message: string, public status = 400) { super(message); } }

export class DuplicateContactError extends Error {
  constructor(public phone: string) {
    super(`A contact with phone ${phone} already exists`);
    this.name = "DuplicateContactError";
  }
}

export class InvalidPhoneError extends Error {
  constructor(public raw: string) {
    super(`"${raw}" is not a valid phone number`);
    this.name = "InvalidPhoneError";
  }
}

export { buildContactScope } from "./conversation-service";

export async function listContacts(session: Session, search?: string) {
  const where: Prisma.ContactWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.contact.findMany({
    where: { AND: [where, buildContactScope(session)] },
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } }, conversations: { where: buildConversationScope(session), orderBy: { createdAt: "desc" }, take: 1, select: { assignedAgent: { select: { name: true } } } } },
    take: 200,
  });
}

export async function getContact(id: string, session: Session) {
  return prisma.contact.findFirst({
    where: { ...buildContactScope(session), id },
    include: {
      tags: { include: { tag: true } },
      customFields: true,
      conversations: { where: buildConversationScope(session), orderBy: { createdAt: "desc" }, take: 20 },
      notes: { where: session.user.role === "AGENT" ? { OR: [{ conversationId: null }, { conversation: buildConversationScope(session) }] } : {}, orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true } } } },
    },
  });
}

export async function createContact(input: ContactInput, actorUserId: string) {
  const normalizedPhone = normalizePhone(input.phone);
  if (!normalizedPhone) {
    throw new InvalidPhoneError(input.phone);
  }

  const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId: requireOrganizationId(), phone: normalizedPhone } } });
  if (existing) {
    throw new DuplicateContactError(normalizedPhone);
  }

  const contact = await prisma.contact.create({
    data: {
      name: input.name,
      phone: normalizedPhone,
      email: input.email || null,
      source: input.source || "manual",
      consentStatus: input.consentStatus,
      isBlocked: input.isBlocked,
      consentAt: input.consentStatus !== "UNKNOWN" ? new Date() : null,
      consentSource: input.consentSource || "manual",
      consentScope: "marketing",
      consentEvidence: input.consentEvidence,
      customFields: input.customFields ? { create: input.customFields } : undefined,
      tags: { create: input.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) },
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "contact.created",
    entityType: "Contact",
    entityId: contact.id,
    metadata: { name: contact.name },
  });

  return contact;
}

export async function updateContact(id: string, input: ContactUpdateInput, actorUserId: string, session: Session) {
  const data: Prisma.ContactUpdateInput = {};

  if (input.customFields !== undefined) data.customFields = { deleteMany: {}, create: input.customFields };
  if (input.tagIds !== undefined) data.tags = { deleteMany: {}, create: input.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) };
  if (input.leadStage !== undefined) data.leadStage = input.leadStage;
  if (input.ownerId !== undefined) {
    if (session.user.role === "AGENT") throw new ContactUpdateError("רק מנהל יכול לשנות אחראי CRM", 403);
    if (input.ownerId && !await prisma.user.findFirst({ where: { id: input.ownerId, isActive: true }, select: { id: true } })) throw new ContactUpdateError("האחראי אינו פעיל או אינו נגיש בעסק זה");
    data.owner = input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true };
  }
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.source !== undefined) data.source = input.source;
  if (input.isBlocked !== undefined) data.isBlocked = input.isBlocked;
  if (input.consentStatus !== undefined) {
    data.consentStatus = input.consentStatus;
    data.consentAt = new Date(); data.consentSource = input.consentSource || "manual";
    data.consentScope = "marketing"; data.consentEvidence = input.consentEvidence || null;
  }

  if (input.phone !== undefined) {
    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
      throw new InvalidPhoneError(input.phone);
    }
    const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId: requireOrganizationId(), phone: normalizedPhone } } });
    if (existing && existing.id !== id) {
      throw new DuplicateContactError(normalizedPhone);
    }
    data.phone = normalizedPhone;
  }

  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.update({ where: { id, AND: [buildContactScope(session)] }, data });
    await tx.auditLog.create({ data: {
      actorUserId, action: "contact.updated", entityType: "Contact", entityId: contact.id,
      metadata: { fields: Object.keys(input), ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}), ...(input.leadStage !== undefined ? { leadStage: input.leadStage } : {}), ...(input.consentStatus ? { consentStatus: input.consentStatus, consentSource: input.consentSource || "manual", consentEvidence: input.consentEvidence ?? null, scope: "marketing" } : {}), ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}) },
    } });
    return contact;
  }, { timeout: 30000 });
}
