import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getPrisma } from "../db.js";
import { ingestWebSessionInboundMessage } from "../web-session/webSessionInbound.js";
import { createWebSessionTextOutboundMessage } from "../web-session/webSessionOutboundService.js";
import { captureRuntimeWriteToken, updateRuntimeIfUnchanged } from "./runtimeWriteFence.js";
const prisma = getPrisma();
const prefix = `own-activity-${process.pid}-${Date.now()}`;
const originalFetch = globalThis.fetch;
let onSend: (() => Promise<void>) | undefined;
let sends = 0;
const ids: string[] = [];
test.before(() => {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/re7_/);
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = "http://worker.invalid";
  globalThis.fetch = (async (url: unknown) => {
    assert.equal(String(url), "http://worker.invalid/web-session/send-text");
    sends++; await onSend?.();
    return new Response(JSON.stringify({ ok: true, externalMessageId: `synthetic-${sends}` }), { status: 200 });
  }) as typeof fetch;
});
test.after(async () => {
  globalThis.fetch = originalFetch;
  // Only this test's synthetic tenants. Cascades preserve unrelated fixtures.
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.event.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.inboundMessage.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.outboundMessage.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.contactConsent.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.contact.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
async function fixture(name: string) {
  onSend = undefined;
  const client = await prisma.client.create({ data: { clientKey: `${prefix}-${name}`, name: "Synthetic activity", features: { whatsappWebSession: true, chatbot: true } } });
  ids.push(client.id);
  const account = await prisma.channelAccount.create({ data: { clientId: client.id, provider: "web_session", channel: "whatsapp", channelAccountId: `synthetic-${name}`, enabled: true, runtimeEnabled: true, outboundEnabled: true, automationEnabled: true, status: "connected", metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTED" } } } });
  const waId = `558199${String(ids.length).padStart(7,"0")}`;
  return { client, account, waId };
}
async function send(f: Awaited<ReturnType<typeof fixture>>, token: ReturnType<typeof captureRuntimeWriteToken>, db = prisma) {
  return createWebSessionTextOutboundMessage({ prisma: db, clientId: f.client.id, clientKey: f.client.clientKey,
    waId: f.waId, waIdCanonical: f.waId, text: "Synthetic reply", requestId: crypto.randomUUID(),
    outboundSource: "bot", skipAgentSignature: true, runtimeWriteToken: token,
    source: { channel: "whatsapp", provider: "web_session", channelAccountId: f.account.channelAccountId } });
}
async function inbound(f: Awaited<ReturnType<typeof fixture>>, text: string) {
  return ingestWebSessionInboundMessage({ prisma, message: { provider: "web_session", channel: "whatsapp",
    clientId: f.client.id, tenantKey: f.client.clientKey, channelAccountDbId: f.account.id,
    channelAccountId: f.account.channelAccountId, externalMessageId: crypto.randomUUID(), sender: f.waId,
    senderCanonical: f.waId, senderJid: `${f.waId}@s.whatsapp.net`, timestamp: new Date(), type: "TEXT", text, rawPayload: {} },
    publishMessageCreatedRealtime: async () => {}, publishHandoffRealtime: async () => {} });
}
for (const answer of ["1", "2"]) test(`integrated WEB consent ${answer}: real outbound activity and persisted node advancement`, async () => {
  const f = await fixture(`consent-${answer}`);
  await prisma.chatbotFlow.create({ data: { clientId: f.client.id, name: "Synthetic consent", isActive: true, entryPoint: true, definition: {
    start: "consent", nodes: {
      consent: { type: "consent", purpose: "service_communications", textVersion: "synthetic", message: "Consent?", acceptOption: "1", declineOption: "2", onAccepted: "menu", onDeclined: "declined" },
      menu: { type: "menu", text: "Menu", options: [{ label: "Continue", next: "next" }] },
      next: { type: "menu", text: "Next", options: [{ label: "Finish", next: "done" }] },
      declined: { type: "text", text: "Declined" }, done: { type: "text", text: "Done" },
    },
  } } });
  const first = await inbound(f,"Hello"); assert.equal(first.ok,true);
  let row = await prisma.conversationRuntimeState.findUniqueOrThrow({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}}});
  assert.equal(row.chatbotNodeId,"consent"); assert.equal(row.chatbotActive,true); assert(row.lastOutboundAt);
  await inbound(f,answer);
  row = await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:row.id}});
  if(answer === "1") {
    assert.equal(row.chatbotNodeId,"menu");
    await inbound(f,"1");
    row = await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:row.id}});
    assert.equal(row.chatbotNodeId,"next");
  } else assert.notEqual(row.chatbotNodeId,"consent");
  assert.equal(await prisma.contactConsent.count({where:{clientId:f.client.id,status:"accepted"}}),answer === "1" ? 1 : 0);
});
for (const change of ["none","claim","transfer","close_csat","reentry","inbound","cycle","transport","account"] as const) test(`real accepted outbound during ${change}: own receipt or stale completion denied`, async () => {
  const f=await fixture(change);
  const row=await prisma.conversationRuntimeState.create({data:{clientId:f.client.id,waId:f.waId,waIdCanonical:f.waId,channel:"whatsapp",provider:"web_session",channelAccountId:f.account.channelAccountId,mode:"BOT",answers:{cycle:"original"}}});
  const expected=captureRuntimeWriteToken(row);
  let concurrent: typeof row | undefined;
  onSend=async()=>{
    if(change==="none")return;
    const data=change==="claim"?{mode:"HUMAN",assignedUserId:"synthetic-user",status:"IN_PROGRESS" as const}
      :change==="transfer"?{mode:"HUMAN",handoffStatus:"ACTIVE" as const,assignedUserId:"other-agent"}
      :change==="close_csat"?{status:"CLOSED" as const,closedAt:new Date(),answers:{satisfactionRuntime:{pending:true}}}
      :change==="reentry"?{mode:"BOT",status:null,closedAt:null,lastInboundAt:new Date(),answers:{cycle:"reentry"},version:{increment:1}}
      :change==="inbound"?{lastInboundMessageId:"new-inbound",lastInboundAt:new Date()}
      :change==="cycle"?{answers:{cycle:"another"},updatedAt:row.updatedAt}
      :change==="transport"?{provider:"meta"}:{channelAccountId:"another-account"};
    concurrent=await prisma.conversationRuntimeState.update({where:{id:row.id},data});
  };
  const result=await send(f,expected); assert(result.ok && result.status==="SENT");
  onSend=undefined;
  if(change==="none") { const second=await send(f,expected); assert(second.ok && second.status==="SENT"); }
  const saved=await updateRuntimeIfUnchanged({prisma,clientId:f.client.id,waId:f.waId,expected,data:{chatbotActive:true,chatbotNodeId:"advanced",answers:{cycle:"original"}}});
  assert.equal(Boolean(saved),change==="none");
  const after=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:row.id}});
  if(concurrent)for(const k of ["mode","status","handoffStatus","assignedUserId","departmentId","queueId","answers","provider","channelAccountId","lastInboundMessageId"] as const)assert.deepEqual(after[k],concurrent[k],k);
  assert(after.lastOutboundAt); assert.equal(await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}}),change==="none"?2:1);
});
test("integrated WEB handoff remains HUMAN and preserves multiple notification outbounds", async () => {
  const f=await fixture("handoff");
  const department=await prisma.department.create({data:{clientId:f.client.id,name:"Synthetic service",slug:"synthetic"}});
  const queue=await prisma.queue.create({data:{clientId:f.client.id,departmentId:department.id,name:"Synthetic queue"}});
  await prisma.department.update({where:{id:department.id},data:{operationalQueueId:queue.id}});
  await prisma.chatbotFlow.create({data:{clientId:f.client.id,name:"Synthetic handoff",isActive:true,entryPoint:true,definition:{start:"menu",nodes:{
    menu:{type:"menu",text:"Choose",options:[{label:"Human",next:"human"}]},
    human:{type:"handoff",text:"Transferring",departmentId:department.id}
  }}}});
  await inbound(f,"Hi"); await inbound(f,"1");
  const row=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}}});
  assert.equal(row.mode,"HUMAN"); assert.equal(row.handoffStatus,"ACTIVE"); assert.equal(row.departmentId,department.id);
  assert.equal(row.status,"WAITING"); assert.equal(row.chatbotActive,false);
  assert((await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}})) >= 2);
});
test("activity DB error after acceptance retains SENT and poisons completion without retry", async () => {
  const f=await fixture("activity-error");
  const row=await prisma.conversationRuntimeState.create({data:{clientId:f.client.id,waId:f.waId,channel:"whatsapp",mode:"BOT"}});
  const expected=captureRuntimeWriteToken(row); const before=sends;
  const db=new Proxy(prisma,{get(target,key){if(key==="conversationRuntimeState")return new Proxy(target.conversationRuntimeState,{get(model,k){if(k==="updateManyAndReturn")return async()=>{throw new Error("synthetic write unavailable")};return Reflect.get(model,k)}});return Reflect.get(target,key)}});
  const result=await send(f,expected,db); assert(result.ok && result.status==="SENT"); assert.equal(sends,before+1);
  assert.equal(await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}}),1);
  assert.equal(await updateRuntimeIfUnchanged({prisma,clientId:f.client.id,waId:f.waId,expected,data:{chatbotNodeId:"must-not-write"}}),null);
});
test("newer activity survives a delayed accepted result; no execution receipt is earned",async()=>{
  const f=await fixture("newer-activity");
  const row=await prisma.conversationRuntimeState.create({data:{clientId:f.client.id,waId:f.waId,channel:"whatsapp",mode:"BOT"}});
  const expected=captureRuntimeWriteToken(row); const newer=new Date(Date.now()+60000);
  onSend=async()=>{await prisma.conversationRuntimeState.update({where:{id:row.id},data:{lastOutboundAt:newer,lastOutboundMessageId:"newer-accepted"}})};
  const result=await send(f,expected);assert(result.ok&&result.status==="SENT");
  const after=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:row.id}});
  assert.equal(after.lastOutboundAt?.getTime(),newer.getTime());assert.equal(after.lastOutboundMessageId,"newer-accepted");
  assert.equal(await updateRuntimeIfUnchanged({prisma,clientId:f.client.id,waId:f.waId,expected,data:{chatbotNodeId:"stale"}}),null);
});

