import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';
const[root,candidate,proof]=process.argv.slice(2).map(p=>path.resolve(p));const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function deny(e){try{fs.writeFileSync(proof+'/denial.private.json',JSON.stringify({errorClass:e.name,stack:e.stack}),{flag:'wx',mode:0o600});}catch{}console.error(JSON.stringify({result:'COMPILED_EPOCH_PROOF_DENIED',errorClass:e.name}));process.exit(1);}
process.on('uncaughtException',deny);process.on('unhandledRejection',deny);global.fetch=()=>{throw Error('provider_forbidden')};global.setInterval=()=>{throw Error('scheduler_forbidden')};assert.equal(process.versions.node,'20.20.0');
const S=root+'/local-evidence/security-containment-20261012',D=root+'/local-evidence/security-auth-v3-prepared-20261012T234100Z';
const rows=JSON.parse(fs.readFileSync(S+'/seed-dependency.stdout.private')).data.data.rows,old=JSON.parse(fs.readFileSync(S+'/package-v2/original-values.private.json')).CHANNEL_ACCOUNT_SECRET_KEY;
const dedicated=JSON.parse(fs.readFileSync(D+'/seed-write-key.proposed.private.json')).CAMPAIGN_SEED_SECRET;
const originalPolicy=JSON.parse(fs.readFileSync(D+'/canonical-seed-policy-final.private.json'));
for(const k of ['CAMPAIGN_SEED_WRITE_EPOCH','CAMPAIGN_SEED_SECRET','CAMPAIGN_SEED_HISTORICAL_SECRET','CAMPAIGN_SEED_HISTORICAL_POLICY_FILE','CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256','APP_AUTH_SECRET'])delete process.env[k];process.env.CHANNEL_ACCOUNT_SECRET_KEY=old;
const{readPrivateCampaignSeedFields:read,buildPrivateCampaignSeedFields:write}=await import(pathToFileURL(candidate+'/dist/campaigns/campaignSeedPrivacy.js'));
const before=hash(JSON.stringify(rows)),expected=rows.map(r=>read(r.payloadJson,{clientId:r.clientId}));
const entries=rows.flatMap(r=>['recipientsCiphertext','componentsByWaIdCiphertext'].filter(f=>r.payloadJson[f]).map(field=>({clientId:r.clientId,eventId:r.id,field,payloadSha256:hash(JSON.stringify(r.payloadJson)),ciphertextSha256:hash(r.payloadJson[field])})));
assert.deepEqual(entries,originalPolicy.entries);assert.equal(entries.length,147);assert.equal(rows.length,126);
const policy={version:1,keySha256:originalPolicy.keySha256,expiresAt:Date.parse('2026-10-22T21:00:00Z'),entries};
const file=proof+'/historical-policy.proposed.private.json',raw=JSON.stringify(policy);fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});
process.env.CAMPAIGN_SEED_WRITE_EPOCH='seed-dedicated-20261014';process.env.CAMPAIGN_SEED_SECRET=dedicated;process.env.CAMPAIGN_SEED_HISTORICAL_SECRET=old;process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=file;process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=hash(raw);
let fresh;
for(let i=0;i<rows.length;i++){const r=rows[i],parsed=read(r.payloadJson,{clientId:r.clientId});assert.deepEqual(parsed,expected[i]);fresh=write({clientId:r.clientId,waIds:parsed.recipients,componentsByWaId:parsed.componentsByWaId});assert.deepEqual(read(fresh,{clientId:r.clientId}),parsed);assert.throws(()=>read(r.payloadJson,{clientId:'other-tenant'}),/not_authorized/);}
const now=Date.now;try{Date.now=()=>policy.expiresAt+1;assert.throws(()=>read(rows[0].payloadJson,{clientId:rows[0].clientId}),/expired_or_invalid/);assert.throws(()=>write({clientId:rows[0].clientId,waIds:[]}),/expired_or_invalid/);assert.deepEqual(read(fresh,{clientId:rows.at(-1).clientId}),expected.at(-1));}finally{Date.now=now;}
// Explicit local reauthorization proof: new bytes/hash, same147 entries. No
// operational renewal, no mutation of historical policy/events/receipts.
const renewal={...policy,expiresAt:policy.expiresAt+86400000},renewalFile=proof+'/local-renewal-test.private.json',renewalRaw=JSON.stringify(renewal);fs.writeFileSync(renewalFile,renewalRaw,{flag:'wx',mode:0o600});assert.notEqual(hash(renewalRaw),hash(raw));assert.deepEqual(renewal.entries,policy.entries);
process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=renewalFile;process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=hash(renewalRaw);assert.deepEqual(read(rows[0].payloadJson,{clientId:rows[0].clientId}),expected[0]);assert.equal(hash(JSON.stringify(rows)),before);
const result={result:'COMPLETE_CANDIDATE_AND_COMPATIBLE_RETURN_EPOCH_PROOF_PASS',events:126,fields:147,historicalPayloadsUnchanged:true,expiryDeniesLegacyRead:true,expiryDeniesNewWrites:true,v2ReadsRemainAvailableAfterLegacyExpiry:true,explicitRenewalTestEntriesUnchanged:true,policyProposedSha256:hash(raw),productionPolicyApproved:false,providerCalls:0,dbWrites:0};fs.writeFileSync(proof+'/result.sanitized.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
