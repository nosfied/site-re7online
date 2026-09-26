import crypto from "node:crypto";
import { MessageStatus, MessageType } from "@prisma/client";
import { getTenant } from "../config/tenantConfig.js";
import { resolveCrmBusinessStatuses } from "../config/tenantOperationalConfig.js";
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
import {
  ensureCampaignOutboundCrmAttemptMaterialization,
} from "./campaignOutboundConversation.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import {
  parseOutboundReturnDestination,
  revalidateOutboundReturnDestination,
  type OutboundReturnDestination,
} from "../routing/outboundReturnDestination.js";
import {
  filterOptedOutCampaignRecipients,
  recordCampaignOptOutBlocks,
} from "./optOutRegistry.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import {
  isWhatsappTemplateCategoryAllowedForTenant,
  WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
} from "../meta/templateCategoryPolicy.js";
import {
  buildPrivateCampaignSeedFields,
  readPrivateCampaignSeedFields,
} from "./campaignSeedPrivacy.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import { normalizeCrmWhatsappIdentity } from "../crm/crmWhatsappIdentity.js";
import {
  CAMPAIGN_EXECUTION_RENEW_MS,
  lockCampaignExecutionBatch,
  assertCampaignExecutionLease,
  claimNextCampaignExecutionJob,
  enqueueCampaignExecutionJob,
  finishCampaignExecutionJob,
  releaseFinishedCampaignExecutionLease,
  renewCampaignExecutionLease,
  type ClaimedCampaignExecutionJob,
} from "./campaignExecutionQueue.js";

const CAMPAIGN_THROTTLE_MS = 1000;
const CAMPAIGN_SCHEDULE_TICK_MS = 60_000;
const CAMPAIGN_EXCLUSION_LOOKUP_BATCH_SIZE = 50;
const CAMPAIGN_BATCH_CHUNK_SIZE = 1000;
const CAMPAIGN_BATCH_MAX_ANALYZED = 5000;
const campaignSubmitStartedRequestId = (campaignId: string, position: number) =>
  `campaign-message-submit-started:${campaignId}:${position}`;
const campaignProviderAcceptedRequestId = (campaignId: string, position: number) =>
  `campaign-message-provider-accepted:${campaignId}:${position}`;
const runningCampaigns = new Map<string, Promise<void>>();
let scheduleTimer: NodeJS.Timeout | null = null;
let campaignRunnerSleepForTests: ((ms: number) => Promise<void>) | null = null;
const CAMPAIGN_TERMINAL_STATUSES = new Set(["completed", "failed", "blocked", "cancelled"]);

export type StartCampaignRunParams = {
  campaignId: string;
  clientId: string;
  clientKey: string;
  name: string;
  templateName: string;
  waIds: string[];
  components?: CampaignTemplateComponents;
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
  returnDestination?: OutboundReturnDestination | null;
  source?: Extract<MetaUsageSource, "campaign" | "manual_campaign_send">;
  executionJob?: ClaimedCampaignExecutionJob;
};

type ScheduledCampaignSeed = {
  recipients: string[];
  templateParams: string[];
  components?: CampaignTemplateComponents;
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
  returnDestination?: OutboundReturnDestination | null;
  selectionMode: "STATIC_RECIPIENTS" | "DYNAMIC_CRM_FILTER";
  dynamicFilter?: {
    version: 1;
    crmBusinessStatusId: string;
  } | null;
  templateVariableMappings?: CampaignTemplateVariableMapping[];
};

type CampaignTemplateVariableMapping = {
  position: string;
  source: "contact.displayName" | "lead.companyName" | "lead.city" | "fixed";
  value?: string;
  fallback?: string;
};

type DynamicLeadRecipient = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  name: string | null;
  company: string | null;
  city: string | null;
};

