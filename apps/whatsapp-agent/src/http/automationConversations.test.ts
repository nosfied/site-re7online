import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPrisma } from "../db.js";
import { syncUserDepartmentMemberships } from "../users/departmentMemberships.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
import { saveAgentSignatureSettings, saveAllowAgentOwnClosedConversations, saveAllowAutomationConversationsInInbox } from "../config/tenantOperationalConfig.js";
import { resolveRealtimeAgentReaders } from "../realtime/agentReadAccess.js";
import { WebSocket } from "ws";
import { storeWebSessionMediaFile } from "../media/webSessionMedia.js";
import { attachRealtimeWebSocket } from "../realtime/websocket.js";
import { addConnection, closeRealtimeConnectionsForClient, publishRealtimeEvent, publishRealtimeEventAsync } from "../realtime/hub.js";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
assert(
  url.protocol === "postgresql:"
    && ["127.0.0.1", "localhost"].includes(url.hostname)
    && /^\d+$/.test(url.port)
    && url.pathname.startsWith("/re7_"),
  "synthetic local DB required",
);
const prisma = getPrisma();
const prefix = `bot-inbox-local-${crypto.randomUUID()}`;
let server: Server, base = "", cwd = process.cwd(), temp = "";
let client: any, other: any, department: any, queue: any, a: any, b: any, supervisor: any, admin: any, outsider: any;
const fixtures: any[] = [];
async function user(clientId: string, role: string, name: string) {
 const row = await prisma.user.create({ data: { clientId, role, name, email: `${prefix}-${name}@example.test`, isActive: true, departmentId: department.id } });
 await prisma.appAuthSession.create({ data: { id: `${row.id}-session`, userId: row.id, clientId, expiresAt: buildAppAuthSessionExpiresAt() } });
 return row;
}
async function request(method: string, route: string, actor = a, body?: unknown) {
 const response = await fetch(base + route, { method, headers: { authorization: `Bearer ${issueClientAuthToken(actor, `${actor.id}-session`)}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 return { status: response.status, body: await response.json() as any };
}
async function fixture(owner = a, tenant = client) {
 const waId = `5581${String(1000000 + fixtures.length).padStart(7, "0")}`;
 const closedAt = new Date("2026-09-28T12:00:00Z"), issuedAt = "2026-09-27T10:00:00Z";
 const cycle = { cycleId: crypto.randomUUID(), protocol: `CVT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`, issuedAt, closedAt: closedAt.toISOString(), source: "synthetic", closeReason: "closed", closeSource: "test" };
 const conversation = await prisma.conversation.create({ data: { clientId: tenant.id, waId, waIdCanonical: waId, channel: "whatsapp", provider: "web_session", lastInboundAt: new Date("2026-09-28T11:00:00Z"), historyVisibleAfter: new Date("2026-09-26T00:00:00Z") } });
 const state = await prisma.conversationRuntimeState.create({ data: { clientId: tenant.id, waId, waIdCanonical: waId, firstSeenAt: new Date(issuedAt), lastInboundAt: new Date("2026-09-28T11:00:00Z"), status: "CLOSED", closedAt, mode: "BOT", answers: { lastClosedServiceCycle: cycle }, handoffActivatedAt: new Date(issuedAt) } });
 const snapshot = await prisma.completedServiceSnapshot.create({ data: { clientId: tenant.id, conversationId: conversation.id, cycleId: cycle.cycleId, protocol: cycle.protocol, closedAt, assignedUserId: owner.id, closedByUserId: supervisor.id, departmentId: department.id, queueId: queue.id } });
 for (const [suffix, createdAt, bodyText] of [["old", "2026-09-25T12:00:00Z", "private before cutoff"], ["previous", "2026-09-27T11:00:00Z", "history from previous attendant"], ["current", "2026-09-28T11:00:00Z", "current service"]]) {
  await prisma.inboundMessage.create({ data: { clientId: tenant.id, waId, waIdCanonical: waId, messageId: `${state.id}-${suffix}`, type: "TEXT", bodyText, allowlistHit: true, rawPayload: {}, createdAt: new Date(createdAt) } });
 }
 const value = { waId, conversation, state, snapshot, cycle, route: `/app/conversation/${waId}` };fixtures.push(value);return value;
}
const settingsRoute = "/app/settings/inbox/automation-conversations";
test.before(async () => {
 temp = await mkdtemp(path.join(os.tmpdir(), "re7-bot-inbox-local-")); process.chdir(temp);
 process.env.WEB_SESSION_MEDIA_ROOT = path.join(temp,"media");
 client = await prisma.client.create({ data: { clientKey: prefix, name: "Synthetic automation", features: { operationalServiceMessages: false } } });
 other = await prisma.client.create({ data: { clientKey: prefix + "-other", name: "Synthetic other" } });
 department = await prisma.department.create({ data: { clientId: client.id, name: "Atendimento", slug: "atendimento" } });
 queue = await prisma.queue.create({ data: { clientId: client.id, departmentId: department.id, name: "Synthetic queue" } });
 await prisma.department.update({ where: { id: department.id }, data: { operationalQueueId: queue.id } });
 a=await user(client.id,"AGENT","Agent-A");b=await user(client.id,"AGENT","Agent-B");supervisor=await user(client.id,"SUPERVISOR","Supervisor");admin=await user(client.id,"ADMIN","Admin");outsider=await user(other.id,"AGENT","Outsider");
 await mkdir(path.join(temp,".data"));await writeFile(path.join(temp,".data/tenants.json"),JSON.stringify(Object.fromEntries([client,other].map(c=>[c.clientKey,{id:c.clientKey,name:c.name,metaPhoneNumberId:"synthetic",allowlist:[],handoffAttendantWaid:"",defaultLanguage:"pt_BR"}]))));
 const {handleRequest}=await import("./routes.js");server=createServer((req,res)=>{void handleRequest(req,res).catch(()=>{res.writeHead(500);res.end('{}');});});
 attachRealtimeWebSocket(server);
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address() as {port:number};base=`http://127.0.0.1:${address.port}`;
});
test.after(async()=>{
 for(const c of [client,other])if(c)closeRealtimeConnectionsForClient(c.id,"test_complete");
 if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
 await prisma.$disconnect();process.chdir(cwd);
 // Synthetic DB and temp fixtures retained for diagnostics, never production.
});


const realFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = ((input: any, init: any) => {
 const target = new URL(typeof input === "string" ? input : input.url ?? String(input));
 if (!["127.0.0.1","localhost"].includes(target.hostname)) { externalCalls++; throw new Error("External provider prohibited in local tests"); }
 return realFetch(input, init);
}) as typeof fetch;
async function bot(provider = "meta", tenant = client) {
 const f = await fixture(a, tenant);
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"BOT",status:"WAITING",closedAt:null,handoffStatus:"NONE",handoffActivatedAt:null,answers:{},provider,departmentId:null,queueId:null,assignedUserId:null,assignedAt:null}});
 await prisma.conversation.update({where:{id:f.conversation.id},data:{provider}});
 return f;
}
async function enable(value: boolean) { return request("PUT",settingsRoute,admin,{allowAutomationConversationsInInbox:value}); }

