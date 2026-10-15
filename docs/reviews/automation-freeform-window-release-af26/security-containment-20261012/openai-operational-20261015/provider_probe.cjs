// Future explicit functional validation. No routes, tenants, message store or sender.
'use strict';
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const [root,phase]=process.argv.slice(2);
 if(!['before','after'].includes(phase))throw Error('phase');
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'window/target.profile.private.json'))).apps.find(a=>a.name==='re7-whatsapp-agent');
 // Same application environment and original parameters, no changed model or scope.
 for(const [k,v]of Object.entries(cfg.env))process.env[k]=String(v);
 delete process.env.OPENAI_BASE_URL;
 const {OpenAIBrain}=await import(pathToFileURL(path.join(cfg.cwd,'dist/agent/openai.brain.js')));
 const {transcribeWithOpenAi}=await import(pathToFileURL(path.join(cfg.cwd,'dist/audio/audioTranscriptionProcess.js')));
 const reply=await new OpenAIBrain().generateReply({lastMessages:[],inboundText:'Teste sintetico local de conectividade. Responda VALIDACAO_OPENAI_OK.',businessContext:'Validacao tecnica isolada, sem cliente ou envio.',stateSummary:{},nowIso:new Date().toISOString()});
 if(reply.source!=='ai'||!reply.text?.trim()||reply.model!=='gpt-4.1-mini'||!reply.usage)throw Error('responses_functional_denied');
 const audio=await transcribeWithOpenAi({filePath:path.join(root,'validation-speech.wav'),mimeType:'audio/wav',apiKey:cfg.env.OPENAI_API_KEY});
 if(!audio.ok||!audio.transcript?.trim()||!audio.transcript.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('validacao'))throw Error('transcription_functional_denied');
 process.stdout.write(JSON.stringify({result:'OPENAI_FUNCTIONAL_ENDPOINTS_PASS',phase,responses:{model:reply.model,nonEmpty:true,usageObserved:true},audio:{model:'gpt-4o-mini-transcribe',expectedSpeechRecognized:true},customerDataUsed:false,messageSent:false}));
})().catch(()=>{process.stderr.write('OPENAI_FUNCTIONAL_PROBE_DENY\n');process.exitCode=1});