function sleep(ms: number) {
  return campaignRunnerSleepForTests
    ? campaignRunnerSleepForTests(ms)
    : new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCampaignRunRecipientWaId(value: string) {
  const raw = value.trim();
  const digits = normalizeWaIdDigits(raw);
  if (!digits) return "";
  if (raw.startsWith("+") && digits.length >= 8) return digits;
  return normalizeCrmWhatsappIdentity(raw)?.crmCanonicalPhone ?? digits;
}

function buildNormalizedCampaignRunRecipients(params: {
  waIds: string[];
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
}) {
  const waIds: string[] = [];
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  const seen = new Set<string>();
  for (const originalWaId of params.waIds) {
    const normalizedWaId = normalizeCampaignRunRecipientWaId(originalWaId);
    if (!normalizedWaId || seen.has(normalizedWaId)) continue;
    seen.add(normalizedWaId);
    waIds.push(normalizedWaId);
    const components = params.componentsByWaId?.[originalWaId] ?? params.componentsByWaId?.[normalizedWaId];
    if (components) componentsByWaId[normalizedWaId] = components;
  }
  return {
    waIds,
    componentsByWaId: Object.keys(componentsByWaId).length > 0 ? componentsByWaId : undefined,
  };
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
  const task = runCampaignInBackground(params, campaignRunId).finally(async () => {
    runningCampaigns.delete(params.campaignId);
    if (params.executionJob) {
      const prisma = getPrisma();
      const campaign = await prisma.campaign.findFirst({
        where: { id: params.campaignId, clientId: params.clientId },
        select: { status: true },
      });
      const status =
        campaign?.status === "completed"
          ? "completed"
          : campaign?.status === "blocked"
            ? "blocked"
            : campaign?.status === "cancelled"
              ? "cancelled"
              : campaign?.status === "paused"
                ? "paused"
                : "failed";
      await finishCampaignExecutionJob({
        clientId: params.clientId,
        jobId: params.executionJob.id,
        leaseToken: params.executionJob.leaseToken,
        status,
        failureReason: campaign?.status ?? "campaign_missing",
        releaseTenantLease: !params.executionJob.batchId,
      });
      if (params.executionJob.batchId) {
        try {
          await updateBatchProgressAfterChunk({
            clientId: params.clientId,
            batchId: params.executionJob.batchId,
            campaignId: params.campaignId,
            chunkIndex: params.executionJob.chunkIndex,
          });
        } finally {
          await releaseFinishedCampaignExecutionLease({
            clientId: params.clientId,
            jobId: params.executionJob.id,
            leaseToken: params.executionJob.leaseToken,
          });
        }
      }
      void processDueScheduledCampaigns({ limit: 1 }).catch((error) => {
        logger.error({
          event: "campaign.queue.next.error",
          message: error instanceof Error ? error.message : "unknown_error",
        });
      });
    }
  });
  runningCampaigns.set(params.campaignId, task);
  return campaignRunId;
}

export function getRunningCampaignPromiseForTests(campaignId: string) {
  if (process.env.NODE_ENV === "production") return null;
  return runningCampaigns.get(campaignId) ?? null;
}

export function setCampaignRunnerSleepForTests(fn: ((ms: number) => Promise<void>) | null) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("campaign_runner_test_hook_unavailable");
  }
  campaignRunnerSleepForTests = fn;
  return () => {
    campaignRunnerSleepForTests = null;
  };
}

export async function updateBatchProgressAfterChunk(params: {
  clientId: string; batchId: string; campaignId: string; chunkIndex: number | null;
}) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await lockCampaignExecutionBatch(tx, params.clientId, params.batchId);
    const batch = await tx.campaignExecutionBatch.findFirst({ where: { id: params.batchId, clientId: params.clientId } });
    if (!batch) return;
    const campaign = await tx.campaign.findFirst({ where: { id: params.campaignId, clientId: params.clientId } });
    if (!campaign) return;
    await tx.campaignExecutionBatchCampaign.updateMany({ where: { batchId: batch.id, campaignId: campaign.id }, data: { status: campaign.status } });
    const links = await tx.campaignExecutionBatchCampaign.findMany({ where: { batchId: batch.id }, orderBy: { chunkIndex: "asc" }, include: { campaign: true } });
    const uncertain = await tx.campaignExecutionJob.count({ where: { batchId: batch.id, status: "needs_review" } });
    const hasFailure = links.some((link) => ["failed", "blocked"].includes(link.campaign.status));
    const allCompleted = links.length > 0 && links.every((link) => link.campaign.status === "completed");
    const allTerminal = links.length > 0 && links.every((link) => CAMPAIGN_TERMINAL_STATUSES.has(link.campaign.status));
    const preserve = ["cancelled", "needs_review", "failed", "blocked"].includes(batch.status);
    const status = uncertain ? "needs_review" : preserve ? batch.status : hasFailure ? "failed" : batch.status === "paused" ? "paused" : allCompleted ? "completed" : allTerminal ? "cancelled" : "running";
    if (["failed", "blocked", "needs_review"].includes(status)) {
      await tx.campaignExecutionJob.updateMany({ where: { batchId: batch.id, status: { in: ["queued", "paused"] } }, data: { status: "blocked", failureReason: "batch_execution_stopped" } });
    }
    await tx.campaignExecutionBatch.update({ where: { id: batch.id }, data: {
      status, completedAt: ["completed", "cancelled", "failed", "blocked"].includes(status) ? new Date() : null,
      currentChunkIndex: links.find((link) => !CAMPAIGN_TERMINAL_STATUSES.has(link.campaign.status))?.chunkIndex ?? params.chunkIndex,
      failureReason: hasFailure && !batch.failureReason ? "batch_chunk_failed" : batch.failureReason,
    } });
    const metadata = isRecord(batch.metadata) ? batch.metadata : {};
    if (typeof metadata.parentCampaignId === "string") {
      await tx.campaign.updateMany({ where: { id: metadata.parentCampaignId, clientId: params.clientId }, data: {
        sentCount: links.reduce((n, link) => n + link.campaign.sentCount, 0),
        blockedCount: links.reduce((n, link) => n + link.campaign.blockedCount, 0),
        status: status === "running" ? "sending" : status === "needs_review" ? "blocked" : status,
      } });
    }
  });
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

function extractTemplateVariableMappings(value: unknown): CampaignTemplateVariableMapping[] {
  if (!Array.isArray(value)) return [];
  const mappings: CampaignTemplateVariableMapping[] = [];
  for (const item of value) {
      if (!isRecord(item)) continue;
      const source = String(item.source ?? "").trim();
      if (
        source !== "contact.displayName" &&
        source !== "lead.companyName" &&
        source !== "lead.city" &&
        source !== "fixed"
      ) {
        continue;
      }
      const position = String(item.position ?? "").trim();
      if (!position) continue;
      mappings.push({
        position,
        source,
        value: typeof item.value === "string" ? item.value.trim() : undefined,
        fallback: typeof item.fallback === "string" ? item.fallback.trim() : undefined,
      });
  }
  return mappings;
}

