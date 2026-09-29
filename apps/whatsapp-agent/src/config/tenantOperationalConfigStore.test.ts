import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { withLockedTenantOperationalConfig } from './tenantOperationalConfigStore.js';
import * as config from './tenantOperationalConfig.js';
import { createCannedReply, listCannedReplies, updateCannedReply } from './cannedReplies.js';
import { saveQueueAssignmentPolicy } from '../queue/assignmentPolicy.js';
import { saveWebSessionAuthorization, markWebSessionAuthorizationOwned, markWebSessionAuthorizationReleased, markWebSessionAuthorizationInvalidatedByMetaIdentityChange } from '../web-session/webSessionAuthorization.js';
import { saveWhatsappPrimaryTransport, clearWhatsappPrimaryTransport, startWhatsappNumberReplacement, cancelWhatsappNumberReplacement, completeWhatsappNumberReplacementIfMatched } from '../web-session/hybridIdentity.js';

const url = new URL(process.env.DATABASE_URL ?? 'http://missing');
assert(['localhost','127.0.0.1','::1'].includes(url.hostname) && url.pathname.startsWith('/re7_config_persistence'), 'isolated synthetic DB required');
const a = new PrismaClient(), b = new PrismaClient(), observer = new PrismaClient();
const clients: string[] = [];
const flag = 'allowAgentOwnClosedConversations'; // Real setter; all fixtures remain synthetic.
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(initial?: Record<string, any>) {
 const client = await a.client.create({data:{clientKey:`config-lock-${crypto.randomUUID()}`,name:'Synthetic config lock'}});
 clients.push(client.id);
 if(initial) await a.tenantOperationalConfig.create({data:{clientId:client.id,config:initial}});
 return client.id;
}
async function read(id:string) { return (await a.tenantOperationalConfig.findUniqueOrThrow({where:{clientId:id}})).config as Record<string,any>; }
async function setFlag(prisma:PrismaClient, id:string, enabled:boolean) {
 return config.saveAllowAgentOwnClosedConversations({prisma,clientId:id,enabled});
}
async function waitForBlockedWriter() {
 const end=Date.now()+3000;
 while(Date.now()<end) {
  const rows=await observer.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`;
  if(Number(rows[0].n)>0)return;
  await new Promise(r=>setTimeout(r,5));
 }
 throw Error('writer never waited on the database lock');
}
test.after(async()=>{
 await a.event.deleteMany({where:{clientId:{in:clients}}});
 await a.tenantOperationalConfig.deleteMany({where:{clientId:{in:clients}}});
 await a.client.deleteMany({where:{id:{in:clients}}});
 await Promise.all([a.$disconnect(),b.$disconnect(),observer.$disconnect()]);
});

test('original signature interleaving: real SELECT then revocation cannot be undone',async()=>{
 const id=await fixture({[flag]:true,unknown:{keep:[1,null,false]}});
 const entered=deferred(),release=deferred();
 const delayed=a.$extends({query:{tenantOperationalConfig:{async findUnique({args,query}){
  const result=await query(args); entered.resolve(); await release.promise; return result;
 }}}});
 const signature=config.saveAgentSignatureSettings({prisma:delayed as unknown as PrismaClient,clientId:id,settings:{enabled:true,mode:'user_name',format:'bold_line'}});
 await entered.promise;
 const revocation=setFlag(b,id,false);
 try { await waitForBlockedWriter(); } finally {release.resolve();}
 await Promise.all([signature,revocation]);
 const result=await read(id); assert.equal(result[flag],false);assert.equal(result.agentSignature.enabled,true);assert.deepEqual(result.unknown,{keep:[1,null,false]});
});

test('simultaneous absent-row creation preserves both independent changes',async()=>{
 const id=await fixture();const entered=deferred(),release=deferred();
 const first=withLockedTenantOperationalConfig(a,id,async tx=>{entered.resolve();await release.promise;await tx.tenantOperationalConfig.update({where:{clientId:id},data:{config:{first:['keep',null]}}});});
 await entered.promise; const second=setFlag(b,id,false);
 try { await waitForBlockedWriter(); } finally {release.resolve();}
 await Promise.all([first,second]);assert.deepEqual(await read(id),{first:['keep',null],[flag]:false});
 assert.equal(await a.tenantOperationalConfig.count({where:{clientId:id}}),1);
});

test('caller transaction rollback includes nested setter; failed creation leaves no row',async()=>{
 const id=await fixture({[flag]:false});
 await assert.rejects(a.$transaction(async tx=>{
  await config.saveAgentSignatureSettings({prisma:tx as PrismaClient,clientId:id,settings:{enabled:true,mode:'user_name',format:'bold_line'}});
  throw Error('rollback sentinel');
 }),/rollback sentinel/);
 assert.deepEqual(await read(id),{[flag]:false});
 const absent=await fixture();
 await assert.rejects(withLockedTenantOperationalConfig(a,absent,async()=>{throw Error('creation rollback');}),/creation rollback/);
 assert.equal(await a.tenantOperationalConfig.count({where:{clientId:absent}}),0);
 await clearWhatsappPrimaryTransport({prisma:a,clientId:absent});
 assert.equal(await a.tenantOperationalConfig.count({where:{clientId:absent}}),0);
});

test('different tenant does not wait; callbacks read the latest committed document',async()=>{
 const id=await fixture({[flag]:true}),other=await fixture();const entered=deferred(),release=deferred();
 const held=withLockedTenantOperationalConfig(a,id,async()=>{entered.resolve();await release.promise;});
 await entered.promise;
 try {await setFlag(b,other,false);assert.equal((await read(other))[flag],false);}finally{release.resolve();}
 await held;
});

const setters: Array<[string,(p:PrismaClient,id:string)=>Promise<unknown>]> = Object.entries(config)
 .filter(([name])=>name.startsWith('save'))
 .map(([name,fn])=>[name,(p,id)=>(fn as Function)({prisma:p,clientId:id,enabled:false,settings:{enabled:true,mode:'user_name',format:'bold_line'},emails:[],statuses:[],policy:name==='saveInboxVisibilityPolicy'?'shared':{},transport:'meta',enabledForRouting:false})]);
const policy={enabled:true,mode:'round_robin' as const,scope:'department' as const,maxActivePerAgent:2,includeSupervisors:false,requireOnline:false,presenceMode:'IGNORE' as const,notifyAssignedOnly:false};
setters.push(
 ['cannedReplies',(p,id)=>createCannedReply({prisma:p,clientId:id,userId:'synthetic',input:{title:'Synthetic',body:'Body'}})],
 ['queuePolicy',(p,id)=>saveQueueAssignmentPolicy({prisma:p,clientId:id,actorUserId:'synthetic',requestId:crypto.randomUUID(),policy})],
 ['webAuthorization',(p,id)=>saveWebSessionAuthorization({prisma:p,clientId:id,actorUserId:'synthetic',number:'5581000000000'})],
 ['webOwned',(p,id)=>markWebSessionAuthorizationOwned({prisma:p,clientId:id,observedIdentity:'5581000000000'})],
 ['webReleased',(p,id)=>markWebSessionAuthorizationReleased({prisma:p,clientId:id,actorUserId:'synthetic'})],
 ['webInvalidated',(p,id)=>markWebSessionAuthorizationInvalidatedByMetaIdentityChange({prisma:p,clientId:id,actorUserId:'synthetic'})],
 ['primaryTransport',(p,id)=>saveWhatsappPrimaryTransport({prisma:p,clientId:id,provider:'meta'})],
 ['clearPrimary',(p,id)=>clearWhatsappPrimaryTransport({prisma:p,clientId:id})],
 ['startReplacement',(p,id)=>startWhatsappNumberReplacement({prisma:p,clientId:id,actorUserId:'synthetic',requestId:crypto.randomUUID(),targetNumber:'5581000000001'})],
 ['cancelReplacement',(p,id)=>cancelWhatsappNumberReplacement({prisma:p,clientId:id,actorUserId:'synthetic',requestId:crypto.randomUUID()})],
 ['completeReplacement',(p,id)=>completeWhatsappNumberReplacementIfMatched({prisma:p,clientId:id,actorUserId:'synthetic',requestId:crypto.randomUUID(),confirmedNumber:'5581000000001',source:'synthetic'})],
);
for(const [name,writer] of setters)test(`revocation and independent keys survive delayed ${name}`,async()=>{
 const id=await fixture({[flag]:true,unknown:{keep:true},whatsappPrimaryTransport:'web_session',webSessionAuthorization:{status:'AUTHORIZED',authorizedNumberCanonical:'5581000000000'},whatsappNumberReplacement:{status:'ACTIVE',targetNumberCanonical:'5581000000001'}});
 const entered=deferred(),release=deferred();
 const revocation=withLockedTenantOperationalConfig(a,id,async tx=>{
  const row=await tx.tenantOperationalConfig.findUniqueOrThrow({where:{clientId:id}});
  await tx.tenantOperationalConfig.update({where:{clientId:id},data:{config:{...(row.config as object),[flag]:false}}});
  entered.resolve();await release.promise;
 });
 await entered.promise; const pending=writer(b,id);
 try{await waitForBlockedWriter();}finally{release.resolve();}
 await Promise.all([revocation,pending]);
 const result=await read(id);assert.equal(result[flag],false);assert.deepEqual(result.unknown,{keep:true});
 if(name==='clearPrimary'||name==='startReplacement')assert(!('whatsappPrimaryTransport' in result));
 if(name==='cancelReplacement'||name==='completeReplacement')assert(!('whatsappNumberReplacement' in result));
});

test('concurrent array additions/edits preserve siblings, null and false',async()=>{
 const id=await fixture({[flag]:false});
 const [one,two]=await Promise.all([a,b].map((p,i)=>createCannedReply({prisma:p,clientId:id,userId:'synthetic',input:{title:`Reply ${i}`,body:`Body ${i}`,category:null}})));
 await Promise.all([updateCannedReply({prisma:a,clientId:id,userId:'synthetic',replyId:one.id,input:{body:'Updated'}}),updateCannedReply({prisma:b,clientId:id,userId:'synthetic',replyId:two.id,input:{title:'Second'}})]);
 const replies=await listCannedReplies({prisma:a,clientId:id,includeInactive:true});assert.equal(replies.length,2);assert.equal(replies.find(x=>x.id===one.id)?.body,'Updated');assert.equal(replies.find(x=>x.id===two.id)?.title,'Second');assert.equal((await read(id))[flag],false);
 await config.saveAiIntentQualificationSettings({prisma:a,clientId:id,settings:{aiQualification:undefined}});
 assert.equal((await read(id)).aiIntentQualification.aiQualification,null);
});

test('absent update-only row: concurrent insertion cannot turn no-op into an unlocked write', async () => {
 const id=await fixture(); const entered=deferred(),release=deferred(); let callbackRan=false;
 const delayed=a.$extends({query:{$allOperations:async ({operation,args,query})=>{
  const result=await query(args);
  if(operation==='$queryRaw'){entered.resolve();await release.promise;}
  return result;
 }}});
 const pending=withLockedTenantOperationalConfig(delayed as unknown as PrismaClient,id,async()=>{callbackRan=true;return 'unexpected';},{createIfMissing:false,onMissing:()=> 'absent'});
 await entered.promise;
 try {await setFlag(b,id,false);} finally {release.resolve();}
 assert.equal(await pending,'absent');assert.equal(callbackRan,false);assert.deepEqual(await read(id),{[flag]:false});
});
