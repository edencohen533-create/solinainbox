import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { organizationRequest } from "@/lib/organization-request";
import { updateTaskSchema } from "@/lib/validation/task";
import { updateContactTask, TaskError } from "@/server/services/task-service";
export const maxDuration = 60;
export const PATCH = organizationRequest(async function(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = updateTaskSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "פרטי עדכון המשימה אינם תקינים" }, { status: 400 });
  try { return NextResponse.json({ task: await updateContactTask(session, (await params).id, input.data) }); }
  catch (error) { if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
});
