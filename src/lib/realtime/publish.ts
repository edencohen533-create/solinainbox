import { getSupabaseServerClient } from "@/lib/supabase";
import { conversationChannel, INBOX_CHANNEL, type RealtimeEvent } from "./channels";

export interface RealtimePublisher {
  publish(channel: string, event: RealtimeEvent): Promise<void>;
}

const supabasePublisher: RealtimePublisher = {
  async publish(channel, event) {
    const client = getSupabaseServerClient();
    const result = await client.channel(channel).send({
      type: "broadcast",
      event: event.type,
      payload: event,
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
  await activePublisher.publish(conversationChannel(event.conversationId), event);
  await activePublisher.publish(INBOX_CHANNEL, event);
}

export async function publishConversationUpdated(
  event: Extract<RealtimeEvent, { type: "conversation_updated" }>
): Promise<void> {
  await activePublisher.publish(conversationChannel(event.conversationId), event);
  await activePublisher.publish(INBOX_CHANNEL, event);
}

export async function publishTyping(event: Extract<RealtimeEvent, { type: "typing" }>): Promise<void> {
  await activePublisher.publish(conversationChannel(event.conversationId), event);
}
