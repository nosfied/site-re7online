import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Prisma } from "@prisma/client";

process.env.ENV = "test";
process.env.WHATSAPP_ACCESS_TOKEN = "synthetic-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "synthetic-meta-phone";
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "synthetic-business";
process.env.WHATSAPP_VERIFY_TOKEN = "synthetic-verify";
process.env.OUTBOUND_TEXT_ENABLED = "true";
process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = "http://worker.invalid";
process.env.CONV_STATE_READ_SOURCE = "postgres";
process.env.CONV_STATE_JSON_WRITE_ENABLED = "false";
process.env.STORAGE_MODE = "postgres";

type PrismaHandle = Awaited<ReturnType<typeof import("../db.js")["getPrisma"]>>;

const prefix = `api-web-window-${process.pid}-${Date.now()}`;
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
let prisma: PrismaHandle;
let receiveWebhook: typeof import("./webhook.controller.js")["receiveWebhook"];
let saveTenants: typeof import("../config/tenantConfig.js")["saveTenants"];
let getChatbotFlowStructureHash: typeof import("../chatbot/chatbotFlow.js")["getChatbotFlowStructureHash"];
let validateChatbotFlowDefinition: typeof import("../chatbot/chatbotFlow.js")["validateChatbotFlowDefinition"];
let sends = 0;
const clientIds: string[] = [];

test.before(async () => {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/re7_/);
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "re7-api-web-window-"));
  process.chdir(cwd);
  const db = await import("../db.js");
  prisma = db.getPrisma();
  ({ receiveWebhook } = await import("./webhook.controller.js"));
  ({ saveTenants } = await import("../config/tenantConfig.js"));
  ({ getChatbotFlowStructureHash, validateChatbotFlowDefinition } = await import("../chatbot/chatbotFlow.js"));
  globalThis.fetch = (async (url: unknown) => {
    const target = String(url);
    assert.ok(
      target === "http://worker.invalid/web-session/send-text" ||
        target.startsWith("https://graph.facebook.com/"),
      target
    );
    sends += 1;
    return new Response(JSON.stringify(
      target.startsWith("https://graph.facebook.com/")
        ? { messages: [{ id: `synthetic-meta-${sends}` }] }
        : { ok: true, externalMessageId: `synthetic-web-${sends}` }
    ), {
      status: 200,
    });
  }) as typeof fetch;
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.inboundMessage.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.outboundMessage.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.conversation.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.contactConsent.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.contact.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: clientIds } } });
  await prisma.waPhoneNumber.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.chatbotFlow.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.channelAccount.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.$disconnect();
});

