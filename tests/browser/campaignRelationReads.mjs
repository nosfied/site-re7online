// Synthetic browser API only. Does not start a backend, connect a DB or submit sends.
// Start the local frontend separately, then:
// node tests/browser/campaignRelationReads.mjs http://127.0.0.1:3082
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('next/dist/compiled/ws');
const local = process.argv[2] || 'http://127.0.0.1:3082';
assert(['127.0.0.1', 'localhost'].includes(new URL(local).hostname), 'local frontend required');
const dir = path.resolve('local-evidence/campaign-schedule-field-audit-20261007/relations-browser');
fs.mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const user = { id: 'fixture-admin', clientId: 'fixture-tenant', name: 'Administrador local', email: 'fixture@example.invalid', role: 'ADMIN', departmentIds: [] };
const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, sid: 'local-synthetic-session', clientId: user.clientId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.simulated';
const session = { baseUrl: '/agent-api', token, user, features: { campaigns: true, crm: true, inbox: true, templates: true, browserPushNotifications: false }, profile: 'business' };
const make = (id, status, scheduledAt = null) => ({ id, clientId: user.clientId, name: `Campanha local ${id}`, templateName: 'modelo_local', status, scheduledAt, totalRecipients: 2, sentCount: 0, blockedCount: 0, createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', progress: { totalRecipients: 2, sentCount: 0, blockedCount: 0, pendingCount: 2 }, messagesMetaStatus: [], metaSummary: { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 } });
const data={A:make('A','scheduled','2030-10-07T15:40:00Z'),L:make('L','scheduled','2030-10-07T15:40:00Z')};
for(let i=0;i<32;i++){const id='D'+String(i).padStart(2,'0');data[id]=make(id,'completed');data[id].selectionMode='DYNAMIC_CRM_FILTER';}
data.L.selectionMode='DYNAMIC_CRM_FILTER';
let epoch=1, relationActive=0, relationMaximum=0, slow=null, failOnce=true;
const counts=()=>report.requests.filter(x=>x.epoch===epoch&&/^\/app\/campaigns\/(D\d+|L)$/.test(x.route)).length;
const template={id:'template-local',name:'modelo_local',status:'approved',category:'UTILITY',language:'pt_BR',content:'Texto sem variavel',variables:[],canUseInCampaign:true};

let held = null, holdId = null, failId = null;
const report = { scope: 'real frontend/Chrome, controlled polling clock, simulated auth/API; no backend/provider', cases: [], requests: [], unexpected: [], exceptions: [] };
const profile = fs.mkdtempSync('/tmp/re7-campaign-browser-');
const log = fs.openSync(path.join(dir,'chrome.log'),'w');
const chrome = spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=9253','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});
let ws, n=0;const pending=new Map();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(e){if(!/context|document|Cannot read|Uncaught/.test(e.message))throw e;}await sleep(60);}throw Error('timeout '+label);}
let send,ev;
try {
 let target;
 await until(async()=>{try{target=(await fetch('http://127.0.0.1:9253/json').then(r=>r.json())).find(x=>x.type==='page');return !!target;}catch{return false;}},'Chrome');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 send=(method,params={})=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params}));});
 const fulfill=(requestId,body,code=200)=>send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 ws.onmessage=async({data:raw})=>{
  const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}return;}
  if(m.method==='Page.javascriptDialogOpening'){report.confirmations??=[];report.confirmations.push(m.params.message);await send('Page.handleJavaScriptDialog',{accept:true});return;}
  if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=='Fetch.requestPaused')return;
  const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;
  try {
   if(u.origin===local&&!p.startsWith('/agent-api'))return await send('Fetch.continueRequest',{requestId});
   if(u.origin!==local){report.unexpected.push({path:p,kind:'external blocked'});return await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
   const route=p.slice('/agent-api'.length);report.requests.push({method:request.method,route,epoch});
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
    if(data[id]) {
      if(/^D\d+|^L$/.test(id)) {
        relationActive++;relationMaximum=Math.max(relationMaximum,relationActive);
        if(id==='D00'&&epoch===1&&!slow){slow={requestId,snapshot:structuredClone(data[id])};return;}
        await sleep(40);relationActive--;
        if(id==='D01'&&failOnce){failOnce=false;return await fulfill(requestId,{error:'fixture_failure'},500);}
      }
      return await fulfill(requestId,{ok:true,campaign:data[id]});
    }
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
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});window.__campaignTimers=new Map();const realInterval=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);let fakeId=900000;window.setInterval=(fn,ms,...args)=>{if(ms===3000){const id=++fakeId;window.__campaignTimers.set(id,()=>fn(...args));return id;}return realInterval(fn,ms,...args);};window.clearInterval=id=>{window.__campaignTimers.delete(id);realClear(id);};const originalNow=Date.now.bind(Date);let offset=0;Date.now=()=>originalNow()+offset;window.__advanceRelationClock=()=>offset+=30000;window.__tickCampaign=async()=>{for(const fn of [...window.__campaignTimers.values()])await fn();};`});
 ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const body=()=>ev('document.body?.innerText||""');
 const dialog=()=>ev(`document.querySelector('[role="dialog"]')?.innerText||document.body.innerText`);
 const tick=()=>ev('window.__tickCampaign()');
 const click=async(text)=>{const ok=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)}||(e.getAttribute('role')==='tab'&&e.textContent.trim().startsWith(${JSON.stringify(text)})));if(!b)return false;b.click();return true;})()`);assert(ok,'button '+text);};
 const select=async(id)=>{await click('Fechar detalhe');assert(await ev(`(()=>{const e=document.querySelector('[aria-label="Ver detalhes da campanha Campanha local ${id}"]');if(!e)return false;e.click();return true;})()`),'row '+id);await until(async()=> (await dialog()).includes('Campanha local '+id),'selected '+id);};
 const check=(name)=>report.cases.push({name,result:'PASS'});
 const setField=async(selector,value)=>assert(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`),selector);
 const chooseOption=async(value)=>{const selector=await ev(`(()=>{const e=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value===${JSON.stringify(value)}));if(!e)return null;e.dataset.testSelect='target';return 'select[data-test-select="target"]';})()`);assert(selector,'option '+value);await setField(selector,value);await ev(`delete document.querySelector('[data-test-select]').dataset.testSelect`);await sleep(80);};
 const openAudience=async()=>{assert(await ev(`(()=>{const e=document.querySelector('[aria-controls="campaign-creation-panel-audience"]');e.click();return true})()`));await click('Filtro dinâmico do CRM');};
 const composerTime='#campaign-creation-panel-audience input[type="datetime-local"]';
 await send('Page.navigate',{url:local+'/app/campaigns'});
 await until(()=>ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local A"]')!==null`),'initial list');await click('Todas');
 await until(()=>slow!==null&&counts()===33&&relationActive===1,'queue drained around slow detail');
 assert.equal(relationMaximum,2);report.initial={requests:counts(),maximum:relationMaximum};check('33 dynamic rows: bounded two reads, slow detail does not block other rows');
 for(let i=0;i<3;i++){await tick();await sleep(120);}assert.equal(counts(),33);report.unchanged={requests:counts(),maximum:relationMaximum};check('Three unchanged updates do not refetch completed rows or immediate failures');
 data.A.name='List update while detail remains slow';data.A.updatedAt='2030-10-07T12:00:00Z';await tick();await until(()=>ev(`document.body.innerText.includes('List update while detail remains slow')`),'independent list update');check('List updates before held detail completes');
 await ev('window.__advanceRelationClock()');await tick();await until(()=>counts()===34&&relationActive===1,'partial retry');check('Partial failure retries after cooldown without blocking list');
 data.L.status='completed';data.L.updatedAt='2030-10-07T13:00:00Z';data.W=make('W','completed');data.W.updatedAt='2030-10-07T14:00:00Z';data.L.executionBatch={id:'batch',chunks:[{campaignId:'W'}]};await tick();await until(()=>counts()===35&&relationActive===1,'snapshot refresh');await sleep(100);assert.equal(await ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local W"]')!==null`),false);check('Changed controller obtains children after snapshot');
 const remembered=structuredClone(data.L);delete data.L.executionBatch;await tick();await sleep(120);assert.equal(counts(),35);assert.equal(await ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local W"]')!==null`),false);check('List omitting relationship preserves proven links');data.L=remembered;
 report.beforeSession={requests:counts(),maximum:relationMaximum};
 epoch=2;relationActive=0;relationMaximum=0;session.user={...session.user,clientId:'other-tenant'};user.clientId='other-tenant';for(const item of Object.values(data))item.clientId='other-tenant';data.L.executionBatch=null;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});`});
 await send('Page.navigate',{url:local+'/app/campaigns'});await until(()=>counts()===33,'new session reads');
 try {await fulfill(slow.requestId,{ok:true,campaign:slow.snapshot});}catch(e){assert.match(e.message,/Invalid InterceptionId/);}slow=null;
 await until(()=>relationActive===0,'new session queue complete');await tick();await sleep(120);assert.equal(counts(),33);assert.equal(relationMaximum,2);assert.equal(await ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local W"]')!==null`),true);report.newSession={requests:counts(),maximum:relationMaximum};check('Session switch clears relations and rejects old detail');
 assert.equal(report.exceptions.length,0);assert.equal(report.unexpected.length,0);assert(report.requests.every(x=>x.method==='GET'));
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
 if(send&&ws?.readyState===1){try{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'last-state.png'),Buffer.from(s.data,'base64'));}catch{}}
 ws?.close();chrome.kill('SIGTERM');fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
