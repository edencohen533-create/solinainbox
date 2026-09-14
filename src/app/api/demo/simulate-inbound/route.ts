import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole, ROLES_ADMIN_MANAGER } from "@/lib/auth-guards";
import { getMockProvider } from "@/server/providers/provider-registry";
import { simulateInboundSchema } from "@/lib/validation/demo";

export async function POST(request: Request) {
  const session = await auth();

  if (!hasRole(session, ROLES_ADMIN_MANAGER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = simulateInboundSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const provider = getMockProvider();
  const { conversation, message } = await provider.simulateInbound(parsed.data);

  return NextResponse.json({ conversationId: conversation.id, messageId: message.id });
}
