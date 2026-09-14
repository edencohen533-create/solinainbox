import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations, type ConversationListFilter } from "@/server/services/conversation-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filter: ConversationListFilter = {
    status: (url.searchParams.get("status") as ConversationListFilter["status"]) ?? undefined,
    assignedTo: (url.searchParams.get("assignedTo") as ConversationListFilter["assignedTo"]) ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  const conversations = await listConversations(session, filter);
  return NextResponse.json({ conversations });
}
