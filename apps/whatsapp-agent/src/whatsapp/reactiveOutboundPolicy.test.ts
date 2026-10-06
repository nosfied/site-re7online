import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getPrisma } from "../db.js";
import { resolveEffectiveWhatsappOutboundTransport, resolveWhatsappTemplateOutboundTransport } from "../crm/crmConversationStart.js";
import { createWebSessionTextOutboundMessage } from "../web-session/webSessionOutboundService.js";
import { revalidateReactiveSubmission } from "./reactiveOutboundPolicy.js";
import { ingestWebSessionInboundMessage } from "../web-session/webSessionInbound.js";
import { createReactiveBotTextOutboundMessage } from "./reactiveBotOutbound.js";
import { captureRuntimeWriteToken, recordOwnRuntimeOutboundActivity, updateRuntimeIfUnchanged } from "../conversation/runtimeWriteFence.js";

const prisma = getPrisma();
const ids: string[] = [];
const originalFetch = globalThis.fetch;
const submissions: string[] = [];
let beforeResponse: (() => Promise<void>) | undefined;
let ambiguous = false;
test.before(() => {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/re7_transport_contingency_/);
  globalThis.fetch = (async (url: unknown) => {
    submissions.push(String(url));
    await beforeResponse?.();
    if (ambiguous) throw new DOMException("synthetic timeout after submission", "AbortError");
    return new Response(JSON.stringify(String(url).includes("worker.invalid")
      ? { ok: true, externalMessageId: crypto.randomUUID() }
      : { messages: [{ id: crypto.randomUUID() }] }), { status: 200 });
  }) as typeof fetch;
});
test.after(async () => {
  globalThis.fetch = originalFetch;
  const where = { clientId: { in: ids } };
  await prisma.event.deleteMany({ where });
  await prisma.outboundMessage.deleteMany({ where });
  await prisma.inboundMessage.deleteMany({ where });
  await prisma.contactConsent.deleteMany({ where });
  await prisma.chatbotFlow.deleteMany({ where });
  await prisma.contact.deleteMany({ where });
  await prisma.lead.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.conversationRuntimeState.deleteMany({ where });
  await prisma.conversation.deleteMany({ where });
  await prisma.waPhoneNumber.deleteMany({ where });
  await prisma.channelAccount.deleteMany({ where });
  await prisma.tenantMetaConfig.deleteMany({ where });
  await prisma.tenantOperationalConfig.deleteMany({ where });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
async function fixture() {
  beforeResponse = undefined; ambiguous = false; submissions.length = 0;
  const client = await prisma.client.create({ data: { clientKey: `reactive-${crypto.randomUUID()}`, name: "Synthetic", status: "ACTIVE", features: { whatsappWebSession: true, chatbot: true } } });
  ids.push(client.id);
  const phone = `synthetic-${crypto.randomUUID()}`;
  await prisma.tenantMetaConfig.create({ data: { clientId: client.id, phoneNumberId: phone, wabaId: "synthetic-waba", businessToken: "synthetic-token", rawPayload: { publicWhatsappIdentity: { canonicalNumber: "5581999000000" } } } });
  await prisma.waPhoneNumber.create({ data: { clientId: client.id, phoneNumberId: phone, display: "5581999000000" } });
  await prisma.tenantOperationalConfig.create({ data: { clientId: client.id, config: { webSessionAuthorization: { status: "OWNED", authorizedNumberCanonical: "5581999000000" } } } });
  const account = await prisma.channelAccount.create({ data: { clientId: client.id, channel: "whatsapp", provider: "web_session", channelAccountId: `synthetic-${crypto.randomUUID()}`, enabled: true, runtimeEnabled: true, outboundEnabled: true, status: "connected", metadata: { webSession: { observedState: "CONNECTED", desiredState: "CONNECTED" } } } });
  const waId = "5581999111111";
  const now = new Date();
  await prisma.conversation.create({ data: { clientId: client.id, waId, channel: "whatsapp", provider: "web_session", channelAccountId: account.channelAccountId, lastInboundAt: now, windowIsOpen: true, windowExpiresAt: new Date(now.getTime()+86400000) } });
  const runtime = await prisma.conversationRuntimeState.create({ data: { clientId: client.id, waId, channel: "whatsapp", provider: "web_session", channelAccountId: account.channelAccountId, mode: "BOT", answers: {}, firstSeenAt: now, lastInboundAt: now, windowIsOpen: true, windowExpiresAt: new Date(now.getTime()+86400000) } });
  const params = { prisma, clientId: client.id, clientKey: client.clientKey, waId, text: "Synthetic reply", requestId: crypto.randomUUID(), outboundSource: "bot" as const, skipAgentSignature: true as const, runtimeWriteToken: captureRuntimeWriteToken(runtime) };
  const decision = (intent?: "REACTIVE_AUTOMATION" | "INTERACTIVE_REPLY" | "PROTOCOL_NOTICE") => resolveEffectiveWhatsappOutboundTransport({ ...params, clientStatus: "ACTIVE", intent });
  const disconnect = () => prisma.channelAccount.update({ where: { id: account.id }, data: { status: "disconnected", metadata: { webSession: { desiredState: "CONNECTED", observedState: "DISCONNECTED" } } } });
  return { client, account, waId, runtime, params, decision, disconnect };
}

test("AUTO: same reactive intent policy, disconnected Web selects Meta; contact start unchanged", async () => {
  const f = await fixture();
  assert.equal((await f.decision("REACTIVE_AUTOMATION") as { provider: string }).provider, "web_session");
  await f.disconnect();
  for (const intent of ["REACTIVE_AUTOMATION", "INTERACTIVE_REPLY", "PROTOCOL_NOTICE"] as const) {
    assert.deepEqual(await f.decision(intent), { status: "ready", provider: "meta", source: "hybrid_reactive_contingency", configuredMode: "HYBRID" });
  }
  assert.equal((await f.decision()).status, "unavailable");
  const result = await createReactiveBotTextOutboundMessage(f.params);
  assert(result.ok && result.status === "SENT");
  assert.equal(submissions.length, 1); assert.match(submissions[0]!, /graph.facebook.com/);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id } }), 1);
  const audit = { intent: "REACTIVE_AUTOMATION", provider: "meta", configuredMode: "HYBRID", reason: "hybrid_reactive_contingency" };
  const outbound = await prisma.outboundMessage.findFirstOrThrow({ where: { clientId: f.client.id } });
  const event = await prisma.event.findFirstOrThrow({ where: { clientId: f.client.id, eventName: "outbound.text.sent" } });
  assert.deepEqual((outbound.rawPayload as any).routingDecision, audit);
  assert.deepEqual((event.payloadJson as any).routingDecision, audit);
  assert(await updateRuntimeIfUnchanged({ ...f.params, expected: f.params.runtimeWriteToken, data: { answers: { syntheticStep: "next" } } }));
  const row = await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } });
  assert.equal(row.provider, "web_session"); assert.equal(row.channelAccountId, f.account.channelAccountId);
});

