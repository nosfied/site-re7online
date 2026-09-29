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
import { saveAgentSignatureSettings, saveAllowAgentOwnClosedConversations } from "../config/tenantOperationalConfig.js";
import { resolveRealtimeAgentReaders } from "../realtime/agentReadAccess.js";
import { WebSocket } from "ws";
import { storeWebSessionMediaFile } from "../media/webSessionMedia.js";
import { attachRealtimeWebSocket } from "../realtime/websocket.js";
import { addConnection, closeRealtimeConnectionsForClient, publishRealtimeEvent, publishRealtimeEventAsync } from "../realtime/hub.js";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/re7_secult_"), "synthetic local DB required");
const prisma = getPrisma();
const prefix = `secult-local-${crypto.randomUUID()}`;
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
const settingsRoute = "/app/settings/inbox/closed-conversations";
test.before(async () => {
 temp = await mkdtemp(path.join(os.tmpdir(), "re7-secult-local-")); process.chdir(temp);
 process.env.WEB_SESSION_MEDIA_ROOT = path.join(temp,"media");
 client = await prisma.client.create({ data: { clientKey: prefix, name: "Synthetic SECULT", features: { operationalServiceMessages: false } } });
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

test("default deny, manager-only isolated setting, 35th writer preserves unrelated fields",async()=>{
 const f=await fixture();assert.equal((await request("GET",f.route)).status,404);
 const initial=await request("GET",settingsRoute,supervisor);assert.equal(initial.body.allowAgentOwnClosedConversations,false);
 assert.equal((await request("PUT",settingsRoute,a,{allowAgentOwnClosedConversations:true})).status,403);
 assert.equal(await prisma.tenantOperationalConfig.count({where:{clientId:client.id}}),0);
 assert.equal((await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:true,inboxVisibilityPolicy:"shared"})).status,400);
 assert.equal(await prisma.tenantOperationalConfig.count({where:{clientId:client.id}}),0);
 assert.equal((await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:true})).status,200);
 assert.equal((await request("PUT","/app/settings/agent-signature",supervisor,{enabled:true,inboxVisibilityPolicy:"shared"})).status,403);
 assert.equal((await request("GET",settingsRoute,admin)).body.allowAgentOwnClosedConversations,true);
});

test("own CLOSED in existing list/count/detail/timeline; other owner/tenant denied; privacy cutoff retained",async()=>{
 const own=fixtures[0], theirs=await fixture(b), foreign=await fixture(outsider,other);
 const list=await request("GET","/app/conversations?status=CLOSED");assert.equal(list.status,200);assert.equal(list.body.allowAgentOwnClosedConversations,true);
 assert(list.body.items.some((i:any)=>i.waId===own.waId), JSON.stringify(list.body));assert(!list.body.items.some((i:any)=>i.waId===theirs.waId));assert.equal(list.body.filterCounts.CLOSED,1);
 for(const suffix of ["","/timeline"]){assert.equal((await request("GET",own.route+suffix)).status,200);assert.equal((await request("GET",theirs.route+suffix)).status,404);assert.equal((await request("GET",foreign.route+suffix)).status,404);}
 const detail=await request("GET",own.route);assert(!JSON.stringify(detail.body).includes("private before cutoff"));assert(JSON.stringify(detail.body).includes("history from previous attendant"));
 assert.equal((await request("GET",own.route,outsider)).status,404);
});

test("current closure proof rejects stale cycle/protocol/date, missing owner and active-cycle reentry",async()=>{
 const f=await fixture();const original:any=f.state.answers;
 for(const patch of [{cycleId:"stale"},{protocol:"CVT-AAAAAAAAAAAA"},{closedAt:"2026-09-27T12:00:00.000Z"}]){
  await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{answers:{lastClosedServiceCycle:{...f.cycle,...patch}}}});assert.equal((await request("GET",f.route)).status,404);
 }
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{answers:original}});
 await prisma.completedServiceSnapshot.update({where:{id:f.snapshot.id},data:{assignedUserId:null}});assert.equal((await request("GET",f.route)).status,404);
 await prisma.completedServiceSnapshot.update({where:{id:f.snapshot.id},data:{assignedUserId:a.id}});
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{answers:{...original,operationalProtocol:{...f.cycle,cycleId:crypto.randomUUID()}}}});assert.equal((await request("GET",f.route)).status,404);
});

