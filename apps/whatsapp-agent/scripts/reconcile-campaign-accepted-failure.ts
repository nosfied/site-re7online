// Offline administrative tool; defaults to read-only. Never starts providers/scheduler.
import fs from 'node:fs';
import { getPrisma } from '../src/db.js';
import { dryRunAcceptedFailure, applyAcceptedFailure, acknowledgeAcceptedFailure, type AcceptedFailureBindings } from '../src/campaigns/campaignAcceptedFailureReconciliation.js';
import { sanitizeMailDeliveryError } from '../src/mail/canonicalMail.js';
const args = process.argv.slice(2);
const value = (key: string) => args.find(a => a.startsWith(`${key}=`))?.slice(key.length + 1);
const file = value('--bindings');
if (!file) throw new Error('reconciliation_bindings_required');
const bindings = JSON.parse(fs.readFileSync(file, 'utf8')) as AcceptedFailureBindings;
for (const key of ['clientId', 'parentCampaignId', 'campaignId', 'batchId', 'jobId', 'runId', 'acceptedEventId', 'failedWebhookEventId', 'validOutboundId', 'snapshotEventId', 'taskId'] as const) {
  if (typeof bindings[key] !== 'string' || !/^[a-f0-9-]{36}$/i.test(bindings[key])) throw new Error(`reconciliation_binding_invalid:${key}`);
}
if (!Number.isInteger(bindings.guardGeneration) || bindings.guardGeneration < 0) throw new Error('reconciliation_binding_invalid:guardGeneration');
const mode = value('--mode') ?? 'dry-run';
if (!['dry-run', 'apply-sql', 'ack-task'].includes(mode)) throw new Error('reconciliation_mode_invalid');
if (mode !== 'dry-run' && !args.includes('--execute-authorized')) throw new Error('reconciliation_execution_not_authorized');
const db = getPrisma();
try {
  if (mode === 'dry-run') {
    const result = await dryRunAcceptedFailure(db, bindings);
    console.log(JSON.stringify(result.alreadyApplied ? result : { alreadyApplied: false, planHash: result.planHash,
      sent: result.plan.sent, failed: result.plan.failed, blocked: result.plan.blockedCount, providerCalls: 0, guardWrites: 0 }));
  } else if (mode === 'apply-sql') {
    const digest = value('--plan-hash');
    if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('reconciliation_plan_hash_required');
    console.log(JSON.stringify(await applyAcceptedFailure(db, bindings, digest)));
  } else {
    const digest = value('--task-hash'), actor = value('--actor');
    if (!digest || !/^[a-f0-9]{64}$/.test(digest) || !actor) throw new Error('reconciliation_task_hash_actor_required');
    const result = await acknowledgeAcceptedFailure(db, bindings, digest, actor);
    console.log(JSON.stringify({ open: result.open, generation: result.generation, drained: result.drained, pendingTasks: result.tasks.length }));
  }
} catch (error) { console.error(sanitizeMailDeliveryError(error)); process.exitCode = 1; }
finally { await db.$disconnect(); }
