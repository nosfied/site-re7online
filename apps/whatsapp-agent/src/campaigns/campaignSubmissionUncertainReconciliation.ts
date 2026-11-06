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
  requireThat(fence.generation === bindings.guardGeneration, "submission_uncertain_guard_drift");
  const entries = Object.entries(fence.tasks);
  const task = fence.tasks[bindings.taskId];
  requireThat(task && task.kind === "provider" && task.phase === "persisting" &&
    canonical(task.reference) === canonical({ clientId: bindings.clientId, campaignId: bindings.campaignId, messageId: messageIdFor(bindings) }),
  "submission_uncertain_task_binding_mismatch");
  if (!fence.open) {
    requireThat(entries.length === 1 && task.generation === bindings.guardGeneration - 1,
      "submission_uncertain_task_set_drift");
    return { taskHash: hash(task) };
  }
  const parentEntry = entries.find(([id]) => id === task.parent);
  requireThat(entries.length === 2 && parentEntry && parentEntry[1].kind === "runner" &&
    parentEntry[1].generation === bindings.guardGeneration && task.generation === bindings.guardGeneration &&
    parentEntry[1].instance === task.instance && parentEntry[1].build === task.build,
  "submission_uncertain_interrupted_task_set_drift");
  const pid = Number(task.instance.split(":")[0]);
  let live = Number.isInteger(pid) && pid > 0;
  if (live) {
    try { process.kill(pid, 0); } catch (error) {
      live = (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
  requireThat(!live, "submission_uncertain_interrupted_process_still_live");
  return { taskHash: hash(task), interruptedParent: { taskId: parentEntry[0], taskHash: hash(parentEntry[1]) } };
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

async function authenticatePriorEffects(db: Db, bindings: SubmissionUncertainBindings) {
  const prefix = `campaign.${bindings.campaignId}.`;
  const [submitStarted, outbounds, dispositions] = await Promise.all([
    db.event.findMany({ where: { clientId: bindings.clientId, eventName: "campaign.message.submit_started",
      messageId: { startsWith: prefix } }, select: { id: true, messageId: true, payloadJson: true } }),
    db.outboundMessage.findMany({ where: { clientId: bindings.clientId,
      messageId: { startsWith: prefix } }, select: { messageId: true } }),
    db.event.findMany({ where: { clientId: bindings.clientId,
      eventName: "campaign.message.submission_uncertain_preserved", messageId: { startsWith: prefix } },
      select: { messageId: true, requestId: true, payloadJson: true } }),
  ]);
  const ordinal = (messageId: string | null) => {
    requireThat(typeof messageId === "string" && messageId.startsWith(prefix),
      "submission_uncertain_effect_set_mismatch");
    const value = Number(messageId.slice(prefix.length));
    requireThat(Number.isSafeInteger(value) && value > 0 && value <= bindings.position,
      "submission_uncertain_effect_set_mismatch");
    return value;
  };
  const submittedByPosition = new Map<number, { id: string; runId: string }>();
  for (const event of submitStarted) {
    const position = ordinal(event.messageId);
    const payload = record(event.payloadJson);
    requireThat(payload.campaignId === bindings.campaignId && typeof payload.campaignRunId === "string",
      "submission_uncertain_effect_set_mismatch");
    requireThat(!submittedByPosition.has(position), "submission_uncertain_effect_set_mismatch");
    submittedByPosition.set(position, { id: event.id, runId: payload.campaignRunId });
  }
  requireThat(submittedByPosition.size === bindings.position &&
    Array.from({ length: bindings.position }, (_unused, index) => index + 1).every(position => submittedByPosition.has(position)),
  "submission_uncertain_effect_set_mismatch");
  const outboundPositions = new Set<number>();
  for (const outbound of outbounds) {
    const position = ordinal(outbound.messageId);
    requireThat(position < bindings.position && !outboundPositions.has(position),
      "submission_uncertain_effect_set_mismatch");
    outboundPositions.add(position);
  }
  const uncertainPositions = new Set<number>();
  for (const disposition of dispositions) {
    const position = ordinal(disposition.messageId);
    if (position === bindings.position) continue;
    const payload = record(disposition.payloadJson);
    const providerCalls = payload.providerCalls;
    const expectedRequestId = providerCalls === 1
      ? `campaign-message-submission-uncertain:${bindings.campaignId}:${position}`
      : providerCalls === 0
        ? `submission-uncertain-disposition:${submittedByPosition.get(position)?.id}`
        : null;
    requireThat(position < bindings.position && !uncertainPositions.has(position) &&
      disposition.requestId === expectedRequestId && payload.campaignId === bindings.campaignId &&
      payload.campaignRunId === submittedByPosition.get(position)?.runId && payload.position === position &&
      payload.providerAcceptance === "unknown" &&
      payload.outboundMaterialized === false && payload.definitiveFailure === false &&
      payload.retryAllowed === false,
    "submission_uncertain_prior_disposition_drift");
    uncertainPositions.add(position);
  }
  for (let position = 1; position < bindings.position; position += 1) {
    requireThat(Number(outboundPositions.has(position)) + Number(uncertainPositions.has(position)) === 1,
      "submission_uncertain_effect_set_mismatch");
  }
  return {
    submitted: submittedByPosition.size,
    priorOutbounds: outboundPositions.size,
    priorUncertainPositions: [...uncertainPositions].sort((left, right) => left - right),
  };
}

async function inspect(db: Db, bindings: SubmissionUncertainBindings) {
  requireThat(Number.isSafeInteger(bindings.position) && bindings.position > 0, "submission_uncertain_scope_invalid");
  const { taskHash, interruptedParent } = authenticateFence(bindings);
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
  const { submitted, priorOutbounds, priorUncertainPositions } = await authenticatePriorEffects(db, bindings);
  requireThat(campaign.sentCount === priorOutbounds, "submission_uncertain_campaign_state_drift");
  await authenticateNoProviderResult(db, bindings);
  const existingDispositions = await db.event.findMany({ where: {
    clientId: bindings.clientId, messageId: messageIdFor(bindings),
    eventName: "campaign.message.submission_uncertain_preserved",
  }, orderBy: { createdAt: "desc" }, take: 2 });
  requireThat(existingDispositions.length <= 1, "submission_uncertain_existing_disposition_ambiguous");
  const existingDisposition = existingDispositions[0];
  if (existingDisposition) {
    const payload = record(existingDisposition.payloadJson);
    requireThat(payload.campaignId === bindings.campaignId && payload.campaignRunId === bindings.runId &&
      payload.position === bindings.position && payload.providerAcceptance === "unknown" &&
      payload.outboundMaterialized === false && payload.definitiveFailure === false &&
      payload.retryAllowed === false && payload.providerCalls === 1,
    "submission_uncertain_existing_disposition_drift");
  }
  const evidenceBase = { campaign, job, seed, submitStarted, taskHash, submitted, priorOutbounds };
  const evidence = priorUncertainPositions.length > 0
    ? { ...evidenceBase, priorUncertainPositions }
    : evidenceBase;
  const planBase = {
    bindings, messageId: messageIdFor(bindings), taskHash, evidenceHash: hash(evidence),
    disposition: "provider_submission_result_unknown", providerAcceptance: "unknown", providerCalls: 0,
    retryAllowed: false, outboundMaterialized: false, campaignStatusPreserved,
    sentCountPreserved: campaign.sentCount, remainingRecipients: campaign.totalRecipients - bindings.position,
  };
  const plan: typeof planBase & {
    existingDispositionEventId?: string;
    originalProviderCalls?: number;
    interruptedParent?: { taskId: string; taskHash: string };
    priorUncertainPositions?: number[];
  } = planBase;
  if (existingDisposition) {
    plan.existingDispositionEventId = existingDisposition.id;
    plan.originalProviderCalls = 1;
  }
  if (interruptedParent) plan.interruptedParent = interruptedParent;
  if (priorUncertainPositions.length > 0) plan.priorUncertainPositions = priorUncertainPositions;
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
    const existingDispositionEventId = inspected.plan.existingDispositionEventId;
    const disposition = typeof existingDispositionEventId === "string"
      ? await tx.event.findUniqueOrThrow({ where: { id: existingDispositionEventId } })
      : await tx.event.create({ data: {
        clientId: bindings.clientId, waId: inspected.targetWaId, messageId: messageIdFor(bindings),
        requestId: `submission-uncertain-disposition:${bindings.submitStartedEventId}`,
        eventName: "campaign.message.submission_uncertain_preserved",
        payloadJson: { campaignId: bindings.campaignId, campaignRunId: bindings.runId,
          position: bindings.position, providerAcceptance: "unknown", outboundMaterialized: false,
          definitiveFailure: false, retryAllowed: false, providerCalls: 0 },
      } });
    const sourceFields = typeof existingDispositionEventId === "string"
      ? { dispositionSource: "runner_committed_before_ledger_release", originalProviderCalls: 1,
        interruptedParent: inspected.plan.interruptedParent ?? null }
      : {};
    const receipt = await tx.event.create({ data: {
      clientId: bindings.clientId, messageId: bindings.campaignId, requestId: receiptRequestId(bindings),
      eventName: "campaign.submission_uncertain.reconciled",
      payloadJson: { version: 1, bindings, planHash: inspected.planHash, taskHash: inspected.plan.taskHash,
        dispositionEventId: disposition.id, providerAcceptance: "unknown", outboundMaterialized: false,
        definitiveFailure: false, retryAllowed: false, providerCalls: 0,
        campaignStatusPreserved: inspected.plan.campaignStatusPreserved,
        sentCountPreserved: inspected.plan.sentCountPreserved,
        guardRemainsClosed: true, jobContinuationAuthorized: false,
        ...(inspected.plan.priorUncertainPositions
          ? { priorUncertainPositions: inspected.plan.priorUncertainPositions } : {}),
        ...sourceFields },
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
  const priorUncertainPositions = Array.isArray(payload.priorUncertainPositions)
    ? payload.priorUncertainPositions : [];
  requireThat(priorUncertainPositions.every((position, index) => Number.isSafeInteger(position) && position > 0 &&
    position < bindings.position && (index === 0 || priorUncertainPositions[index - 1] < position)),
  "submission_uncertain_receipt_contract_drift");
  requireThat(payload.version === 1 && payload.providerAcceptance === "unknown" &&
    payload.outboundMaterialized === false && payload.definitiveFailure === false && payload.retryAllowed === false &&
    payload.providerCalls === 0 && payload.guardRemainsClosed === true && payload.jobContinuationAuthorized === false &&
    typeof payload.taskHash === "string" && /^[a-f0-9]{64}$/.test(payload.taskHash) &&
    typeof payload.planHash === "string" && /^[a-f0-9]{64}$/.test(payload.planHash) &&
    payload.sentCountPreserved === bindings.position - 1 - priorUncertainPositions.length &&
    typeof payload.dispositionEventId === "string",
  "submission_uncertain_receipt_contract_drift");
  const disposition = await db.event.findFirst({ where: { id: payload.dispositionEventId as string,
    clientId: bindings.clientId, messageId: messageIdFor(bindings),
    eventName: "campaign.message.submission_uncertain_preserved" } });
  requireThat(disposition, "submission_uncertain_disposition_missing");
  const dispositionPayload = record(disposition.payloadJson);
  const expectedDispositionProviderCalls = payload.dispositionSource === "runner_committed_before_ledger_release" ? 1 : 0;
  requireThat(dispositionPayload.campaignId === bindings.campaignId && dispositionPayload.campaignRunId === bindings.runId &&
    dispositionPayload.position === bindings.position && dispositionPayload.providerAcceptance === "unknown" &&
    dispositionPayload.outboundMaterialized === false && dispositionPayload.definitiveFailure === false &&
    dispositionPayload.retryAllowed === false && dispositionPayload.providerCalls === expectedDispositionProviderCalls,
  "submission_uncertain_disposition_drift");
  if (expectedDispositionProviderCalls === 1) {
    const interruptedParent = record(payload.interruptedParent);
    requireThat(payload.originalProviderCalls === 1 && typeof interruptedParent.taskId === "string" &&
      typeof interruptedParent.taskHash === "string" && /^[a-f0-9]{64}$/.test(interruptedParent.taskHash),
      "submission_uncertain_interrupted_binding_missing");
  }
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
  const interruptedParentPayload = record(payload.interruptedParent);
  const interruptedParent = typeof interruptedParentPayload.taskId === "string" &&
    typeof interruptedParentPayload.taskHash === "string"
    ? { taskId: interruptedParentPayload.taskId, taskHash: interruptedParentPayload.taskHash } : undefined;
  return { receiptId: receipt.id, taskHash: payload.taskHash as string, interruptedParent,
    providerAcceptance: "unknown" as const, retryAllowed: false as const,
    campaignStatusPreserved,
    campaignContinuationAuthorized: false as const };
}

export async function acknowledgeSubmissionUncertain(db: PrismaClient, bindings: SubmissionUncertainBindings, actor: string) {
  requireThat(actor.trim(), "submission_uncertain_actor_required");
  const verified = await verifySubmissionUncertain(db, bindings);
  const status = acknowledgeSubmissionUncertainCampaignTask({ generation: bindings.guardGeneration,
    taskId: bindings.taskId, reference: { clientId: bindings.clientId, campaignId: bindings.campaignId,
      messageId: messageIdFor(bindings) }, expectedTaskHash: verified.taskHash, receiptId: verified.receiptId, actor,
    ...(verified.interruptedParent ? { interruptedParent: {
      taskId: verified.interruptedParent.taskId, expectedTaskHash: verified.interruptedParent.taskHash,
    } } : {}) });
  return { ...verified, status };
}
