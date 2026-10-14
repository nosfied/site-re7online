// Local-only crypto adapter. Request/response go through private pipes; no network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const request=JSON.parse(fs.readFileSync(0,'utf8'));
 const root=path.resolve(process.argv[2]);
 const {encryptChannelAccountSecret:enc,decryptChannelAccountSecret:dec}=await import(root+'/local-evidence/security-v3-runtime-20261014/candidate/dist/channels/channelAccountSecretCrypto.js');
 if(request.mode==='local-writer'){
  const value=dec(request.row.secretCiphertext,request.oldKey);if(value===null)throw Error('unreadable');
  const state=JSON.parse(value);if(!state||typeof state!=='object'||Array.isArray(state))throw Error('not_web_state_object');state.__isolatedWriterMarker='latest-before-lock';const serialized=JSON.stringify(state);
  process.stdout.write(JSON.stringify({ciphertext:enc(serialized,request.oldKey),hash:crypto.createHash('sha256').update(serialized).digest('hex')}));return;
 }
 if(request.mode==='verify-latest'){
  const value=dec(request.row.secretCiphertext,request.newKey);if(value===null)throw Error('return_not_readable');
  if(JSON.parse(value).__isolatedWriterMarker!=='latest-before-lock')throw Error('latest_state_lost');
  process.stdout.write(JSON.stringify({latestStateReadable:true}));return;
 }
 const changes=[];
 for(const row of request.current.rows){
  if(row.id===request.opaqueId)continue;
  const value=dec(row.secretCiphertext,request.oldKey);
  if(value===null)throw Error('unapproved_invalid_cipher');
  const originalAccount=request.current.accounts.find(a=>a.id===row.channelAccountId);
  changes.push({id:row.id,clientId:originalAccount.clientId,originalRow:row,originalAccount,nextCiphertext:enc(value,request.newKey)});
 }
 const opaque=request.current.rows.find(r=>r.id===request.opaqueId),account=request.current.accounts.find(a=>a.id===opaque.channelAccountId);
 if(dec(opaque.secretCiphertext,request.oldKey)!==null)throw Error('opaque_now_readable');
 process.stdout.write(JSON.stringify({kind:'LOCAL_LOCKED_RENEWAL_EXPERIMENT',changes,retained:[{originalRow:opaque,originalAccount:account,clientId:account.clientId,dispositionSeal:request.seal}],inventoryCount:request.current.rows.length,executionAuthorized:false,plaintextSerialized:false}));
})().catch(e=>{process.stderr.write(JSON.stringify({result:'DENY',errorClass:e.name}));process.exitCode=1});
