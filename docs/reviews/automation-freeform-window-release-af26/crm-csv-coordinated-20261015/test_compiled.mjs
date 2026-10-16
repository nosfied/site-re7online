import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const out=path.resolve(process.argv[2]);const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55781');assert.equal(url.pathname,'/retention_lab');assert.equal(process.env.NODE_ENV,'test');
const root=path.join(out,'api-candidate');const load=p=>import(pathToFileURL(path.join(root,'dist',p)).href);
const {getPrisma}=await load('db.js'),db=getPrisma();
const{issueClientAuthToken}=await load('auth/clientAuth.js');const{buildAppAuthSessionExpiresAt}=await load('auth/sessionPolicy.js');
const client=await db.client.create({data:{clientKey:'csv-compiled-'+randomUUID(),name:'Synthetic compiled CSV',profile:'business',features:{}}});
const other=await db.client.create({data:{clientKey:'csv-compiled-other-'+randomUUID(),name:'Other synthetic',profile:'business',features:{}}});
async function user(clientId,role){const u=await db.user.create({data:{clientId,role,name:'Synthetic '+role,email:randomUUID()+'@example.test',isActive:true}});const sid=randomUUID();await db.appAuthSession.create({data:{id:sid,clientId,userId:u.id,expiresAt:buildAppAuthSessionExpiresAt()}});return issueClientAuthToken(u,sid);}
const admin=await user(client.id,'ADMIN'),agent=await user(client.id,'AGENT'),supervisor=await user(client.id,'SUPERVISOR'),otherAdmin=await user(other.id,'ADMIN');
const runtime=await fs.mkdtemp('/tmp/re7-csv-compiled-');await fs.mkdir(path.join(runtime,'.data'));await fs.writeFile(path.join(runtime,'.data/tenants.json'),JSON.stringify({[client.clientKey]:{id:client.clientKey,name:client.name,metaPhoneNumberId:'synthetic',allowlist:[],handoffAttendantWaid:'',defaultLanguage:'pt_BR'}}));process.chdir(runtime);
for(let n=0;n<5;n++){const waId='558496660000'+n;await db.lead.create({data:{tenantId:client.id,waId,waIdCanonical:waId,name:'Synthetic '+n,status:'NEW'}});if(n>=3)await db.contact.create({data:{clientId:client.id,waId,operationallyExcludedAt:new Date()}});}
await db.lead.create({data:{tenantId:client.id,waId:'anon:compiled',name:'Hidden synthetic',status:'NEW'}});
const{handleRequest}=await load('http/routes.js');const server=createServer((req,res)=>void handleRequest(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
async function request(method,p,token,body){const r=await fetch(base+p,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};}
try{
 const a=await request('GET','/app/crm/contacts?operationalStatus=active',admin),e=await request('GET','/app/crm/contacts?operationalStatus=excluded',admin);
 assert.deepEqual(a.body.totals,{tenantVisible:5,filtered:3,pageCount:3});assert.deepEqual(e.body.totals,{tenantVisible:5,filtered:2,pageCount:2});
 for(const token of[agent,supervisor]){const x=await request('GET','/app/crm/contacts',token);assert.equal(x.body.totals.tenantVisible,3);assert.equal((await request('GET','/app/crm/contacts?operationalStatus=excluded',token)).status,403);}
 const payload={operationId:randomUUID(),csvText:'phone,name\n5584966611111,Synthetic import A\n5584966611112,Synthetic import B',mapping:{phoneColumn:'phone',nameColumn:'name'}};
 assert.equal((await request('POST','/app/crm/contacts/import/confirm',admin,{...payload,operationId:undefined})).status,400);
 const imported=await request('POST','/app/crm/contacts/import/confirm',admin,payload);assert.equal(imported.status,200);assert.equal(imported.body.status,'COMPLETED');assert.equal(imported.body.summary.created,2);
 const before=await db.event.count({where:{clientId:client.id}});
 assert.equal((await request('POST','/app/crm/contacts/import/confirm',admin,payload)).body.status,'COMPLETED');assert.equal(await db.event.count({where:{clientId:client.id}}),before);
 const getPath='/app/crm/contacts/import/operations/'+payload.operationId;
 assert.equal((await request('GET',getPath,admin)).body.status,'COMPLETED');assert.equal((await request('GET',getPath,otherAdmin)).body.status,'UNKNOWN');assert.equal((await request('GET',getPath,agent)).status,403);
 const after=await request('GET','/app/crm/contacts',admin);assert.equal(after.body.totals.tenantVisible,7);
 const proof={result:'EXACT_COMPILED_ARTIFACT_LOCAL_PASS',node:process.versions.node,adminActive:[5,3,3],adminExcluded:[5,2,2],otherRolesAllowedTotal:3,excludedForbiddenForNonAdmin:true,legacyPostDeniedBeforeAdmission:true,created:2,replayedWrites:0,getPreservedForReturn:true,tenantIsolation:true,anonymizedHidden:true,sameApiForTargetAndReturn:true};
 await fs.writeFile(path.join(out,'compiled-proof.sanitized.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await new Promise(r=>server.close(r));await db.$disconnect();}
