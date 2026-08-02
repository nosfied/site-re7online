import { getPrisma } from "../db.js";

export const CAMPAIGN_STATUSES = [
  "draft",
  "sending",
  "completed",
  "blocked",
  "failed",
  "cancelled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

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
    data: { status: "cancelled" },
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
