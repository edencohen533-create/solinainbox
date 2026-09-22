import { z } from "zod";
import { auth } from "@/lib/auth";
import { getConversationForUser } from "@/server/services/conversation-service";
import { createOutboundMessage, MessagePolicyError } from "@/server/services/message-service";

const sendMessageSchema = z.object({
  body: z.string().trim().max(4096).default(""),
  templateId: z.string().min(1).optional(),
  templateVariables: z.record(z.string(), z.string().trim().min(1).max(1024)).optional(),
}).refine((value) => value.templateId || value.body.length > 0);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!await getConversationForUser(session, id)) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "תוכן ההודעה אינו תקין" }, { status: 400 });
  try {
    const result = await createOutboundMessage({ conversationId: id, ...parsed.data, sentByUserId: session.user.id });
    if (result.message.status === "FAILED") return Response.json({ error: "הספק דחה את שליחת ההודעה", messageId: result.message.id }, { status: 502 });
    return Response.json({ messageId: result.message.id, message: result.message });
  } catch (error) {
    if (error instanceof MessagePolicyError) return Response.json({ error: error.message }, { status: 409 });
    console.error("Message send failed", error instanceof Error ? error.name : "Unknown");
    return Response.json({ error: "לא ניתן לאמת את השליחה. יש לבדוק את השיחה לפני ניסיון נוסף" }, { status: 502 });
  }
}