test("Meta/hybrid IA: real assistant, passive WEB sender and Postgres builder retain own activity receipt", {skip:process.env.INCIDENT_WORKER_MINIMAL === "true"}, async()=>{
  const [{readFileSync},vm,ts,{createDualWriteStorage},{generateControlledAssistantReply}]=await Promise.all([
    import("node:fs"),import("node:vm"),import("typescript"),import("../storage/dualWriteStorage.js"),import("../agent/controlledAssistant.js")]);
  const source=readFileSync(new URL("../whatsapp/webhook.controller.ts",import.meta.url),"utf8");
  function extract(start:string,end:string,name:string,context:Record<string,unknown>){
    const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);
    const module={exports:{}};
    vm.runInNewContext(ts.default.transpileModule(source.slice(a,b)+`\nmodule.exports=${name};`,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,...context});
    return module.exports as (arg:any)=>Promise<any>;
  }
  for(const provider of ["meta","web_session"]) for(const intervene of [false,true,"identity"] as const) {
    const f=await fixture(`hybrid-ai-${provider}-${intervene}`);
    const storage=createDualWriteStorage(new Proxy({} as any,{get(){return()=>{throw new Error("JSON not permitted")}}}),{readSource:"postgres",jsonWriteEnabled:false});
    await prisma.conversationRuntimeState.create({data:{clientId:f.client.id,waId:f.waId,waIdCanonical:f.waId,channel:"whatsapp",provider:"meta",mode:"BOT",handoffStatus:"NONE",answers:{},firstSeenAt:new Date(),lastInboundAt:new Date(),windowIsOpen:true,windowExpiresAt:new Date(Date.now()+60_000)}});
    let state=(await storage.getConversation(f.waId,f.client.clientKey))!;assert(state?.runtimeWriteToken);
    const ai=await generateControlledAssistantReply({brain:{async generateReply(){return {text:JSON.stringify({reply:"Orientação sintética",intent:"general",stage:"qualification",goal:"discover_service",confidence:0.9,missing_information:[],next_action:"ask_question",next_question:"Qual serviço?",handoff_recommended:false,lead_temp:"morno",priority:"media"}),source:"ai",model:"simulated"}}},text:"Explique um serviço",tenant:{name:"Synthetic",defaultLanguage:"pt_BR"},state,nowIso:new Date().toISOString(),preclassifiedEducationalIntent:{allowed:true,intent:"general"} as any});
    assert(ai.ok);if(!ai.ok)return;
    state={...state,answers:{...state.answers,aiOrchestrator:{goal:ai.output.goal}}};
    const {persistOutboundMessage}=await import("../db/persist.js");
    const sendMeta=extract("  const sendOutboundText = async","  const sendPassiveOutboundText = async","sendOutboundText",{
      tenantClientId:f.client.id,tenantClientKey:f.client.clientKey,shouldSendOutbound:()=>true,
      checkUsageGate:async()=>({allowed:true}),meta:{requestId:"synthetic"},env:{},
      resolveCurrentTenantCredentials:async()=>({phoneNumberId:"synthetic",source:"synthetic"}),logger:{info(){},warn(){},error(){}},maskNumber:()=>"synthetic",
      sendTextMessage:async()=>{sends++;await onSend?.();return{ok:true,messageId:crypto.randomUUID()}},
      storage:{appendOutboundEvent:async()=>{}},MessageStatus:{SENT:"SENT",FAILED:"FAILED"},
      persistOutboundTextSafe:(p:any)=>persistOutboundMessage({clientId:f.client.id,waId:p.waId,messageId:p.messageId,type:"TEXT",status:p.status,bodyText:p.bodyText,provider:"meta"}),
      persistEventSafe:async()=>{},
    });
    const sendPassive=extract("  const sendPassiveOutboundText = async","  const typedPayload","sendPassiveOutboundText",{
      prisma,tenantClientId:f.client.id,tenantClientKey:f.client.clientKey,tenantClientStatus:"ACTIVE",env:{WHATSAPP_SANDBOX:false},
      resolveEffectiveWhatsappOutboundTransport:provider === "meta" ? async()=>({status:"ready",provider:"meta"}) : (await import("../crm/crmConversationStart.js")).resolveEffectiveWhatsappOutboundTransport,
      shouldSendOutbound:()=>true,createWebSessionTextOutboundMessage,canonicalizeBrazilWaId:(s:string)=>s,
      loadPersistedRuntimeForInbound: async (waId:string) => {
        const runtime = await prisma.conversationRuntimeState.findUnique({where:{clientId_waId:{clientId:f.client.id,waId}}});
        return runtime ? { window: { isOpen: runtime.windowIsOpen, expiresAt: runtime.windowExpiresAt?.toISOString() } } : null;
      },
      isWindowOpen:(state:any, now:number)=>Boolean(state.window?.isOpen && state.window?.expiresAt && now < Date.parse(state.window.expiresAt)),
      logger:{warn(){}},maskNumber:()=>"synthetic",meta:{requestId:"synthetic"},
      sendOutboundText:sendMeta,MessageStatus:{SENT:"SENT",FAILED:"FAILED"},
    });
    const shadowDb=intervene!=="identity" ? prisma : new Proxy(prisma,{get(target,key){
      if(key!=="conversationRuntimeState")return Reflect.get(target,key);
      return new Proxy(target.conversationRuntimeState,{get(model,k){
        if(k!=="updateManyAndReturn")return Reflect.get(model,k);
        return async(args:any)=>{
          // Barrier after the runtime commit, before the owned identity projection.
          await prisma.conversationRuntimeState.update({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}},data:{mode:"HUMAN",status:"IN_PROGRESS",provider:"web_session",channelAccountId:"human-switched-account"}});
          return model.updateManyAndReturn(args);
        };
      }});
    }});
    const save=extract("  const upsertConversationSafe = async","  const persistOutboundConversation = async","upsertConversationSafe",{storage,tenantClientId:f.client.id,tenantClientKey:f.client.clientKey,logger:{info(){}},resolveRuntimeDepartmentId:async(id:unknown)=>id,prisma:shadowDb,phoneNumberId:"synthetic-meta-account",updateRuntimeIfUnchanged,...await import("../channels/whatsappMultichannelShadowWrite.js"),isWhatsAppMultichannelShadowWriteEnabled:()=>true,getPrisma});
    onSend=async()=>{if(intervene===true)await prisma.conversationRuntimeState.update({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}},data:{mode:"HUMAN",status:"IN_PROGRESS",assignedUserId:"synthetic-human"}})};
    const result=await sendPassive({toE164:f.waId,waId:f.waId,intent:"unknown",messageId:crypto.randomUUID(),replyText:ai.output.reply,runtimeWriteToken:state.runtimeWriteToken});assert.equal(result.ok,true);
    const {updateOutbound}=await import("./conversation.service.js");
    await save(updateOutbound(state,result.messageId,new Date().toISOString()));
    const final=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}}});
    assert.equal(final.mode,intervene?"HUMAN":"BOT");assert.equal(Boolean((final.answers as any)?.aiOrchestrator),intervene!==true);if(intervene!==true || provider==="web_session")assert(final.lastOutboundAt);
    if(intervene==="identity")assert.equal(final.channelAccountId,"human-switched-account");
    assert.equal(await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}}),1);
  }
});