test("default false; ADMIN setter only, scope isolation and unrelated fields preserved",async()=>{
 const f=await bot();
 assert.equal((await request("GET",settingsRoute,supervisor)).body.allowAutomationConversationsInInbox,false);
 for(const actor of [a,supervisor]) assert.equal((await request("PUT",settingsRoute,actor,{allowAutomationConversationsInInbox:true})).status,403);
 assert.equal((await request("GET",f.route,admin)).status,404);
 assert.equal((await request("PUT",settingsRoute,admin,{allowAutomationConversationsInInbox:true,allowAgentOwnClosedConversations:true})).status,400);
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});
 assert.equal((await enable(true)).status,200);
 const config:any=(await prisma.tenantOperationalConfig.findUniqueOrThrow({where:{clientId:client.id}})).config;
 assert.equal(config.allowAgentOwnClosedConversations,true);
 assert.equal(await prisma.tenantOperationalConfig.count({where:{clientId:other.id}}),0);
});

test("Meta/IA and WEB_SESSION BOT: manager tenant-wide read; Automation only, not ALL or human counts; no runtime mutation",async()=>{
 for(const provider of ["meta","web_session"]){
  const f=await bot(provider); const before=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}});
  for(const actor of [admin,supervisor]){
   const list=await request("GET","/app/conversations?automation=true",actor);
   assert.equal(list.status,200);assert(list.body.items.some((i:any)=>i.waId===f.waId),JSON.stringify(list.body));
   assert(list.body.filterCounts.AUTOMATION>=1);assert.equal(list.body.filterCounts.ALL,0);assert.equal(list.body.filterCounts.WAITING,0);
   assert.equal((await request("GET","/app/conversations",actor)).body.items.some((i:any)=>i.waId===f.waId),false);
   for(const suffix of ["","/timeline"]){const r=await request("GET",f.route+suffix,actor);assert.equal(r.status,200,JSON.stringify(r));assert(!JSON.stringify(r.body).includes("private before cutoff"));}
  }
  assert.equal((await request("GET",f.route,a)).status,404);
  assert.equal((await request("GET",f.route,outsider)).status,404);
  assert.equal((await request("POST",f.route+"/read-state",supervisor,{unread:false})).status,403);
  assert.deepEqual(await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}}),before);
 }
});

