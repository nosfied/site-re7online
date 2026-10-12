// Standby generation only: frozen pre-close inventory OR verified canonical closure.
// No writer, provider, cancellation or guard-opening capability.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const prior=require('./waiting-work-frozen.cjs');
const uuid=x=>{assert.match(x,/^[a-f0-9-]{36}$/);return "'"+x+"'";};
function sqlFor(e){
 const s=e.scope,c=uuid(s.clientId),b=uuid(s.batchId),j=uuid(s.jobId),ids=s.campaignIds.map(uuid).join(',');
 const child=e.receipt.reference.campaignId;assert(s.campaignIds.includes(child));uuid(child);
 const messages=Array.from({length:5},(_,i)=>"'campaign."+child+'.'+(i+7)+"'").join(',');
 return prior.sqlFor(e).slice(0,-1)+`, 'closure',json_build_object(
 'job',(SELECT row_to_json(x) FROM (SELECT id,"clientId","campaignId","batchId",status,attempt,"failureReason","finishedAt","leaseToken","leaseOwner","leaseExpiresAt" FROM "CampaignExecutionJob" WHERE id=${j} AND "clientId"=${c})x),
 'batch',(SELECT row_to_json(x) FROM (SELECT id,"clientId",status,"completedAt" FROM "CampaignExecutionBatch" WHERE id=${b} AND "clientId"=${c})x),
 'links',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId","batchId","campaignId",status,"recipientCount" FROM "CampaignExecutionBatchCampaign" WHERE "batchId"=${b} AND "clientId"=${c})x),
 'campaigns',(SELECT coalesce(json_agg(x ORDER BY x.id),'[]') FROM (SELECT id,"clientId",status FROM "Campaign" WHERE "clientId"=${c} AND id IN (${ids}))x),
 'cancelEvents',(SELECT count(*) FROM "Event" WHERE "clientId"=${c} AND "messageId"=${b} AND "eventName"='campaign.batch.cancel'),
 'results',(SELECT count(*) FROM "OutboundMessage" WHERE "clientId"=${c} AND "messageId" LIKE 'campaign.${child}.%'),
 'uniqueMetaIds',(SELECT count(DISTINCT "metaMessageId") FROM "OutboundMessage" WHERE "clientId"=${c} AND "messageId" LIKE 'campaign.${child}.%'),
 'reported',(SELECT count(*) FROM "OutboundMessage" WHERE "clientId"=${c} AND "messageId" LIKE 'campaign.${child}.%' AND "rawPayload"->'metaStatus'->>'lastStatus' IN ('delivered','read')),
 'remainingResults',(SELECT count(*) FROM "OutboundMessage" WHERE "clientId"=${c} AND "messageId" IN (${messages})),
 'remainingAccepted',(SELECT count(*) FROM "Event" a WHERE a."clientId"=${c} AND a."eventName"='campaign.message.provider_accepted' AND (a."payloadJson"->>'campaignId'='${child}' OR a."messageId" LIKE 'campaign.${child}.%') AND NOT EXISTS(SELECT 1 FROM "OutboundMessage" o WHERE o."clientId"=a."clientId" AND o."messageId"=a."messageId" AND (jsonb_typeof(a."payloadJson"->'metaMessageId') IS DISTINCT FROM 'string' OR o."metaMessageId"=a."payloadJson"->>'metaMessageId')))))`;
}
function closed(q,e,proof,now=Date.now()){
 assert.equal(e.expectedLifecycle,'after_approved_canonical_cancel');
 assert(proof&&proof.mode==='READ_ONLY'&&proof.stage==='VERIFY_AFTER_CANONICAL_CANCEL'&&proof.planHash===e.closurePlanHash,'closure_certificate_missing_or_divergent');
 assert(proof.plan?.preserveResults===6&&proof.plan?.notSubmitted===5&&proof.plan?.guardRemainsClosed38===true&&proof.plan?.providerCalls===0,'closure_certificate_scope');
 const s=e.scope,x=q.closure,j=x?.job,b=x?.batch;
 assert(j&&j.id===s.jobId&&j.clientId===s.clientId&&j.batchId===s.batchId&&s.campaignIds.includes(j.campaignId)&&j.status==='cancelled'&&j.attempt===1&&j.failureReason==='batch_cancelled'&&j.finishedAt&&j.leaseToken===null&&j.leaseOwner===null&&j.leaseExpiresAt===null,'closure_job_incomplete');
 assert(b&&b.id===s.batchId&&b.clientId===s.clientId&&b.status==='cancelled'&&b.completedAt,'closure_batch_incomplete');
 assert(x.links.length===1&&x.links[0].campaignId===e.receipt.reference.campaignId&&x.links[0].clientId===s.clientId&&x.links[0].batchId===s.batchId&&x.links[0].status==='cancelled'&&x.links[0].recipientCount===11,'closure_link_incomplete');
 assert(x.campaigns.length===2&&x.campaigns.every(c=>c.clientId===s.clientId&&s.campaignIds.includes(c.id)&&c.status==='cancelled'),'closure_campaigns_incomplete');
 assert(x.cancelEvents===1&&x.results===6&&x.uniqueMetaIds===6&&x.reported===6&&x.remainingResults===0&&x.remainingAccepted===0,'closure_results_or_acceptance_divergence');
 for(const v of [q,e]){
  assert(['UTC','Etc/UTC'].includes(v.databaseTimezone));assert.equal(v.leases,0,'closure_linked_lease');
  for(const k of ['jobs','groups','sendingScheduled'])assert(Array.isArray(v[k]),'closure_inventory_incomplete');
  assert(v.jobs.every(j=>j.status==='blocked'&&j.failureReason==='no_eligible_recipients'&&typeof j.leaseExpiresAt==='string'&&Number.isFinite(Date.parse(j.leaseExpiresAt+'Z'))&&Date.parse(j.leaseExpiresAt+'Z')<now),'closure_active_or_unknown_job');
  assert(v.groups.every(g=>g.status==='blocked'),'closure_active_or_unknown_batch');assert.equal(v.sendingScheduled.length,0,'closure_active_campaign');
 }
 for(const k of ['jobs','groups','leases','sendingScheduled'])assert.equal(prior.canonical(q[k]),prior.canonical(e[k]),'closure_inventory_drift:'+k);
 prior.verifyReceipt(q,e);
}
function noWork(q,e){
 assert.equal(e.expectedLifecycle,'after_approved_canonical_cancel','closure_expected_lifecycle_required');
 const p=path.join(__dirname,'../window/closure-verified.private.json');
 assert(fs.existsSync(p)&&!fs.lstatSync(p).isSymbolicLink(),'closure_certificate_required_before_standby');
 closed(q,e,JSON.parse(fs.readFileSync(p,'utf8')));
}
module.exports={...prior,sqlFor,noWork,closed};