test("transfer A to B, supervisor closure attributes B; reentry does not grant A or B historical access",async()=>{
 const f=await fixture(b);assert.equal((await request("GET",f.route,a)).status,404);assert.equal((await request("GET",f.route,b)).status,200);
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{status:"IN_PROGRESS",closedAt:null,mode:"HUMAN",assignedUserId:a.id,departmentId:department.id,queueId:queue.id,answers:{operationalProtocol:{...f.cycle,cycleId:crypto.randomUUID()}}}});
 await prisma.tenantOperationalConfig.update({where:{clientId:client.id},data:{config:{allowAgentOwnClosedConversations:true,inboxVisibilityPolicy:"assignee_only_after_assignment"}}});
 assert.equal((await request("GET",f.route,a)).status,200);assert.equal((await request("GET",f.route,b)).status,404);
 assert.equal((await request("GET",f.route,supervisor)).status,200);assert.equal((await request("GET",f.route,admin)).status,200);
});

test("closed actions and read-state denied without runtime/config changes",async()=>{
 const f=fixtures[0];const before=await prisma.conversationRuntimeState.findUnique({where:{id:f.state.id}});
 for(const [suffix,body] of [["send",{text:"not sent"}],["claim",{}],["transfer",{userId:b.id}],["status",{status:"IN_PROGRESS"}],["release",{}],["read-state",{unread:false}] ] as const){
  const result=await request("POST",f.route+"/"+suffix,a,body);assert.equal(result.status,409,`${suffix}: ${JSON.stringify(result.body)}`);
 }
 assert.deepEqual(await prisma.conversationRuntimeState.findUnique({where:{id:f.state.id}}),before);
 assert.equal(await prisma.outboundMessage.count({where:{clientId:client.id}}),0);
});

test("local media is authorized per tenant/current owner, privacy cutoff and revocation",async()=>{
 const f=fixtures[0];const messageId=`${f.state.id}-image`;
 const content=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=","base64");
 const media=await storeWebSessionMediaFile({clientId:client.id,messageId,content,mimeType:"image/png",fileName:"synthetic.png",kind:"image"});
 const msg=await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId,type:"IMAGE",allowlistHit:true,rawPayload:{media},createdAt:new Date("2026-09-28T11:00:00Z")}});
 const route=f.route+"/messages/"+messageId+"/media";
 const read=async(actor:any)=>fetch(base+route,{headers:{authorization:`Bearer ${issueClientAuthToken(actor,`${actor.id}-session`)}`}});
 const good=await read(a);assert.equal(good.status,200);assert.equal(good.headers.get("cache-control"),"private, no-store");assert.deepEqual(Buffer.from(await good.arrayBuffer()),content);
 for(const actor of [b,outsider])assert.equal((await read(actor)).status,404);
 await prisma.inboundMessage.update({where:{id:msg.id},data:{rawPayload:{media,inboxVisibility:"management_only"}}});assert.equal((await read(a)).status,404);
 await prisma.inboundMessage.update({where:{id:msg.id},data:{rawPayload:{media},createdAt:new Date("2026-09-25T11:00:00Z")}});assert.equal((await read(a)).status,404);
 await prisma.inboundMessage.update({where:{id:msg.id},data:{createdAt:new Date("2026-09-28T11:00:00Z")}});
 await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:false});assert.equal((await read(a)).status,404);
 await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:true});
});

test("real setting revocation cannot be restored by delayed signature save",async()=>{
 let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>entered=r),proceed=new Promise<void>(r=>release=r);
 const delayed=prisma.$extends({query:{tenantOperationalConfig:{async findUnique({args,query}){const result=await query(args);entered();await proceed;return result;}}}});
 const pending=saveAgentSignatureSettings({prisma:delayed as any,clientId:client.id,settings:{enabled:true,mode:"user_name",format:"bold_line"}});
 await reached;const revoke=saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:false});
 const end=Date.now()+3000;let blocked=false;try{while(Date.now()<end){const rows=await prisma.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;if(Number(rows[0].n)>0){blocked=true;break;}await new Promise(r=>setTimeout(r,5));}}finally{release();}
 await Promise.all([pending,revoke]);assert(blocked);assert.equal((await request("GET",settingsRoute,supervisor)).body.allowAgentOwnClosedConversations,false);assert.equal((await request("GET",fixtures[0].route)).status,404);
});

