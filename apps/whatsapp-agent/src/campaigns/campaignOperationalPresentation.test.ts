import "./campaignOperationsTestSupport.js";
import { applyCampaignExecutionBatchAction } from "./campaignBatchControl.js";
import { projectCampaignJobExecution, aggregateCampaignExecution } from "./campaignExecutionPresentation.js";
import { setCampaignOperations, campaignOperationsStatus } from "./campaignOperations.js";
import { claimNextCampaignExecutionJob } from "./campaignExecutionQueue.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import { buildCampaignListPayload, buildCampaignDetailPayload, handleRequest } from "../http/routes.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/re7_integrated_20261012");
assert.equal(process.version, "v20.20.0");
process.env.APP_AUTH_SECRET = "synthetic-list-truth-only";
process.env.CAMPAIGN_SEED_SECRET = "synthetic-list-seed-only";
const cwd = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), "re7-list-truth-"));
process.chdir(temp); fs.mkdirSync(".data"); fs.writeFileSync(".data/tenants.json", "{}");
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", event => queries.push(event.query));
setPrismaForTesting(db);
const tenants: string[] = [];
const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (input, options) => {
  const value = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (value.hostname !== "127.0.0.1") { providerCalls++; throw Error("provider_forbidden"); }
  return originalFetch(input, options);
};
test.after(async () => {
  await db.outboundMessage.deleteMany({ where: { clientId: { in: tenants } } });
  await db.event.deleteMany({ where: { clientId: { in: tenants } } });
  await db.campaignExecutionBatchCampaign.deleteMany({ where: { clientId: { in: tenants } } });
  await db.contact.deleteMany({ where: { clientId: { in: tenants } } });
  await db.lead.deleteMany({ where: { tenantId: { in: tenants } } });
  for (const id of tenants) await db.client.delete({ where: { id } });
  await db.$disconnect(); setPrismaForTesting(undefined); process.chdir(cwd);
  assert.equal(providerCalls, 0);
});
async function fixture() {
  const client = await db.client.create({ data: { clientKey: `list-${crypto.randomUUID()}`, name: "Synthetic list", features: { campaigns: true } } });
  tenants.push(client.id);
  const child = await db.campaign.create({ data: { clientId: client.id, name: "Synthetic child", templateName: "synthetic", status: "sending", totalRecipients: 11, sentCount: 6, createdAt: new Date("2030-01-01T10:00:00Z") } });
  const parent = await db.campaign.create({ data: { clientId: client.id, name: "Synthetic controller", templateName: "synthetic", status: "sending", totalRecipients: 11, blockedCount: 244, createdAt: new Date("2030-01-01T11:00:00Z") } });
  const batch = await db.campaignExecutionBatch.create({ data: { clientId: client.id, name: "Synthetic set", sourceMode: "DYNAMIC_CRM_FILTER", status: "running", idempotencyKey: `dynamic:${parent.id}`, metadata: { parentCampaignId: parent.id }, totalRecipients: 11, blockedCount: 244 } });
  await db.campaignExecutionBatchCampaign.create({ data: { clientId: client.id, batchId: batch.id, campaignId: child.id, chunkIndex: 1, recipientCount: 11, status: "sending" } });
  const recipients = Array.from({ length: 11 }, (_, i) => `55419911000${String(i + 1).padStart(2, "0")}`);
  await seed(client.id, child.id, recipients);
  await seed(client.id, parent.id, [], "DYNAMIC_CRM_FILTER");
  await db.outboundMessage.createMany({ data: recipients.slice(0, 6).map((waId, i) => ({ clientId: client.id, waId, type: "TEMPLATE", status: "SENT", messageId: `campaign.${child.id}.${i+1}`, createdAt: new Date("2030-01-01T10:01:00Z"), rawPayload: { campaignId: child.id, metaStatus: { lastStatus: "delivered" } } })) });
  return { client, parent, child, batch, recipients };
}
async function seed(clientId: string, campaignId: string, recipients: string[], selectionMode = "STATIC_RECIPIENTS") {
  await db.event.create({ data: { clientId, messageId: campaignId, eventName: "campaign.seed.saved", payloadJson: { name: "Synthetic", templateName: "synthetic", selectionMode, ...buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } } });
}
function assertSix(item: any) {
  const closed = item.status === "cancelled" && item.executionState?.state !== "uncertain";
  assert.equal(item.sentCount, 6); assert.equal(item.totalRecipients, 11); assert.equal(item.blockedCount, 0);
  assert.equal(item.metaSummary.totalDelivered, 6); assert.equal(item.metaSummary.totalPending, closed ? 0 : 5);
  for (const [key, value] of Object.entries({ totalRecipients: 11, sentCount: 6, blockedCount: 0, failedCount: 0, pendingCount: closed ? 0 : 5, notSubmittedCount: closed ? 5 : 0 })) assert.equal(item.progress[key], value);
}

