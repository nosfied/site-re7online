// Offline only. Reuses attested crypto functions; no database/provider or application entrypoint.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function planRows(rows,field,key,oldValue,newValue,decrypt,encrypt){
 assert(oldValue&&newValue&&oldValue!==newValue,'distinct_nonempty_keys_required');
 const result=[];
 for(const row of rows){if(!row[field])continue;const plain=decrypt(row[field],oldValue);assert(plain!==null,'existing_ciphertext_unreadable');const next=encrypt(plain,newValue);assert(next&&decrypt(next,newValue)===plain,'new_ciphertext_roundtrip_failed');assert(decrypt(next,oldValue)===null,'old_key_still_reads_new_ciphertext');
 const restored=encrypt(decrypt(next,newValue),oldValue);assert(decrypt(restored,oldValue)===plain,'old_backup_restore_roundtrip_failed');
 result.push({id:row.id,field,expectedCiphertext:row[field],nextCiphertext:next,expectedRowDigest:digest(row)});
 }return result;
}
async function modules(root,attested){
 for(const[f,h]of Object.entries(attested))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(root+'/'+f)).digest('hex'),h,'canonical_module_hash_drift');
 const channel=await import(root+'/channels/channelAccountSecretCrypto.js'),mfa=await import(root+'/auth/mfaService.js'),webhook=await import(root+'/publicApi/publicApiWebhookService.js'),ref=await import(root+'/channels/messengerOutbound.js');
 return {channel:{decode:channel.decryptChannelAccountSecret,encode:channel.encryptChannelAccountSecret},mfa:{decode:mfa.decryptMfaSecret,encode:mfa.encryptMfaSecret},webhook:{decode:webhook.decryptWebhookSigningSecret,encode:webhook.encryptWebhookSigningSecret},externalRefs:{decode:ref.decryptMessengerExternalUserRef,encode:ref.encryptMessengerExternalUserRef}};
}
module.exports={planRows,modules,digest};
if(require.main===module){
 global.fetch=()=>{throw Error('provider_forbidden')};global.setInterval=()=>{throw Error('executor_forbidden')};
 (async()=>{assert.equal(process.versions.node,'20.20.0','node20_exact_required');const[input,oldFile,newFile,root,family,output]=process.argv.slice(2);assert(['channel','mfa','webhook','externalRefs'].includes(family));const v=JSON.parse(fs.readFileSync(input)).data,old=JSON.parse(fs.readFileSync(oldFile)),next=JSON.parse(fs.readFileSync(newFile));const funcs=await modules(require('node:path').resolve(root),v.modules);let groups;
 if(family==='externalRefs')groups=v.data.externalRefs.map(g=>({model:g.model,field:'externalUserRef',key:'META_APP_SECRET',rows:g.rows}));
 else{const model={channel:'channelAccountSecret',mfa:'mfaTotpSecret',webhook:'webhookEndpoint'}[family];groups=v.data.groups.filter(g=>g.model===model);}
 const planned=groups.map(g=>({model:g.model,field:g.field,key:g.key,changes:planRows(g.rows,g.field,g.key,old[g.key],next[g.key],funcs[family].decode,funcs[family].encode)}));
 const plan={mode:'OFFLINE_REENCRYPT_PLAN_ONLY',family,groups:planned,originalSnapshotDigest:digest(v.data),canonicalModules:v.modules,oldKeyEscrowRequired:true,applyAuthorized:false};
 fs.writeFileSync(output,JSON.stringify(plan)+'\n',{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({result:'OFFLINE_CIPHER_PLAN_VERIFIED_NO_APPLY',family,rows:planned.reduce((s,g)=>s+g.changes.length,0),planHash:digest(plan)})+'\n');
 })().catch(e=>{process.stderr.write(JSON.stringify({result:'CIPHER_PLAN_DENIED',errorClass:e.name,diagnostic:e.message.startsWith('existing_ciphertext_unreadable')?'existing_ciphertext_unreadable':'private_diagnostic_required'})+'\n');process.exitCode=1});
}