test("consent exchange is visible in Automation and follows an authorized human handoff without exposing other management content",async()=>{
 await enable(true);
 const f=await bot("web_session");
 const messages=[
  ["prompt","consent_prompt","consent-question"],
  ["positive","consent_positive","consent-positive"],
  ["negative","consent_negative","consent-negative"],
  ["invalid","consent_invalid","consent-invalid-hidden"],
  ["internal","internal_management_note","internal-management-hidden"],
 ] as const;
 for(const [suffix,kind,bodyText] of messages){
  await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId:`${f.state.id}-${suffix}`,type:"TEXT",bodyText,allowlistHit:true,rawPayload:{inboxVisibility:"management_only",inboxInteractionKind:kind}}});
 }
 const assertConsentProjection=(body:unknown)=>{
  const serialized=JSON.stringify(body);
  for(const visible of ["consent-question","consent-positive","consent-negative"])assert(serialized.includes(visible),serialized);
  for(const hidden of ["consent-invalid-hidden","internal-management-hidden"])assert(!serialized.includes(hidden),serialized);
 };
 for(const actor of [admin,supervisor]){
  for(const suffix of ["","/timeline"]){const r=await request("GET",f.route+suffix,actor);assert.equal(r.status,200,JSON.stringify(r));assertConsentProjection(r.body);}
  assert.equal((await request("GET",f.route+"/messages/"+f.state.id+"-prompt/media",actor)).status,404);
 }
 assert.equal((await request("GET",f.route,a)).status,404);
 assert.equal((await request("GET",f.route,outsider)).status,404);
 assert.equal((await request("GET","/app/conversations",admin)).body.items.some((item: { waId?: string })=>item.waId===f.waId),false);

 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"HUMAN",handoffStatus:"ACTIVE",status:"IN_PROGRESS",departmentId:department.id,queueId:queue.id,assignedUserId:a.id,assignedAt:new Date(),handoffActivatedAt:new Date()}});
 for(const actor of [a,admin,supervisor]){
  for(const suffix of ["","/timeline"]){const r=await request("GET",f.route+suffix,actor);assert.equal(r.status,200,JSON.stringify(r));assertConsentProjection(r.body);}
 }
 assert.equal((await request("GET",f.route,outsider)).status,404);
 assert.equal((await request("GET","/app/conversations?automation=true",admin)).body.items.some((item: { waId?: string })=>item.waId===f.waId),false);
 assert((await request("GET","/app/conversations",a)).body.items.some((item: { waId?: string })=>item.waId===f.waId));
});

test("revocation blocks direct/list reads and cannot be restored by later signature write",async()=>{
 const f=await bot();assert.equal((await enable(false)).status,200);
 await saveAgentSignatureSettings({prisma,clientId:client.id,settings:{enabled:true,mode:"user_name",format:"bold_line"}} as any);
 for(const actor of [admin,supervisor]){
  assert.equal((await request("GET",f.route,actor)).status,404);
  assert.equal((await request("GET","/app/conversations?automation=true",actor)).body.items.length,0);
 }
 assert.equal((await request("GET",settingsRoute,admin)).body.allowAutomationConversationsInInbox,false);
 await enable(true);
});

