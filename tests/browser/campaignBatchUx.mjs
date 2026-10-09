// Synthetic browser API only. Does not start a backend, connect a DB or submit sends.
// Start the local frontend separately, then:
// node tests/browser/campaignBatchUx.mjs http://127.0.0.1:3082
import fs from 'node:fs';
import {assertFrontendAssetContract, inspectFrontendAssets} from './frontendAssetContract.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.url)('next/dist/compiled/ws');
const local = process.argv[2] || 'http://127.0.0.1:3082';
assert(['127.0.0.1', 'localhost'].includes(new URL(local).hostname), 'local frontend required');
const dir = path.resolve('local-evidence/campaign-batch-ux-20261009/browser');
fs.mkdirSync(dir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const user = { id: 'fixture-admin', clientId: 'fixture-tenant', name: 'Administrador local', email: 'fixture@example.invalid', role: 'ADMIN', departmentIds: [] };
const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, sid: 'local-synthetic-session', clientId: user.clientId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.simulated';
const session = { baseUrl: '/agent-api', token, user, features: { campaigns: true, crm: true, inbox: true, templates: true, browserPushNotifications: false }, profile: 'business' };
const make = (id, status, scheduledAt = null) => ({ id, clientId: user.clientId, name: `Campanha local ${id}`, templateName: 'modelo_local', status, scheduledAt, totalRecipients: 2, sentCount: 0, blockedCount: 0, createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:00:00Z', progress: { totalRecipients: 2, sentCount: 0, blockedCount: 0, pendingCount: 2 }, messagesMetaStatus: [], metaSummary: { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 } });
const data={A:make('A','scheduled','2030-10-07T15:40:00Z'),P:make('P','completed'),S:make('S','completed'),C1:make('C1','completed'),C2:make('C2','failed'),C3:make('C3','completed'),I:make('I','completed'),J:make('J','completed')};
const batch=(id,children)=>({id,name:'Conjunto '+id,sourceMode:'DYNAMIC_CRM_FILTER',status:'completed',chunkCount:children.length,totalRecipients:children.length,sentCount:1,blockedCount:1,progress:{totalRecipients:children.length,sentCount:1,blockedCount:children.length-1,pendingCount:0,completedChunks:children.length===1?1:children.length-1,runningChunks:0,queuedChunks:0,failedChunks:children.length>1?1:0},failureReason:children.length>1?'Resultado parcial preservado':null,chunks:children.map((id,i)=>({campaignId:id,name:'Nome igual de lote',status:data[id].status,chunkIndex:i+1,recipientCount:1,totalRecipients:1,sentCount:i===0?1:0,blockedCount:i===0?0:1,queueStatus:i===0?'completed':'failed',queuePosition:null,startedAt:'2030-10-07T15:40:00Z',finishedAt:'2030-10-07T15:41:00Z',failureReason:i===0?null:'Falha específica do lote'}))});
data.P.executionBatch=batch('multi',['C1','C2']);data.S.executionBatch=batch('single',['C3']);
for(const [parent,ids] of [['P',['C1','C2']],['S',['C3']]])for(const id of ids){
 const item=data[id],chunk=data[parent].executionBatch.chunks.find(c=>c.campaignId===id);
 item.name='Nome igual de lote';item.executionBatch=data[parent].executionBatch;
 item.totalRecipients=chunk.totalRecipients;item.sentCount=chunk.sentCount;item.blockedCount=chunk.blockedCount;
 item.progress={totalRecipients:1,sentCount:item.sentCount,blockedCount:item.blockedCount,pendingCount:0};
 item.messagesMetaStatus=[{waId:'fixture-'+id,contactName:'Resultado exclusivo '+id,phoneDisplay:'Número sintético',templateName:'modelo_local',status:id==='C2'?'failed':'sent',sentAt:'2030-10-07T15:40:00Z',error:id==='C2'?'131026 sintético':null}];
}
data.C2.templateName='modelo_divergente';data.C2.draftSeed={returnDestination:{type:'human_department',departmentId:'setor-exclusivo',queueId:'fila-exclusiva'},templateParams:['Valor exclusivo'],templateVariableMappings:[{position:'1',source:'FIXED',value:'Exclusivo'}]};
for(const id of ['P','S']){data[id].selectionMode='DYNAMIC_CRM_FILTER';data[id].totalRecipients=data[id].executionBatch.progress.totalRecipients;data[id].sentCount=1;data[id].blockedCount=data[id].executionBatch.progress.blockedCount;data[id].progress={...data[id].executionBatch.progress};}
data.I.name=data.J.name='Independentes com nome igual';
const template={id:'template-local',name:'modelo_local',status:'approved',category:'UTILITY',language:'pt_BR',content:'Texto sem variavel',variables:[],canUseInCampaign:true};

let held = null, holdId = null, failId = null, wrongTenantId = null; let epoch=1, active=0, maximum=0;
const assetResponses=[];
const report = { scope: 'real frontend/Chrome, controlled polling clock, simulated auth/API; no backend/provider', cases: [], requests: [], unexpected: [], exceptions: [] };
const profile = fs.mkdtempSync('/tmp/re7-campaign-browser-');
const log = fs.openSync(path.join(dir,'chrome.log'),'w');
const chrome = spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=9254','--user-data-dir='+profile,'about:blank'],{stdio:['ignore',log,log]});
let ws, n=0;const pending=new Map();
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch(e){if(!/context|document|Cannot read|Uncaught/.test(e.message))throw e;}await sleep(60);}throw Error('timeout '+label);}
let send,ev;
try {
 let target;
 await until(async()=>{try{target=(await fetch('http://127.0.0.1:9254/json').then(r=>r.json())).find(x=>x.type==='page');return !!target;}catch{return false;}},'Chrome');
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
   const route=p.slice('/agent-api'.length);report.requests.push({method:request.method,route,epoch});
   if(route==='/auth/me')return await fulfill(requestId,{ok:true,...session});
   if(route==='/app/tenant')return await fulfill(requestId,{ok:true,tenant:{id:user.clientId,name:'Tenant local',features:session.features,profile:session.profile}});
   if(route==='/app/campaigns'&&request.method==='GET')return await fulfill(requestId,{ok:true,count:Object.keys(data).length,items:Object.values(data).map(({executionBatch,...item})=>item)});
   if(route.startsWith('/app/campaigns/')&&route!=='/app/campaigns/return-destinations'){
    const id=route.split('/').at(-1);
    if(data[id]&&request.method==='GET'){
      active++;maximum=Math.max(maximum,active);
      if(holdId===id){assert(!held,'one held request');held={requestId,id,snapshot:structuredClone(data[id])};holdId=null;return;}
      await sleep(35);active--;
      if(failId===id){failId=null;return await fulfill(requestId,{error:'server_error'},500);}
      if(wrongTenantId===id){wrongTenantId=null;return await fulfill(requestId,{ok:true,campaign:{...data[id],clientId:'other-tenant'}});}
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
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});window.__campaignTimers=new Map();const realInterval=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);let fakeId=900000;window.setInterval=(fn,ms,...args)=>{if(ms===3000){const id=++fakeId;window.__campaignTimers.set(id,()=>fn(...args));return id;}return realInterval(fn,ms,...args);};window.clearInterval=id=>{window.__campaignTimers.delete(id);realClear(id);};window.__tickCampaign=async()=>{for(const fn of [...window.__campaignTimers.values()])await fn();};`});
 ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const body=()=>ev('document.body?.innerText||""');
 const dialog=()=>ev(`document.querySelector('[role="dialog"]')?.innerText||document.body.innerText`);
 const tick=()=>ev('window.__tickCampaign()');
 const click=async(text)=>{const ok=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)}||(e.getAttribute('role')==='tab'&&e.textContent.trim().startsWith(${JSON.stringify(text)})));if(!b)return false;b.click();return true;})()`);assert(ok,'button '+text);};
 const check=(name)=>{report.cases.push({name,result:'PASS'});console.log('PASS: '+name);};
 await send('Page.navigate',{url:local+'/app/campaigns'});
 await until(()=>ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local P"]')!==null`),'list');
 await click('Concluídas');
 await until(()=>ev(`document.querySelectorAll('tr[aria-label="Ver detalhes da campanha Independentes com nome igual"]').length===2`),'independent names');
 report.assetContract=await inspectFrontendAssets({ev,send,responses:assetResponses});assertFrontendAssetContract(report.assetContract);
 check('Real compiled CSS/JS HTTP, MIME and computed styles; independent equal names retained');
 const open=async(id)=>{await ev(`document.querySelector('[aria-label="Ver detalhes da campanha Campanha local ${id}"]').click()`);await until(()=>ev(`document.getElementById('batch-summary-${data[id].executionBatch.id}')!==null`),'batch '+id);};
 const expand=async(index)=>{await ev(`document.querySelectorAll('[aria-label="Conjunto e lotes"] button[aria-expanded]')[${index}].click()`);};
 const releaseHeld=async(marker)=>{const value=held;held=null;active--;try{await fulfill(value.requestId,{ok:true,campaign:{...value.snapshot,messagesMetaStatus:[{...value.snapshot.messagesMetaStatus[0],contactName:marker}]}});}catch(error){if(error.message!=='Invalid InterceptionId.')throw error;report.cancelledLateResponses=(report.cancelledLateResponses||0)+1;}};
 const lotText=()=>ev(`document.querySelector('[aria-label^="Dados exclusivos do lote"]')?.innerText||''`);
 await open('P');assert.equal(await ev(`document.querySelectorAll('[aria-label="Totais do conjunto"]').length`),0,'aggregate cards once on controller');
 const before=report.requests.length;await expand(0);await until(async()=> (await lotText()).includes('Resultado exclusivo C1'),'expanded first');
 assert.equal(report.requests.slice(before).filter(r=>r.route==='/app/campaigns/C2').length,0,'no loading unopened sibling');
 assert.equal(await ev(`document.querySelector('[role=\"dialog\"]')?.innerText.includes('Progresso do lote')`),false);
 check('Several lots: aggregate once; expansion stays on parent and only reads requested ID');
 data.C1.updatedAt='2030-10-07T15:43:00Z';data.C1.messagesMetaStatus[0].contactName='Resultado exclusivo C1 atualizado';await tick();await until(async()=> (await lotText()).includes('C1 atualizado'),'child version');check('Child list version invalidates expanded detail even with unchanged parent version');
 await expand(1);await until(async()=> (await lotText()).includes('Resultado exclusivo C2'),'expanded failure');
 const failed=await lotText();for(const label of ['modelo_divergente','setor-exclusivo','Valor exclusivo','131026','Falha específica'])assert(failed.includes(label),label);
 assert(!(await lotText()).includes('Resultado exclusivo C1'));check('Partial/failed results and divergent template, destination and variables preserved per row');
 await click('Fechar detalhe');await open('S');await expand(0);await until(async()=> (await lotText()).includes('Resultado exclusivo C3'),'single lot');const cachedReads=report.requests.filter(r=>r.route==='/app/campaigns/C3').length;await expand(0);await expand(0);await until(async()=> (await lotText()).includes('Resultado exclusivo C3'),'reused row');assert.equal(report.requests.filter(r=>r.route==='/app/campaigns/C3').length,cachedReads);check('One-lot set uses the same expandable pattern; same-version reopen reuses detail');
 await click('Abrir lote por ID 1: Nome igual de lote');await until(()=>ev(`document.querySelector('[aria-label="Contexto do lote"]')!==null`),'direct child');
 assert.equal(await ev(`document.querySelector('[aria-label="Conjunto e lotes"] details').open`),false);await click('Abrir conjunto por ID');await until(()=>ev(`document.querySelector('[aria-label="Contexto do lote"]')===null`),'parent navigation');check('Child detail has own result/actions, explicit parent link and collapsed aggregate');
 await click('Fechar detalhe');await open('P');failId='C2';await expand(1);await until(()=>ev(`document.querySelector('[aria-label^="Dados exclusivos do lote"] [role="alert"]')!==null`),'inline failure');
 assert((await dialog()).includes('Conjunto multi'));await click('Tentar leitura novamente');await until(async()=> (await lotText()).includes('Resultado exclusivo C2'),'retry read');check('Read failure confined to row; explicit read retry does not submit an action');
 await expand(1);await expand(0);await until(async()=> (await lotText()).includes('Resultado exclusivo C1'),'cached lot');
 // Change parent version so a genuinely new read is needed, then switch before its response.
 data.P.updatedAt='2030-10-07T15:42:00Z';data.P.status='sending';holdId='C1';
 await tick();await until(()=>held!==null,'held lot');await click('Fechar detalhe');await open('S');
 await releaseHeld('OLD_RESPONSE_MARKER');
 await sleep(150);assert(!(await dialog()).includes('OLD_RESPONSE_MARKER'));check('Delayed lot response cannot cross selection/unmount boundary');
 await click('Fechar detalhe');await click('Todas');await open('P');wrongTenantId='C2';await expand(1);await until(()=>ev(`document.querySelector('[aria-label^="Dados exclusivos do lote"] [role="alert"]')!==null`),'tenant mismatch');check('Mismatched tenant detail rejected inline');
 await click('Fechar detalhe');await open('S');
 await send('Page.bringToFront');
 await ev(`document.querySelector('[aria-label="Conjunto e lotes"] button[aria-expanded]').focus()`);
 report.keyboardBefore=await ev(`({focus:document.activeElement?.outerHTML,expanded:document.querySelector('[aria-label="Conjunto e lotes"] button[aria-expanded]').getAttribute('aria-expanded')})`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await until(()=>ev(`document.querySelector('[aria-label="Conjunto e lotes"] button[aria-expanded]').getAttribute('aria-expanded')==='true'`),'keyboard enter');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await until(()=>ev(`document.querySelector('[aria-label="Conjunto e lotes"] button[aria-expanded]').getAttribute('aria-expanded')==='false'`),'keyboard space');check('Keyboard Enter/Space and aria-expanded/controls');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await expand(0);await until(async()=> (await lotText()).includes('Resultado exclusivo C3'),'mobile lot');
 report.mobile=await ev(`(()=>{const panel=document.querySelector('[aria-label="Conjunto e lotes"]');const scroller=panel.querySelector('table').parentElement;return{viewport:innerWidth,panelWidth:panel.getBoundingClientRect().width,overflow:getComputedStyle(scroller).overflowX,background:getComputedStyle(panel).backgroundColor,font:getComputedStyle(panel).fontSize,buttonCount:panel.querySelectorAll('button').length};})()`);
 assert(report.mobile.panelWidth<=390);assert.equal(report.mobile.overflow,'auto');assert.notEqual(report.mobile.background,'rgba(0, 0, 0, 0)');
 await ev(`document.querySelector('[aria-label="Conjunto e lotes"]').scrollIntoView({block:'start'})`);
 report.mobileVisible=await ev(`(()=>{const p=document.querySelector('[aria-label="Conjunto e lotes"]');const s=p.querySelector('table').parentElement;const b=p.querySelector('button[aria-expanded]');s.scrollLeft=0;const first=b.getBoundingClientRect();s.scrollLeft=s.scrollWidth;const direct=p.querySelector('[aria-label^="Abrir lote por ID"]').getBoundingClientRect();return{first:{left:first.left,right:first.right},direct:{left:direct.left,right:direct.right},scrollHeight:s.scrollHeight};})()`);
 assert(report.mobileVisible.first.left>=0&&report.mobileVisible.first.right<=390);assert(report.mobileVisible.direct.left>=0&&report.mobileVisible.direct.right<=390);
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'mobile.png'),Buffer.from(shot.data,'base64'));check('Mobile 390px: styles present, row scrolling contained, controls accessible');
 await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1100,deviceScaleFactor:1,mobile:false});
 // Start an actual delayed read then replace the authenticated synthetic session.
 await click('Fechar detalhe');await open('P');holdId='C1';await expand(0);await until(()=>held!==null,'old session read');
 epoch=2;user.clientId='second-tenant';user.id='second-admin';for(const item of Object.values(data))item.clientId=user.clientId;
 session.user={...user};session.token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,sid:'second',clientId:user.clientId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.simulated';
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('wa_app_session_session_v1',${JSON.stringify(JSON.stringify(session))});`});
 await send('Page.navigate',{url:local+'/app/campaigns'});
 await releaseHeld('STALE_SESSION_MARKER');
 await until(()=>report.requests.some(r=>r.epoch===2&&r.route==='/app/campaigns'),'session list');await sleep(200);assert(!(await body()).includes('STALE_SESSION_MARKER'));check('Session change disposes reads/cache and discards delayed old tenant response');
 await send('Page.navigate',{url:local+'/app/campaigns?campaignId=C2'});
 await until(()=>ev(`document.querySelector('[aria-label="Contexto do lote"]')!==null`),'direct URL');
 assert((await dialog()).includes('Resultado exclusivo C2'));assert.equal(await ev(`document.querySelector('[aria-label="Conjunto e lotes"] details').open`),false);check('Direct child URL preserves own result and collapsible aggregate');
 assert.equal(report.requests.filter(r=>r.method!=='GET'&&!r.route.startsWith('/app/agent-availability')&&!r.route.startsWith('/app/push')).length,0);
 assert.equal(report.unexpected.length,0);assert.equal(report.exceptions.length,0);assert(maximum<=2,'shared HTTP concurrency');report.maximumDetailConcurrency=maximum;
 check('No campaign mutation/provider request; detail concurrency at most two');report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
 if(send&&ws?.readyState===1){try{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'last-state.png'),Buffer.from(s.data,'base64'));}catch{}}
 ws?.close();chrome.kill('SIGTERM');fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
