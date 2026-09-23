import { afterEach, describe, expect, it, vi } from "vitest";
const { send, channel } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue("ok"), channel: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseServerClient: () => ({ channel }) }));
import { publishNewMessage, resetRealtimePublisher } from "@/lib/realtime/publish";
afterEach(() => vi.clearAllMocks());
describe("public realtime privacy", () => {
  it("never broadcasts customer messages or user data on public channels", async () => {
    channel.mockReturnValue({ send }); resetRealtimePublisher();
    await publishNewMessage({ type: "new_message", conversationId: "c", message: { id: "m", body: "private content", direction: "INBOUND", status: "SENT", type: "TEXT", createdAt: new Date().toISOString() } });
    expect(send).toHaveBeenCalledTimes(2);
    for (const [payload] of send.mock.calls) expect(payload).toEqual({ type: "broadcast", event: "invalidate", payload: {} });
  });
});
