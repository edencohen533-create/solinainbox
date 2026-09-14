import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getConversationForUser } from "@/server/services/conversation-service";
import { createOutboundMessage } from "@/server/services/message-service";

const sendMessageSchema = z.object({
  body: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationForUser(session, id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const withinWindow = conversation.lastInboundAt && Date.now() - conversation.lastInboundAt.getTime() <= TWENTY_FOUR_HOURS_MS;
  if (!withinWindow) {
    return NextResponse.json(
      { error: "Free-text messages require the customer to have messaged within the last 24 hours. Use an approved template instead." },
      { status: 409 }
    );
  }

  const parsed = sendMessageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createOutboundMessage({
    conversationId: id,
    body: parsed.data.body,
    sentByUserId: session.user.id,
  });

  return NextResponse.json({ messageId: result.message.id });
}
