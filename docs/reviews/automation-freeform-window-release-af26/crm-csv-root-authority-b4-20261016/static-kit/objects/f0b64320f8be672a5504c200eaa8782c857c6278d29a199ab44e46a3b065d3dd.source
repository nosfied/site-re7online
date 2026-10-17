// Frozen inventory is a deployment constraint, never permission to run a campaign.
const assert=require('node:assert/strict');
const canonical=value=>JSON.stringify(value,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sql = `SELECT json_build_object(
 'databaseTimezone',current_setting('TimeZone'),
 'jobs',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId","campaignId","batchId",status,attempt,"eligibleAt",sequence,"leaseToken","leaseExpiresAt","failureReason" FROM "CampaignExecutionJob" WHERE status NOT IN ('completed','failed','cancelled'))x),
 'groups',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId",status,"sourceMode","idempotencyKey" FROM "CampaignExecutionBatch" WHERE status NOT IN ('completed','failed','cancelled'))x),
 'leases',(SELECT count(*) FROM "TenantCampaignExecutionLease" WHERE "jobId" IS NOT NULL OR "expiresAt">=now()),
 'sendingScheduled',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId",status,"scheduledAt" FROM "Campaign" WHERE status NOT IN ('draft','completed','failed','cancelled'))x),
 'flags',(SELECT coalesce(json_agg("clientId" ORDER BY "clientId"),'[]') FROM "TenantOperationalConfig" WHERE config->'allowAutomationConversationsInInbox'='true'::jsonb),
 'connected',(SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM "ChannelAccount" WHERE provider='web_session' AND status='connected'),
 'auth',(SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM "ChannelAccountSecret" WHERE "secretKind"='baileysAuthState.v1'))`;
function noWork(q,e,now=Date.now()) {
 assert.equal(e?.version,2,'frozen_binding_schema');
 assert.equal(e.guardMustRemainClosed,true,'frozen_requires_closed_guard');
 assert.equal(e.capturedGeneration,38,'frozen_generation');
 assert.equal(typeof e.acknowledgementSha256,'string','frozen_ack_missing');
 assert.match(e.acknowledgementSha256,/^[a-f0-9]{64}$/,'frozen_ack_hash');
 const ids=e.scope;
 assert(ids&&Object.keys(ids).sort().join(',')==='batchId,campaignIds,clientId,jobId','frozen_scope');
 assert(Array.isArray(ids.campaignIds)&&ids.campaignIds.length===2&&new Set(ids.campaignIds).size===2,'frozen_campaign_scope');
 for(const x of [q,e]) {
  assert(['UTC','Etc/UTC'].includes(x.databaseTimezone),'frozen_database_timezone');
  for(const k of ['jobs','groups','sendingScheduled']) assert(Array.isArray(x[k]),'frozen_missing:'+k);
  assert.equal(x.leases,0,'frozen_active_or_linked_lease');
  const live=x.jobs.filter(j=>j.status!=='blocked');
  assert.equal(live.length,1,'frozen_nonterminal_job_count');
  const j=live[0];assert(j.id===ids.jobId&&j.clientId===ids.clientId&&j.batchId===ids.batchId&&ids.campaignIds.includes(j.campaignId)&&j.status==='queued'&&j.attempt===1&&j.failureReason==='operational_suspension'&&j.leaseToken===null&&j.leaseExpiresAt===null,'frozen_job_not_suspended');
  for(const terminal of x.jobs.filter(j=>j.status==='blocked')) {
   assert.equal(terminal.failureReason,'no_eligible_recipients','frozen_terminal_reason');
   assert(typeof terminal.leaseExpiresAt==='string'&&Number.isFinite(Date.parse(terminal.leaseExpiresAt+'Z'))&&Date.parse(terminal.leaseExpiresAt+'Z')<now,'frozen_terminal_lease_not_expired');
  }
  const running=x.groups.filter(g=>g.status!=='blocked');
  assert.equal(running.length,1,'frozen_running_batch_count');
  assert(running[0].id===ids.batchId&&running[0].clientId===ids.clientId&&running[0].status==='running','frozen_batch_scope');
  assert.equal(x.sendingScheduled.length,2,'frozen_campaign_count');
  assert(x.sendingScheduled.every(c=>c.clientId===ids.clientId&&ids.campaignIds.includes(c.id)&&c.status==='sending'),'frozen_campaign_state');
 }
 for(const k of ['jobs','groups','leases','sendingScheduled']) assert.equal(canonical(q[k]),canonical(e[k]),'frozen_inventory_drift:'+k);
}
function sqlFor(e) {
 assert.match(e.receiptId,/^[0-9a-f-]{36}$/,'frozen_receipt_id');
 return sql.slice(0,-1)+", 'receipt',(SELECT \"payloadJson\" FROM \"Event\" WHERE id='"+e.receiptId+"'::uuid))";
}
function validateGuard(g,e,markers) {
 assert(g&&g.version===1&&g.open===false&&g.generation===38&&g.tasks&&typeof g.tasks==='object'&&!Array.isArray(g.tasks)&&Object.keys(g.tasks).length===0&&Array.isArray(g.audit),'frozen_guard_state');
 assert.deepEqual(markers,[false,false],'frozen_ledger_markers');
 const crypto=require('node:crypto');
 assert(g.audit.some(a=>crypto.createHash('sha256').update(canonical(a)).digest('hex')===e.acknowledgementSha256),'frozen_ack_not_archived');
}
function verifyReceipt(q,e) {
 assert.equal(canonical(q.receipt),canonical(e.receipt),'frozen_receipt_drift');
 assert(q.receipt?.taskHash===e.taskHash&&q.receipt?.retryAllowed===false&&q.receipt?.reference?.clientId===e.scope.clientId&&e.scope.campaignIds.includes(q.receipt?.reference?.campaignId),'frozen_receipt_scope');
}
module.exports={sql,noWork,sqlFor,validateGuard,verifyReceipt,canonical};