async function fixture(name: string) {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-${name}`,
      name: "Synthetic API WEB window",
      status: "ACTIVE",
      features: { whatsappWebSession: true, chatbot: true },
    },
  });
  clientIds.push(client.id);
  const phoneNumberId = `meta-${name}-${crypto.randomUUID()}`;
  await prisma.waPhoneNumber.create({
    data: { clientId: client.id, phoneNumberId, display: "5581999000000" },
  });
  const account = await prisma.channelAccount.create({
    data: {
      clientId: client.id,
      provider: "web_session",
      channel: "whatsapp",
      channelAccountId: `web-${name}`,
      enabled: true,
      runtimeEnabled: true,
      outboundEnabled: true,
      automationEnabled: true,
      status: "connected",
      metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTED" } },
    },
  });
  const waId = `558199${String(clientIds.length).padStart(7, "0")}`;
  await saveTenants({
    [client.clientKey]: {
      id: client.clientKey,
      name: "Synthetic API WEB window",
      metaPhoneNumberId: phoneNumberId,
      allowlist: [waId],
      handoffAttendantWaid: "5581888888888",
      defaultLanguage: "pt_BR",
      disableLegacyFlows: true,
      channelAccounts: [
        {
          id: account.id,
          tenantKey: client.clientKey,
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: account.channelAccountId,
          enabled: true,
          status: "connected",
        },
      ],
    },
  });
  const rawDefinition = {
    start: "menu",
    nodes: {
      menu: { type: "menu", text: "Menu", options: [{ label: "Info", next: "info" }] },
      info: { type: "text", text: "Informacoes gerais." },
    },
  };
  const validatedDefinition = validateChatbotFlowDefinition(rawDefinition);
  assert.equal(validatedDefinition.ok, true);
  if (!validatedDefinition.ok) throw new Error("invalid synthetic chatbot definition");
  const flow = await prisma.chatbotFlow.create({
    data: {
      clientId: client.id,
      name: "Synthetic API WEB flow",
      isActive: true,
      entryPoint: true,
      definition: validatedDefinition.definition as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      phoneNumberId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: phoneNumberId,
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60_000),
      lastInboundAt: new Date(),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: phoneNumberId,
      mode: "BOT",
      status: null,
      firstSeenAt: new Date(),
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60_000),
      lastInboundAt: new Date(),
      flow: `chatbot:${flow.id}`,
      chatbotNodeId: "menu",
      chatbotActive: true,
      answers: { preserved: true, chatbotRuntime: { flowStructureHash: getChatbotFlowStructureHash(validatedDefinition.definition), flowStartNodeId: validatedDefinition.definition.start } },
    },
  });
  return { client, phoneNumberId, waId };
}

async function metaHandoffFixture(name: string) {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-${name}`,
      name: "Synthetic Meta handoff",
      status: "ACTIVE",
    },
  });
  clientIds.push(client.id);
  const phoneNumberId = `meta-${name}-${crypto.randomUUID()}`;
  const waId = `558499${String(clientIds.length).padStart(7, "0")}`;
  await prisma.waPhoneNumber.create({
    data: { clientId: client.id, phoneNumberId, display: "5584999000000" },
  });
  await prisma.tenantMetaConfig.create({
    data: {
      clientId: client.id,
      phoneNumberId,
      wabaId: "synthetic-waba",
      businessToken: "synthetic-token",
      rawPayload: { publicWhatsappIdentity: { canonicalNumber: "5584999000000" } },
    },
  });
  await prisma.channelAccount.create({
    data: {
      clientId: client.id,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: phoneNumberId,
      enabled: true,
      automationEnabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      aiEnabled: true,
      handoffEnabled: true,
      status: "connected",
      tokenStatus: "configured",
    },
  });
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId: client.id,
      config: {
        baseConfig: {
          allowlist: [waId],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          disableAutoReply: false,
        },
        aiAssistantConfig: {
          aiAssistantEnabled: true,
          aiAssistantFallbackToHandoff: true,
          aiAssistantSystemPrompt: "Synthetic handoff prompt",
          aiBusinessContext: "",
          aiAssistantGreetingMessage: "",
          aiAssistantFallbackMessage: "",
          aiAssistantHandoffPrompt: "",
          aiAssistantAllowedTopics: [],
          aiAssistantSecondaryTopics: [],
          aiAssistantBlockedTerms: [],
          aiAssistantHandoffKeywords: [],
          aiAssistantMaxReplies: 2,
          aiAssistantProfile: "business",
        },
        queueAssignmentPolicy: {
          enabled: true,
          mode: "round_robin",
          scope: "tenant",
          includeSupervisors: false,
          maxActivePerAgent: 10,
          presenceMode: "IGNORE",
          notifyAssignedOnly: false,
        },
      },
    },
  });
  const department = await prisma.department.create({
    data: { clientId: client.id, name: "Support", slug: `support-${name}` },
  });
  const queue = await prisma.queue.create({
    data: { clientId: client.id, departmentId: department.id, name: "Support queue" },
  });
  await prisma.department.update({
    where: { id: department.id },
    data: { operationalQueueId: queue.id },
  });
  const agent = await prisma.user.create({
    data: {
      clientId: client.id,
      departmentId: department.id,
      name: "Synthetic support agent",
      email: `${prefix}-${name}@example.test`,
      role: "AGENT",
      isActive: true,
    },
  });
  await prisma.userDepartmentMembership.create({
    data: {
      clientId: client.id,
      userId: agent.id,
      departmentId: department.id,
      isPrimary: true,
      isActive: true,
    },
  });
  const now = new Date();
  await prisma.conversation.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      phoneNumberId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: phoneNumberId,
      departmentId: department.id,
      windowIsOpen: true,
      windowExpiresAt: new Date(now.getTime() + 60_000),
      lastInboundAt: now,
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: phoneNumberId,
      departmentId: department.id,
      queueId: queue.id,
      mode: "BOT",
      handoffStatus: "NONE",
      status: null,
      firstSeenAt: now,
      lastInboundAt: now,
      windowIsOpen: true,
      windowExpiresAt: new Date(now.getTime() + 60_000),
      answers: {
        aiOrchestrator: {
          handoffPrompt: {
            prompted: true,
            promptedAt: now.toISOString(),
            messageId: `prompt-${name}`,
            reason: "explicit_human_request",
            score: 3,
            awaitingConfirmation: true,
            confirmationRetryCount: 0,
          },
        },
      },
    },
  });
  return { client, phoneNumberId, waId };
}

function setWebhookControllerTestHooks(hooks: unknown) {
  (globalThis as typeof globalThis & { __re7WebhookControllerTestHooks?: unknown }).__re7WebhookControllerTestHooks = hooks;
}

