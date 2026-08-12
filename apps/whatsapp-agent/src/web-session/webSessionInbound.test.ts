import assert from "node:assert/strict";
import test from "node:test";
import { MessageType } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import {
  extractPhoneFromBaileysJid,
  ingestBaileysWebSessionMessage,
  shouldIgnoreBaileysInboundMessage,
} from "./webSessionInbound.js";

const state = {
  conversation: null as Record<string, unknown> | null,
  inboundMessages: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  runtimeStates: [] as Array<Record<string, unknown>>,
  contacts: [] as Array<Record<string, unknown>>,
  identities: [] as Array<Record<string, unknown>>,
  leads: [] as Array<Record<string, unknown>>,
  outboundMessages: [] as Array<Record<string, unknown>>,
  metrics: [] as Array<Record<string, unknown>>,
  departments: [] as Array<Record<string, unknown>>,
};

function resetState(overrides: Partial<typeof state> = {}) {
  state.conversation = overrides.conversation ?? null;
  state.inboundMessages = overrides.inboundMessages ?? [];
  state.events = overrides.events ?? [];
  state.runtimeStates = overrides.runtimeStates ?? [];
  state.contacts = overrides.contacts ?? [];
  state.identities = overrides.identities ?? [];
  state.leads = overrides.leads ?? [];
  state.outboundMessages = overrides.outboundMessages ?? [];
  state.metrics = overrides.metrics ?? [];
  state.departments = overrides.departments ?? [];
}

function fakePrisma() {
  const prisma = {
    conversation: {
      findUnique: async ({ where }: { where: { clientId_waId: { clientId: string; waId: string } } }) => {
        if (
          state.conversation?.clientId === where.clientId_waId.clientId &&
          state.conversation?.waId === where.clientId_waId.waId
        ) {
          return state.conversation;
        }
        return null;
      },
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        state.conversation = {
          id: state.conversation?.id ?? "conversation_1",
          ...(state.conversation ?? {}),
          ...(state.conversation ? update : create),
        };
        return { id: state.conversation.id };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.conversation = { id: "conversation_1", ...data };
        return state.conversation;
      },
    },
    inboundMessage: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.inboundMessages.find((item) => {
          if (item.clientId !== where.clientId) return false;
          if (where.externalMessageId && item.externalMessageId !== where.externalMessageId) return false;
          const clauses = Array.isArray(where.OR) ? where.OR as Array<Record<string, unknown>> : [];
          return clauses.length === 0 || clauses.some((clause) => {
            if (clause.waId && item.waId === clause.waId) return true;
            if (clause.waIdCanonical && item.waIdCanonical === clause.waIdCanonical) return true;
            return false;
          });
        }) ?? null,
      findUnique: async ({ where }: { where: { clientId_messageId: { clientId: string; messageId: string } } }) =>
        state.inboundMessages.find(
          (item) =>
            item.clientId === where.clientId_messageId.clientId &&
            item.messageId === where.clientId_messageId.messageId
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `inbound_${state.inboundMessages.length + 1}`, ...data };
        state.inboundMessages.push(row);
        return { id: row.id };
      },
    },
    outboundMessage: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.outboundMessages.find((item) => {
          if (item.clientId !== where.clientId) return false;
          if (where.externalMessageId && item.externalMessageId !== where.externalMessageId) return false;
          const clauses = Array.isArray(where.OR) ? where.OR as Array<Record<string, unknown>> : [];
          return clauses.length === 0 || clauses.some((clause) => {
            if (clause.waId && item.waId === clause.waId) return true;
            if (clause.waIdCanonical && item.waIdCanonical === clause.waIdCanonical) return true;
            return false;
          });
        }) ?? null,
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: `event_${state.events.length}` };
      },
    },
    department: {
      findFirst: async () => state.departments[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Record<string, unknown> = { id: "department_1", ...data };
        state.departments.push(row);
        return { id: String(row.id), name: String(row.name) };
      },
    },
    contact: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.contacts[0];
        const row = existing ? { ...existing, ...update } : { id: "contact_1", ...create };
        state.contacts[0] = row;
        return { id: row.id };
      },
    },
    contactChannelIdentity: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.identities[0];
        const row = existing ? { ...existing, ...update } : { id: "identity_1", ...create };
        state.identities[0] = row;
        return { id: row.id };
      },
    },
    lead: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.leads[0];
        const row = existing ? { ...existing, ...update } : { id: "lead_1", ...create };
        state.leads[0] = row;
        return { id: row.id };
      },
    },
    conversationRuntimeState: {
      findFirst: async () => null,
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.runtimeStates[0];
        const row: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "runtime_1", ...create };
        state.runtimeStates[0] = row;
        return {
          id: String(row.id),
          assignedUserId: typeof row.assignedUserId === "string" ? row.assignedUserId : null,
          departmentId: typeof row.departmentId === "string" ? row.departmentId : null,
          queueId: typeof row.queueId === "string" ? row.queueId : null,
          status: typeof row.status === "string" ? row.status : null,
        };
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        conversation: prisma.conversation,
        conversationMetrics: {
          findUnique: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            state.metrics.push(data);
            return data;
          },
          update: async () => null,
        },
      }),
  };
  return prisma;
}

