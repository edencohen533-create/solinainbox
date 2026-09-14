import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { assignConversation } from "@/server/services/conversation-service";

const assignSchema = z.object({ agentId: z.string().nullable() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = assignSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { agentId } = parsed.data;

  const isPrivileged = session.user.role === Role.ADMIN || session.user.role === Role.MANAGER;
  const isSelfAssignment = agentId === session.user.id || agentId === null;
  if (!isPrivileged && !isSelfAssignment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conversation = await assignConversation(id, agentId, session.user.id);
  return NextResponse.json({ conversation });
}
