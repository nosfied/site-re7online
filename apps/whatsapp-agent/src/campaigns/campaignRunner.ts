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
import { isCampaignTerminalStatus } from "./campaignLifecycle.js";
import {
  resolveCampaignRecipientConversationTarget,
  summarizeCampaignRecipientResolution,
} from "./campaignRecipientConversationBridge.js";
import { ensureCampaignOutboundConversation } from "./campaignOutboundConversation.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import {
  filterOptedOutCampaignRecipients,
  recordCampaignOptOutBlocks,
} from "./optOutRegistry.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import {
  isWhatsappTemplateCategoryAllowedForTenant,
  WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
} from "../meta/templateCategoryPolicy.js";

const CAMPAIGN_THROTTLE_MS = 1000;
const CAMPAIGN_SCHEDULE_TICK_MS = 60_000;
const CAMPAIGN_EXCLUSION_LOOKUP_BATCH_SIZE = 50;
const campaignSubmitStartedRequestId = (campaignId: string, position: number) =>
  `campaign-message-submit-started:${campaignId}:${position}`;
const campaignProviderAcceptedRequestId = (campaignId: string, position: number) =>
  `campaign-message-provider-accepted:${campaignId}:${position}`;
const runningCampaigns = new Map<string, Promise<void>>();
let scheduleTimer: NodeJS.Timeout | null = null;

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

type ScheduledCampaignSeed = {
  recipients: string[];
  templateParams: string[];
  components?: CampaignTemplateComponents;
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractComponents(value: unknown): CampaignTemplateComponents | undefined {
  if (!Array.isArray(value)) return undefined;
  const components = value.filter((component): component is CampaignTemplateComponents[number] => {
    if (!isRecord(component) || component.type !== "body" || !Array.isArray(component.parameters)) return false;
    return component.parameters.every((parameter) => {
      return isRecord(parameter) && parameter.type === "text" && typeof parameter.text === "string";
    });
  });
  return components.length > 0 ? components : undefined;
}

function extractComponentsByWaId(value: unknown): Record<string, CampaignTemplateComponents> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([waId, components]) => [waId, extractComponents(components)] as const)
    .filter((entry): entry is [string, CampaignTemplateComponents] => Boolean(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function extractScheduledCampaignSeed(value: unknown): ScheduledCampaignSeed | null {
  if (!isRecord(value)) return null;
  const privateSeed = readPrivateCampaignSeedFields(value);
  const recipients = privateSeed.recipients.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (recipients.length === 0) return null;
  const templateParams = Array.isArray(value.templateParams)
    ? value.templateParams.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return {
    recipients,
    templateParams,
    components: extractComponents(value.components),
    componentsByWaId: extractComponentsByWaId(privateSeed.componentsByWaId),
  };
}

export async function processDueScheduledCampaigns(params: { now?: Date; limit?: number } = {}) {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: params.limit ?? 10,
  });
  let claimed = 0;
  for (const campaign of dueCampaigns) {
    const claim = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        clientId: campaign.clientId,
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      data: {
        status: "sending",
        scheduledAt: null,
      },
    });
    if (claim.count !== 1) continue;
    claimed += 1;
    const seedEvent = await prisma.event.findFirst({
      where: {
        clientId: campaign.clientId,
        messageId: campaign.id,
        eventName: "campaign.seed.saved",
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });
    const seed = extractScheduledCampaignSeed(seedEvent?.payloadJson);
    if (!seed) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "failed" },
      });
      await persistEvent({
        clientId: campaign.clientId,
        messageId: campaign.id,
        requestId: `campaign-scheduled-start-missing-seed:${campaign.id}`,
        eventName: "campaign.scheduled.failed",
        payloadJson: {
          campaignId: campaign.id,
          reason: "missing_seed",
        },
      });
      continue;
    }
    await persistEvent({
      clientId: campaign.clientId,
      messageId: campaign.id,
      requestId: `campaign-scheduled-start:${campaign.id}`,
      eventName: "campaign.scheduled.started",
      payloadJson: {
        campaignId: campaign.id,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
        startedAt: now.toISOString(),
      },
    });
    startCampaignRun({
      campaignId: campaign.id,
      clientId: campaign.clientId,
      clientKey: campaign.client.clientKey,
      name: campaign.name,
      templateName: campaign.templateName,
      waIds: seed.recipients,
      components: seed.components,
      componentsByWaId: seed.componentsByWaId,
    });
  }
  return { checked: dueCampaigns.length, claimed };
}