test("human WAITING and accepted handoffs are not automation; CLOSED excluded; reentry BOT returns only to automation",async()=>{
 const f=await bot();
 for(const data of [{mode:"HUMAN",handoffStatus:"ACTIVE",status:"WAITING",departmentId:department.id,queueId:queue.id},{mode:"BOT",handoffStatus:"ACTIVE",status:"WAITING",departmentId:department.id,queueId:queue.id},{mode:"BOT",handoffStatus:"NONE",status:"CLOSED",closedAt:new Date()}]){
  await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:data as any});
  assert.equal((await request("GET","/app/conversations?automation=true",admin)).body.items.some((i:any)=>i.waId===f.waId),false);
 }
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"BOT",handoffStatus:"NONE",status:"WAITING",closedAt:null,departmentId:null,queueId:null}});
 assert((await request("GET","/app/conversations?automation=true",admin)).body.items.some((i:any)=>i.waId===f.waId));
 assert.equal(externalCalls,0);
});

test("BOT realtime is content-free manager invalidation, excludes AGENT/other tenant, and stops after revocation",async()=>{
 const f=await bot("web_session");await enable(true);const seen=new Map<string,string[]>();
 for(const actor of [a,admin,supervisor,outsider]){
  const values:string[]=[];seen.set(actor.id,values);
  const socket={readyState:WebSocket.OPEN,on(){return this;},send(v:string){values.push(v);},close(){},ping(){},terminate(){}} as unknown as WebSocket;
  addConnection(socket,{userId:actor.id,clientId:actor.clientId,email:actor.email,role:actor.role});
 }
 const event:any={type:"message.created",clientId:client.id,waId:f.waId,mode:"BOT",handoffStatus:"none",humanInboxVisible:false,message:{inboxVisibility:"management_only",bodyText:"never expose this event",createdAt:new Date().toISOString()}};
 await publishRealtimeEventAsync(event);
 for(const actor of [admin,supervisor]){assert.equal(seen.get(actor.id)!.length,1);assert.equal(JSON.parse(seen.get(actor.id)![0]).type,"inbox.access.updated");assert(!seen.get(actor.id)![0].includes("never expose"));}
 assert.equal(seen.get(a.id)!.length,0);assert.equal(seen.get(outsider.id)!.length,0);
 await enable(false);for(const values of seen.values())values.length=0;
 await publishRealtimeEventAsync(event);for(const values of seen.values())assert.equal(values.length,0);
 closeRealtimeConnectionsForClient(client.id,"test_complete");closeRealtimeConnectionsForClient(other.id,"test_complete");await enable(true);
});

test("explicit existing claim retains department authorization; eligible manager claim moves BOT into human work",async()=>{
 const f=await bot();
 assert.equal((await request("GET",f.route,supervisor)).status,200);
 assert.equal((await request("POST",f.route+"/claim",supervisor,{})).status,403);
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{departmentId:department.id,queueId:queue.id}});
 const claimed=await request("POST",f.route+"/claim",supervisor,{});assert.equal(claimed.status,200,JSON.stringify(claimed.body));
 const state=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}});
 assert.equal(state.mode,"HUMAN");assert.equal(state.handoffStatus,"ACTIVE");assert.equal(state.status,"IN_PROGRESS");assert.equal(state.assignedUserId,supervisor.id);
 assert(!(await request("GET","/app/conversations?automation=true",supervisor)).body.items.some((i:any)=>i.waId===f.waId));
 assert((await request("GET","/app/conversations",supervisor)).body.items.some((i:any)=>i.waId===f.waId));
 assert.equal(externalCalls,0);
});

test("automation local media enforces history cutoff, role and revocation",async()=>{
 const f=await bot("web_session"),messageId=f.state.id+"-public-media";
 const content=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=","base64");
 const media=await storeWebSessionMediaFile({clientId:client.id,messageId,content,mimeType:"image/png",fileName:"synthetic.png",kind:"image"});
 const msg=await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId,type:"IMAGE",allowlistHit:true,rawPayload:{media},createdAt:new Date("2026-09-28T11:00:00Z")}});
 const read=async(actor:any)=>fetch(base+f.route+"/messages/"+messageId+"/media",{headers:{authorization:`Bearer ${issueClientAuthToken(actor,`${actor.id}-session`)}`}});
 for(const actor of [admin,supervisor]){const r=await read(actor);assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"private, no-store");assert.deepEqual(Buffer.from(await r.arrayBuffer()),content);}
 for(const actor of [a,outsider])assert.equal((await read(actor)).status,404);
 await prisma.inboundMessage.update({where:{id:msg.id},data:{createdAt:new Date("2026-09-25T00:00:00Z")}});assert.equal((await read(admin)).status,404);
 await prisma.inboundMessage.update({where:{id:msg.id},data:{createdAt:new Date("2026-09-28T11:00:00Z")}});
 await enable(false);assert.equal((await read(supervisor)).status,404);await enable(true);
});