function extractDynamicFilter(value: unknown): ScheduledCampaignSeed["dynamicFilter"] {
  if (!isRecord(value)) return null;
  const version = Number(value.version);
  const crmBusinessStatusId = String(value.crmBusinessStatusId ?? "").trim().toUpperCase();
  if (version !== 1 || !/^[A-Z0-9_-]{2,80}$/.test(crmBusinessStatusId)) return null;
  return { version: 1, crmBusinessStatusId };
}

function extractScheduledCampaignSeed(value: unknown): ScheduledCampaignSeed | null {
  if (!isRecord(value)) return null;
  const selectionMode =
    value.selectionMode === "DYNAMIC_CRM_FILTER" ? "DYNAMIC_CRM_FILTER" : "STATIC_RECIPIENTS";
  const dynamicFilter = extractDynamicFilter(value.dynamicFilter);
  const privateSeed = readPrivateCampaignSeedFields(value);
  const recipients = privateSeed.recipients.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (selectionMode === "STATIC_RECIPIENTS" && recipients.length === 0) return null;
  if (selectionMode === "DYNAMIC_CRM_FILTER" && !dynamicFilter) return null;
  const templateParams = Array.isArray(value.templateParams)
    ? value.templateParams.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const components =
    extractComponents(value.components) ??
    (templateParams.length > 0
      ? [{ type: "body" as const, parameters: templateParams.map((text) => ({ type: "text" as const, text })) }]
      : undefined);
  return {
    recipients,
    templateParams,
    components,
    componentsByWaId: extractComponentsByWaId(privateSeed.componentsByWaId),
    returnDestination: parseOutboundReturnDestination(value.returnDestination),
    selectionMode,
    dynamicFilter,
    templateVariableMappings: extractTemplateVariableMappings(value.templateVariableMappings),
  };
}

function resolveDynamicMappingValue(mapping: CampaignTemplateVariableMapping, lead: DynamicLeadRecipient) {
  const value =
    mapping.source === "fixed"
      ? mapping.value ?? ""
      : mapping.source === "contact.displayName"
        ? lead.name ?? ""
        : mapping.source === "lead.companyName"
          ? lead.company ?? ""
          : lead.city ?? "";
  return String(value || mapping.fallback || "").trim().slice(0, 240);
}

function buildDynamicComponentsForLead(
  mappings: CampaignTemplateVariableMapping[] | undefined,
  lead: DynamicLeadRecipient
): CampaignTemplateComponents | null | undefined {
  if (!mappings || mappings.length === 0) return undefined;
  const values: string[] = [];
  for (const mapping of mappings) {
    const value = resolveDynamicMappingValue(mapping, lead);
    if (!value) return null;
    values.push(value);
  }
  return [{ type: "body", parameters: values.map((text) => ({ type: "text" as const, text })) }];
}

async function getExistingDynamicSnapshot(
  prisma: ReturnType<typeof getPrisma>,
  params: { clientId: string; campaignId: string }
) {
  const event = await prisma.event.findFirst({
    where: {
      clientId: params.clientId,
      messageId: params.campaignId,
      eventName: "campaign.dynamic_snapshot.created",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  if (!event) return null;
  const privateSeed = readPrivateCampaignSeedFields(event.payloadJson);
  return {
    recipients: privateSeed.recipients.map((item) => String(item ?? "").trim()).filter(Boolean),
    componentsByWaId: extractComponentsByWaId(privateSeed.componentsByWaId),
  };
}

async function materializeDynamicCampaignSnapshot(params: {
  campaignId: string;
  clientId: string;
  clientKey: string;
  seed: ScheduledCampaignSeed;
  now: Date;
}): Promise<
  | { ok: true; recipients: string[]; componentsByWaId?: Record<string, CampaignTemplateComponents> }
  | { ok: false; reason: string }
> {
  const prisma = getPrisma();
  const existing = await getExistingDynamicSnapshot(prisma, params);
  if (existing) {
    return { ok: true, recipients: existing.recipients, componentsByWaId: existing.componentsByWaId };
  }
  const statusId = params.seed.dynamicFilter?.crmBusinessStatusId;
  if (!statusId) return { ok: false, reason: "dynamic_filter_invalid" };
  const tenant = await getTenant(params.clientKey);
  const resolvedStatuses = await resolveCrmBusinessStatuses({
    prisma,
    clientId: params.clientId,
    tenant,
  });
  const status = resolvedStatuses.statuses.find((item) => item.id === statusId && item.isActive !== false);
  if (!status) return { ok: false, reason: "crm_status_not_found" };

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: params.clientId,
      status: statusId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    take: 1001,
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      name: true,
      company: true,
      city: true,
    },
  });
  if (leads.length > 1000) return { ok: false, reason: "dynamic_match_limit_exceeded" };

  const recipients: string[] = [];
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  const blocked: Array<{ leadId: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    const rawWaId = normalizeCampaignRunRecipientWaId(lead.waIdCanonical || lead.waId);
    const canonical = normalizeCampaignRunRecipientWaId(rawWaId);
    const dedupeKey = canonical || rawWaId;
    if (!rawWaId || !canonical) {
      blocked.push({ leadId: lead.id, reason: "blocked_identity" });
      continue;
    }
    if (seen.has(dedupeKey)) {
      blocked.push({ leadId: lead.id, reason: "duplicate_identity" });
      continue;
    }
    const components = buildDynamicComponentsForLead(params.seed.templateVariableMappings, lead);
    if (components === null) {
      blocked.push({ leadId: lead.id, reason: "variable_missing_value" });
      continue;
    }
    seen.add(dedupeKey);
    recipients.push(canonical);
    if (components) componentsByWaId[canonical] = components;
  }

  await persistEvent({
    clientId: params.clientId,
    messageId: params.campaignId,
    requestId: `campaign-dynamic-snapshot:${params.campaignId}`,
    eventName: "campaign.dynamic_snapshot.created",
    payloadJson: {
      campaignId: params.campaignId,
      selectionMode: "DYNAMIC_CRM_FILTER",
      dynamicFilter: params.seed.dynamicFilter,
      statusLabel: status.label,
      createdAt: params.now.toISOString(),
      matchedCount: leads.length,
      eligibleCount: recipients.length,
      blockedCount: blocked.length,
      blocked,
      ...buildPrivateCampaignSeedFields({
        clientId: params.clientId,
        waIds: recipients,
        componentsByWaId: Object.keys(componentsByWaId).length > 0 ? componentsByWaId : undefined,
      }),
    },
  });
  await prisma.campaign.updateMany({
    where: { id: params.campaignId, clientId: params.clientId, status: "sending" },
    data: {
      totalRecipients: recipients.length,
      blockedCount: blocked.length,
    },
  });
  return {
    ok: true,
    recipients,
    componentsByWaId: Object.keys(componentsByWaId).length > 0 ? componentsByWaId : undefined,
  };
}