function clearWebhookControllerTestHooks() {
  delete (globalThis as typeof globalThis & { __re7WebhookControllerTestHooks?: unknown }).__re7WebhookControllerTestHooks;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 1000): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function metaWebhook(params: { phoneNumberId: string; waId: string; text: string; timestamp: Date }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "synthetic-waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: params.phoneNumberId, display_phone_number: "5581999000000" },
              contacts: [{ wa_id: params.waId, profile: { name: "Synthetic Contact" } }],
              messages: [
                {
                  from: params.waId,
                  id: `wamid.${crypto.randomUUID()}`,
                  timestamp: String(Math.floor(params.timestamp.getTime() / 1000)),
                  type: "text",
                  text: { body: params.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function waitForAsyncReply() {
  await new Promise((resolve) => setTimeout(resolve, 80));
}

test("accepted Meta handoff survives the HUMAN/WAITING queue-assignment revision before its confirmation outbound", async () => {
  const fixture = await metaHandoffFixture("accepted-confirmation");
  const isolatedTenant = await metaHandoffFixture("accepted-confirmation-isolated");
  const beforeSends = sends;
  const webhook = metaWebhook({
    phoneNumberId: fixture.phoneNumberId,
    waId: fixture.waId,
    text: "sim",
    timestamp: new Date(),
  });
  const inboundMessageId = webhook.entry[0]!.changes[0]!.value.messages[0]!.id;

  await receiveWebhook(webhook, {
    requestId: "accepted-handoff-confirmation",
    route: "/webhook",
    method: "POST",
    rawBodyLength: 0,
  });

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: fixture.client.id, waId: fixture.waId } },
  });
  const queueEvents = await prisma.event.findMany({
    where: { clientId: fixture.client.id, eventName: { startsWith: "queue.assignment." } },
  });
  assert.equal(
    queueEvents[0]?.eventName,
    "queue.assignment.round_robin_applied",
    JSON.stringify(queueEvents[0]?.payloadJson)
  );
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "IN_PROGRESS");
  assert.equal(runtime.handoffStatus, "ACTIVE");
  const idempotencyKey = `ai.handoff.confirmation.${inboundMessageId}`;
  const outbound = await prisma.outboundMessage.findFirst({
    where: {
      clientId: fixture.client.id,
      OR: [
        { messageId: { contains: idempotencyKey } },
        { requestId: { contains: idempotencyKey } },
      ],
    },
  });
  const event = await prisma.event.findFirst({
    where: {
      clientId: fixture.client.id,
      eventName: "outbound.text.sent",
      OR: [
        { messageId: { contains: idempotencyKey } },
        { requestId: { contains: idempotencyKey } },
      ],
    },
  });
  const accepted = await prisma.event.findFirst({
    where: {
      clientId: fixture.client.id,
      eventName: "ai.orchestrator.handoff_confirmation.accepted",
      messageId: inboundMessageId,
    },
  });
  assert.equal((accepted?.payloadJson as Record<string, unknown> | null)?.mode, "HUMAN");
  assert.equal((accepted?.payloadJson as Record<string, unknown> | null)?.status, "IN_PROGRESS");
  assert.equal(sends, beforeSends + 1);
  assert.ok(outbound);
  assert.equal(outbound.status, "SENT");
  assert.equal(outbound.provider, "meta");
  assert.ok(event);
  const isolatedRuntime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: {
      clientId_waId: {
        clientId: isolatedTenant.client.id,
        waId: isolatedTenant.waId,
      },
    },
  });
  assert.equal(isolatedRuntime.mode, "BOT");
  assert.equal(isolatedRuntime.handoffStatus, "NONE");
  assert.equal(
    await prisma.outboundMessage.count({ where: { clientId: isolatedTenant.client.id } }),
    0
  );
});

