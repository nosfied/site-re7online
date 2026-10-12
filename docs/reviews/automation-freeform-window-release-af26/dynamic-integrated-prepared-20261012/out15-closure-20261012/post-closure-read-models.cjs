// Dedicated READ ONLY process; reused canonical route readers, no application entrypoint.
const assert=require('node:assert/strict');
const clientId='10a98bf4-1587-43e8-83d4-e3a48c5d79d9',campaignId='94b5805b-5c6d-4c89-b047-959209261c21',parentId='b019039e-0a89-4a42-9f33-c214323b888f';
assert.equal(process.env.RE7_API_CWD,'/opt/re7online/releases/campaign-dynamic-5b3cf3af-20261012T170000Z/apps/whatsapp-agent');
const {PrismaClient}=require(process.env.RE7_API_CWD+'/node_modules/@prisma/client');
assert(process.env.DATABASE_URL,'original_datasource_required');
global.fetch=()=>{throw Error('provider_forbidden')};global.setInterval=()=>{throw Error('scheduler_forbidden')};
console.log=console.info=console.debug=()=>{};
const db=new PrismaClient({log:[]});
(async()=>{
const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='1s'");
 global.prisma=tx;const routes=await import(process.env.RE7_API_CWD+'/dist/http/routes.js');
 const first=await routes.buildCampaignListPayload(tx,{clientId,limit:100});
 const child=await routes.buildCampaignDetailPayload(tx,{clientId,campaignId});
 const parent=await routes.buildCampaignDetailPayload(tx,{clientId,campaignId:parentId});
 const second=await routes.buildCampaignListPayload(tx,{clientId,limit:100});
 assert.deepEqual(first,second,'read_model_list_changed_within_snapshot');
 function check(x){assert(x);assert.equal(x.status,'cancelled');assert.equal(x.sentCount,6);assert.equal(x.totalRecipients,11);assert.equal(x.metaSummary.totalDelivered+x.metaSummary.totalRead,6);assert.equal(x.metaSummary.totalPending,0);assert.equal(x.metaSummary.totalFailed,0);assert.equal(x.metaSummary.totalNotSubmitted,5);assert.equal(x.progress.pendingCount,0);assert.equal(x.progress.failedCount,0);assert.equal(x.progress.notSubmittedCount,5);return{status:x.status,sentCount:x.sentCount,totalRecipients:x.totalRecipients,blockedCount:x.blockedCount,metaSummary:x.metaSummary,progress:x.progress,execution:x.execution};}
 return{child:check(child.campaign),controller:check(parent.campaign),listChild:check(first.items.find(x=>x.id===campaignId)),listController:check(first.items.find(x=>x.id===parentId)),repeatedListEqual:true,readScope:'list/detail/new-list in one RepeatableRead snapshot; real frontend polling confirmed separately'};
},{isolationLevel:'RepeatableRead',timeout:30000,maxWait:2000});
process.stdout.write(JSON.stringify({result:'POST_CLOSURE_CANONICAL_READ_MODELS_PASS',...result})+'\n');
})().catch(e=>{process.stderr.write(JSON.stringify({errorClass:e.name,errorCode:e.code||null,diagnostic:String(e.message).replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi,'[redacted-url]')})+'\n');process.exitCode=1}).finally(()=>db.$disconnect());