function formatCampaignBatchChunkName(name: string, index: number, count: number) {
  const width = Math.max(2, String(count).length);
  return `${name} — ${String(index).padStart(width, "0")}/${String(count).padStart(width, "0")}`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function resolveDynamicCampaignRecipientsForBatch(params: {
  campaignId: string;
  clientId: string;
  clientKey: string;
  seed: ScheduledCampaignSeed;
  now: Date;
}): Promise<
  | {
      ok: true;
      recipients: string[];
      componentsByWaId?: Record<string, CampaignTemplateComponents>;
      blockedCount: number;
      matchedCount: number;
      statusLabel: string;
    }
  | { ok: false; reason: string }
> {
  const prisma = getPrisma();
  const readSnapshot = async () => {
    const event = await prisma.event.findUnique({ where: { clientId_eventName_requestId: {
      clientId: params.clientId, eventName: "campaign.dynamic_batch_snapshot.created",
      requestId: `campaign-dynamic-batch-snapshot:${params.campaignId}`,
    } } });
    if (!event) return null;
    const payload = isRecord(event.payloadJson) ? event.payloadJson : {};
    const saved = readPrivateCampaignSeedFields(payload);
    if (saved.recipients.length !== Number(payload.eligibleCount)) return { ok: false as const, reason: "batch_snapshot_unreadable" };
    return { ok: true as const, recipients: saved.recipients, componentsByWaId: saved.componentsByWaId,
      blockedCount: Number(payload.blockedCount ?? 0), matchedCount: Number(payload.matchedCount ?? 0), statusLabel: String(payload.statusLabel ?? "") };
  };
  const saved = await readSnapshot();
  if (saved) return saved;
  const statusId = params.seed.dynamicFilter?.crmBusinessStatusId;
  if (!statusId) return { ok: false, reason: "dynamic_filter_invalid" };
  const tenant = await getTenant(params.clientKey);
  const resolvedStatuses = await resolveCrmBusinessStatuses({
    prisma,
    clientId: params.clientId,
    tenant,
  });
  const status = resolvedStatuses.statuses.find((item) => item.id === statusId && item.isActive !== false);
  if (!status) return { ok: false, reason: "crm_status_not_found" };

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: params.clientId,
      status: statusId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    take: CAMPAIGN_BATCH_MAX_ANALYZED + 1,
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      name: true,
      company: true,
      city: true,
    },
  });
  if (leads.length > CAMPAIGN_BATCH_MAX_ANALYZED) return { ok: false, reason: "dynamic_batch_limit_exceeded" };

  const recipients: string[] = [];
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  const blocked: Array<{ leadId: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    const rawWaId = normalizeCampaignRunRecipientWaId(lead.waIdCanonical || lead.waId);
    const canonical = normalizeCampaignRunRecipientWaId(rawWaId);
    const dedupeKey = canonical || rawWaId;
    if (!rawWaId || !canonical) {
      blocked.push({ leadId: lead.id, reason: "blocked_identity" });
      continue;
    }
    if (seen.has(dedupeKey)) {
      blocked.push({ leadId: lead.id, reason: "duplicate_identity" });
      continue;
    }
    const components = buildDynamicComponentsForLead(params.seed.templateVariableMappings, lead);
    if (components === null) {
      blocked.push({ leadId: lead.id, reason: "variable_missing_value" });
      continue;
    }
    seen.add(dedupeKey);
    recipients.push(canonical);
    if (components) componentsByWaId[canonical] = components;
  }

  await persistEvent({
    clientId: params.clientId,
    messageId: params.campaignId,
    requestId: `campaign-dynamic-batch-snapshot:${params.campaignId}`,
    eventName: "campaign.dynamic_batch_snapshot.created",
    payloadJson: {
      campaignId: params.campaignId,
      selectionMode: "DYNAMIC_CRM_FILTER",
      dynamicFilter: params.seed.dynamicFilter,
      statusLabel: status.label,
      createdAt: params.now.toISOString(),
      matchedCount: leads.length,
      eligibleCount: recipients.length,
      blockedCount: blocked.length,
      chunkSize: CAMPAIGN_BATCH_CHUNK_SIZE,
      chunkCount: Math.ceil(recipients.length / CAMPAIGN_BATCH_CHUNK_SIZE),
      blocked,
      ...buildPrivateCampaignSeedFields({
        clientId: params.clientId,
        waIds: recipients,
        componentsByWaId: Object.keys(componentsByWaId).length > 0 ? componentsByWaId : undefined,
      }),
    },
  });

  // A uniqueness collision must use the durable winner, never freshly resolved CRM.
  return (await readSnapshot()) ?? { ok: false, reason: "batch_snapshot_missing" };
}

