'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const codec = require('./seed_epoch_codec.cjs');
const oldKey = 'synthetic-old-key-'.repeat(3), newKey = 'synthetic-new-key-'.repeat(3);
const context = {clientId:'tenant-a',eventId:'event-a',field:'recipientsCiphertext'};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// Exact v1 wire format of campaignSeedPrivacy; no network/database/application startup.
function legacy(value) {
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(oldKey).digest(),iv);
 const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
 return 'v1:'+ [iv,c.getAuthTag(),bytes].map(b=>b.toString('base64')).join(':');
}
const ciphertext=legacy(['synthetic-recipient']);
const authorization={version:1,expiresAt:200,keySha256:sha(oldKey),entries:[{...context,ciphertextSha256:sha(ciphertext)}]};
const input={ciphertext,context,authorization,historicalSecret:oldKey,now:100};
test('attested historical field readable without payload/hash mutation',()=>{
 const original=JSON.stringify(input),digest=sha(original);assert.deepEqual(codec.readHistorical(input),['synthetic-recipient']);assert.equal(sha(JSON.stringify(input)),digest);
});
test('tenant/event/field/unknown ciphertext and duplicate authorization deny',()=>{
 for(const context2 of [{...context,clientId:'tenant-b'},{...context,eventId:'event-b'},{...context,field:'componentsByWaIdCiphertext'}])assert.throws(()=>codec.readHistorical({...input,context:context2}),/not_uniquely_authorized/);
 assert.throws(()=>codec.readHistorical({...input,ciphertext:legacy(['other'])}),/not_uniquely_authorized/);
 assert.throws(()=>codec.readHistorical({...input,authorization:{...authorization,entries:[...authorization.entries,...authorization.entries]}}),/not_uniquely_authorized/);
});
test('expiry/key drift/tamper/structurally invalid ciphertext deny',()=>{
 assert.throws(()=>codec.readHistorical({...input,now:200}),/expired/);
 assert.throws(()=>codec.readHistorical({...input,historicalSecret:newKey}),/key_drift/);
 const bad=ciphertext.slice(0,-4)+'AAAA';
 assert.throws(()=>codec.readHistorical({...input,ciphertext:bad,authorization:{...authorization,entries:[{...context,ciphertextSha256:sha(bad)}]}}),/authentication_denied/);
 const malformed='v1:AAAA:AAAA:AAAA';assert.throws(()=>codec.readHistorical({...input,ciphertext:malformed,authorization:{...authorization,entries:[{...context,ciphertextSha256:sha(malformed)}]}}),/structure/);
});
test('dedicated writer/new epoch never falls back to legacy key or environment',()=>{
 const record=codec.writeDedicated({value:['new'],context,dedicatedSecret:newKey,epoch:'epoch2'});
 assert.equal(record.ciphertext.startsWith('v2:'),true);
 assert.deepEqual(codec.readDedicated({record,context,dedicatedSecret:newKey,epoch:'epoch2'}),['new']);
 for(const options of [{dedicatedSecret:oldKey},{context:{...context,clientId:'tenant-b'}},{context:{...context,field:'componentsByWaIdCiphertext'}}])assert.throws(()=>codec.readDedicated({record,context,dedicatedSecret:newKey,epoch:'epoch2',...options}),/authentication_denied/);
 assert.throws(()=>codec.readDedicated({record,context,dedicatedSecret:newKey,epoch:'other'}),/epoch_drift/);
 assert.throws(()=>codec.writeDedicated({value:[],context,epoch:'epoch2'}),/key_required/);
});