test("WEB chatbot window expiry before bot outbound preserves persisted node", async()=>{
  const f=await fixture("bot-window-expired");
  await prisma.chatbotFlow.create({data:{clientId:f.client.id,name:"Synthetic expired window",isActive:true,entryPoint:true,definition:{
    start:"menu",nodes:{
      menu:{type:"menu",text:"Menu",options:[{label:"Info",next:"info"}]},
      info:{type:"text",text:"Informacoes gerais."},
    },
  }}});
  const first=await inbound(f,"oi");
  assert.equal(first.ok,true);
  const before=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}}});
  assert.equal(before.chatbotNodeId,"menu");
  assert.equal(before.chatbotActive,true);
  const beforeOutboundId=before.lastOutboundMessageId;
  const beforeSends=sends;
  const beforeOutboundCount=await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}});
  const expiredAt=new Date(Date.now()-25*60*60*1000);
  const second=await ingestWebSessionInboundMessage({ prisma, message: { provider:"web_session", channel:"whatsapp",
    clientId:f.client.id, tenantKey:f.client.clientKey, channelAccountDbId:f.account.id, channelAccountId:f.account.channelAccountId,
    externalMessageId:crypto.randomUUID(), sender:f.waId, senderCanonical:f.waId, senderJid:`${f.waId}@s.whatsapp.net`,
    timestamp:expiredAt, type:"TEXT", text:"1", rawPayload:{} },
    publishMessageCreatedRealtime: async () => {}, publishHandoffRealtime: async () => {} });
  assert.equal(second.ok,true);
  assert.equal(sends,beforeSends);
  assert.equal(await prisma.outboundMessage.count({where:{clientId:f.client.id,status:"SENT"}}),beforeOutboundCount);
  const after=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{id:before.id}});
  assert.equal(after.chatbotNodeId,"menu");
  assert.equal(after.chatbotActive,true);
  assert.equal(after.lastOutboundMessageId,beforeOutboundId);
});