test("explicit Meta/Web never fall back; disabled transport and unproven identity deny", async () => {
  const f = await fixture(); await f.disconnect();
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappPrimaryTransport: "web_session" } } });
  assert.equal((await f.decision("PROTOCOL_NOTICE")).status, "unavailable");
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappPrimaryTransport: "meta" } } });
  assert.equal((await f.decision("PROTOCOL_NOTICE") as { provider: string }).provider, "meta");
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: {} } });
  assert.equal((await f.decision("REACTIVE_AUTOMATION")).status, "unavailable");
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { webSessionAuthorization: { status: "OWNED", authorizedNumberCanonical: "5581888000000" } } } });
  assert.equal((await f.decision("REACTIVE_AUTOMATION")).status, "unavailable");
  await prisma.channelAccount.update({ where: { id: f.account.id }, data: { outboundEnabled: false } });
  assert.equal((await f.decision("INTERACTIVE_REPLY")).status, "unavailable");
});

test("fresh eligibility denies expired/fabricated window, changed decision and tenant mismatch before sender", async () => {
  const f = await fixture();
  await prisma.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { windowExpiresAt: new Date(Date.now()-1) } });
  assert.equal(await revalidateReactiveSubmission({ ...f.params, intent: "INTERACTIVE_REPLY", provider: "web_session", runtimeWriteToken: undefined }), "window_closed");
  assert(!(await createReactiveBotTextOutboundMessage(f.params)).ok); assert.equal(submissions.length,0);
  await prisma.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { windowExpiresAt: new Date(Date.now()+86400000), lastInboundAt: null } });
  assert.equal(await revalidateReactiveSubmission({ ...f.params, intent: "PROTOCOL_NOTICE", provider: "web_session", runtimeWriteToken: undefined }), "window_closed");
  assert.equal(await revalidateReactiveSubmission({ ...f.params, clientKey: "other", intent: "INTERACTIVE_REPLY", provider: "web_session" }), "reactive_client_unavailable");
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappPrimaryTransport: "meta" } } });
  assert.equal(await revalidateReactiveSubmission({ ...f.params, intent: "INTERACTIVE_REPLY", provider: "web_session" }), "reactive_transport_changed");
});

