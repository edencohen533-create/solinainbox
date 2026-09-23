import { NextResponse } from "next/server";
import { z } from "zod";
import { ConversationStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildConversationScope, getConversationForUser } from "@/server/services/conversation-service";
import { writeAuditLog } from "@/lib/audit";
import { publishConversationUpdated } from "@/lib/realtime/publish";

const patchSchema = z.object({
  status: z.enum(ConversationStatus).optional(),
  isSpam: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationForUser(session, id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.conversation.updateMany({ where: { id, ...buildConversationScope(session) }, data: parsed.data });
  if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "conversation.updated",
    entityType: "Conversation",
    entityId: id,
    conversationId: id,
    metadata: parsed.data,
  });

  await publishConversationUpdated({
    type: "conversation_updated",
    conversationId: id,
    patch: { status: conversation.status },
  });

  return NextResponse.json({ conversation });
}
