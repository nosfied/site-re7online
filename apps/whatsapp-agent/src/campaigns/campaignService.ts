import crypto from "node:crypto";
import { MessageStatus, MessageType } from "@prisma/client";
import { getTenant } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { logger } from "../logger/logger.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { sendTemplate } from "../services/outboundTemplateService.js";

const CAMPAIGN_THROTTLE_MS = 1000;

export type CreateCampaignParams = {
  clientId: string;
  name: string;
  templateName: string;
  totalRecipients: number;
};

export type RunCampaignParams = {
  clientId: string;
  clientKey: string;
  name: string;
  templateName: string;
  waIds: string[];
};

export type CampaignRunResult = {
  campaignId: string;
  campaignRunId: string;
  status: "completed" | "blocked" | "failed";
  totalRecipients: number;
  sentCount: number;
  blockedCount: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createCampaign(params: CreateCampaignParams) {
  const prisma = getPrisma();
  return prisma.campaign.create({
    data: {
      clientId: params.clientId,
      name: params.name,
      templateName: params.templateName,
      status: "draft",
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

export async function runCampaign(params: RunCampaignParams): Promise<CampaignRunResult> {
  const prisma = getPrisma();
  const tenant = await getTenant(params.clientKey);
  const phoneNumberId = tenant?.metaPhoneNumberId || undefined;
  const language = tenant?.defaultLanguage || "pt_BR";
  const waIds = Array.from(new Set(params.waIds.map((waId) => waId.trim()).filter(Boolean)));
  const campaign = await createCampaign({
    clientId: params.clientId,
    name: params.name,
    templateName: params.templateName,
    totalRecipients: waIds.length,
  });
  const campaignRunId = crypto.randomUUID();

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "sending" },
  });

  logger.info({
    event: "campaign.started",
    campaignId: campaign.id,
    campaignRunId,
    clientId: params.clientId,
    clientKey: params.clientKey,
    templateName: params.templateName,
    totalRecipients: waIds.length,
  });

  return logger.withContext(
    {
      campaignId: campaign.id,
      campaignRunId,
      clientId: params.clientId,
      clientKey: params.clientKey,
    },
    async () => {
      let sentCount = 0;
      let blockedCount = 0;

      for (let index = 0; index < waIds.length; index += 1) {
        const waId = waIds[index];
        logger.updateContext({
          waId,
          conversationKey: makeConversationKey(params.clientKey, waId),
        });
        const requestId = crypto.randomUUID();
        const messageId = `campaign.${campaign.id}.${index + 1}`;
        const result = await sendTemplate({
          toE164: waId,
          waId,
          intent: undefined,
          templateName: params.templateName,
          lang: language,
          requestId,
          rid: campaignRunId,
          messageId,
          clientId: params.clientId,
          clientKey: params.clientKey,
        });

        if (result.blockedByUsage) {
          blockedCount += 1;
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: "blocked",
              blockedCount,
              sentCount,
            },
          });
          logger.warn({
            event: "campaign.blocked_by_limit",
            campaignId: campaign.id,
            campaignRunId,
            requestId,
            waId,
            templateName: params.templateName,
            sentCount,
            blockedCount,
          });
          return {
            campaignId: campaign.id,
            campaignRunId,
            status: "blocked",
            totalRecipients: waIds.length,
            sentCount,
            blockedCount,
          };
        }

        const status = result.ok ? MessageStatus.SENT : MessageStatus.FAILED;
        await persistOutboundMessage({
          clientId: params.clientId,
          phoneNumberId,
          waId,
          messageId,
          type: MessageType.TEMPLATE,
          status,
          templateName: params.templateName,
          templateLang: language,
          requestId,
          metaMessageId: result.metaMessageId ?? null,
          errorBody: result.errorBody ?? null,
          rawPayload: {
            source: "campaign",
            campaignId: campaign.id,
            campaignRunId,
            templateName: params.templateName,
          },
        });
        await persistEvent({
          clientId: params.clientId,
          waId,
          messageId,
          requestId,
          eventName: result.ok ? "campaign.message.sent" : "campaign.message.failed",
          payloadJson: {
            campaignId: campaign.id,
            campaignRunId,
            templateName: params.templateName,
            waId,
            status: result.status ?? null,
            errorBody: result.errorBody ?? null,
          },
        });

        if (!result.ok) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: "failed",
              sentCount,
              blockedCount,
            },
          });
          logger.error({
            event: "campaign.message.failed",
            campaignId: campaign.id,
            campaignRunId,
            requestId,
            waId,
            templateName: params.templateName,
            errorBody: result.errorBody ?? null,
            status: result.status ?? null,
          });
          return {
            campaignId: campaign.id,
            campaignRunId,
            status: "failed",
            totalRecipients: waIds.length,
            sentCount,
            blockedCount,
          };
        }

        sentCount += 1;
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { sentCount },
        });
        logger.info({
          event: "campaign.message.sent",
          campaignId: campaign.id,
          campaignRunId,
          requestId,
          waId,
          templateName: params.templateName,
          sentCount,
          totalRecipients: waIds.length,
        });

        if (index < waIds.length - 1) {
          await sleep(CAMPAIGN_THROTTLE_MS);
        }
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "completed",
          sentCount,
          blockedCount,
        },
      });
      logger.info({
        event: "campaign.completed",
        campaignId: campaign.id,
        campaignRunId,
        clientId: params.clientId,
        clientKey: params.clientKey,
        templateName: params.templateName,
        totalRecipients: waIds.length,
        sentCount,
        blockedCount,
      });
      return {
        campaignId: campaign.id,
        campaignRunId,
        status: "completed",
        totalRecipients: waIds.length,
        sentCount,
        blockedCount,
      };
    }
  );
}
