// Incident proof, not a preventive implementation. All effects are isolated.
import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { campaignRecipientEligibility, normalizeCampaignRecipientIdentity } from "./campaignEligibility.js";
import { normalizeCrmWhatsappIdentity } from "../crm/crmWhatsappIdentity.js";
import { startCampaignRun, getRunningCampaignPromiseForTests } from "./campaignRunner.js";
import { enqueueCampaignExecutionJob, claimNextCampaignExecutionJob } from "./campaignExecutionQueue.js";

// Refuse any URL except the dedicated empty synthetic laboratory database.
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55432");
assert.equal(url.pathname, "/re7_guard37_prevention_20261010");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.cwd().startsWith("/tmp/re7-guard37-"));
const db = getPrisma();

test("prevention: real runner persists accepted outbound before CRM fails, retains persisting and closes", async t => {
  const clientId = crypto.randomUUID(), clientKey = `guard37-synthetic-${clientId}`;
  const waId = "447700900123"; // Synthetic UK example, never sent to a real network.
  const metaId = "synthetic-meta-guard37-accepted-once";
  const templateName = "synthetic_guard37";
  t.after(async () => { await db.$disconnect(); });
  await db.client.create({ data: { id: clientId, clientKey, name: "Synthetic incident proof", profile: "business", features: { campaigns: true } } });
  await db.template.create({ data: { clientId, name: templateName, category: "UTILITY", language: "pt_BR", status: "approved", content: "Synthetic" } });
  const campaign = await db.campaign.create({ data: { clientId, name: "Synthetic incident", templateName, status: "sending", totalRecipients: 2 } });
  assert.equal(normalizeCampaignRecipientIdentity(waId), waId);
  assert.equal(normalizeCrmWhatsappIdentity(waId), null);
  assert.equal(await campaignRecipientEligibility(db, clientId, [waId]), null);
  const job = await enqueueCampaignExecutionJob({ clientId, campaignId: campaign.id, eligibleAt: new Date(0), kind: "campaign" });
  const claimed = await claimNextCampaignExecutionJob();
  assert.ok(claimed); assert.equal(claimed.id, job.id);
  const originalFetch = globalThis.fetch, originalError = logger.error;
  const errors: Array<Record<string, unknown>> = [];
  let submissions = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    assert.ok(target.startsWith("https://graph.facebook.com/"), "unexpected network attempt forbidden");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, waId);
    submissions++;
    const ledger = JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "utf8"));
    const child = Object.values(ledger.tasks).find((task: any) => task.kind === "provider") as any;
    assert.equal(child.phase, "provider_or_uncertain");
    assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.message.submit_started" } }), 1);
    return new Response(JSON.stringify({ messages: [{ id: metaId }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  logger.error = ((value: any) => { errors.push(value); }) as typeof originalError;
  t.after(() => { globalThis.fetch = originalFetch; logger.error = originalError; });
  const id = startCampaignRun({ clientId, clientKey, campaignId: campaign.id, name: campaign.name, templateName,
    waIds: [waId, "5541991100990"], executionJob: claimed });
  assert.ok(id);
  const promise = getRunningCampaignPromiseForTests(campaign.id);
  assert.ok(promise); await promise;
  assert.equal(submissions, 1);
  const accepted = await db.event.findMany({ where: { clientId, eventName: "campaign.message.provider_accepted" } });
  assert.equal(accepted.length, 1);
  assert.equal((accepted[0].payloadJson as any).metaMessageId, metaId);
  assert.equal(await db.outboundMessage.count({ where: { clientId } }), 1);
  const durable = await db.outboundMessage.findFirstOrThrow({ where: { clientId } });
  assert.equal(durable.metaMessageId, metaId); assert.equal(durable.status, "SENT");
  assert.equal(await db.contact.count({ where: { clientId } }), 0);
  assert.equal(await db.lead.count({ where: { tenantId: clientId } }), 0);
  assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.message.submit_started", messageId: `campaign.${campaign.id}.2` } }), 0);
  const error = errors.find(e => e.event === "campaign.result.persistence_pending");
  assert.ok(error);
  assert.equal(error.persistenceStage, "crm_materialization");
  assert.equal(error.errorMessage, "Invalid WhatsApp number");
  assert.equal(error.providerAccepted, true); assert.equal(error.retryAllowed, false);
  const ledger = JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "utf8"));
  assert.equal(ledger.open, false); assert.equal(ledger.generation, 2);
  const tasks: any[] = Object.values(ledger.tasks);
  assert.equal(tasks.length, 1); assert.equal(tasks[0].kind, "provider"); assert.equal(tasks[0].phase, "persisting");
  assert.equal(tasks[0].reference.messageId, `campaign.${campaign.id}.1`);
  assert.ok(tasks[0].parent); assert.equal(ledger.tasks[tasks[0].parent], undefined);
  assert.equal(ledger.audit.at(-1).reason, "unfinished_child_requires_review");
  const suspended = await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(suspended.status, "queued"); assert.equal(suspended.attempt, 1);
  assert.equal(suspended.failureReason, "operational_suspension");
  assert.equal(suspended.leaseToken, null); assert.equal(suspended.leaseOwner, null); assert.equal(suspended.leaseExpiresAt, null);
  assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "sending");
  console.log(JSON.stringify({ proof: "guard37_prevention_proved", node: process.version, provider: "simulated", postgres: "real_isolated",
    submissions, accepted: accepted.length, outbounds: 1, subsequentRecipientSubmissions: 0, taskPhase: tasks[0].phase,
    guardOpen: ledger.open, jobStatus: suspended.status, originalError: error.errorMessage, persistenceStage: error.persistenceStage }));
});

