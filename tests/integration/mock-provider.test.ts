import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationStatus, MessageDirection, MessageStatus, MessageType } from "@prisma/client";

const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();
const auditLogCreate = vi.fn();
const contactUpdate = vi.fn();
const findExistingMessage = vi.fn();
const transactionQuery = vi.fn();
const conversationUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => {
  const db = {
    $queryRaw: (...args: unknown[]) => transactionQuery(...args),
    contact: { update: (...args: unknown[]) => contactUpdate(...args) },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      create: (...args: unknown[]) => conversationCreate(...args),
      update: (...args: unknown[]) => conversationUpdate(...args),
      updateMany: (...args: unknown[]) => conversationUpdateMany(...args),
    },
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findUnique: (...args: unknown[]) => findExistingMessage(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => auditLogCreate(...args),
    },
    // No active automation rules in these tests — evaluateTrigger and
    // scheduleNoReplyChecks (called by createInboundMessage) just no-op.
    automationRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});

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
    contactUpdate.mockReset();
    findExistingMessage.mockReset();
    transactionQuery.mockReset();
    conversationUpdateMany.mockReset();
  });

  afterEach(() => {
    resetRealtimePublisher();
  });

  it("ignores a repeated provider ID without unread increments or side effects", async () => {
    findExistingMessage.mockResolvedValue({ id: "existing", conversation: { id: "conv" } });
    const result = await createInboundMessage({ contactId: "contact-1", providerMessageId: "wamid.repeat", body: "הסר" });
    expect(result.isDuplicate).toBe(true);
    expect(messageCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("uses the provider time and conditional timestamp updates for delayed events", async () => {
    const receivedAt = new Date("2025-01-01T00:00:00Z");
    conversationFindFirst.mockResolvedValue({ id: "conv" });
    conversationUpdate.mockResolvedValue({ id: "conv", unreadCount: 1 });
    messageCreate.mockResolvedValue({ id: "m", createdAt: receivedAt });
    await createInboundMessage({ contactId: "contact-1", providerMessageId: "wamid.old", receivedAt, body: "old message" });
    expect(messageCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdAt: receivedAt, inboundKey: "wamid.old" }) }));
    expect(conversationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: receivedAt } }] }) }));
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

  it("honors an inbound unsubscribe before evaluating send automations", async () => {
    conversationFindFirst.mockResolvedValue({ id: "conv-1", status: ConversationStatus.OPEN });
    messageCreate.mockResolvedValue({ id: "msg-stop", direction: MessageDirection.INBOUND, type: MessageType.TEXT, body: "הסר", status: MessageStatus.SENT, createdAt: new Date() });
    conversationUpdate.mockResolvedValue({ id: "conv-1", unreadCount: 1, lastMessageAt: new Date() });
    await createInboundMessage({ contactId: "contact-1", body: " הסר " });
    expect(contactUpdate).toHaveBeenCalledWith({ where: { id: "contact-1" }, data: { consentStatus: "OPTED_OUT" } });
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
