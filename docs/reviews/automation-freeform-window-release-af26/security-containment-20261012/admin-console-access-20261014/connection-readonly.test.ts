import assert from 'node:assert/strict';
import {loadAdminConnection, saveAdminConnection, clearAdminConnection, testAdminConnection} from '../../../../../src/lib/whatsappAdminApi';
function memory() {const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};}
async function main(){
Object.assign(globalThis,{window:{location:new URL('https://converta.re7online.com/admin/tenants')},localStorage:memory(),sessionStorage:memory()});
localStorage.setItem('tenant-data-sentinel','preserve');sessionStorage.setItem('wa_app_session_session_v1','synthetic-tenant-jwt');sessionStorage.setItem('wa_app_support_return_session_v1','synthetic-support-return');
for(const rememberToken of [false,true]){
 saveAdminConnection({baseUrl:'/agent-api',adminToken:'synthetic-previous-admin',rememberToken});assert.equal(loadAdminConnection().adminToken,'synthetic-previous-admin');assert.equal(loadAdminConnection().baseUrl,'/agent-api');
 assert.equal(Boolean(localStorage.getItem('wa_admin_token_local_v1')),rememberToken);
 let calls=0;Object.assign(globalThis,{fetch:async(url:string,init:RequestInit)=>{calls++;assert.equal(url,'/agent-api/admin/health');assert.equal(init.method??'GET','GET');return new Response('{}',{status:401})}});
 await assert.rejects(testAdminConnection(loadAdminConnection()),/Token inválido \(401\)/);assert.equal(calls,1);
 //401 itself does not silently replace stored credentials. Owner invokes canonical logout.
 assert.equal(loadAdminConnection().adminToken,'synthetic-previous-admin');clearAdminConnection();assert.equal(loadAdminConnection().adminToken,'');
 for(const k of ['wa_admin_connection_v1','wa_admin_token_local_v1'])assert.equal(localStorage.getItem(k),null);assert.equal(sessionStorage.getItem('wa_admin_token_session_v1'),null);
 assert.equal(localStorage.getItem('tenant-data-sentinel'),'preserve');assert.equal(sessionStorage.getItem('wa_app_session_session_v1'),'synthetic-tenant-jwt');assert.equal(sessionStorage.getItem('wa_app_support_return_session_v1'),'synthetic-support-return');
 saveAdminConnection({baseUrl:'/agent-api',adminToken:'synthetic-new-admin',rememberToken});Object.assign(globalThis,{fetch:async(url:string,init:RequestInit)=>{assert.equal(url,'/agent-api/admin/health');assert.equal((init.headers as Record<string,string>)['X-Admin-Token'],'synthetic-new-admin');return new Response('{"ok":true,"db":true}',{status:200})}});await testAdminConnection(loadAdminConnection());assert.equal(loadAdminConnection().adminToken,'synthetic-new-admin');clearAdminConnection();
}
console.log(JSON.stringify({result:'CANONICAL_ADMIN_STORAGE_401_LOGOUT_RECONNECT_PASS',rememberModes:2,tenantJwtPreserved:true,supportReturnPreserved:true,onlyThreeAdminKeysRemoved:true,requestsGetOnly:true,syntheticOnly:true,productionChanges:0}));
}
main().catch(()=>{console.error('DIRECTED_CONSOLE_PROOF_DENY');process.exitCode=1});