test("passive WEB sender revalidates window after reply preparation and before provider", {skip:process.env.INCIDENT_WORKER_MINIMAL === "true"}, async()=>{
  const [{readFileSync},vm,ts]=await Promise.all([import("node:fs"),import("node:vm"),import("typescript")]);
  const source=readFileSync(new URL("../whatsapp/webhook.controller.ts",import.meta.url),"utf8");
  function extract(start:string,end:string,name:string,context:Record<string,unknown>){
    const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);
    const module={exports:{}};
    vm.runInNewContext(ts.default.transpileModule(source.slice(a,b)+`\nmodule.exports=${name};`,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,...context});
    return module.exports as (arg:any)=>Promise<any>;
  }
  const f=await fixture("passive-window-expired");
  await prisma.conversationRuntimeState.create({data:{clientId:f.client.id,waId:f.waId,waIdCanonical:f.waId,channel:"whatsapp",provider:"web_session",mode:"BOT",handoffStatus:"NONE",answers:{},firstSeenAt:new Date(),lastInboundAt:new Date(),windowIsOpen:true,windowExpiresAt:new Date(Date.now()+60_000)}});
  const preparedReply = "Resposta preparada";
  await prisma.conversationRuntimeState.update({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}},data:{windowIsOpen:true,windowExpiresAt:new Date(Date.now()-1_000)}});
  const beforeSends=sends;
  const sendPassive=extract("  const sendPassiveOutboundText = async","  const typedPayload","sendPassiveOutboundText",{
    prisma,tenantClientId:f.client.id,tenantClientKey:f.client.clientKey,tenantClientStatus:"ACTIVE",env:{WHATSAPP_SANDBOX:false},
    resolveEffectiveWhatsappOutboundTransport:(await import("../crm/crmConversationStart.js")).resolveEffectiveWhatsappOutboundTransport,
    shouldSendOutbound:()=>true,createWebSessionTextOutboundMessage,canonicalizeBrazilWaId:(s:string)=>s,
    loadPersistedRuntimeForInbound: async (waId:string) => {
      const runtime = await prisma.conversationRuntimeState.findUnique({where:{clientId_waId:{clientId:f.client.id,waId}}});
      return runtime ? { window: { isOpen: runtime.windowIsOpen, expiresAt: runtime.windowExpiresAt?.toISOString() } } : null;
    },
    isWindowOpen:(state:any, now:number)=>Boolean(state.window?.isOpen && state.window?.expiresAt && now < Date.parse(state.window.expiresAt)),
    logger:{warn(){}},maskNumber:()=>"synthetic",meta:{requestId:"synthetic"},
    sendOutboundText:async()=>{throw new Error("meta fallback must not be used")},MessageStatus:{SENT:"SENT",FAILED:"FAILED"},
  });
  const result=await sendPassive({toE164:f.waId,waId:f.waId,intent:"unknown",messageId:crypto.randomUUID(),replyText:preparedReply});
  assert.equal(result.ok,false);
  assert.equal(result.errorBody,"window_closed");
  assert.equal(sends,beforeSends);
  const after=await prisma.conversationRuntimeState.findUniqueOrThrow({where:{clientId_waId:{clientId:f.client.id,waId:f.waId}}});
  assert.equal(after.mode,"BOT");
  assert.equal(after.chatbotNodeId,null);
});

