const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const request=JSON.parse(fs.readFileSync(0,'utf8'));const source=JSON.parse(fs.readFileSync(process.argv[2])),target=JSON.parse(fs.readFileSync(process.argv[3]));
 const old=source.apps.find(a=>a.name==='re7-whatsapp-agent'),next=target.apps.find(a=>a.name==='re7-whatsapp-agent');
 const {encryptChannelAccountSecret:enc,decryptChannelAccountSecret:dec}=await import(next.cwd+'/dist/channels/channelAccountSecretCrypto.js');
 if(request.mode==='verify-current-new'){
  let readable=0;
  for(const row of request.current.rows){const value=dec(row.secretCiphertext,next.env.CHANNEL_ACCOUNT_SECRET_KEY);if(row.id===request.opaqueId)assert(value===null,'opaque_now_readable');else{assert(value!==null,'new_cipher_unreadable');readable++;}}
  assert(readable===10);process.stdout.write(JSON.stringify({newEpochReadable:10,opaquePreserved:true}));return;
 }
 if(request.mode==='historical-gate'){
  const raw=fs.readFileSync(next.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE);assert(crypto.createHash('sha256').update(raw).digest('hex')===next.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256);
  const policy=JSON.parse(raw);assert(policy.populationCount===147&&policy.authorization==='SEALED_IMMUTABLE_POPULATION');
  const rows=new Map(request.events.map(e=>[e.id,e]));assert(rows.size===126);
  for(const entry of policy.entries){const e=rows.get(entry.eventId);assert(e&&e.clientId===entry.clientId);assert(crypto.createHash('sha256').update(JSON.stringify(e.payloadJson)).digest('hex')===entry.payloadSha256);assert(crypto.createHash('sha256').update(e.payloadJson[entry.field]).digest('hex')===entry.ciphertextSha256);}
  process.stdout.write(JSON.stringify({historicalEvents:126,historicalFields:147,payloadsUnchanged:true}));return;
 }
 const changes=[];
 for(const row of request.current.rows){
  if(row.id===request.opaqueId)continue;
  const value=dec(row.secretCiphertext,old.env.CHANNEL_ACCOUNT_SECRET_KEY);assert(value!==null,'cipher_unreadable');const ciphertext=enc(value,next.env.CHANNEL_ACCOUNT_SECRET_KEY);
  assert(dec(ciphertext,next.env.CHANNEL_ACCOUNT_SECRET_KEY)===value,'roundtrip_denied');assert(dec(ciphertext,old.env.CHANNEL_ACCOUNT_SECRET_KEY)===null,'old_cipher_not_rejected');
  const account=request.current.accounts.filter(a=>a.id===row.channelAccountId);assert(account.length===1);
  changes.push({id:row.id,clientId:account[0].clientId,originalRow:row,originalAccount:account[0],nextCiphertext:ciphertext});
 }
 const opaque=request.current.rows.find(r=>r.id===request.opaqueId),account=request.current.accounts.find(a=>a.id===opaque.channelAccountId);assert(dec(opaque.secretCiphertext,old.env.CHANNEL_ACCOUNT_SECRET_KEY)===null,'opaque_now_readable');
 process.stdout.write(JSON.stringify({kind:'SEALED_CURRENT_UNDER_LOCK',changes,retained:[{originalRow:opaque,originalAccount:account,clientId:account.clientId,dispositionSeal:request.dispositionSeal}],inventoryCount:request.current.rows.length,approvedScopeHash:request.approvedScopeHash,plaintextSerialized:false}));
})().catch(e=>{process.stderr.write(JSON.stringify({result:'CURRENT_PLAN_DENY',errorClass:e.name})+'\n');process.exitCode=1});
