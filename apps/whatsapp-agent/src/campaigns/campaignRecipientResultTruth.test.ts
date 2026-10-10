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
