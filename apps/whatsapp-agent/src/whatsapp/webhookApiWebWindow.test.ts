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
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/re7_/);
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "re7-api-web-window-"));
  process.chdir(cwd);
  const db = await import("../db.js");
  prisma = db.getPrisma();
  ({ receiveWebhook } = await import("./webhook.controller.js"));
  ({ saveTenants } = await import("../config/tenantConfig.js"));
  ({ getChatbotFlowStructureHash, validateChatbotFlowDefinition } = await import("../chatbot/chatbotFlow.js"));
  globalThis.fetch = (async (url: unknown) => {
    assert.equal(String(url), "http://worker.invalid/web-session/send-text");
    sends += 1;
    return new Response(JSON.stringify({ ok: true, externalMessageId: `synthetic-web-${sends}` }), {
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
