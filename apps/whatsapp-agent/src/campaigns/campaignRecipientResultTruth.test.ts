import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCampaignRecipientResultStatuses, buildCampaignMetaStatusItem, summarizeCampaignMetaStatuses } from './campaignRecipientResultTruth.js';
const recipients=['5541991234567','554198765432','5541991112233'];
const seed={recipients,templateName:'synthetic'};
for(const status of ['sending','scheduled']) test(`${status}: known audience pending, explicit failure remains failure`,()=>{
 const failed=buildCampaignMetaStatusItem({waId:recipients[1],messageId:'synthetic.2',templateName:'synthetic',status:'FAILED',errorBody:'synthetic failure',rawPayload:null,createdAt:new Date('2026-10-10T00:00:00Z')});
 const result=buildCampaignRecipientResultStatuses({campaign:{sentCount:0,blockedCount:0,status,templateName:'synthetic'},seed,resultItems:[failed]});
 const summary=summarizeCampaignMetaStatuses(result);assert.equal(summary.totalFailed,1);assert.equal(summary.totalPending,2);assert.equal(result.length,3);
});
test('terminal missing history retains failure; aliases use existing candidates and do not duplicate',()=>{
 const campaign={sentCount:0,blockedCount:0,status:'completed',templateName:'synthetic'};
 const result=buildCampaignRecipientResultStatuses({campaign,seed,resultItems:[]});assert.equal(summarizeCampaignMetaStatuses(result).totalFailed,3);
 const delivered=buildCampaignMetaStatusItem({waId:'554191234567',messageId:'synthetic.1',templateName:'synthetic',status:'SENT',errorBody:null,rawPayload:{metaStatus:{lastStatus:'delivered',lastStatusAt:'2026-10-10T00:00:00Z'}},createdAt:new Date('2026-10-10T00:00:00Z')});
 const aliases=buildCampaignRecipientResultStatuses({campaign:{...campaign,status:'sending',sentCount:1},seed:{...seed,recipients:[recipients[0],'554191234567']},resultItems:[delivered]});assert.equal(aliases.length,1);assert.equal(aliases[0].status,'delivered');
});
test('valid -> uncertain -> valid keeps the uncertain result out of sent and failed totals',()=>{
 const status=(waId:string,state:'sent'|'unknown')=>({waId,templateName:'synthetic',status:state,sentAt:'2026-11-06T12:00:00.000Z',deliveredAt:null,billable:false,nonBillingReason:state==='unknown'?'provider_acceptance_unknown':'status_unconfirmed',pricingCategory:null,pricingBillable:null,pricingModel:null,conversationId:null,error:state==='unknown'?'Resultado da submissão ao provedor incerto; reenvio bloqueado.':null});
 const result=buildCampaignRecipientResultStatuses({campaign:{sentCount:3,blockedCount:0,status:'completed',templateName:'synthetic'},seed,resultItems:[status(recipients[0],'sent'),status(recipients[1],'unknown'),status(recipients[2],'sent')]});
 assert.deepEqual(result.map(item=>item.status),['sent','unknown','sent']);
 const summary=summarizeCampaignMetaStatuses(result);
 assert.equal(summary.totalSent,2);assert.equal(summary.totalUncertain,1);assert.equal(summary.totalFailed,0);assert.equal(summary.totalPending,0);
});
test('legacy history without an uncertainty marker preserves the established sentCount fallback',()=>{
 const result=buildCampaignRecipientResultStatuses({campaign:{sentCount:2,blockedCount:0,status:'completed',templateName:'synthetic'},seed,resultItems:[]});
 assert.deepEqual(result.map(item=>item.status),['sent','sent','failed']);
 const summary=summarizeCampaignMetaStatuses(result);assert.equal(summary.totalSent,2);assert.equal(summary.totalUncertain,0);assert.equal(summary.totalFailed,1);
});
test('failed campaign keeps explicit failure separate from a recipient never submitted',()=>{
 const status=(waId:string,state:'sent'|'failed')=>({waId,templateName:'synthetic',status:state,sentAt:'2026-11-08T12:00:00.000Z',deliveredAt:null,billable:false,nonBillingReason:state==='failed'?'failed':'status_unconfirmed',pricingCategory:null,pricingBillable:null,pricingModel:null,conversationId:null,error:state==='failed'?'Synthetic recipient refusal':null});
 const result=buildCampaignRecipientResultStatuses({campaign:{sentCount:1,blockedCount:0,status:'failed',templateName:'synthetic'},seed,resultItems:[status(recipients[0],'sent'),status(recipients[1],'failed')]});
 assert.deepEqual(result.map(item=>item.status),['sent','failed','not_submitted']);
 const summary=summarizeCampaignMetaStatuses(result);
 assert.equal(summary.totalSent,1);assert.equal(summary.totalFailed,1);assert.equal(summary.totalNotSubmitted,1);assert.equal(summary.totalPending,0);
 assert.equal(result[2]?.nonBillingReason,'not_submitted');
});