test("realtime resolves current ownership, denies other tenants and stops delivering after real revocation",async()=>{
 const f=fixtures[0];await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});
 const event:any={type:"message.created",clientId:client.id,waId:f.waId,humanInboxVisible:true,message:{inboxVisibility:"human_timeline",direction:"INBOUND",type:"TEXT",status:"RECEIVED",bodyText:"synthetic event",createdAt:"2026-09-28T11:00:00Z"}};
 assert.deepEqual([...await resolveRealtimeAgentReaders(prisma,event,[a.id,b.id,outsider.id])],[a.id]);
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:false});assert.equal((await resolveRealtimeAgentReaders(prisma,event,[a.id])).size,0);
 const sent:string[]=[];const socket={readyState:WebSocket.OPEN,on(){return this;},send(value:string){sent.push(value);},close(){},ping(){},terminate(){}} as unknown as WebSocket;
 addConnection(socket,{userId:a.id,clientId:client.id,email:a.email,role:"AGENT"});
 const publishing=publishRealtimeEventAsync(event);publishRealtimeEvent({type:"inbox.access.updated",clientId:client.id});
 await publishing;assert(sent.every(raw=>JSON.parse(raw).type==='inbox.access.updated'));
 closeRealtimeConnectionsForClient(client.id,"test_complete");
});

 test("authenticated websocket delivers own closure only and invalidates after HTTP revocation",async()=>{
 await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:true});
 const received=new Map<string,any[]>();const sockets:WebSocket[]=[];
 for(const actor of [a,b,outsider]){
  const socket=new WebSocket(base.replace("http:","ws:")+"/app/realtime?token="+encodeURIComponent(issueClientAuthToken(actor,`${actor.id}-session`)));
  received.set(actor.id,[]);socket.on("message",raw=>received.get(actor.id)!.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});sockets.push(socket);
 }
 const barrier=async()=>{await Promise.all(sockets.map(socket=>new Promise<void>(resolve=>{socket.once("pong",()=>resolve());socket.ping();})));};
 const event:any={type:"message.created",clientId:client.id,waId:fixtures[0].waId,humanInboxVisible:true,message:{inboxVisibility:"human_timeline",direction:"INBOUND",type:"TEXT",status:"RECEIVED",bodyText:"synthetic websocket",createdAt:"2026-09-28T11:00:00Z"}};
 await publishRealtimeEventAsync(event);await barrier();assert.equal(received.get(a.id)!.filter(e=>e.type==="message.created").length,1);assert.equal(received.get(b.id)!.length,0);assert.equal(received.get(outsider.id)!.length,0);
 await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:false});await publishRealtimeEventAsync(event);await barrier();assert.equal(received.get(a.id)!.filter(e=>e.type==="message.created").length,1);assert(received.get(a.id)!.some(e=>e.type==="inbox.access.updated"));
 for(const socket of sockets)socket.close();closeRealtimeConnectionsForClient(client.id,"test_complete");closeRealtimeConnectionsForClient(other.id,"test_complete");
 });


function barrier() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}
async function makeActive(f: any, owner = a) {
 await prisma.conversationRuntimeState.update({where:{id:f.state.id},data:{
  status:"IN_PROGRESS",closedAt:null,mode:"HUMAN",assignedUserId:owner.id,
  departmentId:department.id,queueId:queue.id,
  answers:{operationalProtocol:{...f.cycle,cycleId:crypto.randomUUID()}},
 }});
}
function syntheticMessage(f: any) {
 return {type:"message.created",clientId:client.id,waId:f.waId,humanInboxVisible:true,
  message:{inboxVisibility:"human_timeline",direction:"INBOUND",type:"TEXT",status:"RECEIVED",
   bodyText:"barrier message",createdAt:"2026-09-28T11:00:00Z"}} as any;
}
async function withPendingAuthorization(f: any, during: () => Promise<void>) {
 const entered=barrier(), resume=barrier();let armed=true;
 const original=prisma.user.findMany;
 // Pause after the current state and users were read, before delivery of that grant.
 prisma.user.findMany=((...args: any[]) => (original as any)(...args).then(async (rows: unknown) => {
  if (armed) { armed=false; entered.release(); await resume.promise; }
  return rows;
 })) as typeof original;
 const sent:any[]=[];
 const socket={readyState:WebSocket.OPEN,on(){return this;},send(raw:string){sent.push(JSON.parse(raw));},close(){},ping(){},terminate(){}} as unknown as WebSocket;
 addConnection(socket,{userId:a.id,clientId:client.id,email:a.email,role:"AGENT"});
 const pending=publishRealtimeEventAsync(syntheticMessage(f));
 try { await entered.promise;await during();resume.release();await pending;return sent; }
 finally {resume.release();await pending;prisma.user.findMany=original;closeRealtimeConnectionsForClient(client.id,"barrier_complete");}
}

