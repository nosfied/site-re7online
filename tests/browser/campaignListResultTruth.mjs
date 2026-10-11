// Synthetic browser API only. Does not start a backend, connect a DB or submit sends.
// Start the local frontend separately, then:
// Node 20: node tests/browser/campaignListResultTruth.mjs http://127.0.0.1:3082 /tmp/re7-list-truth-browser-fixture.json
// Fixture is exported by campaignListResultTruth.test.ts, from synthetic PostgreSQL.
import fs from 'node:fs';
import {assertFrontendAssetContract, inspectFrontendAssets} from './frontendAssetContract.mjs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('next/dist/compiled/ws');
const local = process.argv[2] || 'http://127.0.0.1:3082';
assert(['127.0.0.1', 'localhost'].includes(new URL(local).hostname), 'local frontend required');
const dir = path.resolve('local-evidence/campaign-list-result-truth-20261011/browser-'+Date.now());
fs.mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fixture=JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const user = { id: 'fixture-admin', clientId: fixture.list.items[0].clientId, name: 'Administrador local', email: 'fixture@example.invalid', role: 'ADMIN', departmentIds: [] };
const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, sid: 'local-synthetic-session', clientId: user.clientId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.simulated';
const session = { baseUrl: '/agent-api', token, user, features: { campaigns: true, crm: true, inbox: true, templates: true, browserPushNotifications: false }, profile: 'business' };
const data=Object.fromEntries(fixture.list.items.map(item=>[item.id,item]));
const parentId=fixture.parentId;
data[parentId]=fixture.detail.campaign;
const name=data[parentId].name;
const template={id:'template-local',name:'modelo_local',status:'approved',category:'UTILITY',language:'pt_BR',content:'Texto sem variavel',variables:[],canUseInCampaign:true};

const assetResponses=[];
const report = { scope: 'real frontend/Chrome, controlled polling clock, simulated auth/API; no backend/provider', cases: [], requests: [], unexpected: [], exceptions: [] };
const profile = fs.mkdtempSync('/tmp/re7-campaign-browser-');
const log = fs.openSync(path.join(dir,'chrome.log'),'w');
const chrome = spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=9260','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});
let ws, n=0;const pending=new Map();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(e){if(!/context|document|Cannot read|Uncaught/.test(e.message))throw e;}await sleep(60);}throw Error('timeout '+label);}
let send,ev;
try {
 let target;
 await until(async()=>{try{target=(await fetch('http://127.0.0.1:9260/json').then(r=>r.json())).find(x=>x.type==='page');return !!target;}catch{return false;}},'Chrome');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 send=(method,params={})=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params}));});
 const fulfill=(requestId,body,code=200)=>send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 ws.onmessage=async({data:raw})=>{
  const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}return;}
  if(m.method==='Network.responseReceived'){assetResponses.push({requestId:m.params.requestId,type:m.params.type,url:m.params.response.url,status:m.params.response.status,mime:m.params.response.mimeType});return;}
  if(m.method==='Page.javascriptDialogOpening'){report.confirmations??=[];report.confirmations.push(m.params.message);await send('Page.handleJavaScriptDialog',{accept:true});return;}
  if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=='Fetch.requestPaused')return;
  const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;
  try {
   if(u.origin===local&&!p.startsWith('/agent-api'))return await send('Fetch.continueRequest',{requestId});
   if(u.origin!==local){report.unexpected.push({path:p,kind:'external blocked'});return await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
   const route=p.slice('/agent-api'.length);report.requests.push({method:request.method,route});assert.equal(request.method,'GET','no mutation even simulated');
   if(route==='/auth/me')return await fulfill(requestId,{ok:true,...session});
   if(route==='/app/tenant')return await fulfill(requestId,{ok:true,tenant:{id:user.clientId,name:'Tenant local',features:session.features,profile:session.profile}});
   if(route==='/app/campaigns'&&request.method==='GET')return await fulfill(requestId,fixture.list);
   if(route.startsWith('/app/campaigns/')&&route!=='/app/campaigns/return-destinations'){
    const id=route.split('/').at(-1);
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
 const tick=()=>ev('window.__tickCampaign()');
 const click=async(text)=>{const ok=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)}||(e.getAttribute('role')==='tab'&&e.textContent.trim().startsWith(${JSON.stringify(text)})));if(!b)return false;b.click();return true;})()`);assert(ok,'button '+text);};
 const check=(name)=>report.cases.push({name,result:'PASS'});
 await send('Page.navigate',{url:local+'/app/campaigns'});
 await until(()=>ev(`document.querySelector('[aria-label="Ver detalhes da campanha ${name}"]')!==null`),'loaded corrected list');
 report.assetReadiness={budgetMs:10000,observations:[]};
 await until(async()=>{
  try { report.assetContract=await inspectFrontendAssets({ev,send,responses:assetResponses});return true; }
  catch(error){
   report.assetReadiness.observations.push(error.message);
   if(!error.message.startsWith('unobserved referenced asset:'))throw error;
   return false;
  }
 },'all referenced asset responses',10000);
 assertFrontendAssetContract(report.assetContract);
 await click('Todas');
 const counts=()=>ev(`(()=>{const r=document.querySelector('tr[aria-label="Ver detalhes da campanha ${name}"]');return r?[...r.querySelectorAll('td')].slice(2,4).map(e=>e.textContent.trim()):null})()`);
 assert.deepEqual(await counts(),['6','11']);check('Initial list presents six results / eleven recipients from actual synthetic SQL projection');
 await ev(`document.querySelector('tr[aria-label="Ver detalhes da campanha ${name}"]').click()`);
 await until(()=>ev(`document.querySelector('[role="dialog"]')?.innerText.includes('Conjunto de campanhas')`),'aggregate detail');
 assert.deepEqual(await counts(),['6','11']);
 const cards=await ev(`['entregues','pendentes'].map(label=>[...document.querySelectorAll('[role="dialog"] p')].find(e=>e.textContent.trim().toLowerCase()===label)?.nextElementSibling?.textContent.trim())`);
 assert.deepEqual(cards,['6','5']);
 check('Detail merges into the table without reverting counts; six reported delivered and five pending');
 const before=report.requests.filter(x=>x.route==='/app/campaigns').length;
 await tick();await tick();
 await until(()=>report.requests.filter(x=>x.route==='/app/campaigns').length>before,'new list polling');
 assert.deepEqual(await counts(),['6','11']);check('New polling retains correct counters after detail');
 await click('Fechar detalhe');await click('Enviando');
 await until(()=>counts(),'sending filter');assert.deepEqual(await counts(),['6','11']);check('Existing sending filter preserves projected counts');
 assert.equal(report.unexpected.length,0);assert.equal(report.exceptions.length,0);
 assert(report.requests.every(x=>x.method==='GET'));
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
 if(send&&ws?.readyState===1){try{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'last-state.png'),Buffer.from(s.data,'base64'));}catch{}}
 ws?.close();chrome.kill('SIGTERM');fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
