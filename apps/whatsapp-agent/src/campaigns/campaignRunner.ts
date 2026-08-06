import crypto from "node:crypto";
import { MessageStatus, MessageType } from "@prisma/client";
import { getTenant } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { logger } from "../logger/logger.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { sendTemplate } from "../services/outboundTemplateService.js";
import { renderTemplateBody } from "../templates/templateRendering.js";
import {
  buildMetaUsageEventPayload,
  type MetaUsageSource,
  recordMetaUsageLedgerEvent,
} from "../billing/metaUsageLedger.js";
import type { CampaignTemplateComponents } from "./campaignService.js";
import {
  resolveCampaignRecipientConversationTarget,
  summarizeCampaignRecipientResolution,
} from "./campaignRecipientConversationBridge.js";
import { ensureCampaignOutboundConversation } from "./campaignOutboundConversation.js";
import {
  filterOptedOutCampaignRecipients,
  recordCampaignOptOutBlocks,
} from "./optOutRegistry.js";

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
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
  source?: Extract<MetaUsageSource, "campaign" | "manual_campaign_send">;
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
  const templateForRendering = await prisma.template.findFirst({
    where: {
      clientId: params.clientId,
      name: params.templateName,
      language,
    },
    select: { content: true, category: true },
  });
  const usageSource = params.source ?? "campaign";
  const requestedWaIds = Array.from(new Set(params.waIds.map((waId) => waId.trim()).filter(Boolean)));
  const filteredRecipients = await filterOptedOutCampaignRecipients(prisma, {
    clientId: params.clientId,
    waIds: requestedWaIds,
  });
  const waIds = filteredRecipients.allowed;
  if (filteredRecipients.blocked.length > 0) {
    await prisma.campaign.update({
      where: { id: params.campaignId },
      data: {
        blockedCount: {
          increment: filteredRecipients.blocked.length,
        },
      },
    });
    await recordCampaignOptOutBlocks({
      clientId: params.clientId,
      campaignId: params.campaignId,
      templateName: params.templateName,
      blocked: filteredRecipients.blocked,
    });
  }

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
      let blockedCount =
        (
          await prisma.campaign.findUnique({
            where: { id: params.campaignId },
            select: { blockedCount: true },
          })
        )?.blockedCount ?? 0;

      for (let index = 0; index < waIds.length; index += 1) {
        const inputWaId = waIds[index];
        const campaignState = await prisma.campaign.findUnique({
          where: { id: params.campaignId },
          select: { status: true },
        });
        if (campaignState?.status === "cancelled") {
          logger.info({
            event: "campaign.cancelled",
            campaignId: params.campaignId,
            campaignRunId,
            clientId: params.clientId,
            clientKey: params.clientKey,
          });
          return;
        }
        const resolvedRecipient = await resolveCampaignRecipientConversationTarget(prisma, {
          clientId: params.clientId,
          inputWaId,
        });
        const resolutionSummary = summarizeCampaignRecipientResolution(resolvedRecipient);
        const waId = resolvedRecipient.winningWaId;
        const waIdCanonical = resolvedRecipient.winningWaIdCanonical;
        if (resolvedRecipient.resolved) {
          await persistEvent({
            clientId: params.clientId,
            conversationId: resolvedRecipient.conversationId ?? null,
            waId,
            waIdCanonical,
            requestId: `campaign-recipient-resolution:${params.campaignId}:${index + 1}`,
            eventName: "campaign.recipient.conversation_resolved",
            payloadJson: {
              campaignId: params.campaignId,
              campaignRunId,
              ...resolutionSummary,
            },
          });
        } else if (resolvedRecipient.reason === "ambiguous") {
          await persistEvent({
            clientId: params.clientId,
            waId: inputWaId,
            waIdCanonical: resolvedRecipient.inputWaIdCanonical,
            requestId: `campaign-recipient-resolution:${params.campaignId}:${index + 1}`,
            eventName: "campaign.recipient.conversation_resolution_ambiguous",
            payloadJson: {
              campaignId: params.campaignId,
              campaignRunId,
              ...resolutionSummary,
            },
          });
        }
        logger.updateContext({
          waId,
          conversationKey: makeConversationKey(params.clientKey, waId),
        });
        const requestId = crypto.randomUUID();
        const messageId = `campaign.${params.campaignId}.${index + 1}`;
        const components = params.componentsByWaId?.[inputWaId] ?? params.componentsByWaId?.[waId] ?? params.components;
        const result = await sendTemplate({
          toE164: waId,
          waId,
          intent: undefined,
          templateName: params.templateName,
          lang: language,
          components,
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
        const deliveredAt = new Date();
        const conversationOutcome = result.ok
          ? await ensureCampaignOutboundConversation(prisma, {
              clientId: params.clientId,
              clientKey: params.clientKey,
              waId,
              waIdCanonical,
              phoneNumberId,
              messageId,
              campaignId: params.campaignId,
              campaignRunId,
              templateName: params.templateName,
              sentAt: deliveredAt,
              source: "campaign",
              conversationId: resolvedRecipient.conversationId ?? null,
            })
          : null;
        const usagePayload = buildMetaUsageEventPayload({
          outboundMessageId: messageId,
          conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
          campaignId: params.campaignId,
          source: usageSource,
          messageKind: "template",
          templateName: params.templateName,
          templateCategory: templateForRendering?.category ?? null,
          sentAt: deliveredAt,
          status,
          windowOpenAtSend: null,
          waId,
          waIdCanonical,
        });
        await persistOutboundMessage({
          clientId: params.clientId,
          phoneNumberId,
          waId,
          waIdCanonical,
          messageId,
          type: MessageType.TEMPLATE,
          status,
          bodyText: renderTemplateBody(templateForRendering?.content, components),
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
            components: components ?? null,
            recipientResolution: resolutionSummary,
            conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
            metaUsage: usagePayload,
          },
        });
        await recordMetaUsageLedgerEvent({
          prisma,
          clientId: params.clientId,
          conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
          waId,
          waIdCanonical,
          messageId,
          requestId: `meta-usage:${messageId}:${usagePayload.deliveryStatus}`,
          input: {
            outboundMessageId: messageId,
            conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
            campaignId: params.campaignId,
            source: usageSource,
            messageKind: "template",
            templateName: params.templateName,
            templateCategory: templateForRendering?.category ?? null,
            sentAt: deliveredAt,
            status,
            windowOpenAtSend: null,
            waId,
            waIdCanonical,
          },
        });
        await persistEvent({
          clientId: params.clientId,
          conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
          waId,
          waIdCanonical,
          messageId,
          requestId,
          eventName: result.ok ? "campaign.message.sent" : "campaign.message.failed",
          payloadJson: {
            campaignId: params.campaignId,
            campaignRunId,
            templateName: params.templateName,
            waIdLast4: waId.slice(-4),
            waIdLength: waId.length,
            status: result.status ?? null,
            errorBody: result.errorBody ?? null,
            components: components ?? null,
            conversationId: conversationOutcome?.conversationId ?? resolvedRecipient.conversationId ?? null,
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
