import type { MessageDirection, MessageStatus, MessageType, ConversationStatus } from "@prisma/client";

export function conversationChannel(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export const INBOX_CHANNEL = "inbox:global";

export interface NewMessageEvent {
  type: "new_message";
  conversationId: string;
  message: {
    id: string;
    direction: MessageDirection;
    type: MessageType;
    body: string | null;
    status: MessageStatus;
    createdAt: string;
  };
}

export interface ConversationUpdatedEvent {
  type: "conversation_updated";
  conversationId: string;
  patch: {
    status?: ConversationStatus;
    assignedAgentId?: string | null;
    unreadCount?: number;
    lastMessageAt?: string;
  };
}

export interface TypingEvent {
  type: "typing";
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export type RealtimeEvent = NewMessageEvent | ConversationUpdatedEvent | TypingEvent;
