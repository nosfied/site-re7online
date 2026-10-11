// Node20; genuine compiled suspension producer + PostgreSQL + exact inventory SQL.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const u=new URL(process.env.DATABASE_URL||'');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/re7_frozen_work_20261011_002421');
const artifact=process.argv[2];assert(artifact&&artifact.startsWith('/tmp/'),'isolated_compiled_artifact_required');
const {getPrisma}=require(artifact+'/dist/db.js');
const {suspendCampaignExecutionJob}=require(artifact+'/dist/campaigns/campaignExecutionQueue.js');
const {sql,noWork,sqlFor,canonical,validateGuard,verifyReceipt}=require('./frozen-work.cjs');
const db=getPrisma();
(async()=>{
 await db.event.deleteMany({where:{client:{name:"Synthetic"}}});await db.client.deleteMany({where:{name:"Synthetic"}});
 const clientId=crypto.randomUUID();await db.client.create({data:{id:clientId,clientKey:clientId,name:'Synthetic',profile:'business'}});
 const batch=await db.campaignExecutionBatch.create({data:{clientId,name:'Synthetic',sourceMode:'DYNAMIC_CRM_FILTER',status:'running',idempotencyKey:crypto.randomUUID()}});
 const cs=await Promise.all([0,1].map(()=>db.campaign.create({data:{clientId,name:'Synthetic',templateName:'synthetic',status:'sending'}})));
 const leaseToken=crypto.randomUUID();
 const job=await db.campaignExecutionJob.create({data:{clientId,batchId:batch.id,campaignId:cs[0].id,kind:'campaign',status:'running',attempt:1,eligibleAt:new Date('2026-10-10T15:00:00Z'),idempotencyKey:crypto.randomUUID(),leaseToken,leaseOwner:'synthetic',leaseExpiresAt:new Date(Date.now()+60000)}});
 await db.tenantCampaignExecutionLease.create({data:{clientId,jobId:job.id,leaseToken,ownerId:'synthetic',expiresAt:new Date(Date.now()+60000)}});
 await suspendCampaignExecutionJob({...job}); // Actual runtime code; no replacement/stub.
 const q=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");return (await tx.$queryRawUnsafe(sql))[0].json_build_object;});
 const e={...q,version:2,guardMustRemainClosed:true,capturedGeneration:38,acknowledgementSha256:'a'.repeat(64),scope:{clientId,jobId:job.id,batchId:batch.id,campaignIds:cs.map(c=>c.id)}};
 noWork(q,e);assert.equal(q.jobs[0].status,'queued');assert.equal(q.jobs[0].failureReason,'operational_suspension');assert.equal(q.leases,0);
 // Explicitly injected classification negatives; they are not claims of OS effects.
 let negatives=0;
 for(const change of [x=>x.jobs[0].status='running',x=>x.jobs[0].attempt=0,x=>x.jobs[0].leaseToken='x',x=>x.leases=1,x=>x.groups[0].status='unknown',x=>x.jobs.push({...x.jobs[0],id:'other'}),x=>x.sendingScheduled[0].clientId='other',x=>delete x.jobs]) {const x=structuredClone(q);change(x);assert.throws(()=>noWork(x,e));negatives++;}
 for(const change of [x=>x.capturedGeneration=37,x=>x.guardMustRemainClosed=false,x=>delete x.acknowledgementSha256]){const x=structuredClone(e);change(x);assert.throws(()=>noWork(q,x));negatives++;}
 const ack={action:'ack',reason:'durable_accepted_delivered_historical_crm_disposition_no_retry',generation:38};
 e.acknowledgementSha256=crypto.createHash('sha256').update(canonical(ack)).digest('hex');e.taskHash='b'.repeat(64);e.receiptId=crypto.randomUUID();e.receipt={taskHash:e.taskHash,retryAllowed:false,reference:{clientId,campaignId:cs[0].id}};
 await db.event.create({data:{id:e.receiptId,clientId,eventName:'synthetic.frozen.receipt',payloadJson:e.receipt}});
 const qr=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");return(await tx.$queryRawUnsafe(sqlFor(e)))[0].json_build_object;});verifyReceipt(qr,e);noWork(qr,e);
 const guard={version:1,open:false,generation:38,tasks:{},audit:[ack]};validateGuard(guard,e,[false,false]);
 for(const change of [x=>x.open=true,x=>x.generation=37,x=>x.tasks=null,x=>x.tasks={job:{}},x=>x.audit=[]]){const x=structuredClone(guard);change(x);assert.throws(()=>validateGuard(x,e,[false,false]));negatives++;}
 assert.throws(()=>validateGuard(guard,e,[true,false]));assert.throws(()=>verifyReceipt({...qr,receipt:null},e));negatives+=2;
 console.log(JSON.stringify({result:'PASS' ,real:'compiled suspend -> PostgreSQL READ ONLY inventory -> classifier',negativeInjections:negatives,providerCalls:0}));
})().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
