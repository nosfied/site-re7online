import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import {inspectAcceptedDelivery,buildAcceptedDeliveryReceipt,verifyAcceptedDeliveryReceipt,deliveryEvidenceHash} from "./campaignAcceptedDeliveryReview.js";
const url=new URL(process.env.DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/re7_guard37_prevention_20261010");const db=getPrisma();
test("offline delivered receipt verifies exact evidence, replay, protected five and pending five, never authorizes ack",async t=>{
 t.after(async()=>db.$disconnect());
 const clientId=crypto.randomUUID(),runId=crypto.randomUUID(),phoneNumberId="synthetic-account";
 await db.client.create({data:{id:clientId,clientKey:`receipt-${clientId}`,name:"Synthetic",profile:"business"}});
 const parent=await db.campaign.create({data:{clientId,name:"Synthetic parent",templateName:"synthetic",status:"sending",totalRecipients:11}});
 const campaign=await db.campaign.create({data:{clientId,name:"Synthetic child",templateName:"synthetic",status:"sending",totalRecipients:11,sentCount:5}});
 // Frozen isolated recovery state uses actual schema enums, not a running scheduler.
 const batch=await db.campaignExecutionBatch.create({data:{clientId,name:"Synthetic",sourceMode:"DYNAMIC_CRM_FILTER",status:"running",eligibleAt:new Date(0),totalRecipients:11,chunkCount:1,idempotencyKey:`dynamic:${parent.id}`,metadata:{parentCampaignId:parent.id}}});
 const link=await db.campaignExecutionBatchCampaign.create({data:{clientId,batchId:batch.id,campaignId:campaign.id,chunkIndex:1,recipientCount:11,status:"scheduled"}});
 const job=await db.campaignExecutionJob.create({data:{clientId,campaignId:campaign.id,batchId:batch.id,kind:"batch_chunk",status:"queued",attempt:1,eligibleAt:new Date(0),idempotencyKey:crypto.randomUUID(),failureReason:"operational_suspension"}});
 const prior=[];for(let n=1;n<=5;n++)prior.push(await db.outboundMessage.create({data:{clientId,messageId:`campaign.${campaign.id}.${n}`,phoneNumberId,waId:`554199110000${n}`,type:"TEMPLATE",status:"SENT"}}));
 const messageId=`campaign.${campaign.id}.6`,waId="447700900123",metaMessageId="synthetic-delivered",time=new Date("2026-10-10T15:40:35.501Z");
 const create=(eventName:string,id:string,payloadJson:any,createdAt:Date,wa:string|null=null)=>db.event.create({data:{clientId,eventName,messageId:id,waId:wa,requestId:crypto.randomUUID(),payloadJson,createdAt}});
 const intent=await create("campaign.message.submit_started",messageId,{campaignId:campaign.id,campaignRunId:runId},new Date("2026-10-10T15:40:34.964Z"),waId);
 const accepted=await create("campaign.message.provider_accepted",messageId,{campaignId:campaign.id,campaignRunId:runId,metaMessageId,acceptedAt:"2026-10-10T15:40:35.500Z"},time,waId);
 const sent=await create("webhook.status.orphaned",metaMessageId,{metaMessageId,status:"sent",timestamp:"1791646843",reason:"outbound_message_not_found"},new Date("2026-10-10T15:40:44.443Z"));
 const delivered=await create("webhook.status.orphaned",metaMessageId,{metaMessageId,status:"delivered",timestamp:"1791646843",reason:"outbound_message_not_found"},new Date("2026-10-10T15:40:44.528Z"));
 const taskId=crypto.randomUUID(),task={kind:"provider",phase:"persisting",reference:{clientId,campaignId:campaign.id,messageId},instance:"synthetic",generation:36,build:"synthetic"};
 const guard={open:false,generation:37,tasks:{[taskId]:task}};
 const b={clientId,campaignId:campaign.id,parentCampaignId:parent.id,batchId:batch.id,linkId:link.id,jobId:job.id,runId,taskId,taskHash:deliveryEvidenceHash(task),intentEventId:intent.id,acceptedEventId:accepted.id,sentWebhookId:sent.id,deliveredWebhookId:delivered.id,phoneNumberId,preservedOutboundHashes:Object.fromEntries(prior.map(r=>[r.id,deliveryEvidenceHash(r)]))};
 const inspect=()=>db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;await tx.$executeRaw`SET LOCAL statement_timeout='5000ms'`;return inspectAcceptedDelivery(tx,b,guard);},{isolationLevel:"RepeatableRead",timeout:10000});
 const plan=await inspect();assert.equal(plan.ackEligible,false);assert.equal(plan.providerDeliveredAt,"2026-10-10T15:40:43.000Z");
 assert.deepEqual(await verifyAcceptedDeliveryReceipt(db,plan),{alreadyApplied:false,ackEligible:false});
 // Synthetic SQL fixtures only; no production apply writer/CLI is implemented.
 const out=await db.outboundMessage.create({data:{clientId,messageId,waId,metaMessageId,phoneNumberId,channel:"whatsapp",provider:"meta",type:"TEMPLATE",status:"SENT",createdAt:time,rawPayload:{reconciliation:true,acceptedEventId:accepted.id,deliveredWebhookEventId:delivered.id,metaStatus:{lastStatus:"delivered",metaMessageId,lastStatusAt:plan.providerDeliveredAt}}}});
 const receipt=buildAcceptedDeliveryReceipt(plan,out,"synthetic-owner");
 await db.event.create({data:{clientId,messageId,eventName:"campaign.accepted_delivery.reconciled",requestId:`accepted-delivery:${accepted.id}`,payloadJson:receipt}});
 const replay=await inspect();assert.equal(replay.planHash,plan.planHash);
 for(let n=0;n<2;n++){const r=await verifyAcceptedDeliveryReceipt(db,replay);assert.equal(r.alreadyApplied,true);assert.equal(r.ackEligible,false);}
 assert.equal(await db.outboundMessage.count({where:{clientId}}),6);assert.equal(await db.event.count({where:{clientId,eventName:"campaign.accepted_delivery.reconciled"}}),1);
 assert.equal((await db.campaignExecutionJob.findUniqueOrThrow({where:{id:job.id}})).status,"queued");
 await assert.rejects(inspectAcceptedDelivery(db,{...b,taskHash:"wrong"},guard),/guard_task_mismatch/);
 await assert.rejects(inspectAcceptedDelivery(db,{...b,deliveredWebhookId:sent.id},guard),/provider_mismatch/);
 assert.throws(()=>buildAcceptedDeliveryReceipt(plan,{...out,metaMessageId:"other"},"synthetic-owner"),/result_mismatch/);
 await db.event.updateMany({where:{clientId,eventName:"campaign.accepted_delivery.reconciled"},data:{payloadJson:{...receipt,ackEligible:true}}});
 await assert.rejects(verifyAcceptedDeliveryReceipt(db,plan),/receipt_drift/);
 for(const r of prior)assert.equal(deliveryEvidenceHash(await db.outboundMessage.findUniqueOrThrow({where:{id:r.id}})),b.preservedOutboundHashes[r.id]);
 assert.equal(await db.outboundMessage.count({where:{clientId,messageId:{in:[7,8,9,10,11].map(n=>`campaign.${campaign.id}.${n}`)}}}),0);
});
