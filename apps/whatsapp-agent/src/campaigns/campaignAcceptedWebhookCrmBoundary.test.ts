import './campaignOperationsTestSupport.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { getPrisma } from '../db.js';
import { saveTenants } from '../config/tenantConfig.js';
import { receiveWebhook } from '../whatsapp/webhook.controller.js';
import { startCampaignRun, getRunningCampaignPromiseForTests } from './campaignRunner.js';
import { enqueueCampaignExecutionJob, claimNextCampaignExecutionJob } from './campaignExecutionQueue.js';
import { setCampaignOperations } from './campaignOperations.js';
const url=new URL(process.env.DATABASE_URL||'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,'/re7_guard37_webhook_20261010');
assert.equal(process.env.NODE_ENV,'test');assert.ok(process.cwd().startsWith('/tmp/re7-guard37-'));
const db=getPrisma();
async function bounded(promise:Promise<unknown>) {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('barrier not reached')),5000);})]);}
 finally {if(timer)clearTimeout(timer);}
}
for(const timing of ['before','during','after'] as const) {
 test(`real international runner + real DELIVERED/READ webhook ${timing} CRM rejection keeps result, suspension and no fabricated CRM`,async t=>{
  const clientId=crypto.randomUUID(),clientKey=`boundary-${clientId}`,phone=`account-${clientId}`,waId='447700900456',metaId=`synthetic-${clientId}`;
  process.env.CAMPAIGN_OPERATIONS_FILE=fs.mkdtempSync('/tmp/re7-guard37-boundary-')+'/operations.json';
  setCampaignOperations(true,0,'synthetic','local fixture');
  await db.client.create({data:{id:clientId,clientKey,name:'Synthetic',profile:'business',features:{campaigns:true}}});
  await db.waPhoneNumber.create({data:{clientId,phoneNumberId:phone,display:'synthetic'}});
  await saveTenants({[clientKey]:{id:clientKey,name:'Synthetic',metaPhoneNumberId:phone,allowlist:[waId],handoffAttendantWaid:'5541991100000',defaultLanguage:'pt_BR',disableLegacyFlows:true}});
  const templateName=`boundary_${clientId}`;
  await db.template.create({data:{clientId,name:templateName,category:'UTILITY',language:'pt_BR',status:'approved',content:'Synthetic'}});
  const campaign=await db.campaign.create({data:{clientId,name:'Synthetic boundary',templateName,status:'sending',totalRecipients:2}});
  const job=await enqueueCampaignExecutionJob({clientId,campaignId:campaign.id,eligibleAt:new Date(`${1890-['before','during','after'].indexOf(timing)}-01-01T00:00:00Z`),kind:'campaign'});
  const claimed=await claimNextCampaignExecutionJob();assert.equal(claimed?.id,job.id);
  // Fixture disposal only, after all assertions; never operational cleanup.
  t.after(async()=>{await db.campaignExecutionJob.update({where:{id:job.id},data:{status:'paused'}});await db.tenantCampaignExecutionLease.updateMany({where:{clientId},data:{jobId:null,expiresAt:new Date(0)}});});
  const payload=(status:string,time:string)=>({object:'whatsapp_business_account',entry:[{id:'synthetic-business',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:phone},statuses:[{id:metaId,status,timestamp:time,recipient_id:waId}]}}]}]});
  const statuses=async()=>{await receiveWebhook(payload('delivered','1791648000'));await receiveWebhook(payload('read','1791648100'));};
  const fetchOriginal=globalThis.fetch,createOriginal=db.outboundMessage.create,transactionOriginal=db.$transaction;
  let submissions=0,barrierUsed=false;let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(r=>enter=r),released=new Promise<void>(r=>release=r);
  globalThis.fetch=(async()=>{submissions++;assert.equal(submissions,1);return new Response(JSON.stringify({messages:[{id:metaId}]}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  db.outboundMessage.create=(async(args:any)=>{const row=await createOriginal.call(db.outboundMessage,args);if(timing==='before'&&args.data.clientId===clientId)await statuses();return row;}) as typeof createOriginal;
  // Instrument only the timing, not the CRM implementation or its thrown error.
  db.$transaction=(async(work:any,options:any)=>{
   if(timing==='during'&&!barrierUsed&&typeof work==='function'&&String(work).includes('resolveCrmContactIdentity')) {barrierUsed=true;enter();await released;}
   return transactionOriginal.call(db,work,options);
  }) as typeof transactionOriginal;
  t.after(()=>{release();globalThis.fetch=fetchOriginal;db.outboundMessage.create=createOriginal;db.$transaction=transactionOriginal;});
  startCampaignRun({clientId,clientKey,campaignId:campaign.id,name:campaign.name,templateName,waIds:[waId,'5541991100990'],executionJob:claimed!});
  const running=getRunningCampaignPromiseForTests(campaign.id);assert.ok(running);
  if(timing==='during') {await bounded(entered);await statuses();release();}
  await running;
  if(timing==='after')await statuses();
  await receiveWebhook(payload('delivered','1791647900')); // older status cannot downgrade READ
  const row=await db.outboundMessage.findFirstOrThrow({where:{clientId,messageId:`campaign.${campaign.id}.1`}});
  assert.equal((row.rawPayload as any).metaStatus.lastStatus,'read');
  assert.equal((row.rawPayload as any).metaStatus.metaMessageId,metaId);
  assert.equal(row.phoneNumberId,phone);assert.equal(submissions,1);
  assert.equal(await db.outboundMessage.count({where:{clientId}}),1);
  for(const model of [db.contact,db.conversation,db.conversationRuntimeState] as any[])assert.equal(await model.count({where:{clientId}}),0);
  assert.equal(await db.lead.count({where:{tenantId:clientId}}),0);
  const ledger=JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!,'utf8'));
  assert.equal(ledger.open,false);const tasks:any[]=Object.values(ledger.tasks);assert.equal(tasks.length,1);assert.equal(tasks[0].phase,'persisting');
  const suspended=await db.campaignExecutionJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(suspended.status,'queued');assert.equal(suspended.failureReason,'operational_suspension');
  assert.equal(await db.event.count({where:{clientId,eventName:'campaign.message.sent'}}),0);
  assert.ok(await db.event.count({where:{clientId,eventName:'webhook.campaign.crm_pending'}})>=1);
 });
}


