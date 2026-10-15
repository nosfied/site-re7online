import assert from "node:assert/strict";
import test from "node:test";
import { importRecoveryKey, importIsTerminal, importOperationMessage, mergeImportObservation } from "./crmImportRecovery";
import { confirmAppCrmContactCsvImport, fetchAppCrmImportOperation, type AppCrmImportOperation, type AppSession } from "./appClientApi";
const session = {baseUrl:"https://synthetic.invalid",token:"synthetic-test-token",user:{id:"user",clientId:"tenant",role:"ADMIN"}} as AppSession;
const operation = (status: AppCrmImportOperation['status'], id="00000000-0000-4000-8000-000000000001"):AppCrmImportOperation=>({ok:true,status,operationId:id,progress:null,summary:null});
test("late PROCESSING/UNKNOWN cannot overwrite a terminal receipt or another operation",()=>{
 const complete=operation('COMPLETED');assert.equal(mergeImportObservation(complete,operation('UNKNOWN')),complete);assert.equal(mergeImportObservation(complete,operation('PROCESSING')),complete);
 assert.equal(mergeImportObservation(operation('PROCESSING'),complete),complete);const other=operation('PROCESSING','other');assert.equal(mergeImportObservation(other,complete),other);
});
test("unknown is not failed; storage scope separates tenant/user/base URL and never stores bearer token",()=>{
 assert.equal(importIsTerminal(operation('UNKNOWN')),false);assert.equal(importIsTerminal(operation('FAILED')),true);
 assert.match(importOperationMessage(operation('UNKNOWN')),/Não repita/);assert.doesNotMatch(importRecoveryKey(session),/synthetic-test-token/);
 assert.notEqual(importRecoveryKey(session),importRecoveryKey({...session,user:{...session.user,clientId:'other'}}));assert.notEqual(importRecoveryKey(session),importRecoveryKey({...session,user:{...session.user,id:'other'}}));
});
test("actual client times out/loss after one POST; recovery/reentry uses only GET with the same operation ID",async()=>{
 const original=globalThis.fetch;const calls:Array<{method:string;path:string;body?:string}>=[];const id=operation('UNKNOWN').operationId;
 globalThis.fetch=async(input,init)=>{
  calls.push({method:init?.method??'GET',path:new URL(String(input)).pathname,body:typeof init?.body==='string'?init.body:undefined});
  if(init?.method==='POST')throw new TypeError('synthetic lost response');
  return new Response(JSON.stringify(operation('COMPLETED')),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try {
  await assert.rejects(()=>confirmAppCrmContactCsvImport(session,{operationId:id,csvText:'phone\n5584910000000',mapping:{phoneColumn:'phone'}}));
  assert.equal((await fetchAppCrmImportOperation(session,id)).status,'COMPLETED');assert.equal((await fetchAppCrmImportOperation(session,id)).operationId,id);
  assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET']);assert.equal(JSON.parse(calls[0].body!).operationId,id);assert.ok(calls.slice(1).every(c=>c.path.endsWith(id)));
 } finally {globalThis.fetch=original;}
});
test("actual AbortController timeout is UNKNOWN to the caller; only GET recovers the committed response",async()=>{
 const fetchBefore=globalThis.fetch,setBefore=globalThis.setTimeout;
 const methods:string[]=[];const id=operation('UNKNOWN').operationId;
 globalThis.setTimeout=((fn: (...args: unknown[])=>void,ms?:number,...args:unknown[])=>setBefore(fn,ms===10000?1:ms,...args)) as typeof setTimeout;
 globalThis.fetch=async(_input,init)=>{
  methods.push(init?.method??'GET');
  if(init?.method==='POST')return new Promise<Response>((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('synthetic timeout','AbortError'))));
  return new Response(JSON.stringify(operation('COMPLETED')),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try {
  await assert.rejects(()=>confirmAppCrmContactCsvImport(session,{operationId:id,csvText:'phone\n5584910000000'}),(e:unknown)=>(e as {errorCode?:string}).errorCode==='network_timeout');
  assert.equal((await fetchAppCrmImportOperation(session,id)).status,'COMPLETED');assert.deepEqual(methods,['POST','GET']);
 } finally {globalThis.fetch=fetchBefore;globalThis.setTimeout=setBefore;}
});

test("late progress cannot erase already committed counts; unknown preserves observed partial progress",()=>{
 const current={...operation('PROCESSING'),progress:{classification:null,processed:12,counts:{created:12}}};
 const stale={...operation('PROCESSING'),progress:{classification:null,processed:2,counts:{created:2}}};
 assert.equal(mergeImportObservation(current,stale),current);
 const unknown=mergeImportObservation(current,operation('UNKNOWN'));assert.equal(unknown.status,'UNKNOWN');assert.equal(unknown.progress?.processed,12);
});
