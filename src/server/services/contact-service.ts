import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/lib/audit";
import type { ContactInput } from "@/lib/validation/contact";
import type { Session } from "next-auth";
import { buildConversationScope } from "./conversation-service";
import type { Prisma } from "@prisma/client";

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

export function buildContactScope(session: Session): Prisma.ContactWhereInput {
  return session.user.role === "AGENT" ? { OR: [
    { conversations: { none: {} } },
    { conversations: { some: { assignedAgentId: session.user.id } } },
    { conversations: { none: { assignedAgentId: { not: null } } } },
  ] } : {};
}

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

  const existing = await prisma.contact.findUnique({ where: { phone: normalizedPhone } });
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

export async function updateContact(id: string, input: Partial<ContactInput>, actorUserId: string, session: Session) {
  const data: Prisma.ContactUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.source !== undefined) data.source = input.source;
  if (input.consentStatus !== undefined) data.consentStatus = input.consentStatus;

  if (input.phone !== undefined) {
    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
      throw new InvalidPhoneError(input.phone);
    }
    const existing = await prisma.contact.findUnique({ where: { phone: normalizedPhone } });
    if (existing && existing.id !== id) {
      throw new DuplicateContactError(normalizedPhone);
    }
    data.phone = normalizedPhone;
  }

  const contact = await prisma.contact.update({ where: { id, AND: [buildContactScope(session)] }, data });

  await writeAuditLog({
    actorUserId,
    action: "contact.updated",
    entityType: "Contact",
    entityId: contact.id,
    metadata: { fields: Object.keys(input) },
  });

  return contact;
}