let batchMaterializationHook: ((phase: "after_snapshot" | "before_enqueue") => Promise<void> | void) | null = null;
export function setCampaignBatchMaterializationHookForTests(hook: typeof batchMaterializationHook) {
  if (process.env.NODE_ENV === "production") throw new Error("campaign_runner_test_hook_unavailable");
  batchMaterializationHook = hook;
}

async function recoverInterruptedBatchMaterializations(now: Date) {
  const prisma = getPrisma();
  // Only controllers with no provider work are automatically recoverable.
  const jobs = await prisma.campaignExecutionJob.findMany({ where: {
    campaignId: null, kind: "batch_chunk", status: "running", leaseExpiresAt: { lte: now },
    batch: { sourceMode: "DYNAMIC_CRM_FILTER" },
  }, take: 20, orderBy: [{ leaseExpiresAt: "asc" }, { id: "asc" }] });
  for (const job of jobs) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Client" WHERE id = ${job.clientId}::uuid FOR UPDATE`;
      await lockCampaignExecutionBatch(tx, job.clientId, job.batchId!);
      const batch = await tx.campaignExecutionBatch.findUnique({ where: { id: job.batchId! } });
      if (!batch) return;
      const status = ["scheduled", "running"].includes(batch.status) ? "queued" : batch.status === "paused" ? "paused" : "cancelled";
      const recovered = await tx.campaignExecutionJob.updateMany({ where: { id: job.id, status: "running", leaseToken: job.leaseToken, leaseExpiresAt: { lte: now } }, data: { status, leaseToken: null, leaseOwner: null, leaseExpiresAt: null } });
      if (recovered.count) await tx.tenantCampaignExecutionLease.updateMany({ where: { clientId: job.clientId, jobId: job.id, leaseToken: job.leaseToken ?? undefined, expiresAt: { lte: now } }, data: { jobId: null, expiresAt: now } });
    });
  }
}