test("permission-only config read failure denies CLOSED but preserves active Inbox and general errors",async()=>{
 const active=await fixture(),closed=await fixture();await makeActive(active);
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});
 const original=prisma.tenantOperationalConfig.findUnique;let injected=0;
 // The same table backs other settings. Fail ONLY this resolver, not those reads.
 prisma.tenantOperationalConfig.findUnique=((...args: any[])=>{
  if(new Error().stack?.includes("resolveAllowAgentOwnClosedConversations")) {injected++;throw Error("synthetic own-closed permission read unavailable");}
  return (original as any)(...args);
 }) as typeof original;
 try {
  const list=await request("GET","/app/conversations");assert.equal(list.status,200);
  assert.equal(list.body.allowAgentOwnClosedConversations,false);
  assert(list.body.items.some((item:any)=>item.waId===active.waId));
  assert(!list.body.items.some((item:any)=>item.waId===closed.waId));
  assert.equal(list.body.filterCounts.CLOSED,0);
  assert.equal((await request("GET",active.route)).status,200);
  assert.equal((await request("GET",closed.route)).status,500);
  assert(injected>=2);
 } finally {prisma.tenantOperationalConfig.findUnique=original;}
 const findConversations=prisma.conversation.findMany;
 prisma.conversation.findMany=()=>{throw Error("synthetic general conversation read unavailable");};
 try {assert.equal((await request("GET","/app/conversations")).status,500);}
 finally {prisma.conversation.findMany=findConversations;}
});

for(const enabled of [false,true]) {
 test(`independent conversation handoff preserves pending A message; permission=${enabled}`,{timeout:10000},async()=>{
  await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled});
  const first=await fixture(),second=await fixture();await makeActive(first);await makeActive(second);
  const sent=await withPendingAuthorization(first,async()=>{
   await publishRealtimeEventAsync({type:"conversation.handoff.updated",clientId:client.id,waId:second.waId,status:"IN_PROGRESS",updatedAt:new Date().toISOString()});
  });
  assert.equal(sent.filter(event=>event.type==="message.created"&&event.waId===first.waId).length,1);
 });
}
for(const transition of ["transfer","reentry"] as const) {
 test(`same conversation ${transition} blocks old pending authorization`,{timeout:10000},async()=>{
  await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});
  const f=await fixture();if(transition==="transfer")await makeActive(f);
  const sent=await withPendingAuthorization(f,async()=>{
   await makeActive(f,b);
   // Handoff with a canonical identity still invalidates the pending raw-identity event.
   await publishRealtimeEventAsync({type:"conversation.handoff.updated",clientId:client.id,waId:f.waId,waIdCanonical:f.waId,status:"IN_PROGRESS",assignedUserId:b.id,updatedAt:new Date().toISOString()});
  });
  assert.equal(sent.filter(event=>event.type==="message.created").length,0);
 });
}
test("tenant revocation blocks pending authorization for own CLOSED",{timeout:10000},async()=>{
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});const f=await fixture();
 const sent=await withPendingAuthorization(f,async()=>{
  assert.equal((await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:false})).status,200);
 });
 assert.equal(sent.filter(event=>event.type==="message.created").length,0);
 assert(sent.some(event=>event.type==="inbox.access.updated"));
});

