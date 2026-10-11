// Dedicated read process: no API entrypoint, scheduler, replay or provider.
const fs=require('fs'),assert=require('node:assert/strict');
const P='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z';
const e=JSON.parse(fs.readFileSync(P+'/window/waiting-work.private.json','utf8'));
const clientId=e.scope.clientId,campaignId=e.jobs.find(x=>x.id===e.scope.jobId).campaignId,parentId=e.scope.campaignIds.find(x=>x!==campaignId);
assert(process.env.RE7_API_CWD==='/opt/re7online/releases/campaign-result-truth-2ed9dccc-20261011T184000Z/apps/whatsapp-agent','effective_api_not_candidate');
const {PrismaClient}=require(process.env.RE7_API_CWD+'/node_modules/@prisma/client');
assert(process.env.DATABASE_URL,'original_api_database_url_missing');
globalThis.fetch=async()=>{throw Error('provider_network_prohibited')};globalThis.setInterval=()=>{throw Error('scheduler_prohibited')};
console.log=console.info=console.debug=(...x)=>console.error(...x);
const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});
(async()=>{
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
  globalThis.prisma=tx;
  const routes=await import(process.env.RE7_API_CWD+'/dist/http/routes.js');
  const first=await routes.buildCampaignListPayload(tx,{clientId,limit:100});
  const child=await routes.buildCampaignDetailPayload(tx,{clientId,campaignId});
  const parent=await routes.buildCampaignDetailPayload(tx,{clientId,campaignId:parentId});
  const second=await routes.buildCampaignListPayload(tx,{clientId,limit:100});
  assert.deepEqual(first,second,'list_detail_new_list_changed');
  function check(x){assert(x);assert.equal(x.sentCount,6);assert.equal(x.totalRecipients,11);assert.equal(x.blockedCount,0);assert.equal(x.metaSummary.totalDelivered,6);assert.equal(x.metaSummary.totalPending,5);assert.equal(x.progress.pendingCount,5);return{sentCount:x.sentCount,totalRecipients:x.totalRecipients,blockedCount:x.blockedCount,metaSummary:x.metaSummary,progress:x.progress};}
  const rows=await tx.outboundMessage.findMany({where:{clientId,messageId:{startsWith:`campaign.${campaignId}.`}},take:12,select:{messageId:true,rawPayload:true}});assert.equal(rows.length,6);assert.equal(new Set(rows.map(x=>x.messageId)).size,6);assert.deepEqual(rows.map(x=>Number(x.messageId.split('.').at(-1))).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert(rows.every(x=>x.rawPayload.metaStatus.lastStatus==='delivered'));
  const job=await tx.campaignExecutionJob.findFirst({where:{id:e.scope.jobId,clientId}});assert(job.status==='queued'&&job.failureReason==='operational_suspension'&&job.leaseToken===null&&job.leaseExpiresAt===null);
  const receipt=await tx.event.findFirst({where:{id:e.receiptId,clientId}});assert.deepEqual(receipt.payloadJson,e.receipt);
  return{child:check(child?.campaign),controller:check(parent?.campaign),listChild:check(first.items.find(x=>x.id===campaignId)),listController:check(first.items.find(x=>x.id===parentId)),repeatedListEqual:true,uniqueReportedDeliveries:6,unsubmittedPositions:5,receiptPreserved:true,jobSuspended:true};
 },{isolationLevel:'RepeatableRead',timeout:30000,maxWait:5000});
 process.stdout.write(JSON.stringify({result:'POST_DEPLOY_RESULT_TRUTH_READ_ONLY_PASS',...result})+'\n');
})().catch(e=>{console.error(e.name+':'+e.code+':'+String(e.message).replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi,'[redacted-url]'));process.exitCode=1;}).finally(()=>db.$disconnect());
