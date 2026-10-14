// Local revision of the existing strict planner, never a runtime decoder bypass.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {planRows,digest}=require('../cipher_plan.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function planChannel(snapshot,disposition,seal,oldKey,newKey,decode,encode){
 assert.equal(sha(JSON.stringify(disposition)),seal,'disposition_seal_mismatch');
 assert.equal(disposition.contract,'PRESERVE_OPAQUE_HISTORICAL_NO_ACTIVATION');
 assert.equal(disposition.scope,'LOCAL_REVIEW_ONLY_NOT_PRODUCTION_APPROVAL');
 assert.equal(disposition.sourceSnapshotSha256,snapshot.sourceSha256,'snapshot_provenance_drift');
 assert.equal(disposition.sourceDataSha256,digest(snapshot.data),'snapshot_data_drift');
 assert(disposition.sourceBindingSha256?.match(/^[a-f0-9]{64}$/),'binding_provenance_missing');
 assert.equal(disposition.ownerDeclaredFutureUnused,true);
 const groups=snapshot.data.groups.filter(g=>g.model==='channelAccountSecret');
 assert.equal(groups.length,1);const rows=groups[0].rows,accounts=snapshot.data.accounts;
 const targets=rows.filter(r=>r.id===disposition.secretId);assert.equal(targets.length,1,'disposition_row_not_unique');
 const row=targets[0],account=accounts.filter(a=>a.id===row.channelAccountId);
 assert.equal(account.length,1);assert.equal(account[0].clientId,disposition.clientId,'tenant_mismatch');
 assert.equal(account[0].channel.toLowerCase(),'telegram');assert.equal(row.channelAccountId,disposition.accountId);
 assert.equal(digest(account[0]),disposition.canonicalAccountSha256,'account_provenance_drift');
 assert.equal(digest(row),disposition.canonicalRowSha256,'row_provenance_drift');
 assert.equal(sha(row.secretCiphertext),disposition.ciphertextSha256,'cipher_provenance_drift');
 assert.equal(decode(row.secretCiphertext,oldKey),null,'opaque_row_now_readable_requires_new_review');
 const changes=planRows(rows.filter(r=>r.id!==row.id),'secretCiphertext','CHANNEL_ACCOUNT_SECRET_KEY',oldKey,newKey,decode,encode)
  .map(c=>{const original=rows.find(r=>r.id===c.id),a=accounts.filter(a=>a.id===original.channelAccountId);assert.equal(a.length,1);return {...c,clientId:a[0].clientId,originalRow:original,originalAccount:a[0]};});
 const retained={clientId:disposition.clientId,accountId:row.channelAccountId,secretId:row.id,
  dispositionSeal:seal,classification:'OPAQUE_HISTORICAL_PRESERVED_NOT_RECOVERED',originalRow:row,originalAccount:account[0]};
 return {kind:'LOCAL_CHANNEL_CIPHER_REVIEW_V2',changes,retained:[retained],inventoryCount:rows.length,
  sourceSnapshotSha256:snapshot.sourceSha256,executionAuthorized:false,plaintextSerialized:false};
}
module.exports={planChannel,sha};
