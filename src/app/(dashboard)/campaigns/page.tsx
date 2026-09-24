import { listSenderOptions } from "@/server/providers/provider-registry";
import { organizationRequest } from "@/lib/organization-request";
import { listSendableTemplates } from "@/server/services/template-service";
import { campaignActor } from "@/lib/campaign-auth";
import { prisma } from "@/lib/prisma";
import { CampaignDashboard } from "@/components/campaigns/campaign-dashboard";
import { listCampaigns } from "@/server/services/campaign-service";
import { getActiveProviderSummary } from "@/server/services/provider-credential-service";

export default organizationRequest(async function CampaignsPage() {
  if (!await campaignActor()) return <p className="p-6">הגישה לקמפיינים מיועדת למנהלים בלבד.</p>;
  const [campaigns, lists, contacts, templates, provider, senders, tags, agents] = await Promise.all([
    listCampaigns(),
    prisma.distributionList.findMany({ orderBy: { createdAt: "desc" }, include: { members: { select: { contactId: true } }, _count: { select: { members: true } } } }),
    prisma.contact.findMany({ orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, phone: true, consentStatus: true } }),
    listSendableTemplates(),
    getActiveProviderSummary(),
    listSenderOptions(),
    prisma.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <CampaignDashboard initialCampaigns={JSON.parse(JSON.stringify(campaigns))} lists={lists} contacts={contacts} templates={templates} audienceOptions={{ tags, agents, campaigns: campaigns.map(({ id, name }) => ({ id, name })) }} mock={provider.provider === "mock"} senders={senders} />;
});