setPrismaForTesting(fakePrisma() as never);

test("extractPhoneFromBaileysJid normalizes one-to-one WhatsApp JIDs only", () => {
  assert.equal(extractPhoneFromBaileysJid("5584999997784@s.whatsapp.net"), "5584999997784");
  assert.equal(extractPhoneFromBaileysJid("5584999997784:12@s.whatsapp.net"), "5584999997784");
  assert.equal(extractPhoneFromBaileysJid("123456789012345@lid"), null);
  assert.equal(extractPhoneFromBaileysJid("120363@g.us"), null);
});

test("shouldIgnoreBaileysInboundMessage blocks fromMe, groups and status broadcasts", () => {
  assert.equal(shouldIgnoreBaileysInboundMessage({ key: { id: "m1", remoteJid: "5584@s.whatsapp.net", fromMe: true }, message: { conversation: "x" } }).reason, "from_me");
  assert.equal(shouldIgnoreBaileysInboundMessage({ key: { id: "m2", remoteJid: "120363@g.us" }, message: { conversation: "x" } }).reason, "group");
  assert.equal(shouldIgnoreBaileysInboundMessage({ key: { id: "m3", remoteJid: "status@broadcast" }, message: { conversation: "x" } }).reason, "status_broadcast");
});

test("ingestBaileysWebSessionMessage persists tenant-scoped text inbound once", async () => {
  resetState();

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_1", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464000,
      message: { conversation: "teste inbound" },
    },
  });

  assert.equal(result.action, "persisted");
  assert.equal(state.inboundMessages.length, 1);
  assert.equal(state.inboundMessages[0]?.messageId, "web:account_1:MSG_1");
  assert.equal(state.inboundMessages[0]?.externalMessageId, "MSG_1");
  assert.equal(state.inboundMessages[0]?.channel, "whatsapp");
  assert.equal(state.inboundMessages[0]?.provider, "web_session");
  assert.equal(state.inboundMessages[0]?.type, MessageType.TEXT);
  assert.equal(state.conversation?.provider, "web_session");
  assert.equal(state.runtimeStates[0]?.provider, "web_session");
  assert.equal(state.contacts[0]?.provider, "web_session");
  assert.equal(state.identities[0]?.provider, "web_session");
  assert.equal(state.leads[0]?.provider, "web_session");
  assert.equal(state.leads[0]?.contactChannelIdentityId, "identity_1");

  const duplicate = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_1", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464001,
      message: { conversation: "teste inbound duplicado" },
    },
  });

  assert.equal(duplicate.action, "duplicate");
  assert.equal(state.inboundMessages.length, 1);
  assert.equal(state.events.some((event) => event.eventName === "whatsapp.web.inbound.duplicate"), true);
});

test("ingestBaileysWebSessionMessage resolves inbound quoted reference to local outbound", async () => {
  resetState({
    outboundMessages: [
      {
        id: "outbound_quoted",
        clientId: "client_1",
        waId: "5584999997784",
        waIdCanonical: "55849999997784",
        externalMessageId: "OUTBOUND_EXT_1",
        type: MessageType.TEXT,
        bodyText: "Mensagem enviada pelo Converta",
      },
    ],
  });

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_QUOTED", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464002,
      message: {
        extendedTextMessage: {
          text: "Respondendo a mensagem anterior",
          contextInfo: { stanzaId: "OUTBOUND_EXT_1" },
        },
      },
    },
  });

  assert.equal(result.action, "persisted");
  const rawPayload = state.inboundMessages[0]?.rawPayload as Record<string, unknown>;
  const contextualReply = rawPayload.contextualReply as Record<string, unknown>;
  assert.equal(contextualReply.replyToKind, "outbound");
  assert.equal(contextualReply.replyToInternalMessageId, "outbound_quoted");
  assert.equal(contextualReply.replyToProvider, "web_session");
  assert.equal(contextualReply.replyToProviderMessagePresent, true);
  assert.equal(contextualReply.replyToMetaMessagePresent, false);
  assert.equal(contextualReply.contextResolved, true);
  assert.equal(JSON.stringify(contextualReply).includes("OUTBOUND_EXT_1"), false);
  assert.equal(JSON.stringify(contextualReply).includes("5584999997784"), false);
  assert.equal(JSON.stringify(contextualReply).includes("Mensagem enviada pelo Converta"), false);
  assert.equal("clientPreviewBody" in contextualReply, false);
});

