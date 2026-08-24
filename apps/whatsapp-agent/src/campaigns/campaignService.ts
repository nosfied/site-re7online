import { getPrisma } from "../db.js";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "./campaignLifecycle.js";
export { CAMPAIGN_STATUSES, type CampaignStatus } from "./campaignLifecycle.js";

export type CampaignTemplateComponents = Array<{
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}>;

export type CreateCampaignParams = {
  clientId: string;
  templateId?: string | null;
  name: string;
  templateName: string;
  totalRecipients: number;
  status?: CampaignStatus;
  scheduledAt?: Date | null;
};

export async function createCampaign(params: CreateCampaignParams) {
  const prisma = getPrisma();
  return prisma.campaign.create({
    data: {
      clientId: params.clientId,
      templateId: params.templateId ?? null,
      name: params.name,
      templateName: params.templateName,
      status: params.status ?? "sending",
      totalRecipients: params.totalRecipients,
      scheduledAt: params.scheduledAt ?? null,
    },
  });
}

export async function getCampaignById(campaignId: string, clientId?: string) {
  const prisma = getPrisma();
  return prisma.campaign.findFirst({
    where: {
      id: campaignId,
      ...(clientId ? { clientId } : {}),
    },
  });
}

export async function cancelCampaign(params: { campaignId: string; clientId: string }) {
  const prisma = getPrisma();
  return prisma.campaign.update({
    where: { id: params.campaignId },
    data: { status: "cancelled", scheduledAt: null },
  });
}

export async function listCampaigns(params: {
  clientId: string;
  limit: number;
}) {
  const prisma = getPrisma();
  return prisma.campaign.findMany({
    where: { clientId: params.clientId },
    orderBy: { createdAt: "desc" },
    take: params.limit,
  });
}
