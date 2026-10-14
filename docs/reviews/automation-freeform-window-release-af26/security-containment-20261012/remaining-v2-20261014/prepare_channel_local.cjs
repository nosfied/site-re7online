const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {planChannel,sha}=require('./channel_plan_v2.cjs');
const [rootArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg);
global.fetch=()=>{throw Error('provider_forbidden')};global.setInterval=()=>{throw Error('scheduler_forbidden')};
process.on('uncaughtException',deny);process.on('unhandledRejection',deny);
function deny(e){try{fs.writeFileSync(out+'/denial.private.json',JSON.stringify({errorClass:e.name,stack:e.stack}),{flag:'wx',mode:0o600});}catch{}console.error(JSON.stringify({result:'LOCAL_CHANNEL_PLAN_DENIED',errorClass:e.name}));process.exit(1);}
(async()=>{
 assert.equal(process.versions.node,'20.20.0');const st=fs.lstatSync(out);assert(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700);
 const S=root+'/local-evidence/security-containment-20261012',D=root+'/local-evidence/security-auth-v3-prepared-20261012T234100Z';
 const sourceFile=process.argv[4]?path.resolve(process.argv[4]):S+'/crypto-snapshot.private.json';
 const raw=fs.readFileSync(sourceFile),snapshot=JSON.parse(raw);snapshot.sourceSha256=sha(raw);
 const pendingRaw=fs.readFileSync(D+'/telegram-disposition-pending.private.json'),pending=JSON.parse(pendingRaw);
 const group=snapshot.data.groups.find(g=>g.model==='channelAccountSecret'),rows=group.rows.filter(r=>r.channelAccountId===pending.originalAccountReference);assert.equal(rows.length,1);
 const row=rows[0],accounts=snapshot.data.accounts.filter(a=>a.id===row.channelAccountId);assert.equal(accounts.length,1);assert.equal(accounts[0].clientId,pending.tenantReference);assert(pending.ownerDeclaredFutureUnused);
 // The Python original digest has already been verified by the canonical private
 // disposition verifier. Retain it separately; JS row digest binds this plan.
 const verification=require('node:child_process').spawnSync('python3',[path.resolve(__dirname,'../remaining-local-20261014/verify_telegram_disposition.py'),sourceFile,D+'/telegram-disposition-pending.private.json'],{encoding:'utf8'});assert.equal(verification.status,0,'original_disposition_provenance_denied');
 const disposition={contract:'PRESERVE_OPAQUE_HISTORICAL_NO_ACTIVATION',scope:'LOCAL_REVIEW_ONLY_NOT_PRODUCTION_APPROVAL',clientId:accounts[0].clientId,accountId:row.channelAccountId,secretId:row.id,canonicalAccountSha256:sha(JSON.stringify(accounts[0])),canonicalRowSha256:sha(JSON.stringify(row)),originalPythonRowSha256:pending.preserveOriginalRowSha256,ciphertextSha256:sha(row.secretCiphertext),sourceSnapshotSha256:snapshot.sourceSha256,sourceDataSha256:sha(JSON.stringify(snapshot.data)),sourceBindingSha256:sha(pendingRaw),ownerDeclaredFutureUnused:true};
 const modulePath=root+'/local-evidence/dynamic-integrated-20261012/post-reboot/api-exact-composition/apps/whatsapp-agent/dist/channels/channelAccountSecretCrypto.js';
 assert.equal(sha(fs.readFileSync(modulePath)),snapshot.modules['channels/channelAccountSecretCrypto.js'],'canonical_crypto_module_drift');
 const {decryptChannelAccountSecret:decode,encryptChannelAccountSecret:encode}=await import(modulePath);
 const old=JSON.parse(fs.readFileSync(S+'/package-v2/original-values.private.json')).CHANNEL_ACCOUNT_SECRET_KEY,next=JSON.parse(fs.readFileSync(S+'/package-v2/new-values.private.json')).CHANNEL_ACCOUNT_SECRET_KEY;
 const seal=sha(JSON.stringify(disposition)),plan=planChannel(snapshot,disposition,seal,old,next,decode,encode);
 assert.equal(plan.changes.length,10);assert.equal(plan.retained.length,1);assert.equal(plan.inventoryCount,11);
 if(snapshot.data.seeds){
  const historical=JSON.parse(fs.readFileSync(D+'/canonical-seed-policy-final.private.json'));const byId=new Map(snapshot.data.seeds.map(r=>[r.id,r]));
  assert.equal(byId.size,126);
  for(const e of historical.entries){const r=byId.get(e.eventId);assert(r&&r.clientId===e.clientId);assert.equal(sha(JSON.stringify(r.payloadJson)),e.payloadSha256,'original_seed_payload_drift');assert.equal(sha(r.payloadJson[e.field]),e.ciphertextSha256,'original_seed_ciphertext_drift');}
 }
 for(const [name,v] of [['disposition.private.json',disposition],['channel-plan.private.json',plan]])fs.writeFileSync(out+'/'+name,JSON.stringify(v)+'\n',{flag:'wx',mode:0o600});
 const proof={result:'LOCAL_CHANNEL_PLAN_WITH_OPAQUE_DISPOSITION_PASS_NOT_APPLIED',convertedLegible:10,retainedOpaque:1,inventoryCount:11,dispositionSeal:seal,planHash:sha(JSON.stringify(plan)),originalCipherModuleSha256:sha(fs.readFileSync(modulePath)),providerCalls:0,sqlWrites:0,plaintextSerialized:false,productionApproved:false};
 fs.writeFileSync(out+'/proof.sanitized.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
})();