test("passive WEB sender denies missing and invalid runtime before provider", {skip:process.env.INCIDENT_WORKER_MINIMAL === "true"}, async()=>{
  const [{readFileSync},vm,ts]=await Promise.all([import("node:fs"),import("node:vm"),import("typescript")]);
  const source=readFileSync(new URL("../whatsapp/webhook.controller.ts",import.meta.url),"utf8");
  function extract(start:string,end:string,name:string,context:Record<string,unknown>){
    const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);
    const module={exports:{}};
    vm.runInNewContext(ts.default.transpileModule(source.slice(a,b)+`\nmodule.exports=${name};`,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,...context});
    return module.exports as (arg:any)=>Promise<any>;
  }
  async function buildSender(f: Awaited<ReturnType<typeof fixture>>) {
    return extract("  const sendPassiveOutboundText = async","  const typedPayload","sendPassiveOutboundText",{
      prisma,tenantClientId:f.client.id,tenantClientKey:f.client.clientKey,tenantClientStatus:"ACTIVE",env:{WHATSAPP_SANDBOX:false},
      resolveEffectiveWhatsappOutboundTransport:(await import("../crm/crmConversationStart.js")).resolveEffectiveWhatsappOutboundTransport,
      shouldSendOutbound:()=>true,createWebSessionTextOutboundMessage,canonicalizeBrazilWaId:(value:string)=>value,
      loadPersistedRuntimeForInbound: async (waId:string) => {
        const runtime = await prisma.conversationRuntimeState.findUnique({where:{clientId_waId:{clientId:f.client.id,waId}}});
        return runtime ? { window: { isOpen: runtime.windowIsOpen, expiresAt: runtime.windowExpiresAt?.toISOString() } } : null;
      },
      isWindowOpen:(state:any, now:number)=>Boolean(state.window?.isOpen && state.window?.expiresAt && now < Date.parse(state.window.expiresAt)),
      logger:{warn(){}},maskNumber:()=>"synthetic",meta:{requestId:"synthetic"},
      sendOutboundText:async()=>{throw new Error("meta fallback must not be used")},MessageStatus:{SENT:"SENT",FAILED:"FAILED"},
    });
  }
  const missing=await fixture("passive-runtime-missing");
  const sendMissing=await buildSender(missing);
  const beforeMissing=sends;
  const missingResult=await sendMissing({toE164:missing.waId,waId:missing.waId,intent:"unknown",messageId:crypto.randomUUID(),replyText:"Resposta"});
  assert.equal(missingResult.ok,false);
  assert.equal(missingResult.errorBody,"window_unavailable");
  assert.equal(sends,beforeMissing);

  const invalid=await fixture("passive-window-invalid");
  await prisma.conversationRuntimeState.create({data:{clientId:invalid.client.id,waId:invalid.waId,waIdCanonical:invalid.waId,channel:"whatsapp",provider:"web_session",mode:"BOT",handoffStatus:"NONE",answers:{},firstSeenAt:new Date(),lastInboundAt:new Date(),windowIsOpen:true,windowExpiresAt:null}});
  const sendInvalid=await buildSender(invalid);
  const beforeInvalid=sends;
  const invalidResult=await sendInvalid({toE164:invalid.waId,waId:invalid.waId,intent:"unknown",messageId:crypto.randomUUID(),replyText:"Resposta"});
  assert.equal(invalidResult.ok,false);
  assert.equal(invalidResult.errorBody,"window_invalid");
  assert.equal(sends,beforeInvalid);
});