test("accepted Meta handoff keeps the late-inbound fence and records a sanitized confirmation failure", async () => {
  const fixture = await metaHandoffFixture("accepted-confirmation-late");
  const beforeSends = sends;
  const webhook = metaWebhook({
    phoneNumberId: fixture.phoneNumberId,
    waId: fixture.waId,
    text: "sim",
    timestamp: new Date(),
  });
  const inboundMessageId = webhook.entry[0]!.changes[0]!.value.messages[0]!.id;
  const idempotencyKey = `ai.handoff.confirmation.${inboundMessageId}`;
  setWebhookControllerTestHooks({
    beforePassiveWindowRevalidation: async (params: {
      clientId: string;
      waId: string;
      messageId: string;
    }) => {
      if (params.messageId !== idempotencyKey) return;
      await prisma.conversationRuntimeState.update({
        where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
        data: {
          lastInboundMessageId: `later-${crypto.randomUUID()}`,
          lastInboundAt: new Date(Date.now() - 1),
          windowIsOpen: true,
          windowExpiresAt: new Date(Date.now() + 60_000),
        },
      });
    },
  });
  try {
    await receiveWebhook(webhook, {
      requestId: "accepted-handoff-confirmation-late",
      route: "/webhook",
      method: "POST",
      rawBodyLength: 0,
    });
  } finally {
    clearWebhookControllerTestHooks();
  }

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: fixture.client.id, waId: fixture.waId } },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.handoffStatus, "ACTIVE");
  assert.equal(sends, beforeSends);
  assert.equal(
    await prisma.outboundMessage.count({
      where: { clientId: fixture.client.id, messageId: { contains: idempotencyKey } },
    }),
    0
  );
  const failure = await prisma.event.findFirstOrThrow({
    where: {
      clientId: fixture.client.id,
      eventName: "ai.orchestrator.handoff_confirmation.outbound_failed",
      messageId: idempotencyKey,
    },
  });
  assert.deepEqual(Object.keys(failure.payloadJson as Record<string, unknown>).sort(), [
    "action",
    "clientId",
    "clientKey",
    "correlationId",
    "errorBody",
    "idempotencyKey",
    "inboundMessageId",
    "requestId",
    "waId",
  ]);
  assert.equal((failure.payloadJson as Record<string, unknown>).errorBody, "late_reply_dropped");
  assert.equal((failure.payloadJson as Record<string, unknown>).inboundMessageId, inboundMessageId);
  assert.equal((failure.payloadJson as Record<string, unknown>).idempotencyKey, idempotencyKey);
});

test("API to WEB handler keeps chatbot node recoverable when window closes before provider", async () => {
  const f = await fixture("closed");
  const beforeSends = sends;
  await receiveWebhook(
    metaWebhook({
      phoneNumberId: f.phoneNumberId,
      waId: f.waId,
      text: "1",
      timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
    }),
    { requestId: "api-web-window-closed", route: "/webhook", method: "POST", rawBodyLength: 0 }
  );
  await waitForAsyncReply();
  const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
  });
  assert.equal(sends, beforeSends);
  assert.equal(row.chatbotNodeId, "menu");
  assert.equal(row.chatbotActive, true);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id, status: "SENT" } }), 0);
  assert.deepEqual((row.answers as Record<string, unknown>).preserved, true);
});

test("API to WEB handler restores chatbot node when time closes window before sender revalidation", async () => {
  const f = await fixture("expires-time");
  const beforeSends = sends;
  const rollbackFinished = deferred<{ restored: boolean; reason: string }>();
  const originalDateNow = Date.now;
  let revalidationHits = 0;
  let versionAtRevalidation: number | undefined;
  let windowExpiresAtAtRevalidation: Date | null | undefined;
  setWebhookControllerTestHooks({
    beforePassiveWindowRevalidation: async (params: { clientId: string | null; waId: string; messageId: string }) => {
      if (params.clientId !== f.client.id || params.waId !== f.waId) return;
      revalidationHits += 1;
      const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
        where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
        select: { version: true, windowIsOpen: true, windowExpiresAt: true, answers: true },
      });
      assert.equal(row.windowIsOpen, true);
      assert.ok(row.windowExpiresAt);
      assert.deepEqual((row.answers as Record<string, unknown>).preserved, true);
      versionAtRevalidation = row.version;
      windowExpiresAtAtRevalidation = row.windowExpiresAt;
      Date.now = () => row.windowExpiresAt!.getTime() + 1000;
    },
    beforeChatbotReplyProgressRollback: async (params: { clientId: string | null; waId: string; messageId: string; reason: string }) => {
      if (params.clientId !== f.client.id || params.waId !== f.waId) return;
      assert.equal(params.reason, "window_closed");
      const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
        where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
        select: { version: true, windowIsOpen: true, windowExpiresAt: true },
      });
      assert.equal(row.version, versionAtRevalidation);
      assert.equal(row.windowIsOpen, true);
      assert.equal(row.windowExpiresAt?.toISOString(), windowExpiresAtAtRevalidation?.toISOString());
    },
    afterChatbotReplyProgressRollback: (params: { clientId: string | null; waId: string; messageId: string; reason: string; restored: boolean }) => {
      if (params.clientId === f.client.id && params.waId === f.waId) {
        rollbackFinished.resolve({ restored: params.restored, reason: params.reason });
      }
    },
  });
  try {
    await receiveWebhook(
      metaWebhook({ phoneNumberId: f.phoneNumberId, waId: f.waId, text: "1", timestamp: new Date(originalDateNow()) }),
      { requestId: "api-web-window-expire-time", route: "/webhook", method: "POST", rawBodyLength: 0 }
    );
    const rollback = await withTimeout(rollbackFinished.promise, "chatbot rollback after clock expiration");
    Date.now = originalDateNow;
    const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
      where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
    });
    assert.equal(revalidationHits, 1);
    assert.equal(rollback.reason, "window_closed");
    assert.equal(rollback.restored, true);
    assert.equal(sends, beforeSends);
    assert.equal(row.windowIsOpen, true);
    assert.equal(row.windowExpiresAt?.toISOString(), windowExpiresAtAtRevalidation?.toISOString());
    assert.equal(row.chatbotNodeId, "menu");
    assert.equal(row.chatbotActive, true);
    assert.equal(row.mode, "BOT");
    assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id, status: "SENT" } }), 0);
    assert.equal(await prisma.inboundMessage.count({ where: { clientId: f.client.id } }), 1);
    assert.deepEqual((row.answers as Record<string, unknown>).preserved, true);
  } finally {
    Date.now = originalDateNow;
    clearWebhookControllerTestHooks();
  }
});

