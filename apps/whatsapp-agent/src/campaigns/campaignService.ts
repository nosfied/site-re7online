import { getPrisma } from "../db.js";

export type CampaignTemplateComponents = Array<{
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}>;

export type CreateCampaignParams = {
  clientId: string;
  name: string;
  templateName: string;
  totalRecipients: number;
};

export async function createCampaign(params: CreateCampaignParams) {
  const prisma = getPrisma();
  return prisma.campaign.create({
    data: {
      clientId: params.clientId,
      name: params.name,
      templateName: params.templateName,
      status: "sending",
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
