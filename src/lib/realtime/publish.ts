import { getSupabaseServerClient } from "@/lib/supabase";
import { conversationChannel, INBOX_CHANNEL, type RealtimeEvent } from "./channels";

export interface RealtimePublisher {
  publish(channel: string, event: RealtimeEvent): Promise<void>;
}

const supabasePublisher: RealtimePublisher = {
  async publish(channel) {
    const client = getSupabaseServerClient();
    const result = await client.channel(channel).send({
      type: "broadcast",
      event: "invalidate",
      payload: {},
    });
    if (result !== "ok") {
      console.error(`[realtime] publish to "${channel}" failed: ${result}`);
    }
  },
};

let activePublisher: RealtimePublisher = supabasePublisher;

/** Test-only seam: swap in a fake publisher so tests don't need a live Supabase connection. */
export function setRealtimePublisher(publisher: RealtimePublisher): void {
  activePublisher = publisher;
}

export function resetRealtimePublisher(): void {
  activePublisher = supabasePublisher;
}

export async function publishNewMessage(event: Extract<RealtimeEvent, { type: "new_message" }>): Promise<void> {
  await safelyPublish(conversationChannel(event.conversationId), event);
  await safelyPublish(INBOX_CHANNEL, event);
}

export async function publishConversationUpdated(
  event: Extract<RealtimeEvent, { type: "conversation_updated" }>
): Promise<void> {
  await safelyPublish(conversationChannel(event.conversationId), event);
  await safelyPublish(INBOX_CHANNEL, event);
}

export async function publishTyping(event: Extract<RealtimeEvent, { type: "typing" }>): Promise<void> {
  await safelyPublish(conversationChannel(event.conversationId), event);
}

// Public Supabase channels carry wake-up signals only. The browser retrieves
// actual content from session-authenticated, conversation-scoped HTTP routes.
async function safelyPublish(channel: string, event: RealtimeEvent) {
  try { await activePublisher.publish(channel, event); }
  catch { console.error("Realtime notification failed; authenticated polling will recover"); }
}
export async function publishMessageStatus(event: Extract<RealtimeEvent, { type: "message_status" }>) {
  await safelyPublish(conversationChannel(event.conversationId), event);
}
