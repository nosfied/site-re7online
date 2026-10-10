import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import { persistVerifiedAcceptedCampaignResult } from "./campaignAcceptedResult.js";
import { shouldApplyProviderStatus } from "./campaignDeliveryTruth.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
assert.equal(url.pathname, "/re7_guard37_prevention_20261010");
const db = getPrisma();
test("accepted result: compatible, mismatches, real uniqueness race, concurrent status, tenant/account", async t => {
 t.after(async () => db.$disconnect());
 const clientId=crypto.randomUUID(), other=crypto.randomUUID();
 for(const id of [clientId,other]) await db.client.create({data:{id,clientKey:`result-${id}`,name:"Synthetic",profile:"business"}});
 const p={clientId,phoneNumberId:"account-a",waId:"5541991100777",waIdCanonical:"5541991100777",messageId:"synthetic-result",metaMessageId:"synthetic-meta",templateName:"synthetic",templateLang:"pt_BR",bodyText:"synthetic",requestId:"synthetic",rawPayload:{source:"campaign",campaignId:"synthetic-campaign",campaignRunId:"synthetic-run",components:null,returnDestination:null}};
 const rows=await Promise.all(Array.from({length:8},()=>persistVerifiedAcceptedCampaignResult(db,p)));
 assert.equal(new Set(rows.map(r=>r.id)).size,1);
 assert.equal(await db.outboundMessage.count({where:{clientId,messageId:p.messageId}}),1);
 const baseline=rows[0];
 for(const delta of [{metaMessageId:"other"},{waId:"554191100777"},{phoneNumberId:"account-b"},{templateName:"other"},{rawPayload:{...p.rawPayload,campaignRunId:"other"}}]) await assert.rejects(persistVerifiedAcceptedCampaignResult(db,{...p,...delta}),/campaign_accepted_result_mismatch/);
 assert.equal(await db.outboundMessage.count({where:{clientId}}),1);
 const rival=await persistVerifiedAcceptedCampaignResult(db,{...p,clientId:other}); assert.notEqual(rival.id,baseline.id);
 // Real concurrent SQL writer stands for webhook status persistence; no claim of real webhook execution.
 await Promise.all([db.outboundMessage.update({where:{id:baseline.id},data:{rawPayload:{...p.rawPayload,metaStatus:{lastStatus:"read",lastStatusAt:"2026-10-10T16:00:00Z",metaMessageId:p.metaMessageId}}}}),persistVerifiedAcceptedCampaignResult(db,p)]);
 const read=await db.outboundMessage.findUniqueOrThrow({where:{id:baseline.id}});
 assert.equal((read.rawPayload as any).metaStatus.lastStatus,"read");
 assert.equal(shouldApplyProviderStatus({currentStatus:"read",currentStatusAt:"2026-10-10T16:00:00Z",incomingStatus:"delivered",incomingStatusAt:"2026-10-10T15:59:59Z"}),false);
 await persistVerifiedAcceptedCampaignResult(db,p);
 assert.deepEqual((await db.outboundMessage.findUniqueOrThrow({where:{id:baseline.id}})).rawPayload,read.rawPayload);
 // A genuine conflict at create with incompatible winner must deny, not pass on P2002.
 const incompatible={...p,messageId:"race-incompatible"};
 const outcomes=await Promise.allSettled([persistVerifiedAcceptedCampaignResult(db,incompatible),persistVerifiedAcceptedCampaignResult(db,{...incompatible,metaMessageId:"different-meta"})]);
 assert.equal(outcomes.filter(o=>o.status==="fulfilled").length,1); assert.equal(outcomes.filter(o=>o.status==="rejected").length,1);
});