test("snapshot department requires current canonical access across list detail timeline media and open socket",async()=>{
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});
 const f=await fixture();const otherDepartment=await prisma.department.create({data:{clientId:client.id,name:"Other synthetic",slug:crypto.randomUUID()}});
 const messageId=`${f.state.id}-department-image`,content=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=","base64");
 const media=await storeWebSessionMediaFile({clientId:client.id,messageId,content,mimeType:"image/png",fileName:"synthetic.png",kind:"image"});
 await prisma.inboundMessage.create({data:{clientId:client.id,waId:f.waId,waIdCanonical:f.waId,messageId,type:"IMAGE",allowlistHit:true,rawPayload:{media},createdAt:new Date("2026-09-28T11:00:00Z")}});
 const socket=new WebSocket(base.replace("http:","ws:")+"/app/realtime?token="+encodeURIComponent(issueClientAuthToken(a,`${a.id}-session`)));
 const received:any[]=[];socket.on("message",raw=>received.push(JSON.parse(String(raw))));
 await new Promise<void>((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
 const sync=async(ids:string[])=>syncUserDepartmentMemberships(prisma,{clientId:client.id,userId:a.id,departmentIds:ids,primaryDepartmentId:ids[0]??null});
 const check=async(allowed:boolean,label:string)=>{
  const list=await request("GET","/app/conversations?status=CLOSED");assert.equal(list.status,200,label);
  assert.equal(list.body.items.some((i:any)=>i.waId===f.waId),allowed,label);
  if(!allowed)assert.equal(list.body.filterCounts.CLOSED,0,label);
  for(const suffix of ["","/timeline",`/messages/${messageId}/media`]){
   const result=await fetch(base+f.route+suffix,{headers:{authorization:`Bearer ${issueClientAuthToken(a,`${a.id}-session`)}`}});
   assert.equal(result.status,allowed?200:404,label+suffix);await result.arrayBuffer();
  }
  const before=received.filter(e=>e.type==="message.created").length;
  await publishRealtimeEventAsync(syntheticMessage(f));
  await new Promise<void>(resolve=>{socket.once("pong",()=>resolve());socket.ping();});
  assert.equal(received.filter(e=>e.type==="message.created").length,before+(allowed?1:0),label+" socket");
 };
 try {
  // No memberships yet: legacy User.departmentId is accepted by the canonical resolver.
  await check(true,"legacy department, cleared current state");
  await sync([department.id]);await check(true,"active membership");
  await sync([]);await check(false,"removed membership and legacy field");
  await sync([otherDepartment.id]);await check(false,"other department");
  await sync([department.id]);
  await prisma.department.update({where:{id:department.id},data:{isActive:false}});await check(false,"inactive department");
  await prisma.department.update({where:{id:department.id},data:{isActive:true}});
  await prisma.completedServiceSnapshot.update({where:{id:f.snapshot.id},data:{departmentId:null}});
  // Only this closure lacks proof; other authorized closures remain visible.
  assert.equal((await request("GET",f.route)).status,404);
  assert.equal((await resolveRealtimeAgentReaders(prisma,syntheticMessage(f),[a.id])).size,0);
  await prisma.completedServiceSnapshot.update({where:{id:f.snapshot.id},data:{departmentId:department.id}});await check(true,"restored valid membership");
  await sync([]);
  const active=await fixture();await makeActive(active);
  assert.equal((await request("GET",active.route)).status,200,"active assignee exemption unchanged");
  assert.equal((await request("GET",f.route,supervisor)).status,403,"supervisor still requires current department scope");
  assert.equal((await request("GET",f.route,admin)).status,200,"admin unchanged");
 } finally {
  await prisma.department.update({where:{id:department.id},data:{isActive:true}});await sync([department.id]);
  socket.close();closeRealtimeConnectionsForClient(client.id,"department_test_complete");
 }
});

test("department removal while CLOSED authorization is pending denies delivery",async()=>{
 await saveAllowAgentOwnClosedConversations({prisma,clientId:client.id,enabled:true});const f=await fixture();
 try {
  const sent=await withPendingAuthorization(f,async()=>{
   await syncUserDepartmentMemberships(prisma,{clientId:client.id,userId:a.id,departmentIds:[],primaryDepartmentId:null});
  });
  assert.equal(sent.filter(event=>event.type==="message.created").length,0);
 } finally {await syncUserDepartmentMemberships(prisma,{clientId:client.id,userId:a.id,departmentIds:[department.id],primaryDepartmentId:department.id});}
});

 test("config validation, inactive user/client and configuration read error fail closed",async()=>{
 const f=await fixture();
 assert.equal((await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:"true"})).status,400);
 await request("PUT",settingsRoute,admin,{allowAgentOwnClosedConversations:true});
 await prisma.user.update({where:{id:a.id},data:{isActive:false}});
 assert.equal((await request("GET",f.route)).status,401);
 await prisma.user.update({where:{id:a.id},data:{isActive:true}});
 await prisma.appAuthSession.update({where:{id:`${a.id}-session`},data:{revokedAt:null}});
 await prisma.client.update({where:{id:client.id},data:{status:"INACTIVE"}});
 assert.equal((await request("PUT",settingsRoute,supervisor,{allowAgentOwnClosedConversations:false})).status,401);
 await prisma.client.update({where:{id:client.id},data:{status:"ACTIVE"}});
 const originalFind=prisma.tenantOperationalConfig.findUnique;
 prisma.tenantOperationalConfig.findUnique=()=>{throw Error("synthetic configuration unavailable");};
 try {
 const denied=await request("GET",f.route);assert.equal(denied.status,500);assert(!JSON.stringify(denied.body).includes("current service"));} finally {prisma.tenantOperationalConfig.findUnique=originalFind;}
 });
