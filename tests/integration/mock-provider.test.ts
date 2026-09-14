import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationStatus, MessageDirection, MessageStatus, MessageType } from "@prisma/client";

const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      create: (...args: unknown[]) => conversationCreate(...args),
      update: (...args: unknown[]) => conversationUpdate(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => auditLogCreate(...args),
    },
    // No active automation rules in these tests — evaluateTrigger and
    // scheduleNoReplyChecks (called by createInboundMessage) just no-op.
    automationRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { createInboundMessage } from "@/server/services/message-service";
import { setRealtimePublisher, resetRealtimePublisher, type RealtimePublisher } from "@/lib/realtime/publish";

describe("createInboundMessage (mock provider inbound path)", () => {
  let publishSpy: ReturnType<typeof vi.fn<RealtimePublisher["publish"]>>;

  beforeEach(() => {
    publishSpy = vi.fn<RealtimePublisher["publish"]>().mockResolvedValue(undefined);
    const fakePublisher: RealtimePublisher = { publish: publishSpy };
    setRealtimePublisher(fakePublisher);

    conversationFindFirst.mockReset();
    conversationCreate.mockReset();
    conversationUpdate.mockReset();
    messageCreate.mockReset();
    auditLogCreate.mockReset();
  });

  afterEach(() => {
    resetRealtimePublisher();
  });

  it("creates a new conversation when the contact has no open one", async () => {
    conversationFindFirst.mockResolvedValue(null);
    conversationCreate.mockResolvedValue({ id: "conv-1", status: ConversationStatus.OPEN });
    messageCreate.mockResolvedValue({
      id: "msg-1",
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      body: "שלום",
      status: MessageStatus.SENT,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    conversationUpdate.mockResolvedValue({
      id: "conv-1",
      status: ConversationStatus.OPEN,
      unreadCount: 1,
      lastMessageAt: new Date("2026-01-01T10:00:00Z"),
    });

    const result = await createInboundMessage({ contactId: "contact-1", body: "שלום" });

    expect(conversationCreate).toHaveBeenCalledTimes(1);
    expect(result.isNewConversation).toBe(true);
    expect(result.message.direction).toBe(MessageDirection.INBOUND);
    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-1" },
        data: expect.objectContaining({ unreadCount: { increment: 1 } }),
      })
    );
  });

  it("reuses an existing open conversation instead of creating a new one", async () => {
    conversationFindFirst.mockResolvedValue({ id: "conv-existing", status: ConversationStatus.OPEN });
    messageCreate.mockResolvedValue({
      id: "msg-2",
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      body: "עוד הודעה",
      status: MessageStatus.SENT,
      createdAt: new Date("2026-01-01T10:05:00Z"),
    });
    conversationUpdate.mockResolvedValue({
      id: "conv-existing",
      status: ConversationStatus.OPEN,
      unreadCount: 2,
      lastMessageAt: new Date("2026-01-01T10:05:00Z"),
    });

    const result = await createInboundMessage({ contactId: "contact-1", body: "עוד הודעה" });

    expect(conversationCreate).not.toHaveBeenCalled();
    expect(result.isNewConversation).toBe(false);
    expect(result.conversation.id).toBe("conv-existing");
  });

  it("publishes a realtime event for both the conversation channel and the inbox channel", async () => {
    conversationFindFirst.mockResolvedValue({ id: "conv-1", status: ConversationStatus.OPEN });
    messageCreate.mockResolvedValue({
      id: "msg-3",
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      body: "בדיקה",
      status: MessageStatus.SENT,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    conversationUpdate.mockResolvedValue({
      id: "conv-1",
      status: ConversationStatus.OPEN,
      unreadCount: 1,
      lastMessageAt: new Date("2026-01-01T10:00:00Z"),
    });

    await createInboundMessage({ contactId: "contact-1", body: "בדיקה" });

    // publishNewMessage + publishConversationUpdated, each fanning out to
    // the conversation channel and the global inbox channel: 4 calls total.
    expect(publishSpy).toHaveBeenCalledTimes(4);
    const channels = publishSpy.mock.calls.map((call) => call[0]);
    expect(channels).toContain("conversation:conv-1");
    expect(channels).toContain("inbox:global");
  });
});