async function materializeDynamicBatchJob(params: {
  job: ClaimedCampaignExecutionJob;
  now: Date;
}) {
  const prisma = getPrisma();
  if (!params.job.batchId) {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_id_missing",
    });
    return;
  }
  const batch = await prisma.campaignExecutionBatch.findFirst({
    where: { id: params.job.batchId, clientId: params.job.clientId },
    select: { id: true, name: true, sourceMode: true, status: true, metadata: true },
  });
  if (!batch) {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_not_found",
    });
    return;
  }
  const existingChildren = await prisma.campaignExecutionBatchCampaign.findMany({
    where: { clientId: params.job.clientId, batchId: batch.id },
    orderBy: { chunkIndex: "asc" },
    select: { campaignId: true, chunkIndex: true },
  });
  if (existingChildren.length > 0) {
    await prisma.$transaction(async (tx) => {
      await lockCampaignExecutionBatch(tx, params.job.clientId, batch.id);
      const current = await tx.campaignExecutionBatch.findUniqueOrThrow({ where: { id: batch.id } });
      if (!["scheduled", "running"].includes(current.status)) return;
      for (const child of existingChildren) {
        await enqueueCampaignExecutionJob({ prisma: tx, clientId: params.job.clientId,
          campaignId: child.campaignId, batchId: batch.id, chunkIndex: child.chunkIndex,
          kind: "batch_chunk", eligibleAt: params.now, idempotencyKey: `batch:${batch.id}:chunk:${child.chunkIndex}`,
          metadata: { source: "batch_existing_child" } });
      }
    });
    await finishCampaignExecutionJob({ clientId: params.job.clientId, jobId: params.job.id, leaseToken: params.job.leaseToken, status: "completed" });
    return;
  }
  if (!isRecord(batch.metadata)) {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_metadata_invalid",
    });
    return;
  }
  const parentCampaignId = String(batch.metadata.parentCampaignId ?? "").trim();
  const clientKey = String(batch.metadata.clientKey ?? "").trim();
  if (!parentCampaignId || !clientKey) {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_parent_missing",
    });
    return;
  }
  const parent = await prisma.campaign.findFirst({
    where: { id: parentCampaignId, clientId: params.job.clientId },
    select: { id: true, name: true, templateId: true, templateName: true, status: true },
  });
  if (!parent?.templateId) {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_parent_template_missing",
    });
    return;
  }
  const seedEvent = await prisma.event.findFirst({
    where: {
      clientId: params.job.clientId,
      messageId: parent.id,
      eventName: "campaign.seed.saved",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  const seed = extractScheduledCampaignSeed(seedEvent?.payloadJson);
  if (!seed || seed.selectionMode !== "DYNAMIC_CRM_FILTER") {
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: "batch_dynamic_seed_missing",
    });
    return;
  }
  const snapshot = await resolveDynamicCampaignRecipientsForBatch({
    campaignId: parent.id,
    clientId: params.job.clientId,
    clientKey,
    seed,
    now: params.now,
  });
  if (!snapshot.ok) {
    await prisma.campaignExecutionBatch.updateMany({
      where: { id: batch.id, status: { in: ["scheduled", "running"] } },
      data: { status: "failed", failureReason: snapshot.reason },
    });
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "failed",
      failureReason: snapshot.reason,
    });
    return;
  }
  if (snapshot.recipients.length === 0) {
    await prisma.campaignExecutionBatch.updateMany({
      where: { id: batch.id, status: { in: ["scheduled", "running"] } },
      data: { status: "blocked", failureReason: "no_eligible_recipients", totalRecipients: 0, blockedCount: snapshot.blockedCount },
    });
    await finishCampaignExecutionJob({
      clientId: params.job.clientId,
      jobId: params.job.id,
      leaseToken: params.job.leaseToken,
      status: "blocked",
      failureReason: "no_eligible_recipients",
    });
    return;
  }

  if (process.env.NODE_ENV !== "production") await batchMaterializationHook?.("after_snapshot");
  const recipientChunks = chunkArray(snapshot.recipients, CAMPAIGN_BATCH_CHUNK_SIZE);
  await prisma.$transaction(async (tx) => {
    await lockCampaignExecutionBatch(tx, params.job.clientId, batch.id);
    const current = await tx.campaignExecutionBatch.findUniqueOrThrow({ where: { id: batch.id } });
    const owner = await tx.campaignExecutionJob.findFirst({ where: { id: params.job.id, status: "running", leaseToken: params.job.leaseToken } });
    if (!owner || !["scheduled", "running"].includes(current.status)) return;
    if (await tx.campaignExecutionBatchCampaign.count({ where: { batchId: batch.id } })) return;

    await tx.campaignExecutionBatch.update({
      where: { id: batch.id },
      data: {
        status: "running",
        effectiveStartedAt: current.effectiveStartedAt ?? params.now,
        totalRecipients: snapshot.recipients.length,
        blockedCount: snapshot.blockedCount,
        chunkCount: recipientChunks.length,
        currentChunkIndex: 1,
      },
    });
    await tx.campaign.update({
      where: { id: parent.id },
      data: {
        status: "sending",
        scheduledAt: null,
        totalRecipients: snapshot.recipients.length,
        blockedCount: snapshot.blockedCount,
      },
    });
    for (const [index, recipients] of recipientChunks.entries()) {
      const chunkIndex = index + 1;
      const campaign = await tx.campaign.create({
        data: {
          clientId: params.job.clientId,
          templateId: parent.templateId,
          name: formatCampaignBatchChunkName(parent.name, chunkIndex, recipientChunks.length),
          templateName: parent.templateName,
          status: "scheduled",
          totalRecipients: recipients.length,
          scheduledAt: null,
        },
      });
      await tx.campaignExecutionBatchCampaign.create({
        data: {
          clientId: params.job.clientId,
          batchId: batch.id,
          campaignId: campaign.id,
          chunkIndex,
          recipientCount: recipients.length,
          status: "scheduled",
        },
      });
      const componentsByWaId = snapshot.componentsByWaId
        ? Object.fromEntries(
            recipients
              .map((waId) => [waId, snapshot.componentsByWaId?.[waId]] as const)
              .filter((entry): entry is [string, CampaignTemplateComponents] => Boolean(entry[1]))
          )
        : undefined;
      await tx.event.create({
        data: {
          clientId: params.job.clientId,
          messageId: campaign.id,
          requestId: `campaign-batch-seed:${batch.id}:${chunkIndex}`,
          eventName: "campaign.seed.saved",
          payloadJson: {
            campaignId: campaign.id,
            templateId: parent.templateId,
            name: campaign.name,
            templateName: parent.templateName,
            templateParams: [],
            templateVariableMappings: seed.templateVariableMappings ?? [],
            returnDestination: seed.returnDestination,
            source: `dynamic_crm_batch:${batch.id}`,
            selectionMode: "STATIC_RECIPIENTS",
            dynamicFilter: null,
            summary: {
              requested: recipients.length,
              accepted: recipients.length,
              blocked: 0,
              duplicatesRemoved: 0,
              blockedByReason: [],
            },
            ...buildPrivateCampaignSeedFields({
              clientId: params.job.clientId,
              waIds: recipients,
              componentsByWaId,
            }),
          },
        },
      });
    }
    if (process.env.NODE_ENV !== "production") await batchMaterializationHook?.("before_enqueue");
    const children = await tx.campaignExecutionBatchCampaign.findMany({ where: { batchId: batch.id }, orderBy: { chunkIndex: "asc" } });
    for (const child of children) {
      await enqueueCampaignExecutionJob({ prisma: tx, clientId: params.job.clientId,
        campaignId: child.campaignId, batchId: batch.id, chunkIndex: child.chunkIndex,
        kind: "batch_chunk", eligibleAt: params.now, idempotencyKey: `batch:${batch.id}:chunk:${child.chunkIndex}`,
        metadata: { source: "dynamic_batch_materialized", recipientCount: child.recipientCount } });
    }
  });
  const state = await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: batch.id } });
  await finishCampaignExecutionJob({
    clientId: params.job.clientId,
    jobId: params.job.id,
    leaseToken: params.job.leaseToken,
    status: state.status === "paused" ? "paused" : state.status === "cancelled" || state.status === "needs_review" ? "cancelled" : "completed",
  });
}

