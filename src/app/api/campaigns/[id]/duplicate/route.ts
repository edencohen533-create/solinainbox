import { prisma } from "@/lib/prisma";
import { campaignActor } from "@/lib/campaign-auth";
import { CampaignError, createCampaign } from "@/server/services/campaign-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await campaignActor();
  if (!actor) return Response.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  const source = await prisma.campaign.findUnique({ where: { id } });
  if (!source) return Response.json({ error: "הקמפיין לא נמצא" }, { status: 404 });
  try {
    // New snapshot of today's list/template/sender. Never inherit a schedule or delivery history.
    const campaign = await createCampaign({ name: `${source.name.slice(0, 110)} — העתק`, listId: source.listId, templateId: source.templateId, variables: source.variables as Record<string, string> }, actor.id);
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