test("ambiguous submitted Web or Meta call creates one FAILED attempt and never switches sender", async () => {
  for (const provider of ["web_session", "meta"] as const) {
    const f = await fixture(); if (provider === "meta") await f.disconnect();
    ambiguous = true;
    const result = await createReactiveBotTextOutboundMessage(f.params);
    assert(result.ok && result.status === "FAILED");
    assert.equal(result.provider, provider);
    const outbound = await prisma.outboundMessage.findFirstOrThrow({ where: { clientId: f.client.id } });
    const event = await prisma.event.findFirstOrThrow({ where: { clientId: f.client.id,
      eventName: provider === "meta" ? "outbound.text.failed" : "inbox.web_session.text.failed" } });
    const audit = { intent: "REACTIVE_AUTOMATION", provider, configuredMode: "HYBRID",
      reason: provider === "meta" ? "hybrid_reactive_contingency" : "hybrid_auto" };
    assert.deepEqual((outbound.rawPayload as any).routingDecision, audit);
    assert.deepEqual((event.payloadJson as any).routingDecision, audit);
    assert.equal(submissions.length,1);
    assert.match(submissions[0]!, provider === "meta" ? /graph.facebook.com/ : /worker.invalid/);
    assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id } }), 1);
  }
});

test("intervention during Meta call preserves accepted outbound but invalidates automatic completion", async () => {
  const f = await fixture(); await f.disconnect();
  beforeResponse = async () => { await prisma.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { mode: "HUMAN", departmentId: null, queueId: null, status: "IN_PROGRESS", version: { increment: 1 } } }); };
  const result = await createReactiveBotTextOutboundMessage(f.params); assert(result.ok && result.status === "SENT");
  assert.equal(await updateRuntimeIfUnchanged({ ...f.params, expected: f.params.runtimeWriteToken, data: { mode: "BOT" } }), null);
  const row = await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } });
  assert.equal(row.mode, "HUMAN"); assert.equal(row.status, "IN_PROGRESS"); assert(row.lastOutboundAt);
  assert.equal(submissions.length,1);
});

test("campaign/template hard intent remains Meta-only while AUTO reactive uses Web", async () => {
  const f = await fixture();
  assert.equal((await f.decision("INTERACTIVE_REPLY") as { provider: string }).provider,"web_session");
  assert.equal((await resolveWhatsappTemplateOutboundTransport({ ...f.params, clientStatus: "ACTIVE" }) as { provider: string }).provider,"meta");
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappTransports: { meta: { enabledForRouting: false } } } } });
  assert.equal((await resolveWhatsappTemplateOutboundTransport({ ...f.params, clientStatus: "ACTIVE" })).status,"unavailable");
});

test("barrier after decision: window expires before worker submission and no outbound is created", async () => {
  const f = await fixture();
  assert.equal((await f.decision("INTERACTIVE_REPLY") as { provider: string }).provider,"web_session");
  let entered!: () => void; let release!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const attempt = createWebSessionTextOutboundMessage({ ...f.params, beforeSubmit: async () => {
    entered(); await resume;
    return revalidateReactiveSubmission({ ...f.params, provider: "web_session", intent: "INTERACTIVE_REPLY" });
  } });
  await paused;
  await prisma.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { windowExpiresAt: new Date(Date.now()-1) } });
  release();
  const result = await attempt; assert(!result.ok && result.error === "window_closed");
  assert.equal(submissions.length,0); assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id } }),0);
});

test("barrier before submission: concurrent human transition invalidates prepared automation without sending", async () => {
  const f = await fixture();
  const current = await prisma.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { mode: "HUMAN", version: { increment: 1 } } });
  assert.equal(await revalidateReactiveSubmission({ ...f.params, provider: "web_session", intent: "REACTIVE_AUTOMATION" }),"late_reply_dropped");
  const result = await createReactiveBotTextOutboundMessage(f.params); assert(!result.ok && result.error === "late_reply_dropped");
  assert.equal(submissions.length,0);
  assert.equal((await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } })).updatedAt.getTime(), current.updatedAt.getTime());
});

