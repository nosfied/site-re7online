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

export class CampaignNameConflictError extends Error {
  readonly code = "campaign_name_conflict";

  constructor() {
    super("Campaign name already exists for this tenant.");
    this.name = "CampaignNameConflictError";
  }
}

export function normalizeCampaignNameForUniqueness(name: string) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function isCampaignNameConflictError(error: unknown): error is CampaignNameConflictError {
  return error instanceof CampaignNameConflictError;
}

async function assertCampaignNameAvailable(params: { clientId: string; name: string }) {
  const prisma = getPrisma();
  const normalized = normalizeCampaignNameForUniqueness(params.name);
  if (!normalized) return;
  const existing = await prisma.campaign.findMany({
    where: { clientId: params.clientId },
    select: { name: true },
    take: 5000,
  });
  if (existing.some((campaign) => normalizeCampaignNameForUniqueness(campaign.name) === normalized)) {
    throw new CampaignNameConflictError();
  }
}

export async function createCampaign(params: CreateCampaignParams) {
  const prisma = getPrisma();
  await assertCampaignNameAvailable({ clientId: params.clientId, name: params.name });
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