test("ingestBaileysWebSessionMessage accepts sender resolved from LID mapping", async () => {
  resetState();

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    resolvedSenderJid: "5584999997784@s.whatsapp.net",
    message: {
      key: { id: "MSG_LID", remoteJid: "123456789012345@lid", fromMe: false },
      messageTimestamp: 1786464000,
      message: { conversation: "teste inbound lid" },
    },
  });

  assert.equal(result.action, "persisted");
  assert.equal(state.inboundMessages[0]?.waIdCanonical, "55849999997784");
  assert.equal(state.inboundMessages[0]?.rawPayload && typeof state.inboundMessages[0].rawPayload === "object", true);
  assert.equal((state.inboundMessages[0]?.rawPayload as Record<string, unknown>).senderJidServer, "s.whatsapp.net");
});

test("ingestBaileysWebSessionMessage persists web session media references without binary payload", async () => {
  resetState();

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_IMAGE", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464000,
      message: {
        imageMessage: {
          mimetype: "image/png",
          caption: "print da tela",
        },
      },
      webSessionMedia: {
        kind: "image",
        mediaId: "web-session:media_1",
        mediaRef: "media_1",
        storageRef: "client_1/web_MSG_IMAGE-media_1.png",
        storageProvider: "local_web_session",
        mimeType: "image/png",
        fileName: "print.png",
        caption: "print da tela",
        sizeBytes: 128,
      },
    },
  });

  assert.equal(result.action, "persisted");
  assert.equal(state.inboundMessages[0]?.type, MessageType.IMAGE);
  assert.equal(state.inboundMessages[0]?.bodyText, "print da tela");
  const rawPayload = state.inboundMessages[0]?.rawPayload as { media?: Record<string, unknown> } | undefined;
  assert.equal(rawPayload?.media?.mediaId, "web-session:media_1");
  assert.equal(rawPayload?.media?.storageProvider, "local_web_session");
  assert.equal(rawPayload?.media?.mimeType, "image/png");
  assert.equal("content" in (rawPayload?.media ?? {}), false);
  assert.equal("base64" in (rawPayload?.media ?? {}), false);
  assert.equal(state.events.some((event) => event.eventName === "whatsapp.web.inbound.media.received"), true);
  assert.equal(state.events.some((event) => event.eventName === "whatsapp.web.inbound.media.persisted"), true);
});

test("ingestBaileysWebSessionMessage ignores messages older than the connection cutover", async () => {
  resetState();

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    cutoverAt: new Date("2026-08-11T12:00:00.000Z"),
    message: {
      key: { id: "MSG_OLD", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: Date.parse("2026-08-11T11:59:00.000Z") / 1000,
      message: { conversation: "mensagem antiga" },
    },
  });

  assert.equal(result.action, "ignored");
  assert.equal(result.reason, "before_cutover");
  assert.equal(state.inboundMessages.length, 0);
  assert.equal(state.events.some((event) => event.eventName === "whatsapp.web.inbound.ignored"), true);
});

test("ingestBaileysWebSessionMessage accepts messages newer than the connection cutover", async () => {
  resetState();

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    cutoverAt: new Date("2026-08-11T12:00:00.000Z"),
    message: {
      key: { id: "MSG_NEW", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: Date.parse("2026-08-11T12:00:01.000Z") / 1000,
      message: { conversation: "mensagem nova" },
    },
  });

  assert.equal(result.action, "persisted");
  assert.equal(state.inboundMessages.length, 1);
  assert.equal(state.inboundMessages[0]?.messageId, "web:account_1:MSG_NEW");
});

test("ingestBaileysWebSessionMessage does not rehydrate anonymized conversations", async () => {
  resetState({
    conversation: {
      id: "conversation_anon",
      clientId: "client_1",
      waId: "5584999997784",
      deletedAt: new Date("2026-08-01T00:00:00.000Z"),
      anonymizedAt: new Date("2026-08-01T00:01:00.000Z"),
      closedAt: new Date("2026-08-01T00:00:00.000Z"),
      departmentId: null,
    },
  });

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_ANON", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464000,
      message: { conversation: "nao reidratar" },
    },
  });

  assert.equal(result.action, "ignored");
  assert.equal(state.inboundMessages.length, 0);
  assert.equal(state.runtimeStates.length, 0);
  assert.equal(state.events.some((event) => event.eventName === "inbound.anonymized_identity_seen"), true);
  const serialized = JSON.stringify(state.events);
  assert.equal(serialized.includes("5584999997784"), false);
  assert.equal(serialized.includes("nao reidratar"), false);
});
