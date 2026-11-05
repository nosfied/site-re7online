import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { acknowledgeSubmissionUncertainCampaignTask, readCampaignReconciliationFence } from "./campaignOperations.js";

type Db = PrismaClient | Prisma.TransactionClient;
export type SubmissionUncertainBindings = {
  clientId: string;
  campaignId: string;
  jobId: string;
  runId: string;
  seedEventId: string;
  submitStartedEventId: string;
  taskId: string;
  guardGeneration: number;
  position: number;
};

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]]))
    : item);
const hash = (value: unknown) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function requireThat(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
const messageIdFor = (bindings: SubmissionUncertainBindings) => `campaign.${bindings.campaignId}.${bindings.position}`;
const receiptRequestId = (bindings: SubmissionUncertainBindings) => `submission-uncertain:${bindings.submitStartedEventId}`;
type PreservedCampaignStatus = "sending" | "cancelled";

function preservedCampaignStatus(value: unknown): PreservedCampaignStatus {
  requireThat(value === "sending" || value === "cancelled", "submission_uncertain_campaign_state_drift");
  return value;
}

function authenticateFence(bindings: SubmissionUncertainBindings) {
  const fence = readCampaignReconciliationFence();
  requireThat(!fence.open && fence.generation === bindings.guardGeneration, "submission_uncertain_guard_drift");
  const entries = Object.entries(fence.tasks);
  requireThat(entries.length === 1 && entries[0][0] === bindings.taskId, "submission_uncertain_task_set_drift");
  const task = entries[0][1];
  requireThat(task.kind === "provider" && task.phase === "persisting" && task.generation === bindings.guardGeneration - 1 &&
    canonical(task.reference) === canonical({ clientId: bindings.clientId, campaignId: bindings.campaignId, messageId: messageIdFor(bindings) }),
  "submission_uncertain_task_binding_mismatch");
  return { taskHash: hash(task) };
}

async function authenticateNoProviderResult(db: Db, bindings: SubmissionUncertainBindings) {
  const messageId = messageIdFor(bindings);
  const [accepted, outbounds, terminalResults] = await Promise.all([
    db.event.count({ where: { clientId: bindings.clientId, messageId, eventName: "campaign.message.provider_accepted" } }),
    db.outboundMessage.count({ where: { clientId: bindings.clientId, messageId } }),
    db.event.count({ where: { clientId: bindings.clientId, messageId,
      eventName: { in: ["campaign.message.sent", "campaign.message.failed"] } } }),
  ]);
  requireThat(accepted === 0 && outbounds === 0 && terminalResults === 0,
    "submission_uncertain_provider_result_present");
}

async function inspect(db: Db, bindings: SubmissionUncertainBindings) {
  requireThat(Number.isSafeInteger(bindings.position) && bindings.position > 0, "submission_uncertain_scope_invalid");
  const { taskHash } = authenticateFence(bindings);
  const [campaign, job, seed, submitStarted] = await Promise.all([
    db.campaign.findFirst({ where: { id: bindings.campaignId, clientId: bindings.clientId } }),
    db.campaignExecutionJob.findFirst({ where: { id: bindings.jobId, clientId: bindings.clientId, campaignId: bindings.campaignId } }),
    db.event.findFirst({ where: { id: bindings.seedEventId, clientId: bindings.clientId,
      messageId: bindings.campaignId, eventName: "campaign.seed.saved" } }),
    db.event.findFirst({ where: { id: bindings.submitStartedEventId, clientId: bindings.clientId,
      messageId: messageIdFor(bindings), eventName: "campaign.message.submit_started" } }),
  ]);
  requireThat(campaign && job && seed && submitStarted, "submission_uncertain_evidence_missing");
  const campaignStatusPreserved = preservedCampaignStatus(campaign.status);
  requireThat(campaign.sentCount === bindings.position - 1, "submission_uncertain_campaign_state_drift");
  requireThat(job.kind === "campaign" && job.status === "queued" && job.batchId === null &&
    job.failureReason === "operational_suspension" && !job.leaseToken && !job.leaseOwner && !job.leaseExpiresAt,
  "submission_uncertain_job_state_drift");
  const recipients = readPrivateCampaignSeedFields(record(seed.payloadJson), { clientId: bindings.clientId }).recipients;
  const targetWaId = recipients[bindings.position - 1];
  requireThat(recipients.length === campaign.totalRecipients && typeof targetWaId === "string" && submitStarted.waId === targetWaId,
    "submission_uncertain_seed_position_mismatch");
  const submitPayload = record(submitStarted.payloadJson);
  requireThat(submitPayload.campaignId === bindings.campaignId && submitPayload.campaignRunId === bindings.runId,
    "submission_uncertain_submit_binding_mismatch");
  const [submitted, priorOutbounds] = await Promise.all([
    db.event.count({ where: { clientId: bindings.clientId, eventName: "campaign.message.submit_started",
      messageId: { startsWith: `campaign.${bindings.campaignId}.` } } }),
    db.outboundMessage.count({ where: { clientId: bindings.clientId,
      messageId: { startsWith: `campaign.${bindings.campaignId}.` } } }),
  ]);
  requireThat(submitted === bindings.position && priorOutbounds === bindings.position - 1,
    "submission_uncertain_effect_set_mismatch");
  await authenticateNoProviderResult(db, bindings);
  const evidence = { campaign, job, seed, submitStarted, taskHash, submitted, priorOutbounds };
  const plan = {
    bindings, messageId: messageIdFor(bindings), taskHash, evidenceHash: hash(evidence),
    disposition: "provider_submission_result_unknown", providerAcceptance: "unknown", providerCalls: 0,
    retryAllowed: false, outboundMaterialized: false, campaignStatusPreserved,
    sentCountPreserved: campaign.sentCount, remainingRecipients: campaign.totalRecipients - bindings.position,
  };
  return { plan, planHash: hash(plan), targetWaId };
}

export async function dryRunSubmissionUncertain(db: PrismaClient, bindings: SubmissionUncertainBindings) {
  const prior = await db.event.findUnique({ where: { clientId_eventName_requestId: {
    clientId: bindings.clientId, eventName: "campaign.submission_uncertain.reconciled", requestId: receiptRequestId(bindings),
  } } });
  if (prior) {
    const payload = record(prior.payloadJson);
    requireThat(hash(payload.bindings) === hash(bindings), "submission_uncertain_receipt_binding_mismatch");
    return { alreadyApplied: true as const, receiptId: prior.id, planHash: payload.planHash as string };
  }
  return { alreadyApplied: false as const, ...await inspect(db, bindings) };
}

export async function applySubmissionUncertain(db: PrismaClient, bindings: SubmissionUncertainBindings, expectedPlanHash: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Client" WHERE id=${bindings.clientId}::uuid FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "Campaign" WHERE id=${bindings.campaignId} FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "CampaignExecutionJob" WHERE id=${bindings.jobId} FOR UPDATE`;
    const prior = await tx.event.findUnique({ where: { clientId_eventName_requestId: {
      clientId: bindings.clientId, eventName: "campaign.submission_uncertain.reconciled", requestId: receiptRequestId(bindings),
    } } });
    if (prior) {
      const payload = record(prior.payloadJson);
      requireThat(hash(payload.bindings) === hash(bindings) && payload.planHash === expectedPlanHash,
        "submission_uncertain_receipt_binding_mismatch");
      return { alreadyApplied: true as const, receiptId: prior.id };
    }
    const inspected = await inspect(tx, bindings);
    requireThat(inspected.planHash === expectedPlanHash, "submission_uncertain_plan_drift");
    const disposition = await tx.event.create({ data: {
      clientId: bindings.clientId, waId: inspected.targetWaId, messageId: messageIdFor(bindings),
      requestId: `submission-uncertain-disposition:${bindings.submitStartedEventId}`,
      eventName: "campaign.message.submission_uncertain_preserved",
      payloadJson: { campaignId: bindings.campaignId, campaignRunId: bindings.runId,
        position: bindings.position, providerAcceptance: "unknown", outboundMaterialized: false,
        definitiveFailure: false, retryAllowed: false, providerCalls: 0 },
    } });
    const receipt = await tx.event.create({ data: {
      clientId: bindings.clientId, messageId: bindings.campaignId, requestId: receiptRequestId(bindings),
      eventName: "campaign.submission_uncertain.reconciled",
      payloadJson: { version: 1, bindings, planHash: inspected.planHash, taskHash: inspected.plan.taskHash,
        dispositionEventId: disposition.id, providerAcceptance: "unknown", outboundMaterialized: false,
        definitiveFailure: false, retryAllowed: false, providerCalls: 0,
        campaignStatusPreserved: inspected.plan.campaignStatusPreserved,
        sentCountPreserved: inspected.plan.sentCountPreserved,
        guardRemainsClosed: true, jobContinuationAuthorized: false },
    } });
    return { alreadyApplied: false as const, receiptId: receipt.id };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}

export async function verifySubmissionUncertain(db: PrismaClient, bindings: SubmissionUncertainBindings) {
  const result = await dryRunSubmissionUncertain(db, bindings);
  requireThat(result.alreadyApplied, "submission_uncertain_receipt_missing");
  const receipt = await db.event.findUniqueOrThrow({ where: { id: result.receiptId } });
  const payload = record(receipt.payloadJson);
  const campaignStatusPreserved = preservedCampaignStatus(payload.campaignStatusPreserved);
  requireThat(payload.version === 1 && payload.providerAcceptance === "unknown" &&
    payload.outboundMaterialized === false && payload.definitiveFailure === false && payload.retryAllowed === false &&
    payload.providerCalls === 0 && payload.guardRemainsClosed === true && payload.jobContinuationAuthorized === false &&
    typeof payload.taskHash === "string" && /^[a-f0-9]{64}$/.test(payload.taskHash) &&
    typeof payload.planHash === "string" && /^[a-f0-9]{64}$/.test(payload.planHash) &&
    payload.sentCountPreserved === bindings.position - 1 && typeof payload.dispositionEventId === "string",
  "submission_uncertain_receipt_contract_drift");
  const disposition = await db.event.findFirst({ where: { id: payload.dispositionEventId as string,
    clientId: bindings.clientId, messageId: messageIdFor(bindings),
    eventName: "campaign.message.submission_uncertain_preserved" } });
  requireThat(disposition, "submission_uncertain_disposition_missing");
  const dispositionPayload = record(disposition.payloadJson);
  requireThat(dispositionPayload.campaignId === bindings.campaignId && dispositionPayload.campaignRunId === bindings.runId &&
    dispositionPayload.position === bindings.position && dispositionPayload.providerAcceptance === "unknown" &&
    dispositionPayload.outboundMaterialized === false && dispositionPayload.definitiveFailure === false &&
    dispositionPayload.retryAllowed === false && dispositionPayload.providerCalls === 0,
  "submission_uncertain_disposition_drift");
  await authenticateNoProviderResult(db, bindings);
  const [campaign, job] = await Promise.all([
    db.campaign.findFirstOrThrow({ where: { id: bindings.campaignId, clientId: bindings.clientId } }),
    db.campaignExecutionJob.findFirstOrThrow({ where: { id: bindings.jobId, clientId: bindings.clientId,
      campaignId: bindings.campaignId } }),
  ]);
  requireThat(campaign.status === campaignStatusPreserved && campaign.sentCount === payload.sentCountPreserved,
    "submission_uncertain_campaign_state_drift");
  requireThat(job.kind === "campaign" && job.status === "queued" && job.batchId === null &&
    job.failureReason === "operational_suspension" && !job.leaseToken && !job.leaseOwner && !job.leaseExpiresAt,
  "submission_uncertain_job_state_drift");
  return { receiptId: receipt.id, taskHash: payload.taskHash as string,
    providerAcceptance: "unknown" as const, retryAllowed: false as const,
    campaignStatusPreserved,
    campaignContinuationAuthorized: false as const };
}

export async function acknowledgeSubmissionUncertain(db: PrismaClient, bindings: SubmissionUncertainBindings, actor: string) {
  requireThat(actor.trim(), "submission_uncertain_actor_required");
  const verified = await verifySubmissionUncertain(db, bindings);
  const status = acknowledgeSubmissionUncertainCampaignTask({ generation: bindings.guardGeneration,
    taskId: bindings.taskId, reference: { clientId: bindings.clientId, campaignId: bindings.campaignId,
      messageId: messageIdFor(bindings) }, expectedTaskHash: verified.taskHash, receiptId: verified.receiptId, actor });
  return { ...verified, status };
}
