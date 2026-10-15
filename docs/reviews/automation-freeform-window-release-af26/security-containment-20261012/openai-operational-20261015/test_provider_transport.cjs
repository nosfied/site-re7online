// Exact application modules and probe. Only filesystem location and transports substituted.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.env.OPENAI_TEST_PACKAGE,app=process.env.OPENAI_TEST_APP;
const inventory=JSON.parse(fs.readFileSync(path.join(root,'runtime-inventory.private.json')));
for(const n of ['dist/agent/openai.brain.js','dist/audio/audioTranscriptionProcess.js']){
 const expected=inventory.files.find(e=>e.path===n)?.sha256;
 if(crypto.createHash('sha256').update(fs.readFileSync(path.join(app,n))).digest('hex')!==expected)throw Error('compiled_application_source_drift');
}
const original=fs.readFileSync;
fs.readFileSync=function(file,...args){
 if(String(file)===path.join(root,'window/target.profile.private.json')){
  const cfg=JSON.parse(original(file,'utf8'));const a=cfg.apps.find(a=>a.name==='re7-whatsapp-agent');a.cwd=app;a.env.OPENAI_API_KEY='synthetic-local-key-never-real';
  return JSON.stringify(cfg);
 }
 return original(file,...args);
};
for(const n of ['node:net','node:tls']){
 const m=require(n);for(const k of ['connect','createConnection'])if(m[k])m[k]=()=>{throw Error('network_forbidden_in_local_proof')};
 if(m.Socket)m.Socket.prototype.connect=()=>{throw Error('network_forbidden_in_local_proof')};
}
for(const n of ['node:http','node:https']){const m=require(n);m.request=m.get=()=>{throw Error('network_forbidden_in_local_proof')};}
const calls=[];
globalThis.fetch=async function(input,init){
 const u=new URL(typeof input==='string'?input:input.url);const body=init?.body??input.body;
 if(u.origin!=='https://api.openai.com')throw Error('unexpected_endpoint');
 if(process.env.OPENAI_TEST_FAIL==='responses'&&u.pathname==='/v1/responses')return new Response(JSON.stringify({error:{message:'synthetic denied',type:'authentication_error'}}),{status:401,headers:{'content-type':'application/json'}});
 if(u.pathname==='/v1/responses'){
  const v=typeof body==='string'?JSON.parse(body):null;if(!v||v.model!=='gpt-4.1-mini')throw Error('responses_model_drift');calls.push('responses');
  return new Response(JSON.stringify({id:'resp_synthetic',object:'response',status:'completed',model:'gpt-4.1-mini',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'VALIDACAO_OPENAI_OK',annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(u.pathname==='/v1/audio/transcriptions'){
  if(body.get('model')!=='gpt-4o-mini-transcribe'||body.get('language')!=='pt'||!body.get('file'))throw Error('audio_request_drift');calls.push('audio');
  return new Response(JSON.stringify({text:process.env.OPENAI_TEST_FAIL==='audio'?'':'Teste local de validacao de audio.'}),{status:200,headers:{'content-type':'application/json'}});
 }
 throw Error('unexpected_endpoint');
};
process.on('exit',()=>{if(!process.env.OPENAI_TEST_FAIL&&calls.join(',')!=='responses,audio')process.exitCode=1});