test('real status race: delayed DELIVERED enrichment cannot overwrite newer READ; tenant/account mismatch denies',async t=>{
 const {persistVerifiedAcceptedCampaignResult}=await import('./campaignAcceptedResult.js');
 const {persistCampaignProviderStatus}=await import('./campaignProviderStatusPersistence.js');
 const clientId=crypto.randomUUID(),clientKey=`race-${clientId}`,phone=`race-account-${clientId}`,waId='5541991100666';
 await db.client.create({data:{id:clientId,clientKey,name:'Synthetic',profile:'business'}});
 await db.waPhoneNumber.create({data:{clientId,phoneNumberId:phone,display:'synthetic'}});
 await saveTenants({[clientKey]:{id:clientKey,name:'Synthetic',metaPhoneNumberId:phone,allowlist:[waId],handoffAttendantWaid:'5541991100000',defaultLanguage:'pt_BR',disableLegacyFlows:true}});
 const conversation=await db.conversation.create({data:{clientId,waId,waIdCanonical:waId,phoneNumberId:phone,windowIsOpen:true,lastInboundAt:new Date('2026-10-10T16:00:00Z'),windowExpiresAt:new Date('2026-10-11T16:00:00Z')}});
 const row=await persistVerifiedAcceptedCampaignResult(db,{clientId,phoneNumberId:phone,waId,waIdCanonical:waId,messageId:`race-${clientId}`,metaMessageId:`synthetic-race-${clientId}`,templateName:'synthetic',templateLang:'pt_BR',bodyText:'synthetic',requestId:'synthetic',rawPayload:{source:'campaign',campaignId:crypto.randomUUID(),campaignRunId:crypto.randomUUID(),components:null,returnDestination:null,conversationId:conversation.id}});
 const statusInput={id:row.id,clientId,metaMessageId:row.metaMessageId!,phoneNumberId:phone,webhookPhoneNumberId:phone,incomingStatus:'delivered',incomingTimestamp:'1791648000',normalizedStatus:'DELIVERED',errorBody:null,metaStatus:{lastStatus:'delivered',lastStatusAt:'2026-10-10T16:00:00.000Z',metaMessageId:row.metaMessageId!}};
 for(const delta of [{clientId:crypto.randomUUID()},{webhookPhoneNumberId:'wrong-account'},{metaMessageId:'wrong-meta'}]) await assert.rejects(persistCampaignProviderStatus(db,{...statusInput,...delta}),/identity_mismatch/);
 const payload=(status:string,time:string)=>({object:'whatsapp_business_account',entry:[{id:'synthetic-business',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:phone},statuses:[{id:row.metaMessageId,status,timestamp:time,recipient_id:waId}]}}]}]});
 const original=db.outboundMessage.updateMany,fetchOriginal=globalThis.fetch;let held=false,enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),released=new Promise<void>(r=>release=r);
 db.outboundMessage.updateMany=(async(args:any)=>{if(!held&&args.where.id===row.id){held=true;enter();await released;}return original.call(db.outboundMessage,args);}) as typeof original;
 globalThis.fetch=(async()=>{throw new Error('network forbidden');}) as typeof fetch;
 t.after(()=>{release();db.outboundMessage.updateMany=original;globalThis.fetch=fetchOriginal;});
 const delivered=receiveWebhook(payload('delivered','1791648000'));
 await bounded(entered);await receiveWebhook(payload('read','1791648100'));release();await delivered;
 const after=await db.outboundMessage.findUniqueOrThrow({where:{id:row.id}});
 assert.equal((after.rawPayload as any).metaStatus.lastStatus,'read');
 assert.equal(await db.outboundMessage.count({where:{clientId}}),1);
 const preserved=await db.conversation.findUniqueOrThrow({where:{id:conversation.id}});
 assert.equal(preserved.lastInboundAt!.toISOString(),conversation.lastInboundAt!.toISOString());
 assert.equal(preserved.windowExpiresAt!.toISOString(),conversation.windowExpiresAt!.toISOString());
});