export async function processDueScheduledCampaigns(params: { now?: Date; limit?: number } = {}) {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  await recoverInterruptedBatchMaterializations(now);
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
      executionBatchLinks: { none: {} },
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
        },
      },
      executionBatchLinks: {
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: params.limit ?? 10,
  });
  for (const campaign of dueCampaigns) {
    if (campaign.executionBatchLinks.length > 0) continue;
    const isBatchController = await prisma.event.findFirst({
      where: {
        clientId: campaign.clientId,
        messageId: campaign.id,
        eventName: "campaign.batch.controller.created",
      },
      select: { id: true },
    });
    if (isBatchController) continue;
    await enqueueCampaignExecutionJob({
      prisma,
      clientId: campaign.clientId,
      campaignId: campaign.id,
      eligibleAt: campaign.scheduledAt ?? now,
      kind: "campaign",
      idempotencyKey: `scheduled:${campaign.id}`,
      metadata: {
        source: "scheduled_campaign",
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      },
    });
  }

  let claimed = 0;
  for (let index = 0; index < (params.limit ?? 10); index += 1) {
    const job = await claimNextCampaignExecutionJob({ now });
    if (!job) break;
    claimed += 1;
    if (!job.campaignId) {
      await materializeDynamicBatchJob({ job, now });
      continue;
    }
    const campaign = await prisma.campaign.findFirst({
      where: { id: job.campaignId, clientId: job.clientId },
      include: {
        client: {
          select: {
            id: true,
            clientKey: true,
          },
        },
      },
    });
    if (!campaign) {
      await finishCampaignExecutionJob({
        clientId: job.clientId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        status: "failed",
        failureReason: "campaign_not_found",
      });
      continue;
    }
    if (campaign.status !== "scheduled" && campaign.status !== "sending") {
      await finishCampaignExecutionJob({
        clientId: job.clientId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        status: campaign.status === "paused" ? "paused" : campaign.status === "cancelled" ? "cancelled" : "failed",
        failureReason: `campaign_status_${campaign.status}`,
      });
      continue;
    }
    const claim = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        clientId: campaign.clientId,
        status: { in: ["scheduled", "sending"] },
      },
      data: {
        status: "sending",
        scheduledAt: null,
      },
    });
    if (claim.count !== 1) {
      await finishCampaignExecutionJob({
        clientId: job.clientId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        status: "failed",
        failureReason: "campaign_claim_failed",
      });
      continue;
    }
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
      await finishCampaignExecutionJob({
        clientId: job.clientId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        status: "failed",
        failureReason: "missing_seed",
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
    const executionSeed =
      seed.selectionMode === "DYNAMIC_CRM_FILTER"
        ? await materializeDynamicCampaignSnapshot({
            campaignId: campaign.id,
            clientId: campaign.clientId,
            clientKey: campaign.client.clientKey,
            seed,
            now,
          })
        : { ok: true as const, recipients: seed.recipients, componentsByWaId: seed.componentsByWaId };
    if (!executionSeed.ok) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "failed" },
      });
      await persistEvent({
        clientId: campaign.clientId,
        messageId: campaign.id,
        requestId: `campaign-dynamic-start-failed:${campaign.id}`,
        eventName: "campaign.dynamic_snapshot.failed",
        payloadJson: {
          campaignId: campaign.id,
          reason: executionSeed.reason,
        },
      });
      await finishCampaignExecutionJob({
        clientId: job.clientId,
        jobId: job.id,
        leaseToken: job.leaseToken,
        status: "failed",
        failureReason: executionSeed.reason,
      });
      continue;
    }
    startCampaignRun({
      campaignId: campaign.id,
      clientId: campaign.clientId,
      clientKey: campaign.client.clientKey,
      name: campaign.name,
      templateName: campaign.templateName,
      waIds: executionSeed.recipients,
      components: seed.components,
      componentsByWaId: executionSeed.componentsByWaId ?? seed.componentsByWaId,
      returnDestination: seed.returnDestination,
      executionJob: job,
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
  let lastLeaseRenewedAt = 0;
  const ensureLease = async () => {
    if (!params.executionJob) return true;
    const renewed = await renewCampaignExecutionLease({
      clientId: params.clientId,
      jobId: params.executionJob.id,
      leaseToken: params.executionJob.leaseToken,
    });
    if (renewed) {
      lastLeaseRenewedAt = Date.now();
      return true;
    }
    logger.warn({
      event: "campaign.runner.lease_lost",
      campaignId: params.campaignId,
      campaignRunId,
      clientId: params.clientId,
      jobId: params.executionJob.id,
    });
    return false;
  };
  if (!(await ensureLease())) return;
  const ensureFreshLease = async () => {
    if (!params.executionJob) return true;
    if (Date.now() - lastLeaseRenewedAt < CAMPAIGN_EXECUTION_RENEW_MS) return true;
    return ensureLease();
  };
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
  const normalizedRecipients = buildNormalizedCampaignRunRecipients({
    waIds: params.waIds,
    componentsByWaId: params.componentsByWaId,
  });
  const requestedWaIds = normalizedRecipients.waIds;
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

  let resolvedReturnDestination: OutboundReturnDestination | null = null;
  if (params.returnDestination) {
    const destinationResult = await revalidateOutboundReturnDestination(prisma, {
      clientId: params.clientId,
      destination: params.returnDestination,
    });
    if (!destinationResult.ok) {
      await prisma.campaign.updateMany({
        where: { id: params.campaignId, clientId: params.clientId, status: "sending" },
        data: { status: "failed" },
      });
      await persistEvent({
        clientId: params.clientId,
        messageId: params.campaignId,
        requestId: `campaign-preflight-return-destination:${params.campaignId}`,
        eventName: "campaign.preflight.failed",
        payloadJson: {
          campaignId: params.campaignId,
          campaignRunId,
          reason: destinationResult.error,
        },
      });
      logger.error({
        event: "campaign.preflight.failed",
        campaignId: params.campaignId,
        campaignRunId,
        clientId: params.clientId,
        clientKey: params.clientKey,
        reason: destinationResult.error,
      });
      return;
    }
    resolvedReturnDestination = destinationResult.destination;
  }

  if (waIds.length > 0 && !resolvedReturnDestination) {
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
          if (!(await ensureLease())) {
            return;
          }
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
            normalizedRecipients.componentsByWaId?.[inputWaId] ??
            normalizedRecipients.componentsByWaId?.[waId] ??
            normalizedRecipients.componentsByWaId?.[waIdCanonical] ??
            params.components;
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
          if (params.executionJob) {
            const stillOwner = await ensureFreshLease();
            if (!stillOwner) {
              logger.warn({
                event: "campaign.runner.lease_lost_before_provider",
                campaignId: params.campaignId,
                campaignRunId,
                clientId: params.clientId,
                jobId: params.executionJob.id,
              });
              return;
            }
            const leaseStillCurrent = await assertCampaignExecutionLease({
              clientId: params.clientId,
              jobId: params.executionJob.id,
              leaseToken: params.executionJob.leaseToken,
            });
            if (!leaseStillCurrent) {
              logger.warn({
                event: "campaign.runner.lease_lost_before_provider",
                campaignId: params.campaignId,
                campaignRunId,
                clientId: params.clientId,
                jobId: params.executionJob.id,
              });
              return;
            }
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
          let stopAfterCurrentProviderResult = false;
          if (params.executionJob) {
            const stillOwner = await assertCampaignExecutionLease({
              clientId: params.clientId,
              jobId: params.executionJob.id,
              leaseToken: params.executionJob.leaseToken,
            });
            if (!stillOwner) {
              stopAfterCurrentProviderResult = true;
              logger.warn({
                event: "campaign.runner.lease_lost_after_provider",
                campaignId: params.campaignId,
                campaignRunId,
                clientId: params.clientId,
                jobId: params.executionJob.id,
                messageId,
              });
            }
          }

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
          const conversationOutcome = await ensureCampaignOutboundCrmAttemptMaterialization(prisma, {
            clientId: params.clientId,
            waId,
            waIdCanonical,
            phoneNumberId,
            messageId,
            campaignId: params.campaignId,
            campaignRunId,
            templateName: params.templateName,
            source: "campaign",
            conversationId: resolvedRecipient.conversationId ?? null,
          });
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
              conversationId: null,
              previousConversationId: resolvedRecipient.conversationId ?? null,
              deliveryConversationPending: result.ok,
              metaUsage: usagePayload,
              returnDestination: resolvedReturnDestination,
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
              conversationId: null,
              previousConversationId: resolvedRecipient.conversationId ?? null,
              deliveryConversationPending: result.ok,
            },
          });

          if (!result.ok) {
            await prisma.campaign.updateMany({
              where: { id: params.campaignId, status: { in: ["sending", "paused"] } },
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

          if (stopAfterCurrentProviderResult) {
            logger.warn({
              event: "campaign.runner.stopped_after_provider_result_without_lease",
              campaignId: params.campaignId,
              campaignRunId,
              clientId: params.clientId,
              jobId: params.executionJob?.id ?? null,
              messageId,
              sentCount,
              blockedCount,
            });
            return;
          }

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
