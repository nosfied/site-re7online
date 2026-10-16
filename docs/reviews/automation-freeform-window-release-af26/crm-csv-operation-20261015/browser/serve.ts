// Isolated synthetic HTTP harness. No worker, provider calls or productive credentials.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function main() {
  const root = process.env.RE7_CSV_REVIEW_ROOT!;
  const lab = '/tmp/re7-csv-browser-20261015';
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55781'); assert.equal(url.pathname, '/retention_lab');
  assert.equal(process.env.NODE_ENV, 'test');
  const load = (p: string) => import(pathToFileURL(path.join(root, 'apps/whatsapp-agent/src', p)).href);
  const { getPrisma, setPrismaForTesting } = await load('db.ts');
  const { issueClientAuthToken } = await load('auth/clientAuth.ts');
  const { buildAppAuthSessionExpiresAt } = await load('auth/sessionPolicy.ts');
  const { getFeatures } = await load('features/clientFeatures.ts');
  const db = getPrisma();
  const client = await db.client.create({data:{clientKey:'csv-browser-'+randomUUID(),name:'CSV Synthetic Review',profile:'business',features:{}}});
  const user = await db.user.create({data:{clientId:client.id,name:'Synthetic Reviewer',email:randomUUID()+'@example.test',role:'ADMIN',isActive:true}});
  const sid = randomUUID(), expiresAt=buildAppAuthSessionExpiresAt();
  await db.appAuthSession.create({data:{id:sid,clientId:client.id,userId:user.id,expiresAt}});
  await db.lead.createMany({data:Array.from({length:62},(_,i)=>({tenantId:client.id,waId:'55849'+String(20000000+i),waIdCanonical:'55849'+String(20000000+i),phone:'55849'+String(20000000+i),name:i<5?'Target Synthetic '+i:'Synthetic '+i,status:'NEW',channel:'whatsapp',provider:'meta'}))});
  await db.lead.create({data:{tenantId:client.id,waId:'anon:csv-browser',name:'Hidden anonymized synthetic',status:'NEW'}});
  const runtime=path.join(lab,'runtime');await fs.mkdir(path.join(runtime,'.data'),{recursive:true});
  await fs.writeFile(path.join(runtime,'.data/tenants.json'),JSON.stringify({[client.clientKey]:{id:client.clientKey,name:client.name,metaPhoneNumberId:'synthetic',allowlist:[],handoffAttendantWaid:'',defaultLanguage:'pt_BR'}}));
  process.chdir(runtime);
  let delayed = false;
  const wrapped = new Proxy(db,{get(t,k){
    if(k==='event')return new Proxy(t.event,{get(e,p){
      if(p==='create')return async(args:any)=>{
        const result=await e.create(args);
        if(args.data.eventName==='crm.contact.import.classified'&&!delayed){delayed=true;await new Promise(r=>setTimeout(r,18000));}
        return result;
      };
      const value=(e as any)[p];return typeof value==='function'?value.bind(e):value;
    }});
    const value=(t as any)[k];return typeof value==='function'?value.bind(t):value;
  }});
  setPrismaForTesting(wrapped);
  const {handleRequest}=await load('http/routes.ts');
  const requests:any[]=[];
  const server=createServer((req,res)=>{
    const started=Date.now();res.on('finish',()=>{requests.push({method:req.method,path:req.url,status:res.statusCode,elapsedMs:Date.now()-started});void fs.writeFile(path.join(lab,'requests.private.json'),JSON.stringify(requests));});
    void handleRequest(req,res);
  });
  await new Promise<void>(r=>server.listen(55782,'127.0.0.1',r));
  const session={baseUrl:'/agent-api',token:issueClientAuthToken(user,sid),expiresAt:expiresAt.toISOString(),user,profile:'business',features:{...getFeatures(client),crm:true}};
  await fs.writeFile(path.join(lab,'session.private.json'),JSON.stringify(session),{mode:0o600});
  await fs.writeFile(path.join(lab,'fixture.private.json'),JSON.stringify({clientId:client.id,userId:user.id}),{mode:0o600});
  console.log('SYNTHETIC_REAL_API_READY_55782');
  process.on('SIGTERM',()=>{server.close(()=>{void db.$disconnect().then(()=>process.exit(0));});});
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
