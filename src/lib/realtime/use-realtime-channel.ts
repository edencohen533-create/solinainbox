"use client";

import { useEffect, useEffectEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeEvent } from "./channels";

/**
 * Subscribes to a Supabase broadcast channel for the lifetime of the
 * component and invokes `onEvent` for every message. Used both for a single
 * conversation's channel and the global inbox-list channel.
 */
export function useRealtimeChannel(channelName: string, onEvent: (event: RealtimeEvent) => void) {
  const handleEvent = useEffectEvent((event: RealtimeEvent) => onEvent(event));

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    const channel = client.channel(channelName);

    channel.on("broadcast", { event: "new_message" }, ({ payload }) => handleEvent(payload as RealtimeEvent));
    channel.on("broadcast", { event: "conversation_updated" }, ({ payload }) => handleEvent(payload as RealtimeEvent));
    channel.on("broadcast", { event: "typing" }, ({ payload }) => handleEvent(payload as RealtimeEvent));

    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [channelName]);
}