export function startCampaignScheduleProcessor(params: { intervalMs?: number } = {}) {
  if (scheduleTimer) return () => undefined;
  const intervalMs = params.intervalMs ?? CAMPAIGN_SCHEDULE_TICK_MS;
  scheduleTimer = setInterval(() => {
    processDueScheduledCampaigns().catch((error) => {
      logger.error({
        event: "campaign.schedule.processor.error",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    });
  }, intervalMs);
  scheduleTimer.unref?.();
  void processDueScheduledCampaigns();
  return () => {
    if (!scheduleTimer) return;
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  };
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
    select: { id: true, content: true, category: true },
  });
  const categoryDecision = await isWhatsappTemplateCategoryAllowedForTenant({
    prisma,
    clientId: params.clientId,
    effectiveCategory: templateForRendering?.category ?? null,
  });
  if (!categoryDecision.allowed) {
    await prisma.campaign.updateMany({
      where: { id: params.campaignId, clientId: params.clientId, status: "sending" },
      data: { status: "blocked" },
    });
    await persistEvent({
      clientId: params.clientId,
      messageId: params.campaignId,
      requestId: `campaign-template-category-blocked:${params.campaignId}:${campaignRunId}`,
      eventName: "campaign.template.blocked",
      payloadJson: {
        campaignId: params.campaignId,
        campaignRunId,
        templateId: templateForRendering?.id ?? null,
        templateName: params.templateName,
        templateCategory: templateForRendering?.category ?? null,
        reason: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
        allowedCategories: categoryDecision.allowedCategories,
      },
    });
    logger.warn({
      event: "campaign.template.blocked",
      campaignId: params.campaignId,
      campaignRunId,
      clientId: params.clientId,
      clientKey: params.clientKey,
      templateName: params.templateName,
      templateCategory: templateForRendering?.category ?? null,
      reason: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
    });
    return;
  }
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

  if (waIds.length > 0) {
    try {
      await ensureDefaultOperationalDepartmentAndQueue(prisma, params.clientId);
    } catch (error) {
      await prisma.campaign.updateMany({
        where: { id: params.campaignId, clientId: params.clientId, status: "sending" },
        data: { status: "failed" },
      });
      await persistEvent({
        clientId: params.clientId,
        messageId: params.campaignId,
        requestId: `campaign-preflight-operational-default:${params.campaignId}`,
        eventName: "campaign.preflight.failed",
        payloadJson: {
          campaignId: params.campaignId,
          campaignRunId,
          reason: "default_operational_department_missing",
          message: error instanceof Error ? error.message : "unknown_error",
        },
      });
      logger.error({
        event: "campaign.preflight.failed",
        campaignId: params.campaignId,
        campaignRunId,
        clientId: params.clientId,
        clientKey: params.clientKey,
        reason: "default_operational_department_missing",
        message: error instanceof Error ? error.message : "unknown_error",
      });
      return;
    }
  }

  await logger.withContext(
    {
      campaignId: params.campaignId,
      campaignRunId,
      clientId: params.clientId,
      clientKey: params.clientKey,
    },
    async () => {
      let sentCount = 0;
      const initialCounts = await prisma.campaign.findUnique({
        where: { id: params.campaignId },
        select: { sentCount: true, blockedCount: true },
      });
      sentCount = initialCounts?.sentCount ?? 0;
      let blockedCount = initialCounts?.blockedCount ?? 0;

      for (let batchStart = 0; batchStart < waIds.length; batchStart += CAMPAIGN_EXCLUSION_LOOKUP_BATCH_SIZE) {
        const resolvedBatch: Array<{
          index: number;
          inputWaId: string;
          resolvedRecipient: Awaited<ReturnType<typeof resolveCampaignRecipientConversationTarget>>;
          resolutionSummary: ReturnType<typeof summarizeCampaignRecipientResolution>;
          waId: string;
          waIdCanonical: string;
        }> = [];
        const batchInputs = waIds.slice(batchStart, batchStart + CAMPAIGN_EXCLUSION_LOOKUP_BATCH_SIZE);
        for (let batchOffset = 0; batchOffset < batchInputs.length; batchOffset += 1) {
          const index = batchStart + batchOffset;
          const inputWaId = batchInputs[batchOffset];
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
          resolvedBatch.push({ index, inputWaId, resolvedRecipient, resolutionSummary, waId, waIdCanonical });
        }
        const operationallyExcluded = await loadOperationallyExcludedWaIds(prisma, {
          clientId: params.clientId,
          waIds: resolvedBatch.flatMap((item) => [item.inputWaId, item.waId, item.waIdCanonical]),
        });
        for (const item of resolvedBatch) {
          const { index, inputWaId, resolvedRecipient, resolutionSummary, waId, waIdCanonical } = item;
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
          if (campaignState?.status === "paused") {
            logger.info({
              event: "campaign.paused",
              campaignId: params.campaignId,
              campaignRunId,
              clientId: params.clientId,
              clientKey: params.clientKey,
            });
            return;
          }
          if (!campaignState || isCampaignTerminalStatus(campaignState.status)) {
            logger.info({
              event: "campaign.runner.stopped_terminal_status",
              campaignId: params.campaignId,
              campaignRunId,
              clientId: params.clientId,
              clientKey: params.clientKey,
              status: campaignState?.status ?? null,
            });
            return;
          }
          if (campaignState.status !== "sending") {
            return;
          }
          logger.updateContext({
            waId,
            conversationKey: makeConversationKey(params.clientKey, waId),
          });
          const requestId = crypto.randomUUID();
          const messageId = `campaign.${params.campaignId}.${index + 1}`;
          const existingOutbound = await prisma.outboundMessage.findFirst({
            where: {
              clientId: params.clientId,
              messageId,
            },
            select: { id: true },
          });
          if (existingOutbound) {
            continue;
          }
          const previousProviderAcceptance = await prisma.event.findFirst({
            where: {
              clientId: params.clientId,
              messageId,
              eventName: "campaign.message.provider_accepted",
            },
            select: { id: true },
          });
          if (previousProviderAcceptance) {
            await persistEvent({
              clientId: params.clientId,
              conversationId: resolvedRecipient.conversationId ?? null,
              waId,
              waIdCanonical,
              messageId,
              requestId: `campaign-message-provider-reconciliation-required:${params.campaignId}:${index + 1}`,
              eventName: "campaign.message.reconciliation_required",
              payloadJson: {
                campaignId: params.campaignId,
                campaignRunId,
                templateName: params.templateName,
                reason: "provider_accepted_without_local_outbound",
                waIdLast4: waId.slice(-4),
                waIdLength: waId.length,
              },
            });
            await prisma.campaign.updateMany({
              where: { id: params.campaignId, status: "sending" },
              data: {
                status: "failed",
                sentCount,
                blockedCount,
              },
            });
            logger.error({
              event: "campaign.message.reconciliation_required",
              campaignId: params.campaignId,
              campaignRunId,
              messageId,
              reason: "provider_accepted_without_local_outbound",
            });
            return;
          }
          const recipientOperationallyExcluded = [inputWaId, waId, waIdCanonical].some((identity) =>
            operationallyExcluded.has(identity)
          );
          if (recipientOperationallyExcluded) {
            blockedCount += 1;
            await prisma.campaign.update({
              where: { id: params.campaignId },
              data: { blockedCount },
            });
            await persistEvent({
              clientId: params.clientId,
              conversationId: resolvedRecipient.conversationId ?? null,
              waId,
              waIdCanonical,
              messageId,
              requestId: `campaign-operational-exclusion:${params.campaignId}:${index + 1}`,
              eventName: "campaign.recipient.operationally_excluded",
              payloadJson: {
                campaignId: params.campaignId,
                campaignRunId,
                templateName: params.templateName,
                waIdLast4: waId.slice(-4),
                waIdLength: waId.length,
                reason: "contact_operationally_excluded",
                timestamp: new Date().toISOString(),
              },
            });
            logger.info({
              event: "campaign.recipient.operationally_excluded",
              campaignId: params.campaignId,
              campaignRunId,
              requestId,
              waIdLast4: waId.slice(-4),
              waIdLength: waId.length,
              templateName: params.templateName,
            });
            continue;
          }
          const components =
            params.componentsByWaId?.[inputWaId] ?? params.componentsByWaId?.[waId] ?? params.components;
          const previousSubmitStarted = await prisma.event.findFirst({
            where: {
              clientId: params.clientId,
              eventName: "campaign.message.submit_started",
              requestId: campaignSubmitStartedRequestId(params.campaignId, index + 1),
            },
            select: { id: true },
          });
          if (previousSubmitStarted) {
            await persistEvent({
              clientId: params.clientId,
              conversationId: resolvedRecipient.conversationId ?? null,
              waId,
              waIdCanonical,
              messageId,
              requestId: `campaign-message-submit-reconciliation-required:${params.campaignId}:${index + 1}`,
              eventName: "campaign.message.reconciliation_required",
              payloadJson: {
                campaignId: params.campaignId,
                campaignRunId,
                templateName: params.templateName,
                reason: "submit_started_without_local_outbound",
                waIdLast4: waId.slice(-4),
                waIdLength: waId.length,
              },
            });
            await prisma.campaign.updateMany({
              where: { id: params.campaignId, status: "sending" },
              data: {
                status: "failed",
                sentCount,
                blockedCount,
              },
            });
            logger.error({
              event: "campaign.message.reconciliation_required",
              campaignId: params.campaignId,
              campaignRunId,
              messageId,
              reason: "submit_started_without_local_outbound",
            });
            return;
          }
          await persistEvent({
            clientId: params.clientId,
            conversationId: resolvedRecipient.conversationId ?? null,
            waId,
            waIdCanonical,
            messageId,
            requestId: campaignSubmitStartedRequestId(params.campaignId, index + 1),
            eventName: "campaign.message.submit_started",
            payloadJson: {
              campaignId: params.campaignId,
              campaignRunId,
              templateName: params.templateName,
              waIdLast4: waId.slice(-4),
              waIdLength: waId.length,
            },
          });
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
            await prisma.campaign.updateMany({
              where: { id: params.campaignId, status: "sending" },
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
          if (result.ok) {
            await persistEvent({
              clientId: params.clientId,
              conversationId: resolvedRecipient.conversationId ?? null,
              waId,
              waIdCanonical,
              messageId,
              requestId: campaignProviderAcceptedRequestId(params.campaignId, index + 1),
              eventName: "campaign.message.provider_accepted",
              payloadJson: {
                campaignId: params.campaignId,
                campaignRunId,
                templateName: params.templateName,
                metaMessageId: result.metaMessageId ?? null,
                waIdLast4: waId.slice(-4),
                waIdLength: waId.length,
                acceptedAt: deliveredAt.toISOString(),
              },
            });
          }
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
            await prisma.campaign.updateMany({
              where: { id: params.campaignId, status: "sending" },
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
      }

      await prisma.campaign.updateMany({
        where: { id: params.campaignId, status: "sending" },
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
    await prisma.campaign.updateMany({
      where: { id: params.campaignId, status: "sending" },
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