test("delayed signature writer cannot restore automation permission after real setter revocation",async()=>{
 let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>entered=r),proceed=new Promise<void>(r=>release=r);
 const delayed=prisma.$extends({query:{tenantOperationalConfig:{async findUnique({args,query}){const result=await query(args);entered();await proceed;return result;}}}});
 const pending=saveAgentSignatureSettings({prisma:delayed as any,clientId:client.id,settings:{enabled:true,mode:"user_name",format:"bold_line"}});
 await reached;const revoke=saveAllowAutomationConversationsInInbox({prisma,clientId:client.id,enabled:false});
 release();await Promise.all([pending,revoke]);
 assert.equal((await request("GET",settingsRoute,admin)).body.allowAutomationConversationsInInbox,false);await enable(true);
});

test("existing explicit transfer retains human lifecycle and does not depend on view flag",async()=>{
 const f=await bot();await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{departmentId:department.id,queueId:queue.id}});
 const r=await request("POST",f.route+"/transfer",admin,{userId:b.id});assert.equal(r.status,200,JSON.stringify(r.body));
 const state=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}});assert.equal(state.mode,"HUMAN");assert.equal(state.assignedUserId,b.id);assert.equal(state.status,"IN_PROGRESS");
 assert.equal(externalCalls,0);
});

test("audit: delayed BOT event never becomes human content after CLOSED/HUMAN, aliases or revocation",async()=>{
 const {setPrismaForTesting}=await import("../db.js");
 for(const status of ["CLOSED","IN_PROGRESS"]) for(const enabled of [true,false]){
  const f=await bot();await enable(enabled);const seen:string[]=[];
  const socket={readyState:WebSocket.OPEN,on(){return this;},send(v:string){seen.push(v);},close(){},ping(){},terminate(){}} as unknown as WebSocket;
  addConnection(socket,{userId:supervisor.id,clientId:client.id,email:supervisor.email,role:supervisor.role});
  let enter!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let once=true;
  const delayed=prisma.$extends({query:{conversationRuntimeState:{async findFirst({args,query}){if(once){once=false;enter();await gate;}return query(args);}}}});
  setPrismaForTesting(delayed as any);
  const event:any={type:"message.created",clientId:client.id,waId:f.waId+"@s.whatsapp.net",waIdCanonical:f.waId,mode:"BOT",handoffStatus:"none",humanInboxVisible:false,message:{inboxVisibility:"management_only",bodyText:"restricted-old-bot",createdAt:new Date().toISOString()}};
  const pending=publishRealtimeEventAsync(event);
  await reached;await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{status:status as any,mode:status==="CLOSED"?"BOT":"HUMAN",handoffStatus:status==="CLOSED"?"NONE":"ACTIVE"}});release();await pending;setPrismaForTesting(prisma);
  assert(!seen.some(x=>x.includes("restricted-old-bot")),JSON.stringify({status,enabled,seen}));
  if(!enabled)assert.equal(seen.length,0);
  seen.length=0;
  if(status==="IN_PROGRESS"){
   await publishRealtimeEventAsync({...event,waId:f.waId,mode:"HUMAN",handoffStatus:"active",humanInboxVisible:true,message:{...event.message,inboxVisibility:"human_timeline",bodyText:"legitimate-human"}});
   assert(seen.some(x=>x.includes("legitimate-human")));
  }
  if(status==="CLOSED"){
   await publishRealtimeEventAsync({type:"conversation.handoff.updated",clientId:client.id,waId:f.waId,mode:"BOT",status:"CLOSED",handoffStatus:"none",updatedAt:new Date().toISOString(),reason:"legitimate-closure"});
   assert(seen.some(x=>x.includes("legitimate-closure")));
  }
  closeRealtimeConnectionsForClient(client.id,"test_complete");
 }
});

