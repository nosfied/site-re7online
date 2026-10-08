import './campaignOperationsTestSupport.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { getPrisma } from '../db.js';
import { buildCampaignDetailPayload, buildCampaignListPayload } from '../http/routes.js';
import { campaignOperationsStatus, campaignTask, campaignProviderAttempt } from './campaignOperations.js';
import { buildPrivateCampaignSeedFields } from './campaignSeedPrivacy.js';
import { dryRunAcceptedFailure, applyAcceptedFailure, acknowledgeAcceptedFailure, type AcceptedFailureBindings } from './campaignAcceptedFailureReconciliation.js';
process.env.APP_AUTH_SECRET = 'synthetic-reconciliation-key';

test('Postgres idempotent reconciliation correlates accepted/failed, preserves SENT/snapshot/CRM and pending task', async () => {
  const db = getPrisma(), clientId = crypto.randomUUID();
  try {
    await db.client.create({ data: { id: clientId, clientKey: `reconcile-${clientId}`, name: 'Synthetic', profile: 'business' } });
    const parent = await db.campaign.create({ data: { clientId, name: 'Synthetic controller', templateName: 'synthetic', status: 'sending', totalRecipients: 6 } });
    const child = await db.campaign.create({ data: { clientId, name: 'Synthetic child', templateName: 'synthetic', status: 'sending', totalRecipients: 6, sentCount: 1 } });
    const batch = await db.campaignExecutionBatch.create({ data: { clientId, name: 'Synthetic', sourceMode: 'DYNAMIC_CRM_FILTER', status: 'running', idempotencyKey: `dynamic:${parent.id}`, totalRecipients: 6, chunkCount: 1 } });
    await db.campaignExecutionBatchCampaign.create({ data: { clientId, campaignId: child.id, batchId: batch.id, chunkIndex: 0, recipientCount: 6, status: 'sending' } });
    const job = await db.campaignExecutionJob.create({ data: { clientId, campaignId: child.id, batchId: batch.id, kind: 'batch_chunk', status: 'queued', eligibleAt: new Date(), idempotencyKey: crypto.randomUUID(), failureReason: 'operational_suspension' } });
    const waIds = ['5541991100950', ...Array.from({ length: 5 }, (_, i) => `123456789012${i}`)];
    await db.lead.createMany({ data: waIds.slice(1).map(waId => ({ tenantId: clientId, waId: `anon:subject:${waId}`, status: 'NURTURE' })) });
    const snapshot = await db.event.create({ data: { clientId, messageId: parent.id, eventName: 'campaign.dynamic_batch_snapshot.created', payloadJson: { eligibleCount: 6, ...buildPrivateCampaignSeedFields({ clientId, waIds }) } } });
    const runId = crypto.randomUUID(), metaMessageId = 'synthetic-accepted-no-retry';
    const accepted = await db.event.create({ data: { clientId, waId: waIds[1], messageId: `campaign.${child.id}.2`, eventName: 'campaign.message.provider_accepted', payloadJson: { campaignId: child.id, campaignRunId: runId, metaMessageId } } });
    const webhook = await db.event.create({ data: { clientId, eventName: 'webhook.status.orphaned', payloadJson: { metaMessageId, status: 'failed', timestamp: '1700000000', reason: 'outbound_message_not_found', errors: [{ code: 131026 }] } } });
    const valid = await db.outboundMessage.create({ data: { clientId, waId: waIds[0], messageId: `campaign.${child.id}.1`, type: 'TEMPLATE', status: 'SENT' } });
    await db.event.createMany({ data: [1, 2].map(i => ({ clientId, messageId: `campaign.${child.id}.${i}`, eventName: 'campaign.message.submit_started', payloadJson: {} })) });
    let submissions = 0;
    await campaignTask('synthetic', async () => { await campaignProviderAttempt(async () => {}, async () => { submissions++; return { ok: true }; }, { clientId, campaignId: child.id, messageId: `campaign.${child.id}.2` }); });
    const guard = campaignOperationsStatus();
    const b: AcceptedFailureBindings = { clientId, parentCampaignId: parent.id, campaignId: child.id, batchId: batch.id, jobId: job.id, runId,
      acceptedEventId: accepted.id, failedWebhookEventId: webhook.id, validOutboundId: valid.id, snapshotEventId: snapshot.id, taskId: guard.tasks[0].id, guardGeneration: guard.generation! };
    const first = await dryRunAcceptedFailure(db, b); assert.equal(first.alreadyApplied, false);
    if (first.alreadyApplied) throw new Error('unexpected');
    assert.equal(first.plan.blocked.length, 4);
    await assert.rejects(dryRunAcceptedFailure(db, { ...b, runId: crypto.randomUUID() }), /correlation_mismatch/);
    await assert.rejects(applyAcceptedFailure(db, b, 'wrong-hash'), /plan_drift/);
    assert.equal(await db.outboundMessage.count({ where: { clientId } }), 1);
    await applyAcceptedFailure(db, b, first.planHash);
    const replay = await applyAcceptedFailure(db, b, first.planHash); assert.equal(replay.alreadyApplied, true);
    assert.equal(submissions, 1);
    assert.equal(await db.outboundMessage.count({ where: { clientId } }), 2);
    assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: valid.id } })).status, 'SENT');
    assert.deepEqual((await db.event.findUniqueOrThrow({ where: { id: snapshot.id } })).payloadJson, snapshot.payloadJson);
    assert.equal(await db.contact.count({ where: { clientId } }), 0);
    assert.equal(await db.lead.count({ where: { tenantId: clientId } }), 5);
    assert.equal(await db.event.count({ where: { clientId, eventName: 'campaign.recipient.import_blocked' } }), 4);
    for (const campaignId of [child.id, parent.id]) {
      const detail = await buildCampaignDetailPayload(db, { clientId, campaignId });
      assert.ok(detail);
      assert.equal(detail.campaign.metaSummary.totalSent, 1);
      assert.equal(detail.campaign.metaSummary.totalFailed, 1);
      assert.equal(detail.campaign.metaSummary.totalBlocked, 4);
      assert.equal(detail.campaign.metaSummary.totalPending, 0);
      assert.equal(detail.campaign.messagesMetaStatus.length, 6);
      assert.equal(detail.campaign.progress.pendingCount, 0);
      const progress = detail.campaign.executionBatch!.progress;
      assert.equal(progress.sentCount, 1); assert.equal(progress.failedCount, 1);
      assert.equal(progress.blockedCount, 4); assert.equal(progress.pendingCount, 0);
    }
    const list = await buildCampaignListPayload(db, { clientId, limit: 50 });
    for (const item of list.items.filter(c => [child.id, parent.id].includes(c.id))) {
      assert.equal(item.metaSummary.totalSent, 1); assert.equal(item.metaSummary.totalFailed, 1);
      assert.equal(item.metaSummary.totalBlocked, 4); assert.equal(item.progress.pendingCount, 0);
    }
    // Pagination may include only the controller. Its receipt belongs to the child.
    await db.campaign.update({ where: { id: parent.id }, data: { createdAt: new Date(Date.now() + 1000) } });
    const controllerOnly = await buildCampaignListPayload(db, { clientId, limit: 1 });
    assert.equal(controllerOnly.items[0].id, parent.id);
    assert.equal(controllerOnly.items[0].metaSummary.totalSent, 1);
    assert.equal(controllerOnly.items[0].metaSummary.totalFailed, 1);
    assert.equal(controllerOnly.items[0].metaSummary.totalBlocked, 4);
    await db.campaign.update({ where: { id: parent.id }, data: { createdAt: parent.createdAt } });
    const reconciled = await db.outboundMessage.findFirstOrThrow({ where: { clientId, messageId: `campaign.${child.id}.2` } });
    assert.equal((reconciled.rawPayload as any).metaStatus.lastStatusAt, '2023-11-14T22:13:20.000Z');
    await db.outboundMessage.update({ where: { id: reconciled.id }, data: { metaMessageId: 'wrong-provider-message' } });
    await assert.rejects(acknowledgeAcceptedFailure(db, b, 'wrong', 'synthetic'), /failed_result_missing/);
    await db.outboundMessage.update({ where: { id: reconciled.id }, data: { metaMessageId } });
    const receiptEvent = await db.event.findFirstOrThrow({ where: { clientId, eventName: 'campaign.accepted_failure.reconciled' } });
    await db.event.update({ where: { id: receiptEvent.id }, data: { payloadJson: { ...(receiptEvent.payloadJson as any), metaMessageId: 'wrong' } } });
    await assert.rejects(acknowledgeAcceptedFailure(db, b, 'wrong', 'synthetic'), /ack_provider_mismatch/);
    await db.event.update({ where: { id: receiptEvent.id }, data: { payloadJson: receiptEvent.payloadJson! } });
    const block = await db.event.findFirstOrThrow({ where: { clientId, eventName: 'campaign.recipient.import_blocked' } });
    await db.event.update({ where: { id: block.id }, data: { eventName: 'synthetic.hidden.block' } });
    await assert.rejects(acknowledgeAcceptedFailure(db, b, 'wrong', 'synthetic'), /block_results_missing/);
    await db.event.update({ where: { id: block.id }, data: { eventName: block.eventName } });
    await db.campaignExecutionBatchCampaign.updateMany({ where: { clientId, campaignId: child.id }, data: { status: 'sending' } });
    await assert.rejects(acknowledgeAcceptedFailure(db, b, 'wrong', 'synthetic'), /terminal_state_drift/);
    await db.campaignExecutionBatchCampaign.updateMany({ where: { clientId, campaignId: child.id }, data: { status: 'failed' } });
    assert.equal(campaignOperationsStatus().open, false);
    assert.deepEqual(campaignOperationsStatus().tasks, guard.tasks);
    await assert.rejects(acknowledgeAcceptedFailure(db, b, "wrong", "synthetic"), /task_drift/);
    const task = { ...guard.tasks[0] }; delete (task as any).id;
    const digest = crypto.createHash('sha256').update(JSON.stringify(task, (_k, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
    const acknowledged = await acknowledgeAcceptedFailure(db, b, digest, "synthetic");
    assert.equal(acknowledged.open, false); assert.equal(acknowledged.tasks.length, 0);
    assert.equal(acknowledged.generation, b.guardGeneration + 1);
    assert.equal(await acknowledgeAcceptedFailure(db, b, digest, "synthetic").then(v => v.generation), acknowledged.generation);
    assert.equal((await applyAcceptedFailure(db, b, first.planHash)).alreadyApplied, true);
    const archived = acknowledged.audit.find(a => a.receiptId);
    assert.ok(archived?.resolvedTask); assert.deepEqual(archived.resolvedTask.task, task);
  } finally { await db.$disconnect(); }
});
