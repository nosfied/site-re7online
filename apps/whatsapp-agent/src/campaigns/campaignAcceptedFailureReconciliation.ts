import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readPrivateCampaignSeedFields } from './campaignSeedPrivacy.js';
import { campaignRecipientEligibility } from './campaignEligibility.js';
import { parseProviderStatusTimestamp } from './campaignDeliveryTruth.js';
import { acknowledgeReconciledCampaignTask, campaignOperationsStatus } from './campaignOperations.js';

type Db = PrismaClient | Prisma.TransactionClient;
export type AcceptedFailureBindings = {
  clientId: string; parentCampaignId: string; campaignId: string; batchId: string; jobId: string;
  runId: string; acceptedEventId: string; failedWebhookEventId: string; validOutboundId: string;
  snapshotEventId: string; taskId: string; guardGeneration: number;
};
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
function requireThat(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason); }
function record(value: unknown): Record<string, any> {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'reconciliation_payload_invalid');
  return value as Record<string, any>;
}

// Dry-run performs no provider, CRM, runtime or guard writes; acknowledgement is a separate explicit operation below.
export async function dryRunAcceptedFailure(db: Db, b: AcceptedFailureBindings) {
  const campaign = await db.campaign.findFirst({ where: { id: b.campaignId, clientId: b.clientId } });
  const parent = await db.campaign.findFirst({ where: { id: b.parentCampaignId, clientId: b.clientId } });
  const batch = await db.campaignExecutionBatch.findFirst({ where: { id: b.batchId, clientId: b.clientId } });
  const job = await db.campaignExecutionJob.findFirst({ where: { id: b.jobId, clientId: b.clientId, campaignId: b.campaignId, batchId: b.batchId } });
  const link = await db.campaignExecutionBatchCampaign.findFirst({ where: { clientId: b.clientId, campaignId: b.campaignId, batchId: b.batchId } });
  requireThat(campaign && parent && batch && job && link, 'reconciliation_binding_mismatch');
  requireThat(batch.idempotencyKey === `dynamic:${b.parentCampaignId}` && batch.sourceMode === 'DYNAMIC_CRM_FILTER', 'reconciliation_controller_binding_mismatch');
  requireThat(await db.campaignExecutionBatchCampaign.count({ where: { clientId: b.clientId, batchId: b.batchId } }) === 1, 'reconciliation_multiple_chunks_unsupported');
  const receipt = await db.event.findUnique({ where: { clientId_eventName_requestId: {
    clientId: b.clientId, eventName: 'campaign.accepted_failure.reconciled', requestId: `accepted-failure:${b.acceptedEventId}`,
  } } });
  if (receipt) {
    requireThat(hash(record(receipt.payloadJson).bindings) === hash(b), 'reconciliation_receipt_binding_mismatch');
    return { alreadyApplied: true as const, receiptId: receipt.id };
  }
  requireThat(campaign.status === 'sending' && parent.status === 'sending' && batch.status === 'running' && job.status === 'queued' && !job.leaseToken && !job.leaseExpiresAt, 'reconciliation_state_drift');
  const lease = await db.tenantCampaignExecutionLease.findUnique({ where: { clientId: b.clientId } });
  requireThat(!lease?.jobId && (!lease || lease.expiresAt <= new Date()), 'reconciliation_executor_live');
  const accepted = await db.event.findFirst({ where: { id: b.acceptedEventId, clientId: b.clientId, eventName: 'campaign.message.provider_accepted' } });
  const webhook = await db.event.findFirst({ where: { id: b.failedWebhookEventId, clientId: b.clientId, eventName: 'webhook.status.orphaned' } });
  const snapshot = await db.event.findFirst({ where: { id: b.snapshotEventId, clientId: b.clientId, messageId: b.parentCampaignId, eventName: 'campaign.dynamic_batch_snapshot.created' } });
  const valid = await db.outboundMessage.findFirst({ where: { id: b.validOutboundId, clientId: b.clientId, messageId: `campaign.${b.campaignId}.1` } });
  requireThat(accepted && webhook && snapshot && valid, 'reconciliation_evidence_missing');
  const a = record(accepted.payloadJson), w = record(webhook.payloadJson);
  const messageId = `campaign.${b.campaignId}.2`;
  requireThat(accepted.messageId === messageId && a.campaignId === b.campaignId && a.campaignRunId === b.runId &&
    typeof a.metaMessageId === 'string' && w.metaMessageId === a.metaMessageId && w.status === 'failed' &&
    w.reason === 'outbound_message_not_found' && Array.isArray(w.errors) && w.errors.some((e: any) => e.code === 131026) &&
    webhook.createdAt >= accepted.createdAt, 'reconciliation_provider_correlation_mismatch');
  requireThat(valid.status === 'SENT', 'reconciliation_valid_send_mismatch');
  requireThat(!await db.outboundMessage.findFirst({ where: { clientId: b.clientId, messageId } }), 'reconciliation_outbound_already_exists');
  const recipients = readPrivateCampaignSeedFields(record(snapshot.payloadJson), { clientId: b.clientId }).recipients;
  requireThat(recipients.length === 6 && valid.waId === recipients[0] && accepted.waId === recipients[1], 'reconciliation_snapshot_mismatch');
  requireThat(await db.event.count({ where: { clientId: b.clientId, eventName: 'campaign.message.submit_started', messageId: { startsWith: `campaign.${b.campaignId}.` } } }) === 2, 'reconciliation_unexpected_submission');
  const blocked: Array<{ position: number; reason: string; waId: string }> = [];
  for (let i = 1; i < recipients.length; i++) {
    const reason = await campaignRecipientEligibility(db as PrismaClient, b.clientId, [recipients[i]]);
    requireThat(reason === 'anonymized_contact' || reason === 'invalid_whatsapp_identity', 'reconciliation_recipient_not_proven_invalid');
    if (i > 1) blocked.push({ position: i + 1, reason, waId: recipients[i] });
  }
  const plan = { bindings: b, messageId, metaMessageId: a.metaMessageId as string, acceptedAt: accepted.createdAt,
    failedAt: webhook.createdAt, providerFailedAt: parseProviderStatusTimestamp(w.timestamp), providerErrors: w.errors, waId: accepted.waId!, blocked, validOutboundId: valid.id, sent: 1, failed: 1, blockedCount: 4,
    evidenceHash: hash([accepted, webhook, snapshot, campaign, parent, batch, job, link]) };
  return { alreadyApplied: false as const, plan, planHash: hash(plan) };
}