test("audit: REST BOT grant cannot survive transition or revocation between authorization and builder/media",async()=>{
 const {setPrismaForTesting}=await import("../db.js");
 const outsideDepartment=await prisma.department.create({data:{clientId:client.id,name:"Outside",slug:"outside-audit"}});
 for(const suffix of ["","/timeline","/media-audit"]) for(const change of ["human","revoke"]){
  await enable(true);const f=await bot("web_session");
  let route=f.route+suffix;
  if(suffix==="/media-audit"){
   const id=f.state.id+"-audit-media",content=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=","base64");
   const media=await storeWebSessionMediaFile({clientId:client.id,messageId:id,content,mimeType:"image/png",fileName:"synthetic.png",kind:"image"});
   await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId:id,type:"IMAGE",allowlistHit:true,rawPayload:{media}}});
   route=f.route+"/messages/"+id+"/media";
  }
  let enter!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let once=true;
  const delayed=prisma.$extends({query:{tenantOperationalConfig:{async findUnique({args,query}){const row=await query(args);if(once){once=false;enter();await gate;}return row;}}}});
  setPrismaForTesting(delayed as any);
  const pending=fetch(base+route,{headers:{authorization:`Bearer ${issueClientAuthToken(supervisor,`${supervisor.id}-session`)}`}});
  await reached;
  if(change==="human")await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"HUMAN",status:"IN_PROGRESS",handoffStatus:"ACTIVE",departmentId:outsideDepartment.id,assignedUserId:b.id,assignedAt:new Date()}});
  else await saveAllowAutomationConversationsInInbox({prisma,clientId:client.id,enabled:false});
  release();const result=await pending;const body=await result.text();setPrismaForTesting(prisma);
  assert([403,404].includes(result.status),JSON.stringify({suffix,change,status:result.status,body}));
  assert(!body.includes("current service"));
 }
});

test("audit: revocation or handoff after payload/media lookup is denied before response headers",async()=>{
 const {setPrismaForTesting}=await import("../db.js");
 for(const kind of ["detail","timeline","media"]) for(const revoke of [true,false]){
  await enable(true);const f=await bot("web_session");let route=f.route+(kind==="timeline"?"/timeline":"");
  if(kind==="media"){
   const id=f.state.id+"-late-media",content=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=","base64");
   const media=await storeWebSessionMediaFile({clientId:client.id,messageId:id,content,mimeType:"image/png",fileName:"synthetic.png",kind:"image"});
   await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId:id,type:"IMAGE",allowlistHit:true,rawPayload:{media}}});
   route=f.route+"/messages/"+id+"/media";
  }
  let enter!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let once=true;
  const pause=async(result:any)=>{if(once){once=false;enter();await gate;}return result;};
  const delayed=prisma.$extends({query:{inboundMessage:{async findMany({args,query}){const r=await query(args);return kind!=="media"?pause(r):r;},async findFirst({args,query}){const r=await query(args);return kind==="media"?pause(r):r;}}}});
  setPrismaForTesting(delayed as any);
  const pending=fetch(base+route,{headers:{authorization:`Bearer ${issueClientAuthToken(supervisor,`${supervisor.id}-session`)}`}});
  await reached;
  if(revoke)await saveAllowAutomationConversationsInInbox({prisma,clientId:client.id,enabled:false});
  else await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"HUMAN",status:"IN_PROGRESS",handoffStatus:"ACTIVE",assignedUserId:b.id,assignedAt:new Date(),departmentId:null}});
  release();const response=await pending;const body=await response.text();setPrismaForTesting(prisma);
  assert.equal(response.status,404,JSON.stringify({kind,revoke,body}));assert(!body.includes("current service"));
 }
});

test("audit: unchanged BOT grant remains readable without mutation and human reads keep their rules",async()=>{
 await enable(true);const f=await bot();const before=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}});
 for(const actor of [admin,supervisor])for(const suffix of ["","/timeline"]){
  const r=await request("GET",f.route+suffix,actor);assert.equal(r.status,200);assert(!JSON.stringify(r.body).includes("private before cutoff"));
 }
 assert.deepEqual(await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:f.state.id}}),before);
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{mode:"HUMAN",handoffStatus:"ACTIVE",status:"IN_PROGRESS",departmentId:department.id,queueId:queue.id,assignedUserId:supervisor.id,assignedAt:new Date()}});
 await enable(false);
 for(const suffix of ["","/timeline"])assert.equal((await request("GET",f.route+suffix,supervisor)).status,200);
});