test('real DELIVERED/READ controller retains a newer Brazilian human cycle and its window',async t=>{
 const {persistVerifiedAcceptedCampaignResult}=await import('./campaignAcceptedResult.js');
 const clientId=crypto.randomUUID(),clientKey=`human-${clientId}`,phone=`human-account-${clientId}`,waId='5541991100558';
 await db.client.create({data:{id:clientId,clientKey,name:'Synthetic',profile:'business'}});
 await db.waPhoneNumber.create({data:{clientId,phoneNumberId:phone,display:'synthetic'}});
 await saveTenants({[clientKey]:{id:clientKey,name:'Synthetic',metaPhoneNumberId:phone,allowlist:[waId],handoffAttendantWaid:'5541991100000',defaultLanguage:'pt_BR',disableLegacyFlows:true}});
 const department=await db.department.create({data:{clientId,name:'Current human',slug:`human-${clientId}`}});
 const queue=await db.queue.create({data:{clientId,departmentId:department.id,name:'Current human'}});
 const oldDepartment=await db.department.create({data:{clientId,name:'Old campaign',slug:`old-${clientId}`}});
 const oldQueue=await db.queue.create({data:{clientId,departmentId:oldDepartment.id,name:'Old campaign'}});
 const inboundAt=new Date('2026-10-10T16:00:00Z'),expiry=new Date('2026-10-11T16:00:00Z');
 const conversation=await db.conversation.create({data:{clientId,waId,waIdCanonical:waId,phoneNumberId:phone,departmentId:department.id,windowIsOpen:true,lastInboundAt:inboundAt,windowExpiresAt:expiry}});
 const runtime=await db.conversationRuntimeState.create({data:{clientId,waId,waIdCanonical:waId,conversationKey:`${clientKey}:${waId}`,version:1,mode:'HUMAN',status:'IN_PROGRESS',assignedUserId:'synthetic-current-human',departmentId:department.id,queueId:queue.id,answers:{currentCycle:true},windowIsOpen:true,lastInboundAt:inboundAt,windowExpiresAt:expiry}});
 const row=await persistVerifiedAcceptedCampaignResult(db,{clientId,phoneNumberId:phone,waId,waIdCanonical:waId,messageId:`human-${clientId}`,metaMessageId:`synthetic-human-${clientId}`,templateName:'synthetic',templateLang:'pt_BR',bodyText:'synthetic',requestId:'synthetic',rawPayload:{source:'campaign',campaignId:crypto.randomUUID(),campaignRunId:crypto.randomUUID(),components:null,previousConversationId:conversation.id,returnDestination:{type:'human_department',departmentId:oldDepartment.id,queueId:oldQueue.id}}});
 await db.event.create({data:{clientId,messageId:row.messageId,eventName:'campaign.message.submit_started',payloadJson:{runtimeVersionAtSubmission:0,conversationUpdatedAtAtSubmission:'2026-10-10T15:00:00Z'}}});
 const payload=(status:string,time:string)=>({object:'whatsapp_business_account',entry:[{id:'synthetic-business',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:phone},statuses:[{id:row.metaMessageId,status,timestamp:time,recipient_id:waId}]}}]}]});
 const original=globalThis.fetch;globalThis.fetch=(async()=>{throw new Error('network forbidden');}) as typeof fetch;t.after(()=>{globalThis.fetch=original;});
 await receiveWebhook(payload('delivered','1791648000'));await receiveWebhook(payload('read','1791648100'));
 const after=await db.conversationRuntimeState.findUniqueOrThrow({where:{id:runtime.id}});
 assert.equal(after.assignedUserId,runtime.assignedUserId);assert.equal(after.departmentId,department.id);assert.equal(after.queueId,queue.id);assert.equal(after.version,1);assert.equal(after.status,'IN_PROGRESS');assert.equal(after.mode,'HUMAN');assert.deepEqual(after.answers,runtime.answers);
 assert.equal(after.lastInboundAt!.toISOString(),inboundAt.toISOString());assert.equal(after.windowExpiresAt!.toISOString(),expiry.toISOString());
 const afterConversation=await db.conversation.findUniqueOrThrow({where:{id:conversation.id}});assert.equal(afterConversation.departmentId,department.id);assert.equal(afterConversation.lastInboundAt!.toISOString(),inboundAt.toISOString());
 assert.equal((await db.outboundMessage.findUniqueOrThrow({where:{id:row.id}})).rawPayload && ((await db.outboundMessage.findUniqueOrThrow({where:{id:row.id}})).rawPayload as any).metaStatus.lastStatus,'read');
 assert.equal(await db.conversation.count({where:{clientId}}),1);assert.equal(await db.conversationRuntimeState.count({where:{clientId}}),1);
});
test.after(async()=>db.$disconnect());
