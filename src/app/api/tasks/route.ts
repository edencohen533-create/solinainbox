import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { organizationRequest } from "@/lib/organization-request";
import { createTaskSchema, listTaskSchema } from "@/lib/validation/task";
import { createContactTask, listContactTasks, TaskError } from "@/server/services/task-service";
export const maxDuration = 60;
export const GET = organizationRequest(async function(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = listTaskSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return NextResponse.json({ error: "מסנני משימות אינם תקינים" }, { status: 400 });
  try { return NextResponse.json(await listContactTasks(session, input.data)); }
  catch (error) { if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
});
export const POST = organizationRequest(async function(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = createTaskSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "יש למלא משימה, נציג ומועד יעד תקינים" }, { status: 400 });
  try { return NextResponse.json({ task: await createContactTask(session, input.data) }, { status: 201 }); }
  catch (error) { if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
});