test("SQL failure after acceptance keeps intent/task and never resubmits", async t => {
 const { setCampaignOperations } = await import("./campaignOperations.js");
 const dir=fs.mkdtempSync("/tmp/re7-guard37-sql-");
 process.env.CAMPAIGN_OPERATIONS_FILE=dir+"/operations.json";
 setCampaignOperations(true,0,"synthetic","isolated failure fixture");
 const clientId=crypto.randomUUID(),clientKey=`sql-${clientId}`,name=`sql_${Date.now()}`;
 await db.client.create({data:{id:clientId,clientKey,name:"Synthetic",profile:"business",features:{campaigns:true}}});
 await db.template.create({data:{clientId,name,category:"UTILITY",language:"pt_BR",status:"approved",content:"Synthetic"}});
 const campaign=await db.campaign.create({data:{clientId,name:"SQL fault",templateName:name,status:"sending",totalRecipients:1}});
 const originalFetch=globalThis.fetch, create=db.outboundMessage.create, log=logger.error;
 let submissions=0; const errors:any[]=[];
 globalThis.fetch=(async()=>{submissions++;return new Response(JSON.stringify({messages:[{id:"synthetic-sql-accepted"}]}),{status:200,headers:{"content-type":"application/json"}});}) as typeof fetch;
 // Inject a missing foreign key into the SQL operation, not a fake exception.
 db.outboundMessage.create=((args:any)=>create.call(db.outboundMessage,{...args,data:{...args.data,clientId:crypto.randomUUID()}})) as typeof create;
 logger.error=((event:any)=>errors.push(event)) as typeof log;
 t.after(()=>{globalThis.fetch=originalFetch;db.outboundMessage.create=create;logger.error=log;});
 startCampaignRun({clientId,clientKey,campaignId:campaign.id,name:campaign.name,templateName:name,waIds:["5541991100555"]});
 await getRunningCampaignPromiseForTests(campaign.id);
 assert.equal(submissions,1); assert.equal(await db.outboundMessage.count({where:{clientId}}),0);
 assert.equal(await db.event.count({where:{clientId,eventName:"campaign.message.provider_accepted"}}),1);
 const fault=errors.find(e=>e.event==="campaign.result.persistence_pending");
 assert.equal(fault.persistenceStage,"outbound_persistence");assert.equal(fault.retryAllowed,false);
 const ledger=JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!,"utf8"));
 assert.equal(ledger.open,false);assert.equal((Object.values(ledger.tasks)[0] as any).phase,"persisting");
 await db.$disconnect();
});
