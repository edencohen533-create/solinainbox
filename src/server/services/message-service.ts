import { acquireSendLease, SendConflictError } from "./send-guard";
import { eligibilityError, isUnsubscribe, MARKETING_INTERVAL_MS } from "@/lib/message-policy";
import { randomUUID } from "node:crypto";
import { renderTemplate, validateTemplateVariables } from "@/lib/campaigns";
import { prisma } from "@/lib/prisma";
import { AutomationTrigger, ConversationSource, ConversationStatus, MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import { publishConversationUpdated, publishNewMessage } from "@/lib/realtime/publish";
import { writeAuditLog } from "@/lib/audit";
import { evaluateTrigger, scheduleNoReplyChecks } from "@/server/services/automation-service";
import { getActiveProvider } from "@/server/providers/provider-registry";
import { MockWhatsAppProvider } from "@/server/providers/mock-whatsapp-provider";
import type { OutboundMessagePayload } from "@/server/providers/whatsapp-provider";

export interface CreateInboundMessageInput {
  contactId: string;
  body: string;
  type?: MessageType;
  mediaUrl?: string;
  source?: ConversationSource;
  providerMessageId?: string;
  receivedAt?: Date;
  media?: { providerMediaId: string; mimeType: string; fileName?: string };
}

/**
 * The single entry point for every inbound WhatsApp message, whether it
 * comes from the mock provider's Demo Simulator or (later) a real Meta
 * Cloud API / Telnyx webhook. Both call this same function, so the DB
 * writes, automation evaluation, and realtime broadcast never need to
 * change when a real provider is plugged in.
 */
export async function createInboundMessage(input: CreateInboundMessageInput) {
  const result = await prisma.$transaction(async (tx) => {
    // Serialize inbound messages for the same contact, including different
    // provider IDs arriving at once when no conversation exists yet.
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${input.contactId} FOR UPDATE`;
    if (input.providerMessageId) {
      const existing = await tx.message.findUnique({ where: { inboundKey: input.providerMessageId }, include: { conversation: true } });
      if (existing) return { conversation: existing.conversation, message: existing, isNewConversation: false, isDuplicate: true };
    }
    if (isUnsubscribe(input.body)) {
      await tx.contact.update({ where: { id: input.contactId }, data: { consentStatus: "OPTED_OUT", consentAt: new Date(), consentSource: "whatsapp", consentScope: "marketing", consentEvidence: input.providerMessageId ?? "inbound-demo" } });
    }
    const openConversation = await tx.conversation.findFirst({
      where: { contactId: input.contactId, status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] } },
      orderBy: { createdAt: "desc" },
    });
    const previous = !openConversation ? await tx.conversation.findFirst({
      where: { contactId: input.contactId, assignedAgent: { isActive: true } }, orderBy: { createdAt: "desc" },
    }) : null;
    const conversation = openConversation ?? await tx.conversation.create({ data: {
      contactId: input.contactId, assignedAgentId: previous?.assignedAgentId ?? null, status: ConversationStatus.OPEN, source: input.source ?? ConversationSource.MOCK,
    } });
    const receivedAt = input.receivedAt ?? new Date();
    const attachmentId = randomUUID();
    const message = await tx.message.create({ data: {
      conversationId: conversation.id, direction: MessageDirection.INBOUND,
      type: input.type ?? MessageType.TEXT, body: input.body, status: MessageStatus.SENT,
      createdAt: receivedAt, inboundKey: input.providerMessageId, providerMessageId: input.providerMessageId,
      ...(input.media ? { attachments: { create: [{ id: attachmentId, url: `/api/attachments/${attachmentId}`, ...input.media }] } } : {}),
      ...(!input.media && input.mediaUrl ? { attachments: { create: [{ url: input.mediaUrl, mimeType: guessMimeType(input.type) }] } } : {}),
    } });
    // Delayed webhook retries must not reopen the 24-hour reply window or
    // move the inbox ordering backwards. Outbound updates can run concurrently.
    await tx.conversation.updateMany({
      where: { id: conversation.id, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: receivedAt } }] }, data: { lastMessageAt: receivedAt },
    });
    await tx.conversation.updateMany({
      where: { id: conversation.id, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: receivedAt } }] }, data: { lastInboundAt: receivedAt },
    });
    const updated = await tx.conversation.update({ where: { id: conversation.id }, data: { unreadCount: { increment: 1 } } });
    await tx.auditLog.create({ data: {
      action: openConversation ? "message.received" : "conversation.created",
      entityType: "Conversation", entityId: conversation.id, conversationId: conversation.id,
      metadata: { messageId: message.id },
    } });
    return { conversation: updated, message, isNewConversation: !openConversation, isDuplicate: false };
  });
  if (result.isDuplicate) return result;
  const { conversation, message, isNewConversation } = result;
  // A notification outage must not cause Meta to re-deliver a committed message.
  const effects = await Promise.allSettled([
    evaluateTrigger(AutomationTrigger.NEW_INBOUND_MESSAGE, { conversationId: conversation.id }),
    ...(isNewConversation ? [evaluateTrigger(AutomationTrigger.NEW_CONVERSATION, { conversationId: conversation.id })] : []),
    scheduleNoReplyChecks(conversation.id),
    publishNewMessage({ type: "new_message", conversationId: conversation.id, message: {
      id: message.id, direction: message.direction, type: message.type, body: message.body,
      status: message.status, createdAt: message.createdAt.toISOString(),
    } }),
    publishConversationUpdated({ type: "conversation_updated", conversationId: conversation.id, patch: {
      unreadCount: conversation.unreadCount, lastMessageAt: conversation.lastMessageAt?.toISOString(),
    } }),
  ]);
  if (effects.some((effect) => effect.status === "rejected")) console.error("Inbound message persisted; one or more follow-up actions failed");
  return result;
}

export interface CreateOutboundMessageInput {
  conversationId: string;
  body: string;
  type?: MessageType;
  sentByUserId: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  requireOptIn?: boolean;
  campaignRecipientId?: string;
  requestKey?: string;
  automated?: boolean;
  media?: { file: Buffer; mimeType: string; fileName: string };
}

export class MessagePolicyError extends Error {}

export async function createOutboundMessage(input: CreateOutboundMessageInput) {
  let release: () => Promise<void>;
  try { release = await acquireSendLease(input.conversationId); }
  catch (error) { if (error instanceof SendConflictError) throw new MessagePolicyError(error.message); throw error; }
  try {
    if (input.requestKey) {
      const existing = await prisma.message.findUnique({ where: { requestKey: input.requestKey }, include: { attachments: true } });
      if (existing) {
        if (existing.conversationId !== input.conversationId || existing.sentByUserId !== input.sentByUserId) throw new MessagePolicyError("מזהה בקשה אינו תקין");
        if (["QUEUED", "UNKNOWN"].includes(existing.status)) throw new MessagePolicyError("תוצאת הבקשה הקודמת אינה ודאית. אין לשלוח שוב לפני בדיקה");
        return { conversation: await prisma.conversation.findUniqueOrThrow({ where: { id: input.conversationId } }), message: existing };
      }
    }
    return await sendOutboundMessage(input);
  } finally { await release(); }
}

async function sendOutboundMessage(input: CreateOutboundMessageInput) {
  const now = new Date();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    include: { contact: true },
  });

  const serviceWindow = !!conversation.lastInboundAt && now.getTime() - conversation.lastInboundAt.getTime() < 86400000;
  let marketing = Boolean(input.requireOptIn);
  if (input.automated && conversation.assignedAgentId) throw new MessagePolicyError("המענה האוטומטי נעצר כאשר נציג מטפל בשיחה");
  let body = input.body;
  if (input.templateId) {
    const template = await prisma.template.findUnique({ where: { id: input.templateId } });
    if (!template || template.status !== "APPROVED") throw new MessagePolicyError("התבנית אינה מאושרת לשליחה");
    marketing ||= template.category === "MARKETING";
    try {
      if (Object.values(input.templateVariables ?? {}).some((value) => /\{[^{}]+\}/.test(value))) throw new Error("יש לפתור את כל המשתנים לפני שליחה");
      validateTemplateVariables(template.body, input.templateVariables ?? {});
    }
    catch (error) { throw new MessagePolicyError((error as Error).message); }
    body = renderTemplate(template.body, input.templateVariables ?? {});
  } else if (!conversation.lastInboundAt || now.getTime() - conversation.lastInboundAt.getTime() >= 86400000) {
    throw new MessagePolicyError("חלון המענה הסתיים. יש לשלוח תבנית מאושרת");
  }
  const eligibility = eligibilityError(conversation.contact, marketing, serviceWindow);
  if (eligibility) throw new MessagePolicyError(eligibility);
  const provider = await getActiveProvider();
  if (provider instanceof MockWhatsAppProvider && (conversation.source === "WHATSAPP" || await prisma.message.findFirst({ where: { conversationId: conversation.id, providerCredentialId: { not: null } }, select: { id: true } }))) throw new MessagePolicyError("חיבור WhatsApp נותק. יש לחבר מחדש לפני שליחה בשיחה זו");
  if (provider.requiresVerifiedInbound && !input.templateId) {
    const verifiedInbound = await prisma.message.findFirst({ where: {
      conversationId: input.conversationId, direction: "INBOUND", inboundKey: { not: null },
      createdAt: { gt: new Date(now.getTime() - 86400000) },
    }, select: { id: true } });
    if (!verifiedInbound) throw new MessagePolicyError("נדרשת הודעת לקוח אמיתית מ־Meta ב־24 השעות האחרונות, או תבנית מאושרת");
  }
  const messageType = input.templateId ? "TEMPLATE" : (input.type ?? MessageType.TEXT);
  const uploaded = input.media ? await provider.uploadMedia(input.media.file, input.media.mimeType) : undefined;
  const outboundPayload: OutboundMessagePayload = {
    conversationId: input.conversationId,
    to: conversation.contact.phone,
    type: messageType as OutboundMessagePayload["type"],
    body,
    templateId: input.templateId,
    templateVariables: input.templateVariables,
    ...(uploaded ? { mediaId: uploaded.mediaId, mediaUrl: uploaded.mediaUrl, fileName: input.media?.fileName } : {}),
  };

  // Persist before contacting the provider. A timeout may mean it accepted
  // the message, so retain the queued row and never retry automatically.
  const attachmentId = randomUUID();
  // Reserve the marketing budget across campaigns and automation workers.
  if (marketing) {
    const reserved = await prisma.contact.updateMany({ where: { id: conversation.contact.id, isBlocked: false, consentStatus: "OPTED_IN", OR: [{ lastMarketingAt: null }, { lastMarketingAt: { lte: new Date(now.getTime() - MARKETING_INTERVAL_MS) } }] }, data: { lastMarketingAt: now } });
    if (!reserved.count) throw new MessagePolicyError("אין זכאות לדיוור או שנוצלה מגבלת דיוור אחת לנמען ב־24 שעות");
  }
  const queued = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      requestKey: input.requestKey,
      providerCredentialId: provider.credentialId,
      direction: MessageDirection.OUTBOUND,
      type: input.templateId ? MessageType.TEMPLATE : (input.type ?? MessageType.TEXT),
      body,
      status: MessageStatus.QUEUED,
      sentByUserId: input.sentByUserId,
      templateId: input.templateId,
      createdAt: now,
      ...(uploaded && input.media ? { attachments: { create: [{
        id: attachmentId, url: uploaded.mediaId ? `/api/attachments/${attachmentId}` : uploaded.mediaUrl,
        providerMediaId: uploaded.mediaId, mimeType: input.media.mimeType, fileName: input.media.fileName, sizeBytes: input.media.file.length,
      }] } } : {}),
    },
  });
  if (input.campaignRecipientId) {
    await prisma.campaignRecipient.update({ where: { id: input.campaignRecipientId }, data: { messageId: queued.id } });
  }
  let sendResult;
  try {
    // Opt-out / global block can change while media uploads are in flight.
    const freshContact = await prisma.contact.findUniqueOrThrow({ where: { id: conversation.contact.id } });
    const latestError = eligibilityError(freshContact, marketing, serviceWindow);
    if (latestError) {
      await prisma.message.update({ where: { id: queued.id }, data: { status: "FAILED", errorReason: latestError, failedAt: new Date() } });
      throw new MessagePolicyError(latestError);
    }
    sendResult = input.templateId ? await provider.sendTemplate(outboundPayload) : await provider.sendMessage(outboundPayload);
  } catch (error) {
    if (!(error instanceof MessagePolicyError)) await prisma.message.update({ where: { id: queued.id }, data: { status: "UNKNOWN", errorReason: "תוצאה לא ודאית; אין לנסות שוב אוטומטית" } });
    throw error;
  }
  const message = await prisma.message.update({
    where: { id: queued.id },
    include: { attachments: { select: { id: true, url: true, mimeType: true, fileName: true, sizeBytes: true } } },
    data: {
      status: sendResult.status === "FAILED" ? MessageStatus.FAILED : sendResult.status === "ACCEPTED" ? MessageStatus.ACCEPTED : MessageStatus.SENT,
      errorReason: sendResult.error ?? null,
      acceptedAt: sendResult.status !== "FAILED" ? new Date() : null,
      failedAt: sendResult.status === "FAILED" ? new Date() : null,
      providerMessageId: sendResult.providerMessageId || null,
    },
  });

  const updated = await prisma.conversation.update({
    where: { id: input.conversationId },
    data: sendResult.status === "FAILED" ? {} : { lastMessageAt: now },
  });

  await writeAuditLog({
    actorUserId: input.sentByUserId,
    action: sendResult.status === "FAILED" ? "message.failed" : "message.accepted",
    entityType: "Conversation",
    entityId: input.conversationId,
    conversationId: input.conversationId,
    metadata: { messageId: message.id, providerError: sendResult.error ?? null },
  });

  await publishNewMessage({
    type: "new_message",
    conversationId: input.conversationId,
    message: {
      id: message.id,
      direction: message.direction,
      type: message.type,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    },
  });

  // Real providers report delivery/read progression via webhook status
  // callbacks (see MetaWhatsAppProvider.receiveWebhook); the mock provider
  // has no external caller, so simulate the same progression locally.
  if (provider instanceof MockWhatsAppProvider && sendResult.status !== "FAILED") {
    void simulateDeliveryProgression(message.id);
  }

  return { conversation: updated, message };
}

// Dev-only simplification (flagged in the plan): relies on the Node process
// staying alive between the two timeouts, which holds under `next dev` /
// `next start` but not on serverless. Production hardening would replace
// this with the same DB-scheduled pattern used for delayed automations.
async function simulateDeliveryProgression(messageId: string) {
  setTimeout(async () => {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.DELIVERED, deliveredAt: new Date() },
      });
    } catch {
      // Message may no longer exist (e.g. in tests); safe to ignore.
    }
  }, 1500);

  setTimeout(async () => {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.READ, readAt: new Date() },
      });
    } catch {
      // ignore
    }
  }, 4000);
}

function guessMimeType(type: MessageType | undefined): string {
  switch (type) {
    case MessageType.IMAGE:
      return "image/jpeg";
    case MessageType.VIDEO:
      return "video/mp4";
    case MessageType.AUDIO:
      return "audio/ogg";
    case MessageType.DOCUMENT:
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
