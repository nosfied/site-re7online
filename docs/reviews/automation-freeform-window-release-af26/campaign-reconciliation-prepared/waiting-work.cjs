// Read-only operational classification. Waiting work is preserved, never a drain certificate.
const assert = require('node:assert/strict');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sql = `SELECT json_build_object(
 'jobs',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId","campaignId","batchId",status,attempt,"eligibleAt",sequence,"leaseToken","leaseExpiresAt","failureReason" FROM "CampaignExecutionJob" WHERE status NOT IN ('completed','failed','cancelled'))x),
 'groups',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId",status,"sourceMode","idempotencyKey" FROM "CampaignExecutionBatch" WHERE status NOT IN ('completed','failed','cancelled'))x),
 'leases',(SELECT count(*) FROM "TenantCampaignExecutionLease" WHERE "jobId" IS NOT NULL OR "expiresAt">=now()),
 'sendingScheduled',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId",status,"scheduledAt" FROM "Campaign" WHERE status NOT IN ('draft','completed','failed','cancelled'))x),
 'flags',(SELECT coalesce(json_agg("clientId" ORDER BY "clientId"),'[]') FROM "TenantOperationalConfig" WHERE config->'allowAutomationConversationsInInbox'='true'::jsonb),
 'connected',(SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM "ChannelAccount" WHERE provider='web_session' AND status='connected'),
 'auth',(SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM "ChannelAccountSecret" WHERE "secretKind"='baileysAuthState.v1'))`;
function noWork(q, expected) {
  assert.equal(expected?.version, 1, 'waiting_binding_schema');
  assert.equal(expected?.guardMustRemainClosed, true, 'waiting_requires_closed_guard');
  for (const value of [q, expected]) {
    for (const key of ['jobs','groups','sendingScheduled']) assert(Array.isArray(value[key]), 'waiting_missing_array:'+key);
    assert.equal(value.leases, 0, 'waiting_active_or_unresolved_lease');
    assert(value.jobs.every(j => j && typeof j.id === 'string' && typeof j.clientId === 'string' && j.status === 'queued' &&
      j.leaseToken === null && j.leaseExpiresAt === null), 'waiting_job_not_inactive');
    assert(value.groups.every(g => g && typeof g.id === 'string' && typeof g.clientId === 'string' && g.status === 'queued'), 'waiting_group_not_inactive');
    assert(value.sendingScheduled.every(c => c && typeof c.id === 'string' && typeof c.clientId === 'string' && c.status === 'scheduled'), 'waiting_campaign_not_inactive');
  }
  for (const key of ['jobs','groups','leases','sendingScheduled']) assert.equal(canonical(q[key]), canonical(expected[key]), 'waiting_work_drift:'+key);
}
module.exports = { sql, noWork };
