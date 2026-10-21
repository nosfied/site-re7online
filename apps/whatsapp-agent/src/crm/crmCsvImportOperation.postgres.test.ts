import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { executeCrmImportOperation as execute, readCrmImportOperation as read, IMPORT_EVENTS, CrmImportOperationError } from "./crmCsvImportOperation.js";
import { previewCrmContactCsvImport, upsertCrmContact } from "./crmContactUpsert.js";
import { buildCrmContactsPayload, selectCrmContactsPage } from "./crmContactsReadModel.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.port,"55781"); assert.equal(url.pathname,"/retention_lab");
const db = new PrismaClient(); const clients: string[] = [];
const phone = (n: number) => `55849${10000000+n}`;
async function fixture(csv = `phone,name\n${phone(1)},Synthetic`) {
 const clientId=randomUUID();clients.push(clientId);await db.client.create({data:{id:clientId,clientKey:clientId,name:"synthetic CSV"}});
 return {clientId,operationId:randomUUID(),actorUserId:randomUUID(),requestId:randomUUID(),csvText:csv,mapping:{phoneColumn:"phone",nameColumn:"name"}};
}
function intercept(onCreate:(data:any,run:()=>Promise<any>)=>Promise<any>,afterCommit=false) {
 return new Proxy(db,{get(target,key){
  if(key!=="$transaction"){const value=(target as any)[key];return typeof value==="function"?value.bind(target):value;}
  return async(work:any,options:any)=>{
   let terminal=false;
   const result=await target.$transaction(async tx=>work(new Proxy(tx,{get(t,k){
    if(k!=="event")return (t as any)[k];
    return new Proxy(t.event,{get(e,p){if(p!=="create")return (e as any)[p];return async(args:any)=>{
     if(args.data.eventName===IMPORT_EVENTS.finished)terminal=true;
     return onCreate(args.data,()=>t.event.create(args));
    };}});
   }})),options);
   if(afterCommit&&terminal)throw new Error("synthetic lost commit response");return result;
  };
 }});
}
test.after(async()=>{
 for(const clientId of clients){await db.event.deleteMany({where:{clientId}});await db.conversation.deleteMany({where:{clientId}});await db.lead.deleteMany({where:{tenantId:clientId}});await db.contactChannelIdentity.deleteMany({where:{clientId}});await db.contact.deleteMany({where:{clientId}});await db.client.delete({where:{id:clientId}});}
 await db.$disconnect();
});
test("993 =880 eligible+82 invalid+31 duplicates;879 new+1 updated;recover summary without writes",async()=>{
 const rows=Array.from({length:880},(_,i)=>`${phone(i)},Imported ${i}`);
 const p=await fixture(['phone,name',...rows,...Array.from({length:82},(_,i)=>`invalid${i},Invalid`),...rows.slice(0,31)].join('\n'));
 await upsertCrmContact(db,{clientId:p.clientId,input:{phone:phone(879),name:"Before"},actorUserId:p.actorUserId,requestId:randomUUID(),source:"crm_manual",audit:false});
 const preview=await previewCrmContactCsvImport(db,p);assert.equal(preview.totalRows,993);assert.equal(preview.readyToImport,880);assert.equal(preview.invalidRows,82);assert.equal(preview.duplicatesInFile,31);assert.equal(preview.rows.length,200);assert.equal(preview.sample.truncated,true);
 const result=await execute(db,p);assert.equal(result.status,"COMPLETED");const s=result.summary!;
 assert.equal(s.received,993);assert.equal(s.created,879);assert.equal(s.updated,1);assert.equal(s.unchanged,0);assert.equal(s.invalid,82);assert.equal(s.duplicates,31);
 assert.equal(s.created+s.updated+s.unchanged+s.invalid+s.invalidCrmStatuses+s.duplicates+s.excludedContacts+s.provisionalContacts+s.identityConflicts+s.failed,993);
 const before=await db.event.count({where:{clientId:p.clientId}});assert.deepEqual((await read(db,p.clientId,p.operationId)).summary,s);assert.deepEqual((await execute(db,p)).summary,s);assert.equal(await db.event.count({where:{clientId:p.clientId}}),before);
 const next=await execute(db,{...p,operationId:randomUUID()});assert.equal(next.summary?.unchanged,880);assert.equal(next.summary?.created,0);
 await assert.rejects(()=>execute(db,{...p,csvText:p.csvText+'\n'+phone(9999)+',Changed'}),(e:unknown)=>e instanceof CrmImportOperationError&&e.code==='import_operation_payload_mismatch');
});
test("invalid CSV proven failed before rows;missing operation remains UNKNOWN",async()=>{
 const p=await fixture('');assert.equal((await execute(db,p)).status,"FAILED");assert.equal(await db.contact.count({where:{clientId:p.clientId}}),0);assert.equal((await read(db,p.clientId,randomUUID())).status,"UNKNOWN");
});
test("row+audit+progress atomic;second row failure leaves first committed UNKNOWN;no replay;tenant isolated",async()=>{
 const p=await fixture(`phone,name\n${phone(1)},One\n${phone(2)},Two`);let once=false;
 const wrapped=intercept(async(data,run)=>{if(data.eventName===IMPORT_EVENTS.row&&data.payloadJson.rowNumber===3&&!once){once=true;throw new Error('synthetic ledger unavailable');}return run();});
 const result=await execute(wrapped,p);assert.equal(result.status,"UNKNOWN");assert.equal(result.progress?.processed,1);assert.equal(await db.contact.count({where:{clientId:p.clientId}}),1);assert.equal(await db.event.count({where:{clientId:p.clientId,eventName:'crm.contact.created'}}),1);
 const before=await db.event.count({where:{clientId:p.clientId}});assert.equal((await execute(db,p)).status,"UNKNOWN");assert.equal(await db.event.count({where:{clientId:p.clientId}}),before);
 await assert.rejects(()=>execute(db,{...p,operationId:randomUUID()}),(e:unknown)=>e instanceof CrmImportOperationError&&e.code==='import_unresolved');
 const other=await fixture();assert.equal((await read(db,other.clientId,p.operationId)).status,"UNKNOWN");assert.equal((await execute(db,other)).status,"COMPLETED");
});
test("concurrent duplicate reads progress;different operation denied;delayed original completes once",async()=>{
 const p=await fixture();let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
 const wrapped=intercept(async(data,run)=>{if(data.eventName===IMPORT_EVENTS.row){entered();await gate;}return run();});
 const running=execute(wrapped,p);await ready;
 try{assert.equal((await execute(db,p)).status,"PROCESSING");await assert.rejects(()=>execute(db,{...p,operationId:randomUUID()}),(e:unknown)=>e instanceof CrmImportOperationError&&e.operationId===p.operationId);}finally{release();}
 assert.equal((await running).status,"COMPLETED");assert.equal(await db.contact.count({where:{clientId:p.clientId}}),1);
});
test("lost final commit response recovered as COMPLETED from durable receipt",async()=>{
 const p=await fixture();const result=await execute(intercept(async(_d,run)=>run(),true),p);assert.equal(result.status,"COMPLETED");assert.equal(result.summary?.created,1);assert.equal((await read(db,p.clientId,p.operationId)).summary?.created,1);
});
test("stale processing is UNKNOWN without failed/rollback receipt",async()=>{
 const p=await fixture();await db.event.create({data:{clientId:p.clientId,eventName:IMPORT_EVENTS.started,requestId:p.operationId,payloadJson:{inputHash:'synthetic'},createdAt:new Date('2020-01-01')}});const r=await read(db,p.clientId,p.operationId);assert.equal(r.status,"UNKNOWN");assert.equal(r.summary,null);
});
test("read model keyset pagination counts beyond old candidate cap without duplicates;other tenant empty",async()=>{
 const p=await fixture();await db.lead.createMany({data:Array.from({length:4105},(_,i)=>({tenantId:p.clientId,waId:phone(i),name:i<4100?'Synthetic':'Target',status:'NEW'}))});
 const list=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50},statuses:[]});assert.equal(list.pagination.total,4105);assert.equal(list.items.length,50);
 assert.ok(list.pageInfo.nextCursor);const second=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:2,limit:50,cursor:list.pageInfo.nextCursor},statuses:[]});assert.equal(second.pagination.total,4105);assert.equal(second.items.length,50);assert.equal(new Set([...list.items,...second.items].map(item=>item.leadId)).size,100);
 const filtered=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{q:'Target',page:1,limit:50},statuses:[]});assert.equal(filtered.pagination.total,5);assert.equal(filtered.items.length,5);
 const other=await fixture();assert.equal((await buildCrmContactsPayload(db,{clientId:other.clientId,query:{},statuses:[]})).pagination.total,0);
});
test("external ordering keeps tied keyset pages deterministic and an emptied later page preserves total",async()=>{
 const p=await fixture();const tiedAt=new Date("2026-10-20T12:00:00.000Z");
 const ids=Array.from({length:101},(_,i)=>`order-tie-${p.clientId}-${String(i).padStart(3,"0")}`);
 await db.lead.createMany({data:ids.map((id,i)=>({id,tenantId:p.clientId,waId:`order-tie-${i}`,name:`Order tie ${i}`,status:"NEW",createdAt:tiedAt,updatedAt:tiedAt}))});
 const first=await selectCrmContactsPage(db,{clientId:p.clientId,query:{page:1,limit:50},includeAnonymized:false});
 assert.deepEqual(first.rows.map(row=>row.id),ids.slice(0,50));assert.equal(first.total,101);assert.equal(first.hasNextPage,true);assert.ok(first.nextCursor);
 const firstCursor=JSON.parse(Buffer.from(first.nextCursor,"base64url").toString("utf8"));assert.equal(firstCursor.id,ids[49]);
 const second=await selectCrmContactsPage(db,{clientId:p.clientId,query:{page:2,limit:50,cursor:first.nextCursor},includeAnonymized:false});
 assert.deepEqual(second.rows.map(row=>row.id),ids.slice(50,100));assert.equal(second.total,101);assert.equal(second.hasNextPage,true);assert.ok(second.nextCursor);
 assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,100);
 const secondCursor=JSON.parse(Buffer.from(second.nextCursor,"base64url").toString("utf8"));assert.equal(secondCursor.id,ids[99]);
 await db.lead.delete({where:{id:ids[100]}});
 const emptied=await selectCrmContactsPage(db,{clientId:p.clientId,query:{page:3,limit:50,cursor:second.nextCursor},includeAnonymized:false});
 assert.deepEqual(emptied.rows,[]);assert.equal(emptied.total,100);assert.equal(emptied.hasNextPage,false);assert.equal(emptied.nextCursor,null);
});
test("manual SQL search preserves literal LIKE metacharacters, accents and formatted phone semantics",async()=>{
 const p=await fixture();
 const leads=await Promise.all([
  db.lead.create({data:{tenantId:p.clientId,waId:`${phone(6001)}-percent`,name:"Literal % marker",status:"NEW"}}),
  db.lead.create({data:{tenantId:p.clientId,waId:`${phone(6002)}-underscore`,name:"Literal _ marker",status:"NEW"}}),
  db.lead.create({data:{tenantId:p.clientId,waId:`${phone(6003)}-slash`,name:"Literal \\ marker",status:"NEW"}}),
  db.lead.create({data:{tenantId:p.clientId,waId:`${phone(6004)}-accent`,name:"Ação Única",status:"NEW"}}),
  db.lead.create({data:{tenantId:p.clientId,waId:phone(6005),phone:"(84) 91000-6005",name:"Formatted phone",status:"NEW"}}),
  db.lead.create({data:{tenantId:p.clientId,waId:`${phone(6006)}-control`,name:"Plain marker",status:"NEW"}}),
 ]);
 for(const [q,expectedId] of [["%",leads[0].id],["_",leads[1].id],["\\",leads[2].id],["ação",leads[3].id],["(84) 91000-6005",leads[4].id]] as const){
  const result=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{q,page:1,limit:50},statuses:[]});
  assert.equal(result.pagination.total,1,q);assert.deepEqual(result.items.map(item=>item.leadId),[expectedId],q);
 }
});
test("set-based eligibility prefers direct contact and preserves legacy fallback, lifecycle, exclusion, anonymity, conversation and opt-out",async()=>{
 const p=await fixture();
 const direct=await db.contact.create({data:{clientId:p.clientId,waId:phone(7001),externalUserRef:"direct-only",name:"Direct active",lifecycle:"ACTIVE"}});
 const aliasCollision=await db.contact.create({data:{clientId:p.clientId,waId:phone(7002),externalUserRef:"lead-direct",name:"Alias excluded",lifecycle:"ACTIVE",operationallyExcludedAt:new Date()}});
 const identity=await db.contactChannelIdentity.create({data:{clientId:p.clientId,contactId:direct.id,channel:"whatsapp",provider:"web_session",channelAccountId:"test",externalUserHash:randomUUID(),externalUserRef:"lead-direct"}});
 const directLead=await db.lead.create({data:{tenantId:p.clientId,waId:"lead-direct",waIdCanonical:"lead-direct",contactChannelIdentityId:identity.id,name:"Direct lead",status:"NEW"}});
 await db.contact.create({data:{clientId:p.clientId,waId:phone(7003),externalUserRef:"lead-fallback",name:"Fallback active",lifecycle:"ACTIVE"}});
 const fallbackLead=await db.lead.create({data:{tenantId:p.clientId,waId:"lead-fallback",waIdCanonical:"lead-fallback",name:"Fallback lead",status:"NEW"}});
 await db.contact.create({data:{clientId:p.clientId,waId:phone(7004),externalUserRef:"lead-provisional",name:"Fallback provisional",lifecycle:"PROVISIONAL"}});
 await db.lead.create({data:{tenantId:p.clientId,waId:"lead-provisional",waIdCanonical:"lead-provisional",name:"Provisional lead",status:"NEW"}});
 const excluded=await db.contact.create({data:{clientId:p.clientId,waId:phone(7005),externalUserRef:"lead-excluded",name:"Fallback excluded",lifecycle:"ACTIVE",operationallyExcludedAt:new Date()}});
 const excludedLead=await db.lead.create({data:{tenantId:p.clientId,waId:"lead-excluded",waIdCanonical:"lead-excluded",name:"Excluded lead",status:"NEW"}});
 await db.contact.create({data:{clientId:p.clientId,waId:phone(7006),externalUserRef:"lead-anon",name:"Usuario anonimizado",lifecycle:"ACTIVE"}});
 const anonymizedLead=await db.lead.create({data:{tenantId:p.clientId,waId:"lead-anon",waIdCanonical:"lead-anon",name:"Visible lead name",status:"NEW"}});
 await db.conversation.create({data:{clientId:p.clientId,waId:"lead-fallback",waIdCanonical:"lead-fallback"}});
 await db.event.create({data:{clientId:p.clientId,waId:"lead-fallback",waIdCanonical:"lead-fallback",eventName:"contact.opt_out.recorded",payloadJson:{}}});

 const active=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50,operationalStatus:"active"},statuses:[]});
 assert.deepEqual(new Set(active.items.map(item=>item.leadId)),new Set([directLead.id,fallbackLead.id]));
 assert.equal(active.items.find(item=>item.leadId===directLead.id)?.contactId,direct.id);
 assert.ok(!active.items.some(item=>item.contactId===aliasCollision.id));
 const excludedResult=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50,operationalStatus:"excluded"},statuses:[]});
 assert.deepEqual(excludedResult.items.map(item=>item.leadId),[excludedLead.id]);
 assert.equal(excludedResult.items[0]?.contactId,excluded.id);
 const withAnonymized=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50,operationalStatus:"active"},statuses:[],includeAnonymized:true});
 assert.ok(withAnonymized.items.some(item=>item.leadId===anonymizedLead.id));
 const conversation=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50,operationalStatus:"active",hasConversation:true},statuses:[]});
 assert.deepEqual(conversation.items.map(item=>item.leadId),[fallbackLead.id]);
 const optedOut=await buildCrmContactsPayload(db,{clientId:p.clientId,query:{page:1,limit:50,operationalStatus:"active",optOut:true},statuses:[]});
 assert.deepEqual(optedOut.items.map(item=>item.leadId),[fallbackLead.id]);
});
test("only control receipts gain critical protection; no tenant policy changed; recovered errors omit CSV identities",async()=>{
 const {classifyEventRetentionPolicy}=await import('../events/eventRetentionPolicy.js');
 for(const name of Object.values(IMPORT_EVENTS))assert.equal(classifyEventRetentionPolicy(name),'CRITICAL');
 assert.equal(classifyEventRetentionPolicy('crm.contact.import.summary'),'OPERATIONAL');
 const p=await fixture(`phone,name\ninvalid-example,Synthetic private name\n${phone(2)},Other`);const r=await execute(db,p);assert.equal(r.status,'COMPLETED');
 assert.ok(r.summary?.errors.length);assert.equal(r.summary?.errors[0].phoneDisplay,null);assert.ok(!JSON.stringify(r.summary).includes('Synthetic private name'));assert.ok(!JSON.stringify(r.summary).includes('invalid-example'));
});
test("exclusion racing classification rechecks each row and reconciles late skips",async()=>{
 const p=await fixture(`phone,name\n${phone(11)},Changed one\n${phone(12)},Must preserve`);
 for(const n of [11,12])await upsertCrmContact(db,{clientId:p.clientId,input:{phone:phone(n),name:'Before'},actorUserId:p.actorUserId,requestId:randomUUID(),source:'crm_manual',audit:false});
 let once=false;
 const wrapped=intercept(async(data,run)=>{
  if(data.eventName===IMPORT_EVENTS.row&&!once){once=true;await db.contact.updateMany({where:{clientId:p.clientId,waId:phone(12)},data:{operationallyExcludedAt:new Date()}});}return run();
 });
 const result=await execute(wrapped,p);assert.equal(result.status,'COMPLETED');assert.equal(result.summary?.updated,1);assert.equal(result.summary?.excludedContacts,1);assert.equal(result.summary?.readyToImport,2);
 const protectedContact=await db.contact.findFirstOrThrow({where:{clientId:p.clientId,waId:phone(12)}});assert.equal(protectedContact.name,'Before');assert.ok(protectedContact.operationallyExcludedAt);
});