// Prepared for separately authorized reconciliation. SQL-only, serializable,
// hash-bound dry-run. Does NOT acknowledge/erase the provider task or reopen guard.
export async function applyAcceptedFailure(db: PrismaClient, b: AcceptedFailureBindings, expectedPlanHash: string) {
  const prior = await db.event.findUnique({ where: { clientId_eventName_requestId: {
    clientId: b.clientId, eventName: 'campaign.accepted_failure.reconciled', requestId: `accepted-failure:${b.acceptedEventId}`,
  } } });
  if (prior) return dryRunAcceptedFailure(db, b);
  const guard = campaignOperationsStatus();
  requireThat(guard.available && !guard.open && guard.generation === b.guardGeneration && !guard.ledgerFault, 'reconciliation_guard_drift');
  const task = guard.tasks.find(t => t.id === b.taskId);
  requireThat(task?.phase === 'persisting' && task.kind === 'provider' && task.reference?.clientId === b.clientId &&
    task.reference.campaignId === b.campaignId && task.reference.messageId === `campaign.${b.campaignId}.2`, 'reconciliation_task_mismatch');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Client" WHERE id = ${b.clientId}::uuid FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "CampaignExecutionBatch" WHERE id = ${b.batchId} FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "CampaignExecutionJob" WHERE id = ${b.jobId} FOR UPDATE`;
    const result = await dryRunAcceptedFailure(tx, b);
    if (result.alreadyApplied) return result;
    requireThat(result.planHash === expectedPlanHash, 'reconciliation_plan_drift');
    const p = result.plan;
    const reconciledOutbound = await tx.outboundMessage.create({ data: { clientId: b.clientId, waId: p.waId, messageId: p.messageId,
      metaMessageId: p.metaMessageId, channel: 'whatsapp', provider: 'meta', type: 'TEMPLATE', status: 'FAILED',
      createdAt: p.acceptedAt, errorBody: '131026: Message undeliverable',
      rawPayload: { reconciliation: true, acceptedEventId: b.acceptedEventId, failedWebhookEventId: b.failedWebhookEventId,
        metaStatus: { lastStatus: 'failed', lastStatusAt: p.providerFailedAt?.toISOString() ?? null, errors: p.providerErrors } } } });
    await tx.event.create({ data: { clientId: b.clientId, messageId: p.messageId,
      requestId: `accepted-failure-result:${b.acceptedEventId}`, eventName: 'campaign.message.failed',
      payloadJson: { campaignId: b.campaignId, campaignRunId: b.runId, status: 131026, errorBody: 'Message undeliverable', providerAccepted: true, reconciliation: true, retryAllowed: false, metaMessageId: p.metaMessageId, reconciledOutboundId: reconciledOutbound.id } } });
    for (const item of p.blocked) await tx.event.create({ data: { clientId: b.clientId, waId: item.waId,
      messageId: b.campaignId, requestId: `accepted-failure-block:${b.acceptedEventId}:${item.position}`,
      eventName: 'campaign.recipient.import_blocked', payloadJson: { campaignId: b.campaignId, reason: item.reason, recipient: item.waId, rowNumber: item.position, reconciliation: true, beforeProvider: true } } });
    for (const id of [b.campaignId, b.parentCampaignId]) await tx.campaign.update({ where: { id }, data: { status: 'failed', sentCount: 1, blockedCount: 4 } });
    await tx.campaignExecutionJob.update({ where: { id: b.jobId }, data: { status: 'failed', finishedAt: new Date(), failureReason: 'reconciled_meta_131026_no_retry' } });
    await tx.campaignExecutionBatchCampaign.update({ where: { id: (await tx.campaignExecutionBatchCampaign.findFirstOrThrow({ where: { clientId: b.clientId, campaignId: b.campaignId } })).id }, data: { status: 'failed' } });
    await tx.campaignExecutionBatch.update({ where: { id: b.batchId }, data: { status: 'failed', blockedCount: 4, completedAt: new Date(), failureReason: 'reconciled_meta_131026_no_retry' } });
    const receipt = await tx.event.create({ data: { clientId: b.clientId, messageId: b.campaignId,
      eventName: 'campaign.accepted_failure.reconciled', requestId: `accepted-failure:${b.acceptedEventId}`,
      payloadJson: { bindings: b, planHash: expectedPlanHash, sent: 1, failed: 1, blocked: 4, guardRemainsClosed: true, reconciledOutboundId: reconciledOutbound.id, metaMessageId: p.metaMessageId } } });
    return { alreadyApplied: false, receiptId: receipt.id };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}

