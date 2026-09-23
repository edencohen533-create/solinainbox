import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildConversationScope } from "@/server/services/conversation-service";
async function context(id: string) {
  const session = await auth();
  if (!session?.user) return null;
  return await prisma.conversation.findFirst({ where: { id, ...buildConversationScope(session) }, select: { id: true } }) ? session.user.id : null;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, userId = await context(id);
  if (!userId) return Response.json({ error: "Not found" }, { status: 404 });
  const draft = await prisma.conversationDraft.findUnique({ where: { conversationId_userId: { conversationId: id, userId } } });
  return Response.json({ body: draft?.body ?? "" }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, userId = await context(id);
  if (!userId) return Response.json({ error: "Not found" }, { status: 404 });
  const data = z.object({ body: z.string().max(4096) }).safeParse(await request.json().catch(() => null));
  if (!data.success) return Response.json({ error: "Invalid draft" }, { status: 400 });
  await prisma.conversationDraft.upsert({ where: { conversationId_userId: { conversationId: id, userId } }, create: { conversationId: id, userId, body: data.data.body }, update: { body: data.data.body } });
  return Response.json({ ok: true });
}