test("API to WEB handler preserves human intervention when window expires before sender revalidation", async () => {
  const f = await fixture("expires-human");
  const beforeSends = sends;
  const rollbackFinished = deferred<{ restored: boolean; reason: string }>();
  let revalidationHits = 0;
  let humanInterventionApplied = false;
  setWebhookControllerTestHooks({
    beforePassiveWindowRevalidation: async (params: { clientId: string | null; waId: string; messageId: string }) => {
      if (params.clientId !== f.client.id || params.waId !== f.waId) return;
      revalidationHits += 1;
      await prisma.conversationRuntimeState.update({
        where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
        data: { windowIsOpen: false, windowExpiresAt: new Date(Date.now() - 1000) },
      });
    },
    beforeChatbotReplyProgressRollback: async (params: { clientId: string | null; waId: string; messageId: string; reason: string }) => {
      if (params.clientId !== f.client.id || params.waId !== f.waId) return;
      humanInterventionApplied = true;
      await prisma.conversationRuntimeState.update({
        where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
        data: {
          mode: "HUMAN",
          status: "WAITING",
          flow: null,
          flowStep: null,
          chatbotNodeId: null,
          chatbotActive: false,
          answers: { preserved: true, humanIntervention: true },
          version: { increment: 1 },
        },
      });
    },
    afterChatbotReplyProgressRollback: (params: { clientId: string | null; waId: string; messageId: string; reason: string; restored: boolean }) => {
      if (params.clientId === f.client.id && params.waId === f.waId) {
        rollbackFinished.resolve({ restored: params.restored, reason: params.reason });
      }
    },
  });
  try {
    await receiveWebhook(
      metaWebhook({ phoneNumberId: f.phoneNumberId, waId: f.waId, text: "1", timestamp: new Date() }),
      { requestId: "api-web-window-expire-human", route: "/webhook", method: "POST", rawBodyLength: 0 }
    );
    const rollback = await withTimeout(rollbackFinished.promise, "chatbot rollback CAS");
    const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
      where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
    });
    assert.equal(revalidationHits, 1);
    assert.equal(humanInterventionApplied, true);
    assert.equal(rollback.reason, "window_closed");
    assert.equal(rollback.restored, false);
    assert.equal(sends, beforeSends);
    assert.equal(row.mode, "HUMAN");
    assert.equal(row.status, "WAITING");
    assert.equal(row.chatbotNodeId, null);
    assert.equal(row.chatbotActive, false);
    assert.deepEqual(row.answers, { preserved: true, humanIntervention: true });
    assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id, status: "SENT" } }), 0);
  } finally {
    clearWebhookControllerTestHooks();
  }
});

test("API to WEB handler advances chatbot node when window remains open", async () => {
  const f = await fixture("open");
  const beforeSends = sends;
  await receiveWebhook(
    metaWebhook({ phoneNumberId: f.phoneNumberId, waId: f.waId, text: "1", timestamp: new Date() }),
    { requestId: "api-web-window-open", route: "/webhook", method: "POST", rawBodyLength: 0 }
  );
  await waitForAsyncReply();
  const row = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: f.client.id, waId: f.waId } },
  });
  assert.equal(sends, beforeSends + 1);
  assert.equal(row.chatbotNodeId, null);
  assert.equal(row.chatbotActive, false);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id, status: "SENT" } }), 1);
});
