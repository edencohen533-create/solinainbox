import { processOrganizations } from "@/jobs/organization-runner";
import { processDueCampaigns } from "@/jobs/campaign-runner";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await processOrganizations("campaign", processDueCampaigns));
}
