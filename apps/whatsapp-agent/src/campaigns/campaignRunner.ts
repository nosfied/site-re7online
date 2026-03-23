import crypto from "node:crypto";
import { MessageStatus, MessageType } from "@prisma/client";
import { getTenant } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { logger } from "../logger/logger.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { sendTemplate } from "../services/outboundTemplateService.js";
import type { CampaignTemplateComponents } from "./campaignService.js";

const CAMPAIGN_THROTTLE_MS = 1000;
const runningCampaigns = new Map<string, Promise<void>>();

export type StartCampaignRunParams = {
  campaignId: string;
  clientId: string;
  clientKey: string;
  name: string;
  templateName: string;
  waIds: string[];
  components?: CampaignTemplateComponents;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startCampaignRun(params: StartCampaignRunParams) {
  if (runningCampaigns.has(params.campaignId)) {
    logger.warn({
      event: "campaign.runner.skipped_already_running",
      campaignId: params.campaignId,
      clientId: params.clientId,
      clientKey: params.clientKey,
    });
    return null;
  }

  const campaignRunId = crypto.randomUUID();
  const task = runCampaignInBackground(params, campaignRunId).finally(() => {
    runningCampaigns.delete(params.campaignId);
  });
  runningCampaigns.set(params.campaignId, task);
  return campaignRunId;
}

async function runCampaignInBackground(
  params: StartCampaignRunParams,
  campaignRunId: string
) {
  const prisma = getPrisma();
  const tenant = await getTenant(params.clientKey);
  const phoneNumberId = tenant?.metaPhoneNumberId || undefined;
  const language = tenant?.defaultLanguage || "pt_BR";
  const waIds = Array.from(new Set(params.waIds.map((waId) => waId.trim()).filter(Boolean)));

  logger.info({
    event: "campaign.runner.started",
    campaignId: params.campaignId,
    campaignRunId,
    clientId: params.clientId,
    clientKey: params.clientKey,
    templateName: params.templateName,
    totalRecipients: waIds.length,
  });

  logger.info({
    event: "campaign.started",
    campaignId: params.campaignId,
    campaignRunId,
    clientId: params.clientId,
    clientKey: params.clientKey,
    templateName: params.templateName,
    totalRecipients: waIds.length,
  });

  await logger.withContext(
    {
      campaignId: params.campaignId,
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
        const messageId = `campaign.${params.campaignId}.${index + 1}`;
        const result = await sendTemplate({
          toE164: waId,
          waId,
          intent: undefined,
          templateName: params.templateName,
          lang: language,
          components: params.components,
          requestId,
          rid: campaignRunId,
          messageId,
          clientId: params.clientId,
          clientKey: params.clientKey,
        });

        if (result.blockedByUsage) {
          blockedCount += 1;
          await prisma.campaign.update({
            where: { id: params.campaignId },
            data: {
              status: "blocked",
              blockedCount,
              sentCount,
            },
          });
          logger.warn({
            event: "campaign.blocked_by_limit",
            campaignId: params.campaignId,
            campaignRunId,
            requestId,
            waId,
            templateName: params.templateName,
            sentCount,
            blockedCount,
          });
          return;
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
            campaignId: params.campaignId,
            campaignRunId,
            templateName: params.templateName,
            components: params.components ?? null,
          },
        });
        await persistEvent({
          clientId: params.clientId,
          waId,
          messageId,
          requestId,
          eventName: result.ok ? "campaign.message.sent" : "campaign.message.failed",
          payloadJson: {
            campaignId: params.campaignId,
            campaignRunId,
            templateName: params.templateName,
            waId,
            status: result.status ?? null,
            errorBody: result.errorBody ?? null,
            components: params.components ?? null,
          },
        });

        if (!result.ok) {
          await prisma.campaign.update({
            where: { id: params.campaignId },
            data: {
              status: "failed",
              sentCount,
              blockedCount,
            },
          });
          logger.error({
            event: "campaign.message.failed",
            campaignId: params.campaignId,
            campaignRunId,
            requestId,
            waId,
            templateName: params.templateName,
            errorBody: result.errorBody ?? null,
            status: result.status ?? null,
          });
          return;
        }

        sentCount += 1;
        await prisma.campaign.update({
          where: { id: params.campaignId },
          data: { sentCount },
        });
        logger.info({
          event: "campaign.message.sent",
          campaignId: params.campaignId,
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
        where: { id: params.campaignId },
        data: {
          status: "completed",
          sentCount,
          blockedCount,
        },
      });
      logger.info({
        event: "campaign.completed",
        campaignId: params.campaignId,
        campaignRunId,
        clientId: params.clientId,
        clientKey: params.clientKey,
        templateName: params.templateName,
        totalRecipients: waIds.length,
        sentCount,
        blockedCount,
      });
    }
  ).catch(async (error) => {
    await prisma.campaign.update({
      where: { id: params.campaignId },
      data: { status: "failed" },
    });
    logger.error({
      event: "campaign.runner.failed",
      campaignId: params.campaignId,
      campaignRunId,
      clientId: params.clientId,
      clientKey: params.clientKey,
      message: (error as Error).message,
    });
  });
}