test("derived execution distinguishes live lease, user pause, operational suspension and uncertainty", () => {
 const now=new Date("2030-10-10T15:40:00Z");
 const running={status:"running",leaseOwner:"synthetic",leaseToken:"synthetic",leaseExpiresAt:new Date("2030-10-10T15:41:00Z"),leaseConfirmed:true};
 assert.equal(projectCampaignJobExecution(running,"running",now).state,"processing");
 assert.equal(aggregateCampaignExecution([],"cancelled").state,"uncertain");
 assert.equal(aggregateCampaignExecution([{state:"processing"},{state:"operational_suspension"}],"running").state,"processing");
 assert.equal(projectCampaignJobExecution(running,"paused",now).state,"user_pause_requested");
 assert.equal(projectCampaignJobExecution({...running,leaseConfirmed:false},"running",now).state,"uncertain");
 assert.equal(projectCampaignJobExecution({...running,leaseExpiresAt:now},"running",now).state,"uncertain");
 assert.equal(projectCampaignJobExecution({status:"paused"},"paused",now).state,"user_paused");
 assert.equal(projectCampaignJobExecution({status:"queued",failureReason:"operational_suspension"},"running",now).state,"operational_suspension");
 assert.equal(projectCampaignJobExecution({status:"queued",leaseToken:"orphan"},"running",now).state,"uncertain");
 assert.equal(projectCampaignJobExecution({status:"needs_review"},"needs_review",now).state,"uncertain");
});
test("real list/detail/polling show suspended child/controller and canonical cancel preserves six results and snapshot", async () => {
 const f=await fixture();
 const job=await db.campaignExecutionJob.create({data:{clientId:f.client.id,batchId:f.batch.id,campaignId:f.child.id,kind:"batch_chunk",status:"queued",attempt:1,failureReason:"operational_suspension",idempotencyKey:"synthetic-close",eligibleAt:new Date(0)}});
 for(const waId of f.recipients.slice(6)){await db.contact.create({data:{clientId:f.client.id,waId,lifecycle:"PROVISIONAL"}});await db.lead.create({data:{tenantId:f.client.id,waId,phone:waId,status:"NEW"}});}
 for(const eventName of ["campaign.dynamic_batch_snapshot.created","campaign.accepted_delivery.reconciled","campaign.accepted_delivery.crm_disposition","meta.usage.estimated","meta.usage.updated"])
  await db.event.create({data:{clientId:f.client.id,messageId:eventName.includes("snapshot")?f.parent.id:`campaign.${f.child.id}.6`,eventName,payloadJson:{synthetic:true,preserve:true}}});
 const preserved=async()=>JSON.stringify({outbounds:await db.outboundMessage.findMany({where:{clientId:f.client.id},orderBy:{id:"asc"}}),events:await db.event.findMany({where:{clientId:f.client.id,eventName:{not:"campaign.batch.cancel"}},orderBy:{id:"asc"}}),contacts:await db.contact.findMany({where:{clientId:f.client.id},orderBy:{id:"asc"}}),leads:await db.lead.findMany({where:{tenantId:f.client.id},orderBy:{id:"asc"}})});
 const before=await preserved();
 for(const id of [f.parent.id,f.child.id]){const detail=(await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:id}))!.campaign;assertSix(detail);assert.equal(detail.executionState.state,"operational_suspension");assert.equal(detail.executionBatch!.progress.runningChunks,0);assert.equal(detail.executionBatch!.progress.suspendedChunks,1);}
 for(const row of (await buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items){assertSix(row);assert.equal(row.executionState.state,"operational_suspension");assert(!JSON.stringify(row).includes("leaseToken"));}
 const fence=campaignOperationsStatus();assert.notEqual(fence.generation,null);setCampaignOperations(false,fence.generation!,"synthetic","preserve suspended campaign");assert.equal(await claimNextCampaignExecutionJob(),null);
 let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
 const lock=db.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM "CampaignExecutionBatch" WHERE id=${f.batch.id} FOR UPDATE`;entered();await gate;},{timeout:10000});await ready;
 let settled=false;let secondSettled=false;const action={clientId:f.client.id,batchId:f.batch.id,action:"cancel" as const,userId:"synthetic-owner",requestId:"local-close"};
 const pending=applyCampaignExecutionBatchAction(db,action).then(x=>{settled=true;return x;});const second=applyCampaignExecutionBatchAction(db,action).then(x=>{secondSettled=true;return x;});await new Promise(r=>setTimeout(r,50));assert.equal(secondSettled,false);assert.equal(settled,false,"same batch lock serializes closure");release();await lock;
 assert.deepEqual(await pending,{ok:true});assert.deepEqual(await second,{ok:true});assert.deepEqual(await applyCampaignExecutionBatchAction(db,action),{ok:true});
 assert.equal(await preserved(),before,"snapshot, receipt, usage, results and CRM byte-equal");
 assert.equal(await db.event.count({where:{clientId:f.client.id,eventName:"campaign.batch.cancel"}}),1);
 assert.equal((await db.campaignExecutionJob.findUniqueOrThrow({where:{id:job.id}})).status,"cancelled");assert.equal((await db.campaignExecutionBatch.findUniqueOrThrow({where:{id:f.batch.id}})).status,"cancelled");
 assert.equal((await db.campaignExecutionBatchCampaign.findFirstOrThrow({where:{batchId:f.batch.id}})).status,"cancelled");
 for(let tick=0;tick<2;tick++)for(const row of(await buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items){assertSix(row);assert.equal(row.status,"cancelled");assert.equal(row.executionState.state,"cancelled");const detail=(await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:row.id}))!.campaign;assertSix(detail);assert.equal(detail.executionState.state,"cancelled");}
 const returnRoot=process.env.RE7_COMPATIBLE_RETURN_ROOT;
 if(returnRoot){
  assert.ok(path.isAbsolute(returnRoot)&&returnRoot.endsWith("/compatible-return/apps/whatsapp-agent"));
  const readers=await import(pathToFileURL(path.join(returnRoot,"dist/http/routes.js")).href);
  const returnDb=await import(pathToFileURL(path.join(returnRoot,"dist/db.js")).href);
  returnDb.setPrismaForTesting(db);
  try{
   for(const row of(await readers.buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items){assertSix(row);assert.equal(row.executionState.state,"cancelled");const detail=(await readers.buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:row.id})).campaign;assertSix(detail);}
   const returnControl=await import(pathToFileURL(path.join(returnRoot,"dist/campaigns/campaignBatchControl.js")).href);
   const denial=await returnControl.applyCampaignExecutionBatchAction(db,{...action,action:"resume",requestId:"return-deny-resume"});assert.equal(denial.ok,false);assert.equal(denial.status,409);assert.equal(denial.error,"campaign_batch_not_resumable");
   const returnQueue=await import(pathToFileURL(path.join(returnRoot,"dist/campaigns/campaignExecutionQueue.js")).href);
   assert.equal(await returnQueue.claimNextCampaignExecutionJob(db,{ownerId:"compatible-return",leaseMs:30000}),null);
   assert.equal(await preserved(),before,"compatible return cannot change six results or manufacture submissions");
  }finally{returnDb.setPrismaForTesting(undefined);}
 }
 assert.equal(await db.outboundMessage.count({where:{clientId:f.client.id}}),6);assert.equal(providerCalls,0);
});
test("foreign action cannot close batch; cancel during live execution requires review, never claims completion",async()=>{
 const f=await fixture(),foreign=await fixture();
 const denied=await applyCampaignExecutionBatchAction(db,{clientId:foreign.client.id,batchId:f.batch.id,action:"cancel",userId:"foreign",requestId:"deny"});assert.equal(denied.ok,false);
 await db.campaignExecutionJob.create({data:{clientId:f.client.id,batchId:f.batch.id,campaignId:f.child.id,kind:"batch_chunk",status:"running",leaseToken:"live",leaseOwner:"live",leaseExpiresAt:new Date("2030-10-10T15:41:00Z"),idempotencyKey:"live",eligibleAt:new Date(0)}});
 assert.deepEqual(await applyCampaignExecutionBatchAction(db,{clientId:f.client.id,batchId:f.batch.id,action:"cancel",userId:"synthetic",requestId:"active"}),{ok:true});
 assert.equal((await db.campaignExecutionBatch.findUniqueOrThrow({where:{id:f.batch.id}})).status,"needs_review");
 const detail=(await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:f.parent.id}))!.campaign;assert.equal(detail.executionState.state,"uncertain");assertSix(detail);
});

test("tenant accepted event without a compatible durable result projects uncertainty; persistence resolves only that boundary",async()=>{
 const f=await fixture();await db.campaignExecutionJob.create({data:{clientId:f.client.id,batchId:f.batch.id,campaignId:f.child.id,kind:"batch_chunk",status:"queued",attempt:1,failureReason:"operational_suspension",idempotencyKey:"orphan-result",eligibleAt:new Date(0)}});
 const messageId=`campaign.${f.child.id}.7`;await db.event.create({data:{clientId:f.client.id,messageId,eventName:"campaign.message.provider_accepted",payloadJson:{campaignId:f.child.id,metaMessageId:"synthetic-known-acceptance"}}});
 const detail=(await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:f.parent.id}))!.campaign;assert.equal(detail.executionState.state,"uncertain");assertSix(detail);
 for(const row of(await buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items)assert.equal(row.executionState.state,"uncertain");
 await db.outboundMessage.create({data:{clientId:f.client.id,waId:f.recipients[6],messageId,metaMessageId:"synthetic-known-acceptance",type:"TEMPLATE",status:"SENT",rawPayload:{campaignId:f.child.id}}});
 assert.equal((await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:f.parent.id}))!.campaign.executionState.state,"operational_suspension");assert.equal(providerCalls,0);
});

test("foreign batch metadata cannot leak through a tenant-owned malformed job",async()=>{
 const a=await fixture(),b=await fixture();await db.campaignExecutionJob.create({data:{clientId:a.client.id,campaignId:a.child.id,batchId:b.batch.id,kind:"batch_chunk",status:"queued",idempotencyKey:"foreign-batch-link",eligibleAt:new Date(0)}});
 const row=(await buildCampaignListPayload(db,{clientId:a.client.id,limit:100})).items.find(x=>x.id===a.child.id)!;assert.equal(row.executionState.state,"uncertain");assert.equal(row.executionQueue!.batchName,null);assert.equal(row.executionQueue!.batchId,null);assert.equal(row.executionQueue!.batchStatus,null);assertSix(row);
});


test("known acceptance remains uncertain across canonical cancellation in list detail and lot",async()=>{
 const f=await fixture();await db.campaignExecutionJob.create({data:{clientId:f.client.id,batchId:f.batch.id,campaignId:f.child.id,kind:"batch_chunk",status:"queued",attempt:1,failureReason:"operational_suspension",idempotencyKey:"cancel-known-acceptance",eligibleAt:new Date(0)}});
 const messageId=`campaign.${f.child.id}.7`;
 await db.event.create({data:{clientId:f.client.id,messageId,eventName:"campaign.message.provider_accepted",payloadJson:{campaignId:f.child.id,metaMessageId:"synthetic-cancel-accepted"}}});
 assert.deepEqual(await applyCampaignExecutionBatchAction(db,{clientId:f.client.id,batchId:f.batch.id,action:"cancel",userId:"synthetic",requestId:"cancel-known"}),{ok:true});
 async function check(){
  const rows=(await buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items;
  for(const item of rows){assert.equal(item.status,"cancelled");assert.equal(item.executionState.state,"uncertain");assertSix(item);assert.equal(item.progress.notSubmittedCount,0);}
  for(const id of [f.parent.id,f.child.id]){
   const item=(await buildCampaignDetailPayload(db,{clientId:f.client.id,campaignId:id}))!.campaign;
   assert.equal(item.executionState.state,"uncertain");assertSix(item);assert.equal(item.progress.notSubmittedCount,0);
   assert.ok(item.executionBatch);assert.equal(item.executionBatch.executionState.state,"uncertain");assert.equal(item.executionBatch.chunks[0].executionState.state,"uncertain");
  }
 }
 await check();
 await db.outboundMessage.create({data:{clientId:f.client.id,waId:f.recipients[6],messageId,metaMessageId:"different-meta-id",type:"TEMPLATE",status:"SENT",rawPayload:{campaignId:f.child.id}}});
 for(const row of(await buildCampaignListPayload(db,{clientId:f.client.id,limit:100})).items){assert.equal(row.executionState.state,"uncertain");assert.equal(row.progress.notSubmittedCount,0);}
 await db.outboundMessage.deleteMany({where:{clientId:f.client.id,messageId}});
 await check();assert.equal(providerCalls,0);
});
