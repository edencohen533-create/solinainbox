import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getConversationForUser } from "@/server/services/conversation-service";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactProfilePanel } from "@/components/inbox/contact-profile-panel";
import { ConversationActions } from "@/components/inbox/conversation-actions";
import type { MessageItem } from "@/types/domain";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  const conversation = await getConversationForUser(session, conversationId);
  if (!conversation) {
    notFound();
  }

  const messages: MessageItem[] = conversation.messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    type: message.type,
    body: message.body,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    sentByUser: message.sentByUser ? { id: message.sentByUser.id, name: message.sentByUser.name } : null,
  }));

  // eslint-disable-next-line react-hooks/purity -- Server Component computed once per request, not a memoized render.
  const now = Date.now();
  const composerDisabled =
    !conversation.lastInboundAt || now - conversation.lastInboundAt.getTime() > TWENTY_FOUR_HOURS_MS;

  const agents = await prisma.user.findMany({
    where: { role: { in: [Role.AGENT, Role.MANAGER] }, isActive: true },
    select: { id: true, name: true },
  });

  return (
    <div className="flex h-full flex-col">
      <ConversationActions
        conversationId={conversation.id}
        status={conversation.status}
        assignedAgentId={conversation.assignedAgentId}
        agents={agents}
        isSpam={conversation.isSpam}
      />
      <div className="flex min-h-0 flex-1">
      <ChatPanel
        key={conversation.id}
        conversationId={conversation.id}
        initialMessages={messages}
        composerDisabled={composerDisabled}
        composerDisabledReason="עברו יותר מ-24 שעות מאז הודעת הלקוח האחרונה — יש לשלוח תבנית מאושרת."
      />
      <ContactProfilePanel
        contact={{
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          email: conversation.contact.email,
          consentStatus: conversation.contact.consentStatus,
          tags: conversation.contact.tags,
          customFields: conversation.contact.customFields,
        }}
      />
      </div>
    </div>
  );
}
