// Synthetic browser API only. Does not start a backend, connect a DB or submit sends.
// Start the local frontend separately, then:
// node tests/browser/frontendAssetLayoutAudit.mjs http://127.0.0.1:3086
import fs from 'node:fs';
import {inspectFrontendAssets} from './frontendAssetContract.mjs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('next/dist/compiled/ws');
const local = process.argv[2] || 'http://127.0.0.1:3082';
assert(['127.0.0.1', 'localhost'].includes(new URL(local).hostname), 'local frontend required');
const dir = path.resolve(process.env.ASSET_AUDIT_DIR || 'local-evidence/frontend-layout-audit-20261007/browser');
fs.mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const user = { id: 'fixture-admin', clientId: 'fixture-tenant', name: 'Administrador local', email: 'fixture@example.invalid', role: 'ADMIN', departmentIds: [] };
const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, sid: 'local-synthetic-session', clientId: user.clientId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.simulated';
const session = { baseUrl: '/agent-api', token, user, features: { campaigns: true, crm: true, inbox: true, templates: true, browserPushNotifications: false }, profile: 'business' };
const make = (id, status, scheduledAt = null) => ({ id, clientId: user.clientId, name: `Campanha local ${id}`, templateName: 'modelo_local', status, scheduledAt, totalRecipients: 2, sentCount: 0, blockedCount: 0, createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', progress: { totalRecipients: 2, sentCount: 0, blockedCount: 0, pendingCount: 2 }, messagesMetaStatus: [], metaSummary: { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 } });
const data = { A:make('A','scheduled','2030-10-07T15:40:00Z'), B:make('B','draft'), C:make('C','draft'), E:make('E','completed'), K:make('K','completed'), G:make('G','completed'), M:make('M','completed'), N:make('N','completed'), I:make('I','completed'), J:make('J','completed') };
const batch = (id, children) => ({id,name:'Conjunto '+id,sourceMode:'DYNAMIC_CRM_FILTER',status:'completed',chunkCount:children.length,totalRecipients:children.length,sentCount:children.length,blockedCount:0,progress:{totalRecipients:children.length,sentCount:children.length,blockedCount:0,pendingCount:0,completedChunks:children.length,runningChunks:0,queuedChunks:0,failedChunks:0},chunks:children.map((id,i)=>({campaignId:id,name:data[id].name,status:'completed',chunkIndex:i+1,recipientCount:1,totalRecipients:1,sentCount:1,blockedCount:0,queueStatus:'completed',queuePosition:null,startedAt:null,finishedAt:null,failureReason:null}))});
data.E.selectionMode='DYNAMIC_CRM_FILTER';data.G.selectionMode='DYNAMIC_CRM_FILTER';data.E.executionBatch=batch('single',['K']);data.K.executionBatch=data.E.executionBatch;data.G.executionBatch=batch('multi',['M','N']);data.M.executionBatch=data.G.executionBatch;data.N.executionBatch=data.G.executionBatch;
data.I.name=data.J.name='Campanhas independentes iguais';
for (const item of Object.values(data)) if(item.status==='completed') { item.sentCount=2;item.progress.sentCount=2;item.progress.pendingCount=0;item.metaSummary.totalSent=2; }
const template={id:'template-local',name:'modelo_local',status:'approved',category:'UTILITY',language:'pt_BR',content:'Texto sem variavel',variables:[],canUseInCampaign:true};

let held = null, holdId = null, failId = null;
let currentLabel;let responses=[];
const report = { scope: 'real frontend/Chrome, controlled polling clock, simulated auth/API; no backend/provider', cases: [], requests: [], unexpected: [], exceptions: [] };
const profile = fs.mkdtempSync('/tmp/re7-campaign-browser-');
const log = fs.openSync(path.join(dir,'chrome.log'),'w');
const chrome = spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=9252','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});
let ws, n=0;const pending=new Map();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(e){if(!/context|document|Cannot read|Uncaught/.test(e.message))throw e;}await sleep(60);}throw Error('timeout '+label);}
let send,ev;
try {
 let target;
 await until(async()=>{try{target=(await fetch('http://127.0.0.1:9252/json').then(r=>r.json())).find(x=>x.type==='page');return !!target;}catch{return false;}},'Chrome');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 send=(method,params={})=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params}));});
 const fulfill=(requestId,body,code=200)=>send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 ws.onmessage=async({data:raw})=>{
  const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}return;}
  if(m.method==='Network.responseReceived'){responses.push({requestId:m.params.requestId,type:m.params.type,url:m.params.response.url,status:m.params.response.status,mime:m.params.response.mimeType});return;}
  if(m.method==='Runtime.exceptionThrown'){report.exceptions.push({version:currentLabel,text:m.params.exceptionDetails.text});return;}
  if(m.method==='Runtime.consoleAPICalled'){report.console??=[];report.console.push({version:currentLabel,type:m.params.type,text:m.params.args.map(x=>x.value||x.description).join(' ')});return;}
  if(m.method==='Network.loadingFailed'){report.networkFailures??=[];report.networkFailures.push({version:currentLabel,reason:m.params.errorText});return;}
  if(m.method==='Page.javascriptDialogOpening'){report.confirmations??=[];report.confirmations.push(m.params.message);await send('Page.handleJavaScriptDialog',{accept:true});return;}
  if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=='Fetch.requestPaused')return;
  const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;
  try {
   if(u.origin===local&&!p.startsWith('/agent-api'))return await send('Fetch.continueRequest',{requestId});
   if(u.origin!==local){report.unexpected.push({path:p,kind:'external blocked'});return await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
   const route=p.slice('/agent-api'.length);report.requests.push({method:request.method,route});
   if(route==='/auth/me')return await fulfill(requestId,{ok:true,...session});
   if(route==='/app/tenant')return await fulfill(requestId,{ok:true,tenant:{id:user.clientId,name:'Tenant local',features:session.features,profile:session.profile}});
   if(route==='/app/campaigns'&&request.method==='GET')return await fulfill(requestId,{ok:true,count:Object.keys(data).length,items:Object.values(data).map(({executionBatch,...item})=>item)});
   if(route.startsWith('/app/campaigns/')&&route!=='/app/campaigns/return-destinations'){
    if(route.endsWith('/schedule')&&request.method==='POST'){
     const id=route.split('/').at(-2);const value=JSON.parse(request.postData);report.payloads??=[];report.payloads.push({route,...value});data[id].scheduledAt=value.scheduledAt;data[id].status='scheduled';return await fulfill(requestId,{ok:true,campaign:data[id],schedule:{summary:{accepted:2}}});
    }
    if(route==='/app/campaigns/drafts'&&request.method==='POST'){
     const value=JSON.parse(request.postData);report.payloads??=[];report.payloads.push({route,...value});data.R={...make('R','draft'),selectionMode:'DYNAMIC_CRM_FILTER'};return await fulfill(requestId,{ok:true,campaign:{...data.R,campaignId:'R'},draft:{summary:{accepted:0},recipients:[]}});
    }
    if(route==='/app/campaigns/audience-preview')return await fulfill(requestId,{ok:true,items:[],summary:{total:0,eligible:0,blocked:0,analyzed:0,truncated:false,blockedByReason:[]},filters:{status:'FOLLOW_UP'},pagination:{page:1,limit:25,total:0,totalPages:0,hasNextPage:false,hasPreviousPage:false}});
    const id=route.split('/').at(-1);
    if(holdId===id){assert(!held,'one held request');held={requestId,id};holdId=null;return;}
    if(failId===id){failId=null;return await fulfill(requestId,{error:'server_error'},500);}
    if(data[id])return await fulfill(requestId,{ok:true,campaign:data[id],schedule:{summary:{accepted:2}}});
   }
   if(route==='/app/campaigns/return-destinations')return await fulfill(requestId,{ok:true,departments:[{id:'dept',name:'Atendimento Geral',operationalReady:true}],flows:[]});
   if(route==='/app/crm/statuses')return await fulfill(requestId,{ok:true,settings:{crmBusinessStatuses:[{id:'FOLLOW_UP',label:'Follow-up',isActive:true,campaignEligible:true}]}});
   if(route==='/app/templates')return await fulfill(requestId,{ok:true,items:[template],count:1});
   if(route.startsWith('/app/agent-availability'))return await fulfill(requestId,{ok:true,availability:{available:false,status:'offline',userId:user.id},heartbeatIntervalMs:60000});
   if(route.startsWith('/app/push'))return await fulfill(requestId,{ok:true,configured:false,subscribed:false});
   report.unexpected.push({route,method:request.method});await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
  }catch(e){report.unexpected.push({path:p,error:e.message});}
 };
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1100,deviceScaleFactor:1,mobile:false});await send('Emulation.setTimezoneOverride',{timezoneId:'America/Fortaleza'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});window.__campaignTimers=new Map();const realInterval=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);let fakeId=900000;window.setInterval=(fn,ms,...args)=>{if(ms===3000){const id=++fakeId;window.__campaignTimers.set(id,()=>fn(...args));return id;}return realInterval(fn,ms,...args);};window.clearInterval=id=>{window.__campaignTimers.delete(id);realClear(id);};window.__tickCampaign=async()=>{for(const fn of [...window.__campaignTimers.values()])await fn();};`});
 ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Network.setCacheDisabled',{cacheDisabled:true});
 for(const label of (process.env.AUDIT_VERSIONS||'9f,fa60').split(',')) {
  await fetch(local+'/__lab/version/'+label);currentLabel=label;responses=[];
  await send('Page.navigate',{url:local+'/app/campaigns'});
  await until(()=>ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local B"]')!==null`),'loaded '+label);
  await sleep(250);
  const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,label+'.png'),Buffer.from(image.data,'base64'));
  const result=await inspectFrontendAssets({ev,send,responses});report.cases.push({version:label,...result});
 }
 assert.equal(report.cases[0].result,'PASS','9f baseline must pass');
 if(process.env.AUDIT_EXPECT_FAIL==='1')assert.equal(report.cases[1].result,'FAIL','exact rejected tar must fail asset contract');
 else assert(report.cases.every(x=>x.result==='PASS'),'new candidate assets must pass');
 assert.equal(report.unexpected.length,0,'no external/backend requests');
} finally {
 ws?.close();chrome.kill('SIGTERM');fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
