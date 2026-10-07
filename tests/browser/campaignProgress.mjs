// Synthetic browser API only. Does not start a backend, connect a DB or submit sends.
// Start the local frontend separately, then:
// node tests/browser/campaignProgress.mjs http://127.0.0.1:3078
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('next/dist/compiled/ws');
const local = process.argv[2] || 'http://127.0.0.1:3078';
assert(['127.0.0.1', 'localhost'].includes(new URL(local).hostname), 'local frontend required');
const dir = path.resolve('local-evidence/campaign-visual-20261006/browser');
fs.mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const user = { id: 'fixture-admin', clientId: 'fixture-tenant', name: 'Administrador local', email: 'fixture@example.invalid', role: 'ADMIN', departmentIds: [] };
const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, sid: 'local-synthetic-session', clientId: user.clientId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.simulated';
const session = { baseUrl: '/agent-api', token, user, features: { campaigns: true, crm: true, inbox: true, templates: true, browserPushNotifications: false }, profile: 'business' };
const make = (id, status, scheduledAt = null) => ({ id, clientId: user.clientId, name: `Campanha local ${id}`, templateName: 'modelo_local', status, scheduledAt, totalRecipients: 2, sentCount: 0, blockedCount: 0, createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', progress: { totalRecipients: 2, sentCount: 0, blockedCount: 0, pendingCount: 2 }, messagesMetaStatus: [], metaSummary: { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 } });
const data = { A: make('A','scheduled'), B: make('B','draft'), C: make('C','failed'), D: make('D','completed') };
data.C.metaSummary.totalFailed=2;
data.D.sentCount=1;data.D.blockedCount=1;data.D.metaSummary.totalDelivered=1;data.D.metaSummary.totalFailed=1;
let held = null, holdId = null, failId = null;
const report = { scope: 'real frontend/Chrome, controlled polling clock, simulated auth/API; no backend/provider', cases: [], requests: [], unexpected: [], exceptions: [] };
const profile = fs.mkdtempSync('/tmp/re7-campaign-browser-');
const log = fs.openSync(path.join(dir,'chrome.log'),'w');
const chrome = spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=9248','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});
let ws, n=0;const pending=new Map();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(e){if(!/context|document|Cannot read|Uncaught/.test(e.message))throw e;}await sleep(60);}throw Error('timeout '+label);}
let send,ev;
try {
 let target;
 await until(async()=>{try{target=(await fetch('http://127.0.0.1:9248/json').then(r=>r.json())).find(x=>x.type==='page');return !!target;}catch{return false;}},'Chrome');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 send=(method,params={})=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params}));});
 const fulfill=(requestId,body,code=200)=>send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 ws.onmessage=async({data:raw})=>{
  const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}return;}
  if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=='Fetch.requestPaused')return;
  const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;
  try {
   if(u.origin===local&&!p.startsWith('/agent-api'))return await send('Fetch.continueRequest',{requestId});
   if(u.origin!==local){report.unexpected.push({path:p,kind:'external blocked'});return await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
   const route=p.slice('/agent-api'.length);report.requests.push({method:request.method,route});
   if(['/app/departments','/app/users','/app/conversations'].includes(route)) return await fulfill(requestId,{ok:true,items:[],departments:[],users:[],conversations:[],count:0});
   if(route==='/auth/me')return await fulfill(requestId,{ok:true,...session});
   if(route==='/app/tenant')return await fulfill(requestId,{ok:true,tenant:{id:user.clientId,name:'Tenant local',features:session.features,profile:session.profile}});
   if(route==='/app/campaigns')return await fulfill(requestId,{ok:true,count:4,items:Object.values(data)});
   if(route.startsWith('/app/campaigns/')&&route!=='/app/campaigns/return-destinations'){
    const id=route.split('/').at(-1);
    if(holdId===id){assert(!held,'one held request');held={requestId,id};holdId=null;return;}
    if(failId===id){failId=null;return await fulfill(requestId,{error:'server_error'},500);}
    if(data[id])return await fulfill(requestId,{ok:true,campaign:data[id]});
   }
   if(route==='/app/campaigns/return-destinations')return await fulfill(requestId,{ok:true,departments:[],flows:[]});
   if(route==='/app/crm/statuses')return await fulfill(requestId,{ok:true,settings:{crmBusinessStatuses:[]}});
   if(route==='/app/templates')return await fulfill(requestId,{ok:true,items:[],count:0});
   if(route.startsWith('/app/agent-availability'))return await fulfill(requestId,{ok:true,availability:{available:false,status:'offline',userId:user.id},heartbeatIntervalMs:60000});
   if(route.startsWith('/app/push'))return await fulfill(requestId,{ok:true,configured:false,subscribed:false});
   report.unexpected.push({route,method:request.method});await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
  }catch(e){report.unexpected.push({path:p,error:e.message});}
 };
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1100,deviceScaleFactor:1,mobile:false});await send('Emulation.setTimezoneOverride',{timezoneId:'America/Fortaleza'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});window.__campaignTimers=new Map();const realInterval=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);let fakeId=900000;window.setInterval=(fn,ms,...args)=>{if(ms===3000){const id=++fakeId;window.__campaignTimers.set(id,()=>fn(...args));return id;}return realInterval(fn,ms,...args);};window.clearInterval=id=>{window.__campaignTimers.delete(id);realClear(id);};window.__tickCampaign=async()=>{for(const fn of [...window.__campaignTimers.values()])await fn();};`});
 ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const body=()=>ev('document.body?.innerText||""');
 const dialog=()=>ev(`document.querySelector('[role="dialog"]')?.innerText||document.body.innerText`);
 const tick=()=>ev('window.__tickCampaign()');
 const click=async(text)=>{const ok=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`);assert(ok,'button '+text);};
 const select=async(id)=>{await click('Fechar detalhe');assert(await ev(`(()=>{const e=document.querySelector('[aria-label="Ver detalhes da campanha Campanha local ${id}"]');if(!e)return false;e.click();return true;})()`),'row '+id);await until(async()=> (await dialog()).includes('Campanha local '+id),'selected '+id);};
 const check=(name)=>report.cases.push({name,result:'PASS'});
 await send('Page.navigate',{url:local+'/app/campaigns?campaignId=A'});
 await until(async()=> (await body()).toLowerCase().includes('envio imediato na fila'),'initial immediate presentation');
 await until(()=>ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local B"]')!==null`),'initial tenant list loaded without polling');
 assert(!(await dialog()).includes('Sem horário definido'));assert((await dialog()).includes('Na fila de envio'));
 assert.equal(await ev(`document.querySelector('[data-nextjs-dialog]')!==null`),false);
 const browser=process.env.AGENT_BROWSER_BIN||'/home/deifson-oliveira/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-linux-x64';
 const snap=spawnSync(browser,['--cdp','9248','--session','campaign-progress-local','snapshot','-i'],{encoding:'utf8',timeout:20000});fs.writeFileSync(path.join(dir,'agent-browser.snapshot.txt'),snap.stdout||'');assert.equal(snap.status,0,'agent-browser verification');
 check('Immediate queued labels, sending tab and no false schedule; agent-browser gut-check');
 data.A.status='sending';await tick();await until(async()=> (await dialog()).includes('Enviando...'),'processing');check('Queued to sending automatically');
 data.A.status='completed';data.A.sentCount=2;data.A.metaSummary.totalDelivered=2;await tick();await until(async()=> (await dialog()).includes('Entregue para 2/2'),'completed');
 await until(()=>ev('window.__campaignTimers.size===0'),'terminal stops timer');check('Completed result arrives and polling stops');
 data.B.status='scheduled';data.B.scheduledAt='2026-11-07T14:00:00Z';await select('B');await until(async()=> (await dialog()).toLowerCase().includes('envio agendado'),'future');assert((await dialog()).includes('07/11/2026'));assert(!(await dialog()).toLowerCase().includes('envio imediato na fila'));check('Future schedule shows actual date/time');
 data.B.status='sending';await tick();await until(async()=> (await dialog()).includes('Enviando...'),'scheduled start');check('Future scheduled campaign transitions to processing');
 data.B.status='failed';data.B.metaSummary.totalFailed=2;await tick();await until(async()=> (await dialog()).includes('Falha na campanha'),'failed');check('Failed terminal result is observed');
 await select('D');await until(async()=> (await dialog()).includes('Entrega parcial'),'partial');check('Existing partial result projection preserved');
 await select('A');holdId='A';const refresh=click('Atualizar detalhe');await refresh;await until(async()=>!!held,'held A');await select('B');
 await fulfill(held.requestId,{ok:true,campaign:{...data.A,name:'STALE A must never render'}});held=null;await sleep(150);assert(!(await dialog()).includes('STALE A'));assert((await dialog()).includes('Campanha local B'));check('Late detail A cannot replace selected B');
 await select('A');failId='A';await click('Atualizar detalhe');await until(async()=> (await body()).includes('atualizar detalhe') || (await body()).includes('Atualização não concluída'),'read failure');
 assert((await dialog()).includes('Campanha local A'));check('Read error preserves current campaign; no execution action');
 holdId='A';await click('Atualizar detalhe');await until(async()=>!!held,'held unmount');await send('Page.navigate',{url:local+'/app/login'});await until(()=>ev(`location.pathname==='/app/login'`),'unmounted');
 try{await fulfill(held.requestId,{ok:true,campaign:{...data.A,name:'STALE after unmount'}});}catch(e){assert.match(e.message,/Invalid InterceptionId/);report.unmountRequestCancelled=true;}held=null;await sleep(150);assert(!(await body()).includes('STALE after unmount'));check('Unmount discards pending detail');
 assert.equal(report.unexpected.length,0);assert.equal(report.exceptions.length,0);assert.equal(report.requests.filter(x=>x.method!=='GET'&&!x.route.startsWith('/app/agent-availability')).length,0,'no mutations/sends');
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
 if(send&&ws?.readyState===1){try{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'last-state.png'),Buffer.from(s.data,'base64'));}catch{}}
 ws?.close();chrome.kill('SIGTERM');fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
