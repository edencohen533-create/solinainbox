"use client";

import { useEffect, useRef, useState } from "react";
import { isSameDay } from "date-fns";
import { MessageBubble } from "./message-bubble";
import { DateSeparator } from "./date-separator";
import { MessageComposer } from "./message-composer";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { conversationChannel } from "@/lib/realtime/channels";
import type { MessageItem } from "@/types/domain";

export function ChatPanel({
  conversationId,
  initialMessages,
  composerDisabled,
  composerDisabledReason,
}: {
  conversationId: string;
  initialMessages: MessageItem[];
  composerDisabled?: boolean;
  composerDisabledReason?: string;
}) {
  // Keyed by conversationId in the parent, so switching conversations
  // remounts this component with fresh initial state instead of needing an
  // effect to re-sync `messages` from the `initialMessages` prop.
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useRealtimeChannel(conversationChannel(conversationId), (event) => {
    if (event.type === "new_message") {
      setMessages((prev) => {
        if (prev.some((m) => m.id === event.message.id)) return prev;
        return [
          ...prev,
          {
            id: event.message.id,
            direction: event.message.direction,
            type: event.message.type,
            body: event.message.body,
            status: event.message.status,
            createdAt: event.message.createdAt,
            sentByUser: null,
          },
        ];
      });
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showSeparator = !prev || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
          return (
            <div key={message.id}>
              {showSeparator && <DateSeparator date={new Date(message.createdAt)} />}
              <div className="mb-1.5">
                <MessageBubble message={message} />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <MessageComposer onSent={(message) => setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message])} conversationId={conversationId} disabled={composerDisabled} disabledReason={composerDisabledReason} />
    </div>
  );
}
