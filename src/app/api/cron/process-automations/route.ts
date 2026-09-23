import { processOrganizations } from "@/jobs/organization-runner";
import { NextResponse } from "next/server";
import { processDueAutomationRuns } from "@/jobs/automation-runner";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOrganizations("automation", processDueAutomationRuns);
  return NextResponse.json(result);
}

export const maxDuration = 60;
