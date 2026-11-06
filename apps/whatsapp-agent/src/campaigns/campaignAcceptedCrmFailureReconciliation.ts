import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { acknowledgeAcceptedFailedWithoutCrmCampaignTask, readCampaignReconciliationFence } from "./campaignOperations.js";

type Db = PrismaClient | Prisma.TransactionClient;
export type AcceptedCrmFailureBindings = {
  clientId: string;
  campaignId: string;
  jobId: string;
  runId: string;
  seedEventId: string;
  acceptedEventId: string;
  failedOutboundId: string;
  taskId: string;
  guardGeneration: number;
  position: number;
  providerErrorCode: 130497;
};

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]]))
    : item);
const hash = (value: unknown) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
function requireThat(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
const messageIdFor = (b: AcceptedCrmFailureBindings) => `campaign.${b.campaignId}.${b.position}`;
const receiptRequestId = (b: AcceptedCrmFailureBindings) => `accepted-crm-failure:${b.acceptedEventId}`;
type PreservedCampaignStatus = "sending" | "cancelled";

function preservedCampaignStatus(value: unknown, reason = "crm_failure_campaign_state_drift"): PreservedCampaignStatus {
  requireThat(value === "sending" || value === "cancelled", reason);
  return value;
}

function authenticateFence(b: AcceptedCrmFailureBindings) {
  const fence = readCampaignReconciliationFence();
  requireThat(!fence.open && fence.generation === b.guardGeneration, "crm_failure_guard_drift");
  const entries = Object.entries(fence.tasks);
  requireThat(entries.length === 1 && entries[0][0] === b.taskId, "crm_failure_task_set_drift");
  const task = entries[0][1];
  requireThat(task.kind === "provider" && task.phase === "persisting" && task.generation === b.guardGeneration - 1 &&
    canonical(task.reference) === canonical({ clientId: b.clientId, campaignId: b.campaignId, messageId: messageIdFor(b) }),
  "crm_failure_task_binding_mismatch");
  return { fence, task, taskHash: hash(task) };
}

async function inspect(db: Db, b: AcceptedCrmFailureBindings) {
  requireThat(Number.isSafeInteger(b.position) && b.position > 1 && b.providerErrorCode === 130497, "crm_failure_scope_invalid");
  const { taskHash } = authenticateFence(b);
  const [campaign, job, seed, accepted, outbound] = await Promise.all([
    db.campaign.findFirst({ where: { id: b.campaignId, clientId: b.clientId } }),
    db.campaignExecutionJob.findFirst({ where: { id: b.jobId, clientId: b.clientId, campaignId: b.campaignId } }),
    db.event.findFirst({ where: { id: b.seedEventId, clientId: b.clientId, messageId: b.campaignId, eventName: "campaign.seed.saved" } }),
    db.event.findFirst({ where: { id: b.acceptedEventId, clientId: b.clientId, messageId: messageIdFor(b), eventName: "campaign.message.provider_accepted" } }),
    db.outboundMessage.findFirst({ where: { id: b.failedOutboundId, clientId: b.clientId, messageId: messageIdFor(b) } }),
  ]);
  requireThat(campaign && job && seed && accepted && outbound, "crm_failure_evidence_missing");
  const campaignStatusPreserved = preservedCampaignStatus(campaign.status);
  requireThat(campaign.sentCount === b.position - 1 && campaign.blockedCount === 0,
    "crm_failure_campaign_state_drift");
  requireThat(job.kind === "campaign" && job.status === "queued" && job.batchId === null && job.failureReason === "operational_suspension" &&
    !job.leaseToken && !job.leaseOwner && !job.leaseExpiresAt, "crm_failure_job_state_drift");
  const recipients = readPrivateCampaignSeedFields(record(seed.payloadJson), { clientId: b.clientId }).recipients;
  requireThat(recipients.length === campaign.totalRecipients && recipients[b.position - 1] === accepted.waId,
    "crm_failure_seed_position_mismatch");
  const acceptedPayload = record(accepted.payloadJson), raw = record(outbound.rawPayload), metaStatus = record(raw.metaStatus);
  const providerErrors = Array.isArray(metaStatus.errors) ? metaStatus.errors.map(record) : [];
  requireThat(acceptedPayload.campaignId === b.campaignId && acceptedPayload.campaignRunId === b.runId &&
    typeof acceptedPayload.metaMessageId === "string" && outbound.metaMessageId === acceptedPayload.metaMessageId &&
    outbound.waId === accepted.waId && outbound.status === "FAILED" && metaStatus.lastStatus === "failed" &&
    providerErrors.some(error => Number(error.code) === b.providerErrorCode), "crm_failure_provider_result_mismatch");
  const [submitted, outbounds, crmReady, resultEvents] = await Promise.all([
    db.event.count({ where: { clientId: b.clientId, eventName: "campaign.message.submit_started", messageId: { startsWith: `campaign.${b.campaignId}.` } } }),
    db.outboundMessage.count({ where: { clientId: b.clientId, messageId: { startsWith: `campaign.${b.campaignId}.` } } }),
    db.event.count({ where: { clientId: b.clientId, messageId: messageIdFor(b), eventName: "campaign.recipient.contact_bootstrap_ready" } }),
    db.event.count({ where: { clientId: b.clientId, messageId: messageIdFor(b), eventName: { in: ["campaign.message.sent", "campaign.message.failed"] } } }),
  ]);
  requireThat(submitted === b.position && outbounds === b.position && crmReady === 0 && resultEvents === 0,
    "crm_failure_effect_set_mismatch");
  const evidence = { campaign, job, seed, accepted, outbound, taskHash };
  const plan = { bindings: b, messageId: messageIdFor(b), taskHash,
    metaMessageIdSha256: hash(acceptedPayload.metaMessageId), evidenceHash: hash(evidence),
    disposition: "unsupported_international_identity_after_provider_acceptance", providerCalls: 0,
    campaignStatusPreserved, sentCountPreserved: campaign.sentCount,
    remainingRecipients: campaign.totalRecipients - b.position };
  return { plan, planHash: hash(plan) };
}

export async function dryRunAcceptedCrmFailure(db: PrismaClient, b: AcceptedCrmFailureBindings) {
  const prior = await db.event.findUnique({ where: { clientId_eventName_requestId: {
    clientId: b.clientId, eventName: "campaign.accepted_crm_failure.reconciled", requestId: receiptRequestId(b),
  } } });
  if (prior) {
    const payload = record(prior.payloadJson);
    requireThat(hash(payload.bindings) === hash(b), "crm_failure_receipt_binding_mismatch");
    return { alreadyApplied: true as const, receiptId: prior.id, planHash: payload.planHash as string };
  }
  return { alreadyApplied: false as const, ...await inspect(db, b) };
}

export async function applyAcceptedCrmFailure(db: PrismaClient, b: AcceptedCrmFailureBindings, expectedPlanHash: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Client" WHERE id=${b.clientId}::uuid FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "Campaign" WHERE id=${b.campaignId} FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "CampaignExecutionJob" WHERE id=${b.jobId} FOR UPDATE`;
    const prior = await tx.event.findUnique({ where: { clientId_eventName_requestId: {
      clientId: b.clientId, eventName: "campaign.accepted_crm_failure.reconciled", requestId: receiptRequestId(b),
    } } });
    if (prior) return { alreadyApplied: true as const, receiptId: prior.id };
    const inspected = await inspect(tx, b);
    requireThat(inspected.planHash === expectedPlanHash, "crm_failure_plan_drift");
    const disposition = await tx.event.create({ data: { clientId: b.clientId, waId: (await tx.outboundMessage.findUniqueOrThrow({ where: { id: b.failedOutboundId } })).waId,
      messageId: messageIdFor(b), requestId: `accepted-crm-failure-disposition:${b.acceptedEventId}`,
      eventName: "campaign.crm.historical_disposition", payloadJson: {
        reason: inspected.plan.disposition, crmMaterialized: false, providerAccepted: true,
        providerReportedStatus: "failed", providerErrorCode: b.providerErrorCode, retryAllowed: false,
      } } });
    const failed = await tx.event.create({ data: { clientId: b.clientId, messageId: messageIdFor(b),
      requestId: `accepted-crm-failure-result:${b.acceptedEventId}`, eventName: "campaign.message.failed",
      payloadJson: { campaignId: b.campaignId, campaignRunId: b.runId, providerAccepted: true,
        providerReportedStatus: "failed", providerErrorCode: b.providerErrorCode, retryAllowed: false,
        crmMaterialized: false, reconciliation: true, outboundMessageId: b.failedOutboundId } } });
    const receipt = await tx.event.create({ data: { clientId: b.clientId, messageId: b.campaignId,
      requestId: receiptRequestId(b), eventName: "campaign.accepted_crm_failure.reconciled",
      payloadJson: { version: 2, bindings: b, planHash: inspected.planHash, taskHash: inspected.plan.taskHash,
        dispositionEventId: disposition.id, failureEventId: failed.id, providerCalls: 0,
        campaignStatusPreserved: inspected.plan.campaignStatusPreserved,
        campaignRemainsSending: inspected.plan.campaignStatusPreserved === "sending",
        campaignRemainsCancelled: inspected.plan.campaignStatusPreserved === "cancelled",
        guardRemainsClosed: true, jobContinuationAuthorized: false } } });
    return { alreadyApplied: false as const, receiptId: receipt.id };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}

export async function verifyAcceptedCrmFailure(db: PrismaClient, b: AcceptedCrmFailureBindings) {
  const result = await dryRunAcceptedCrmFailure(db, b);
  requireThat(result.alreadyApplied, "crm_failure_receipt_missing");
  const receipt = await db.event.findUniqueOrThrow({ where: { id: result.receiptId } });
  const payload = record(receipt.payloadJson);
  const version = Number(payload.version);
  const campaignStatusPreserved = version === 1 && payload.campaignRemainsSending === true
    ? "sending"
    : preservedCampaignStatus(payload.campaignStatusPreserved, "crm_failure_receipt_contract_drift");
  requireThat((version === 1 || version === 2) &&
    payload.campaignRemainsSending === (campaignStatusPreserved === "sending") &&
    (version === 1 || payload.campaignRemainsCancelled === (campaignStatusPreserved === "cancelled")) &&
    payload.providerCalls === 0 && payload.guardRemainsClosed === true &&
    payload.jobContinuationAuthorized === false && typeof payload.taskHash === "string", "crm_failure_receipt_contract_drift");
  requireThat(typeof payload.dispositionEventId === "string" && typeof payload.failureEventId === "string",
    "crm_failure_receipt_effect_binding_invalid");
  requireThat(await db.event.count({ where: { id: { in: [payload.dispositionEventId, payload.failureEventId] }, clientId: b.clientId,
    messageId: messageIdFor(b) } }) === 2, "crm_failure_receipt_effect_missing");
  return { receiptId: receipt.id, taskHash: payload.taskHash as string, terminalForAcceptedResult: true as const,
    campaignStatusPreserved, campaignContinuationAuthorized: false as const };
}

export async function acknowledgeAcceptedCrmFailure(db: PrismaClient, b: AcceptedCrmFailureBindings, actor: string) {
  requireThat(actor.trim(), "crm_failure_actor_required");
  const verified = await verifyAcceptedCrmFailure(db, b);
  const status = acknowledgeAcceptedFailedWithoutCrmCampaignTask({ generation: b.guardGeneration,
    taskId: b.taskId, reference: { clientId: b.clientId, campaignId: b.campaignId, messageId: messageIdFor(b) },
    expectedTaskHash: verified.taskHash, receiptId: verified.receiptId, actor });
  return { ...verified, status };
}