export async function verifyAcceptedFailureReceipt(db: PrismaClient, b: AcceptedFailureBindings) {
  const receipt = await dryRunAcceptedFailure(db, b);
  requireThat(receipt.alreadyApplied, "reconciliation_receipt_not_durable");
  const valid = await db.outboundMessage.findFirst({ where: { id: b.validOutboundId, clientId: b.clientId, messageId: `campaign.${b.campaignId}.1`, status: 'SENT' } });
  requireThat(valid, 'reconciliation_valid_send_drift');
  const durable = await db.event.findFirstOrThrow({ where: { id: receipt.receiptId, clientId: b.clientId,
    eventName: 'campaign.accepted_failure.reconciled', requestId: `accepted-failure:${b.acceptedEventId}` } });
  const payload = record(durable.payloadJson);
  requireThat(hash(payload.bindings) === hash(b) && payload.sent === 1 && payload.failed === 1 && payload.blocked === 4 &&
    typeof payload.reconciledOutboundId === 'string' && typeof payload.metaMessageId === 'string' && payload.guardRemainsClosed === true &&
    typeof payload.planHash === 'string' && /^[a-f0-9]{64}$/.test(payload.planHash), 'reconciliation_receipt_provenance_mismatch');
  const accepted = await db.event.findFirstOrThrow({ where: { id: b.acceptedEventId, clientId: b.clientId,
    messageId: `campaign.${b.campaignId}.2`, eventName: 'campaign.message.provider_accepted' } });
  const webhook = await db.event.findFirstOrThrow({ where: { id: b.failedWebhookEventId, clientId: b.clientId, eventName: 'webhook.status.orphaned' } });
  const a = record(accepted.payloadJson), w = record(webhook.payloadJson);
  requireThat(a.campaignId === b.campaignId && a.campaignRunId === b.runId && a.metaMessageId === payload.metaMessageId &&
    w.metaMessageId === payload.metaMessageId && w.status === 'failed' && w.reason === 'outbound_message_not_found' &&
    Array.isArray(w.errors) && w.errors.some((e: any) => e.code === 131026), 'reconciliation_ack_provider_mismatch');
  const failed = await db.outboundMessage.findFirst({ where: { id: payload.reconciledOutboundId, clientId: b.clientId,
    messageId: `campaign.${b.campaignId}.2`, metaMessageId: payload.metaMessageId, status: 'FAILED', provider: 'meta', type: 'TEMPLATE' } });
  const provenance = failed ? record(failed.rawPayload) : {};
  requireThat(failed?.errorBody === '131026: Message undeliverable' && failed.waId === accepted.waId &&
    failed.createdAt.getTime() === accepted.createdAt.getTime() && provenance.reconciliation === true &&
    provenance.acceptedEventId === b.acceptedEventId && provenance.failedWebhookEventId === b.failedWebhookEventId,
    'reconciliation_failed_result_missing');
  const failureEvent = await db.event.findFirst({ where: { clientId: b.clientId, messageId: failed.messageId,
    eventName: 'campaign.message.failed', requestId: `accepted-failure-result:${b.acceptedEventId}` } });
  const f = failureEvent ? record(failureEvent.payloadJson) : {};
  requireThat(f.metaMessageId === payload.metaMessageId && f.reconciledOutboundId === failed.id && f.campaignId === b.campaignId && f.campaignRunId === b.runId &&
    f.providerAccepted === true && f.retryAllowed === false && f.status === 131026, 'reconciliation_failure_event_mismatch');
  requireThat(await db.campaign.count({ where: { clientId: b.clientId, id: { in: [b.campaignId, b.parentCampaignId] },
    status: 'failed', sentCount: 1, blockedCount: 4 } }) === 2 &&
    await db.campaignExecutionJob.count({ where: { id: b.jobId, campaignId: b.campaignId, batchId: b.batchId, clientId: b.clientId,
      status: 'failed', failureReason: 'reconciled_meta_131026_no_retry', leaseToken: null, leaseExpiresAt: null } }) === 1 &&
    await db.campaignExecutionBatch.count({ where: { id: b.batchId, clientId: b.clientId, status: 'failed', blockedCount: 4 } }) === 1 &&
    await db.campaignExecutionBatchCampaign.count({ where: { clientId: b.clientId, campaignId: b.campaignId, batchId: b.batchId, status: 'failed' } }) === 1,
    'reconciliation_terminal_state_drift');
  requireThat(await db.event.count({ where: { clientId: b.clientId, messageId: b.campaignId, eventName: 'campaign.recipient.import_blocked',
    requestId: { in: [3, 4, 5, 6].map(position => `accepted-failure-block:${b.acceptedEventId}:${position}`) } } }) === 4, 'reconciliation_block_results_missing');
  return { receiptId: receipt.receiptId, reconciledOutboundId: failed.id,
    metaMessageIdSha256: crypto.createHash('sha256').update(payload.metaMessageId).digest('hex'),
    sent: 1, failed: 1, blocked: 4, terminal: true };
}

export async function acknowledgeAcceptedFailure(db: PrismaClient, b: AcceptedFailureBindings,
  expectedTaskHash: string, actor: string) {
  const receipt = await verifyAcceptedFailureReceipt(db, b);
  return acknowledgeReconciledCampaignTask({ generation: b.guardGeneration, taskId: b.taskId,
    reference: { clientId: b.clientId, campaignId: b.campaignId, messageId: `campaign.${b.campaignId}.2` },
    expectedTaskHash, receiptId: receipt.receiptId, actor });
}
