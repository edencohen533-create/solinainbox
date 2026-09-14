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
}

/**
 * The single entry point for every inbound WhatsApp message, whether it
 * comes from the mock provider's Demo Simulator or (later) a real Meta
 * Cloud API / Telnyx webhook. Both call this same function, so the DB
 * writes, automation evaluation, and realtime broadcast never need to
 * change when a real provider is plugged in.
 */
export async function createInboundMessage(input: CreateInboundMessageInput) {
  const openConversation = await prisma.conversation.findFirst({
    where: {
      contactId: input.contactId,
      status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] },
    },
    orderBy: { createdAt: "desc" },
  });

  const conversation =
    openConversation ??
    (await prisma.conversation.create({
      data: {
        contactId: input.contactId,
        status: ConversationStatus.OPEN,
        source: input.source ?? ConversationSource.MOCK,
      },
    }));

  const isNewConversation = !openConversation;
  const now = new Date();

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      type: input.type ?? MessageType.TEXT,
      body: input.body,
      status: MessageStatus.SENT,
      createdAt: now,
      ...(input.mediaUrl
        ? { attachments: { create: [{ url: input.mediaUrl, mimeType: guessMimeType(input.type) }] } }
        : {}),
    },
  });

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: now,
      lastInboundAt: now,
      unreadCount: { increment: 1 },
    },
  });

  await writeAuditLog({
    action: isNewConversation ? "conversation.created" : "message.received",
    entityType: "Conversation",
    entityId: conversation.id,
    conversationId: conversation.id,
    metadata: { messageId: message.id },
  });

  await evaluateTrigger(AutomationTrigger.NEW_INBOUND_MESSAGE, { conversationId: conversation.id });
  if (isNewConversation) {
    await evaluateTrigger(AutomationTrigger.NEW_CONVERSATION, { conversationId: conversation.id });
  }
  await scheduleNoReplyChecks(conversation.id);

  await publishNewMessage({
    type: "new_message",
    conversationId: conversation.id,
    message: {
      id: message.id,
      direction: message.direction,
      type: message.type,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    },
  });

  await publishConversationUpdated({
    type: "conversation_updated",
    conversationId: conversation.id,
    patch: {
      unreadCount: updated.unreadCount,
      lastMessageAt: updated.lastMessageAt?.toISOString(),
    },
  });

  return { conversation: updated, message, isNewConversation };
}

export interface CreateOutboundMessageInput {
  conversationId: string;
  body: string;
  type?: MessageType;
  sentByUserId: string;
  templateId?: string;
}

export async function createOutboundMessage(input: CreateOutboundMessageInput) {
  const now = new Date();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    include: { contact: true },
  });

  const provider = await getActiveProvider();
  const messageType = input.templateId ? "TEMPLATE" : (input.type ?? MessageType.TEXT);
  const outboundPayload: OutboundMessagePayload = {
    conversationId: input.conversationId,
    to: conversation.contact.phone,
    type: messageType as OutboundMessagePayload["type"],
    body: input.body,
    templateId: input.templateId,
  };

  const sendResult = input.templateId
    ? await provider.sendTemplate(outboundPayload)
    : await provider.sendMessage(outboundPayload);

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: MessageDirection.OUTBOUND,
      type: input.type ?? MessageType.TEXT,
      body: input.body,
      status: sendResult.status === "FAILED" ? MessageStatus.FAILED : MessageStatus.SENT,
      sentByUserId: input.sentByUserId,
      templateId: input.templateId,
      providerMessageId: sendResult.providerMessageId || null,
      createdAt: now,
    },
  });

  const updated = await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: now },
  });

  await writeAuditLog({
    actorUserId: input.sentByUserId,
    action: "message.sent",
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