for (const answer of ["1", "2"]) test(`Web inbound, explicit Meta reactive output: consent ${answer} persists flow progress`, async () => {
  const f = await fixture();
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappPrimaryTransport: "meta" } } });
  await prisma.chatbotFlow.create({ data: { clientId: f.client.id, name: "Synthetic reactive consent", isActive: true, entryPoint: true, definition: {
    start: "consent", nodes: {
      consent: { type: "consent", purpose: "service_communications", textVersion: "synthetic", message: "Consent?", acceptOption: "1", declineOption: "2", onAccepted: "menu", onDeclined: "declined" },
      menu: { type: "menu", text: "Menu", options: [{ label: "Continue", next: "next" }] },
      next: { type: "menu", text: "Next", options: [{ label: "Finish", next: "done" }] },
      declined: { type: "text", text: "Declined" }, done: { type: "text", text: "Done" },
    },
  } } });
  const inbound = (text: string) => ingestWebSessionInboundMessage({ prisma, message: {
    provider: "web_session", channel: "whatsapp", clientId: f.client.id, tenantKey: f.client.clientKey,
    channelAccountDbId: f.account.id, channelAccountId: f.account.channelAccountId, externalMessageId: crypto.randomUUID(),
    sender: f.waId, senderCanonical: f.waId, senderJid: `${f.waId}@s.whatsapp.net`, timestamp: new Date(), type: "TEXT", text, rawPayload: {},
  }, publishMessageCreatedRealtime: async () => {}, publishHandoffRealtime: async () => {} });
  assert((await inbound("Hello")).ok);
  assert.equal((await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } })).chatbotNodeId,"consent");
  assert((await inbound(answer)).ok);
  let row = await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } });
  if (answer === "1") {
    assert.equal(row.chatbotNodeId,"menu");
    assert((await inbound("1")).ok);
    row = await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } });
    assert.equal(row.chatbotNodeId,"next");
  } else assert.notEqual(row.chatbotNodeId,"consent");
  assert(row.lastOutboundAt);
  assert.equal(await prisma.conversation.count({ where: { clientId: f.client.id } }),1);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId: f.client.id } }),1);
  assert(submissions.length >= 2); assert(submissions.every(url => url.includes("graph.facebook.com")));
});


test("own activity CAS uses UTC consistently in a non-UTC PostgreSQL session", async () => {
  const f = await fixture();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'America/Fortaleza'`;
    const at = new Date();
    for (const offset of [0, 1]) {
      assert.equal(await recordOwnRuntimeOutboundActivity({ prisma: tx,
        clientId: f.client.id, waId: f.waId, expected: f.params.runtimeWriteToken,
        sentAt: new Date(at.getTime() + offset), messageId: `synthetic-utc-${offset}`,
        channelAccountId: f.account.channelAccountId, preserveTransport: true }), true);
    }
  });
});


test("prepared Web account or Meta credential change denies submission without selecting a replacement", async () => {
  const f = await fixture();
  let entered!: () => void; let release!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const attempt = createWebSessionTextOutboundMessage({ ...f.params, beforeSubmit: async prepared => {
    entered(); await resume;
    return revalidateReactiveSubmission({ ...f.params, intent: "INTERACTIVE_REPLY", provider: "web_session", expectedWebAccountId: prepared.channelAccountId });
  } });
  await paused;
  await prisma.channelAccount.update({ where: { id: f.account.id }, data: { outboundEnabled: false } });
  await prisma.channelAccount.create({ data: { clientId: f.client.id, channel: "whatsapp", provider: "web_session",
    channelAccountId: `synthetic-replacement-${crypto.randomUUID()}`, enabled: true, runtimeEnabled: true, outboundEnabled: true,
    status: "connected", metadata: { webSession: { observedState: "CONNECTED", desiredState: "CONNECTED" } } } });
  release(); const result = await attempt;
  assert(!result.ok && result.error === "reactive_account_changed");
  assert.equal(submissions.length,0);
  await prisma.tenantOperationalConfig.update({ where: { clientId: f.client.id }, data: { config: { whatsappPrimaryTransport: "meta" } } });
  const credentials = await prisma.tenantMetaConfig.findUniqueOrThrow({ where: { clientId: f.client.id } });
  await prisma.tenantMetaConfig.update({ where: { clientId: f.client.id }, data: { businessToken: "synthetic-rotated" } });
  assert.equal(await revalidateReactiveSubmission({ ...f.params, intent: "REACTIVE_AUTOMATION", provider: "meta", runtimeWriteToken: undefined,
    expectedMetaCredentials: { phoneNumberId: credentials.phoneNumberId!, accessToken: credentials.businessToken! } }), "reactive_account_changed");
  assert.equal(submissions.length,0); assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id } }),0);
});
