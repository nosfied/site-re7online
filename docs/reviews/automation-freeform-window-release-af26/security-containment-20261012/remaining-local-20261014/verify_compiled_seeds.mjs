// Reads original private evidence offline. Writes only a fresh local proof policy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [root,overlay]=process.argv.slice(2).map(p=>path.resolve(p));
// Real evidence may contain personal data: never print assert actual/expected.
function deny(e){
 try {fs.writeFileSync(overlay+'/proof-denial.private.json',JSON.stringify({errorClass:e?.name,stack:e?.stack})+'\n',{flag:'wx',mode:0o600});} catch {}
 console.error(JSON.stringify({result:'LOCAL_PROOF_DENIED_PRIVATE_DIAGNOSTIC',errorClass:e?.name}));process.exit(1);
}
process.on('uncaughtException',deny);process.on('unhandledRejection',deny);
assert.equal(process.versions.node,'20.20.0');
global.fetch=()=>{throw Error('provider_forbidden')};
global.setInterval=()=>{throw Error('scheduler_forbidden')};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const S=root+'/local-evidence/security-containment-20261012';
const D=root+'/local-evidence/security-auth-v3-prepared-20261012T234100Z';
const rows=JSON.parse(fs.readFileSync(S+'/seed-dependency.stdout.private')).data.data.rows;
const originalPolicy=JSON.parse(fs.readFileSync(D+'/canonical-seed-policy-final.private.json'));
const old=JSON.parse(fs.readFileSync(S+'/package-v2/original-values.private.json')).CHANNEL_ACCOUNT_SECRET_KEY;
const dedicated=JSON.parse(fs.readFileSync(D+'/seed-write-key.proposed.private.json')).CAMPAIGN_SEED_SECRET;
const base=JSON.parse(fs.readFileSync(root+'/local-evidence/retention-third-authorized-20261014T105622Z/current-postbank-source.config.private.json'));
const baseHash=hash(JSON.stringify(base)),before=hash(JSON.stringify(rows));
for(const k of ['CAMPAIGN_SEED_WRITE_EPOCH','CAMPAIGN_SEED_SECRET','CAMPAIGN_SEED_HISTORICAL_SECRET','CAMPAIGN_SEED_HISTORICAL_POLICY_FILE','CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256','APP_AUTH_SECRET'])delete process.env[k];
process.env.CHANNEL_ACCOUNT_SECRET_KEY=old;
const {readPrivateCampaignSeedFields:read,buildPrivateCampaignSeedFields:write}=await import(pathToFileURL(overlay+'/dist/campaigns/campaignSeedPrivacy.js'));
const expected=rows.map(r=>read(r.payloadJson,{clientId:r.clientId}));
const entries=rows.flatMap(r=>['recipientsCiphertext','componentsByWaIdCiphertext'].filter(f=>r.payloadJson[f]).map(field=>({clientId:r.clientId,eventId:r.id,field,payloadSha256:hash(JSON.stringify(r.payloadJson)),ciphertextSha256:hash(r.payloadJson[field])})));
assert.deepEqual(entries,originalPolicy.entries); assert.equal(entries.length,147);assert.equal(rows.length,126);
const policy={version:1,keySha256:originalPolicy.keySha256,expiresAt:Date.now()+120000,entries};
const raw=JSON.stringify(policy),file=overlay+'/proof-policy.private.json';
fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});
process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=file;
process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=hash(raw);
process.env.CAMPAIGN_SEED_HISTORICAL_SECRET=old;
process.env.CAMPAIGN_SEED_SECRET=dedicated;
process.env.CAMPAIGN_SEED_WRITE_EPOCH='local-review-20261014';
for(let i=0;i<rows.length;i++){
 const r=rows[i],decoded=read(r.payloadJson,{clientId:r.clientId});assert.deepEqual(decoded,expected[i]);
 const fresh=write({clientId:r.clientId,waIds:decoded.recipients,componentsByWaId:decoded.componentsByWaId});
 assert.deepEqual(read(fresh,{clientId:r.clientId}),decoded);
 assert.throws(()=>read(r.payloadJson,{clientId:'unauthorized-tenant'}),/not_authorized/);
 assert.throws(()=>read({...r.payloadJson,unapprovedModification:true},{clientId:r.clientId}),/not_authorized/);
}
assert.equal(hash(JSON.stringify(rows)),before);assert.equal(hash(JSON.stringify(base)),baseHash);
console.log(JSON.stringify({result:'COMPILED_ACTIVE_BASE_SEED_PROOF_PASS',events:126,fields:147,immutablePayloads:true,policyEntriesUnchanged:true,dedicatedKeyReused:true,currentConfigurationUnchanged:true,negativeTenantAndPayloadCases:252,providerCalls:0,databaseWrites:0,proofPolicy:'LOCAL_TWO_MINUTES_NOT_OPERATIONAL',executionAuthorized:false}));
