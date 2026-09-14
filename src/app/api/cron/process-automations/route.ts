import { NextResponse } from "next/server";
import { processDueAutomationRuns } from "@/jobs/automation-runner";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueAutomationRuns();
  return NextResponse.json(result);
}
