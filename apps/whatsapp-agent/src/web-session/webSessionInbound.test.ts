import assert from "node:assert/strict";
import test from "node:test";
import { MessageType } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import { getActiveServiceCycle, getLastClosedServiceCycle } from "../conversation/serviceCycle.js";
import type { InboxRealtimeEvent } from "../realtime/events.js";
import {
  CRM_CONTACT_REACTIVATED_EVENT,
  loadOperationallyExcludedWaIds,
} from "../contacts/contactOperationalExclusion.js";
import {
  buildWebSessionHandoffNotificationPlan,
  extractPhoneFromBaileysJid,
  ingestBaileysWebSessionMessage,
  shouldIgnoreBaileysInboundMessage,
} from "./webSessionInbound.js";

test("handoff notification plan keeps OPEN base notifications ordered and unique", () => {
  const plan = buildWebSessionHandoffNotificationPlan({
    handoffText: "Vou encaminhar seu atendimento para a equipe responsável.",
    protocolText: "Protocolo CVT-TESTE",
    closeCommandGuidance: "Para encerrar, digite !SAIR!",
    queuePositionText: "Você é o nº 1 da fila.",
    offHoursMessage: null,
  });

  assert.deepEqual(plan.map((item) => item.requestSuffix), [
    "handoff",
    "protocol",
    "close-command-guidance",
    "queue-position",
  ]);
  assert.equal(plan.filter((item) => item.text.includes("!SAIR!")).length, 1);
});

test("handoff notification plan adds only next-expedient message for CLOSED", () => {
  const plan = buildWebSessionHandoffNotificationPlan({
    handoffText: "Vou encaminhar seu atendimento para a equipe responsável.",
    protocolText: "Protocolo CVT-TESTE",
    closeCommandGuidance: "Para encerrar, digite !SAIR!",
    queuePositionText: "Você é o nº 1 da fila.",
    offHoursMessage: "Atendimento no próximo expediente.",
  });

  assert.deepEqual(plan.map((item) => item.requestSuffix), [
    "handoff",
    "protocol",
    "close-command-guidance",
    "queue-position",
    "off-hours",
  ]);
  assert.equal(new Set(plan.map((item) => item.requestSuffix)).size, 5);
});

const state = {
  conversation: null as Record<string, unknown> | null,
  inboundMessages: [] as Array<Record<string, unknown>>,
  inboundMessageCreatePayloads: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  runtimeStates: [] as Array<Record<string, unknown>>,
  contacts: [] as Array<Record<string, unknown>>,
  identities: [] as Array<Record<string, unknown>>,
  leads: [] as Array<Record<string, unknown>>,
  outboundMessages: [] as Array<Record<string, unknown>>,
  metrics: [] as Array<Record<string, unknown>>,
  departments: [] as Array<Record<string, unknown>>,
  queues: [] as Array<Record<string, unknown>>,
  config: null as Record<string, unknown> | null,
  channelAccounts: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  satisfactionSurveys: [] as Array<Record<string, unknown>>,
  satisfactionResponses: [] as Array<Record<string, unknown>>,
  chatbotFlow: null as Record<string, unknown> | null,
  contactConsents: [] as Array<Record<string, unknown>>,
};

function resetState(overrides: Partial<typeof state> = {}) {
  state.conversation = overrides.conversation ?? null;
  state.inboundMessages = overrides.inboundMessages ?? [];
  state.inboundMessageCreatePayloads = overrides.inboundMessageCreatePayloads ?? [];
  state.events = overrides.events ?? [];
  state.runtimeStates = overrides.runtimeStates ?? [];
  state.contacts = overrides.contacts ?? [];
  state.identities = overrides.identities ?? [];
  state.leads = overrides.leads ?? [];
  state.outboundMessages = overrides.outboundMessages ?? [];
  state.metrics = overrides.metrics ?? [];
  state.departments = overrides.departments ?? [];
  state.queues = overrides.queues ?? [];
  state.config = overrides.config ?? null;
  state.channelAccounts = overrides.channelAccounts ?? [];
  state.users = overrides.users ?? [];
  state.satisfactionSurveys = overrides.satisfactionSurveys ?? [];
  state.satisfactionResponses = overrides.satisfactionResponses ?? [];
  state.chatbotFlow = overrides.chatbotFlow ?? null;
  state.contactConsents = overrides.contactConsents ?? [];
}

function protocolStartedEvents() {
  return state.events.filter((event) => event.eventName === "conversation.protocol.started");
}

function rawPayloadOf(row: Record<string, unknown> | undefined) {
  return row?.rawPayload as Record<string, unknown> | undefined;
}

function fakePrisma() {
  const withoutUndefined = (value: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  const prisma = {
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (!state.conversation) return null;
        if (where.clientId && state.conversation.clientId !== where.clientId) return null;
        if (where.waId && state.conversation.waId !== where.waId) return null;
        if (where.id && state.conversation.id !== where.id) return null;
        return state.conversation;
      },
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
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.conversation) state.conversation = { ...state.conversation, ...data };
        return { count: state.conversation ? 1 : 0 };
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
        state.inboundMessageCreatePayloads.push(data);
        state.inboundMessages.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: {
        where: { clientId_messageId: { clientId: string; messageId: string } };
        data: Record<string, unknown>;
      }) => {
        const index = state.inboundMessages.findIndex(
          (item) =>
            item.clientId === where.clientId_messageId.clientId &&
            item.messageId === where.clientId_messageId.messageId
        );
        if (index >= 0) state.inboundMessages[index] = { ...state.inboundMessages[index], ...data };
        return index >= 0 ? state.inboundMessages[index] : null;
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
      findUnique: async ({ where }: { where: { clientId_messageId: { clientId: string; messageId: string } } }) =>
        state.outboundMessages.find(
          (item) =>
            item.clientId === where.clientId_messageId.clientId &&
            item.messageId === where.clientId_messageId.messageId
        ) ?? null,
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const row = { id: `outbound_${state.outboundMessages.length + 1}`, ...data };
        state.outboundMessages.push(row);
        return select?.id ? { id: row.id } : row;
      },
      update: async ({ where, data, select }: { where: { clientId_messageId: { clientId: string; messageId: string } }; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const index = state.outboundMessages.findIndex(
          (item) =>
            item.clientId === where.clientId_messageId.clientId &&
            item.messageId === where.clientId_messageId.messageId
        );
        if (index >= 0) state.outboundMessages[index] = { ...state.outboundMessages[index], ...data };
        const row = index >= 0 ? state.outboundMessages[index] : null;
        return select?.id ? { id: row?.id ?? "outbound_0" } : row;
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push({ createdAt: new Date(), ...data });
        return { id: `event_${state.events.length}` };
      },
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.events.filter((event) => {
          if (where?.clientId && event.clientId !== where.clientId) return false;
          const eventNames = (where?.eventName as { in?: string[] } | undefined)?.in;
          if (eventNames && !eventNames.includes(String(event.eventName))) return false;
          const clauses = Array.isArray(where?.OR) ? where.OR as Array<Record<string, unknown>> : [];
          if (clauses.length === 0) return true;
          return clauses.some((clause) => {
            const waIds = (clause.waId as { in?: string[] } | undefined)?.in;
            if (waIds && waIds.includes(String(event.waId))) return true;
            const canonicalWaIds = (clause.waIdCanonical as { in?: string[] } | undefined)?.in;
            if (canonicalWaIds && canonicalWaIds.includes(String(event.waIdCanonical))) return true;
            return false;
          });
        }),
    },
    department: {
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.departments.find((department) => {
          if (where?.id && department.id !== where.id) return false;
          if (where?.clientId && department.clientId !== where.clientId) return false;
          if (where?.isActive !== undefined && department.isActive !== where.isActive) return false;
          const clauses = Array.isArray(where?.OR) ? where.OR as Array<Record<string, unknown>> : [];
          if (clauses.length === 0) return true;
          return clauses.some((clause) => {
            if (clause.slug && department.slug === clause.slug) return true;
            if (clause.name && department.name === clause.name) return true;
            return false;
          });
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Record<string, unknown> = { id: "department_1", ...data };
        state.departments.push(row);
        return { id: String(row.id), name: String(row.name) };
      },
    },
    queue: {
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.queues.find((queue) => {
          if (where?.id && queue.id !== where.id) return false;
          if (where?.clientId && queue.clientId !== where.clientId) return false;
          return true;
        }) ?? null,
    },
    tenantOperationalConfig: {
      findUnique: async () => state.config ? { config: state.config } : null,
    },
    channelAccount: {
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.channelAccounts.find((account) => {
          if (where?.clientId && account.clientId !== where.clientId) return false;
          if (where?.channel && account.channel !== where.channel) return false;
          if (where?.provider && account.provider !== where.provider) return false;
          if (where?.channelAccountId && account.channelAccountId !== where.channelAccountId) return false;
          return true;
        }) ?? null,
    },
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.users.find((user) => user.id === where.id && user.clientId === where.clientId && user.isActive !== false) ?? null,
    },
    satisfactionSurvey: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.satisfactionSurveys.find((survey) => {
          if (survey.clientId !== where.clientId) return false;
          if (where.conversationId && survey.conversationId !== where.conversationId) return false;
          if (where.type && survey.type !== where.type) return false;
          if (where.source && survey.source !== where.source) return false;
          const status = where.status as { in?: string[] } | string | undefined;
          if (typeof status === "string" && survey.status !== status) return false;
          if (status && typeof status === "object" && Array.isArray(status.in) && !status.in.includes(String(survey.status))) return false;
          return true;
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `survey_${state.satisfactionSurveys.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        state.satisfactionSurveys.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const index = state.satisfactionSurveys.findIndex((survey) => survey.id === where.id);
        if (index >= 0) state.satisfactionSurveys[index] = { ...state.satisfactionSurveys[index], ...data, updatedAt: new Date() };
        return state.satisfactionSurveys[index] ?? null;
      },
    },
    satisfactionResponse: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.satisfactionResponses.find((response) => {
          if (response.clientId !== where.clientId) return false;
          if (where.surveyId && response.surveyId !== where.surveyId) return false;
          if (where.id && response.id !== where.id) return false;
          return true;
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `response_${state.satisfactionResponses.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        state.satisfactionResponses.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id?: string; surveyId?: string }; data: Record<string, unknown> }) => {
        const index = state.satisfactionResponses.findIndex((response) => {
          if (where.id) return response.id === where.id;
          if (where.surveyId) return response.surveyId === where.surveyId;
          return false;
        });
        if (index >= 0) state.satisfactionResponses[index] = { ...state.satisfactionResponses[index], ...data, updatedAt: new Date() };
        return state.satisfactionResponses[index] ?? null;
      },
    },
    chatbotFlow: {
      findFirst: async () => state.chatbotFlow,
    },
    contact: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.contacts.find((contact) => {
          if (where.clientId && contact.clientId !== where.clientId) return false;
          if (where.waId && contact.waId !== where.waId) return false;
          if (where.id && contact.id !== where.id) return false;
          if (where.operationallyExcludedAt && !contact.operationallyExcludedAt) return false;
          return true;
        }) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.contacts.filter((contact) => {
          if (where?.clientId && contact.clientId !== where.clientId) return false;
          if (where?.operationallyExcludedAt && !contact.operationallyExcludedAt) return false;
          const clauses = Array.isArray(where?.OR) ? where.OR as Array<Record<string, unknown>> : [];
          if (clauses.length === 0) return true;
          return clauses.some((clause) => {
            const waIds = (clause.waId as { in?: string[] } | undefined)?.in;
            if (waIds && waIds.includes(String(contact.waId))) return true;
            const externalRefs = (clause.externalUserRef as { in?: string[] } | undefined)?.in;
            if (externalRefs && externalRefs.includes(String(contact.externalUserRef))) return true;
            const legacyWaIds = (clause.legacyWaId as { in?: string[] } | undefined)?.in;
            if (legacyWaIds && legacyWaIds.includes(String(contact.legacyWaId))) return true;
            return false;
          });
        }),
      findUnique: async () => state.contacts[0] ?? null,
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.contacts[0];
        const row = existing ? { ...existing, ...update } : { id: "contact_1", ...create };
        state.contacts[0] = row;
        return { id: row.id };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const index = state.contacts.findIndex((contact) => {
          if (where.id && contact.id !== where.id) return false;
          return true;
        });
        if (index >= 0) state.contacts[index] = { ...state.contacts[index], ...data };
        return index >= 0 ? state.contacts[index] : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const contact of state.contacts) {
          if (where.clientId && contact.clientId !== where.clientId) continue;
          if (where.id && contact.id !== where.id) continue;
          if (where.waId && contact.waId !== where.waId) continue;
          if (where.lifecycle && contact.lifecycle !== where.lifecycle) continue;
          Object.assign(contact, data);
          count += 1;
        }
        return { count };
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
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.leads.find((lead) => {
          if (where.tenantId && lead.tenantId !== where.tenantId) return false;
          if (where.waId && lead.waId !== where.waId) return false;
          if (where.id && lead.id !== where.id) return false;
          return true;
        }) ?? null,
      findUnique: async () => state.leads[0] ?? null,
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.leads[0];
        const row = existing ? { ...existing, ...update } : { id: "lead_1", ...create };
        state.leads[0] = row;
        return { id: row.id };
      },
    },
    contactConsent: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.contactConsents.find((consent) => {
          if (where.clientId && consent.clientId !== where.clientId) return false;
          if (where.purpose && consent.purpose !== where.purpose) return false;
          if (where.contactId && consent.contactId !== where.contactId) return false;
          if (where.leadId && consent.leadId !== where.leadId) return false;
          return true;
        }) ?? null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `consent_${state.contactConsents.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        state.contactConsents.push(row);
        return row;
      },
    },
    conversationRuntimeState: {
      findFirst: async () => state.runtimeStates[0] ?? null,
      findUnique: async () => state.runtimeStates[0] ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.runtimeStates.filter((runtimeState) => {
          if (where?.clientId && runtimeState.clientId !== where.clientId) return false;
          if (where?.queueId && runtimeState.queueId !== where.queueId) return false;
          if (where?.status && runtimeState.status !== where.status) return false;
          if (where?.assignedUserId === null && runtimeState.assignedUserId != null) return false;
          if (where?.closedAt === null && runtimeState.closedAt != null) return false;
          return true;
        }),
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.runtimeStates[0];
        const row: Record<string, unknown> = existing
          ? { ...existing, ...withoutUndefined(update) }
          : { id: "runtime_1", ...withoutUndefined(create) };
        state.runtimeStates[0] = row;
        return {
          id: String(row.id),
          firstSeenAt: row.firstSeenAt instanceof Date ? row.firstSeenAt : new Date("2026-08-11T12:00:00.000Z"),
          windowIsOpen: row.windowIsOpen === true,
          windowExpiresAt: row.windowExpiresAt instanceof Date ? row.windowExpiresAt : null,
          lastInboundAt: row.lastInboundAt instanceof Date ? row.lastInboundAt : null,
          lastOutboundAt: row.lastOutboundAt instanceof Date ? row.lastOutboundAt : null,
          lastInboundMessageId: typeof row.lastInboundMessageId === "string" ? row.lastInboundMessageId : null,
          lastOutboundMessageId: typeof row.lastOutboundMessageId === "string" ? row.lastOutboundMessageId : null,
          intent: typeof row.intent === "string" ? row.intent : "unknown",
          handoffStatus: typeof row.handoffStatus === "string" ? row.handoffStatus : "NONE",
          handoffRequestedAt: row.handoffRequestedAt instanceof Date ? row.handoffRequestedAt : null,
          handoffActivatedAt: row.handoffActivatedAt instanceof Date ? row.handoffActivatedAt : null,
          handoffReleasedAt: row.handoffReleasedAt instanceof Date ? row.handoffReleasedAt : null,
          flow: row.flow ?? null,
          flowStep: typeof row.flowStep === "string" ? row.flowStep : null,
          chatbotNodeId: typeof row.chatbotNodeId === "string" ? row.chatbotNodeId : null,
          chatbotActive: row.chatbotActive === true,
          answers: row.answers && typeof row.answers === "object" ? row.answers : {},
          mode: row.mode === "BOT" ? "BOT" : "HUMAN",
          assignedUserId: typeof row.assignedUserId === "string" ? row.assignedUserId : null,
          assignedTo: typeof row.assignedTo === "string" ? row.assignedTo : null,
          assignedAt: row.assignedAt instanceof Date ? row.assignedAt : null,
          departmentId: typeof row.departmentId === "string" ? row.departmentId : null,
          queueId: typeof row.queueId === "string" ? row.queueId : null,
          status: typeof row.status === "string" ? row.status : null,
          closedAt: row.closedAt instanceof Date ? row.closedAt : null,
          channel: typeof row.channel === "string" ? row.channel : null,
          provider: typeof row.provider === "string" ? row.provider : null,
          channelAccountId: typeof row.channelAccountId === "string" ? row.channelAccountId : null,
        };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.runtimeStates[0]) state.runtimeStates[0] = { ...state.runtimeStates[0], ...data };
        return { count: state.runtimeStates[0] ? 1 : 0 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.runtimeStates[0]) state.runtimeStates[0] = { ...state.runtimeStates[0], ...data };
        return state.runtimeStates[0] ?? null;
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

function withConnectedWebSession() {
  state.channelAccounts = [{
    id: "account_1",
    clientId: "client_1",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "web-session-default",
    enabled: true,
    outboundEnabled: true,
    runtimeEnabled: true,
    status: "connected",
    metadata: {
      webSession: {
        desiredState: "CONNECTED",
        observedState: "CONNECTED",
      },
    },
    client: {
      id: "client_1",
      clientKey: "tenant_1",
      status: "ACTIVE",
      features: { whatsappWebSession: true },
    },
  }];
}

async function withFakeWorker<T>(callback: () => Promise<T>) {
  const previousUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
  const previousFetch = globalThis.fetch;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = "http://worker.test";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, externalMessageId: `worker_${Date.now()}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    return await callback();
  } finally {
    if (previousUrl === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = previousUrl;
    globalThis.fetch = previousFetch;
  }
}

function closeConfig() {
  return {
    chatbotCloseCommand: {
      command: "#ENCERRAR#",
      closedMessage: "Atendimento encerrado - {dataHora} - {protocol}\n\nObrigado pelo seu contato, {contactName}! 👋\nChame sempre que precisar. 😁",
      confirmation: {
        enabled: true,
        questionText: "Encerrar o protocolo atual?\n\n1 - Sim\n2 - Não",
        cancelledText: "Encerramento cancelado. Seguimos com o atendimento.",
      },
    },
    satisfactionPolicy: {
      enabled: true,
      trigger: "HUMAN_CONVERSATION_CLOSED",
      expiresAfterMinutes: 15,
      questionText: "Pesquisa de Satisfação do Protocolo #{protocol}.\n\n5 - ⭐⭐⭐⭐⭐\n4 - ⭐⭐⭐⭐\n3 - ⭐⭐⭐\n2 - ⭐⭐\n1 - ⭐",
      commentEnabled: true,
      commentOfferText: "Poderia compartilhar conosco o que motivou essa avaliação?\n\n1 - Sim\n2 - Não",
      commentPromptText: "Digite o texto:",
      thankYouText: "Obrigad@ por participar da nossa pesquisa! 😊",
    },
  };
}

function directedServiceCloseConfig() {
  const config = closeConfig();
  return {
    ...config,
    satisfactionPolicy: {
      ...config.satisfactionPolicy,
      eligibility: "DIRECTED_SERVICE",
    },
  };
}

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

test("ingestBaileysWebSessionMessage does not recreate inactive default department", async () => {
  resetState({
    departments: [
      {
        id: "department_inactive",
        clientId: "client_1",
        name: "Atendimento Geral",
        slug: "atendimento-geral",
        isActive: false,
      },
    ],
  });

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_NO_DEFAULT_DEPARTMENT", remoteJid: "5584999999614@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464000,
      message: { conversation: "inicio" },
    },
  });

  assert.equal(result.action, "persisted");
  assert.equal(state.departments.length, 1);
  assert.equal(state.runtimeStates[0]?.departmentId, null);
  assert.equal(state.conversation?.departmentId, undefined);
});

test("ingestBaileysWebSessionMessage stores provider observed name only when local names are empty", async () => {
  resetState();

  await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_NAME", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      pushName: "Maria Cultura",
      messageTimestamp: 1786464000,
      message: { conversation: "teste inbound" },
    },
  });

  assert.equal(state.contacts[0]?.name, "Maria Cultura");
  assert.equal(state.leads[0]?.name, "Maria Cultura");

  await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_NAME_2", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      pushName: "Nome do aparelho",
      messageTimestamp: 1786464001,
      message: { conversation: "nova mensagem" },
    },
  });

  assert.equal(state.contacts[0]?.name, "Maria Cultura");
  assert.equal(state.leads[0]?.name, "Maria Cultura");
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
  assert.equal(state.inboundMessages[0]?.waIdCanonical, "5584999997784");
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

test("ingestBaileysWebSessionMessage blocks inbound media disabled by tenant policy", async () => {
  resetState({
    config: {
      whatsappMediaPolicy: {
        inbound: { image: false, audio: true, video: true, document: true },
        outbound: { image: true, audio: true, video: true, document: true },
      },
    },
  });

  const result = await ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: "MSG_IMAGE_BLOCKED", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: 1786464000,
      message: {
        imageMessage: {
          mimetype: "image/png",
          caption: "print da tela",
        },
      },
    },
  });

  assert.equal(result.action, "ignored");
  assert.equal(result.reason, "media_type_not_allowed");
  assert.equal(state.inboundMessages.length, 0);
  assert.equal(state.events.some((event) => event.eventName === "whatsapp.media_policy.blocked"), true);
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

function conversationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation_1",
    clientId: "client_1",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "web-session-default",
    departmentId: "department_general",
    queueId: "queue_general",
    ...overrides,
  };
}

function runtimeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "runtime_1",
    clientId: "client_1",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "web-session-default",
    firstSeenAt: new Date("2026-08-11T12:00:00.000Z"),
    windowIsOpen: true,
    windowExpiresAt: new Date("2026-08-12T12:00:00.000Z"),
    lastInboundAt: new Date("2026-08-11T12:00:00.000Z"),
    lastOutboundAt: null,
    intent: "unknown",
    handoffStatus: "NONE",
    handoffRequestedAt: null,
    handoffActivatedAt: null,
    handoffReleasedAt: null,
    flow: null,
    flowStep: null,
    chatbotNodeId: null,
    chatbotActive: false,
    answers: {},
    mode: "HUMAN",
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
    departmentId: "department_general",
    queueId: "queue_general",
    status: "WAITING",
    closedAt: null,
    ...overrides,
  };
}

async function ingestText(
  text: string,
  messageId: string,
  timestamp = "2026-08-11T12:00:00.000Z",
  publishHandoffRealtime?: (
    event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>
  ) => Promise<void>
) {
  return ingestBaileysWebSessionMessage({
    clientId: "client_1",
    tenantKey: "tenant_1",
    channelAccountDbId: "account_1",
    channelAccountId: "web-session-default",
    message: {
      key: { id: messageId, remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
      messageTimestamp: Date.parse(timestamp) / 1000,
      message: { conversation: text },
    },
    publishHandoffRealtime,
  });
}

test("close command keeps legacy HUMAN_ONLY CSAT from waiting conversations without an agent", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [runtimeFixture({ status: "WAITING", assignedUserId: null })],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    const requested = await ingestText("#ENCERRAR#", "MSG_CLOSE_WAITING_REQUEST");
    assert.equal(requested.action, "persisted");
    assert.equal(state.runtimeStates[0]?.status, "WAITING");
    assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("closeConfirmation"), true);

    const result = await ingestText("1", "MSG_CLOSE_WAITING_CONFIRM");
    assert.equal(result.action, "persisted");
  });

  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.runtimeStates[0]?.assignedUserId, null);
  assert.equal(state.satisfactionSurveys.length, 0);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Encerrar o protocolo atual?")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Atendimento encerrado")), true);
});

test("web session creates provisional contact while entry flow consent is pending", async () => {
  resetState({
    chatbotFlow: {
      id: "flow_consent",
      definition: {
        start: "consent",
        nodes: {
          consent: {
            type: "consent",
            purpose: "service_communications",
            textVersion: "v1",
            message: "Consentimento",
            acceptOption: "1",
            declineOption: "2",
            onAccepted: "done",
          },
          done: { type: "text", text: "OK" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_CONSENT_PROVISIONAL", "2026-08-11T12:00:00.000Z");
  });

  assert.equal(state.contacts[0]?.lifecycle, "PROVISIONAL");
});

test("web session creates active contact when no consent flow is configured", async () => {
  resetState();
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_NO_CONSENT_ACTIVE", "2026-08-11T12:00:00.000Z");
  });

  assert.equal(state.contacts[0]?.lifecycle, "ACTIVE");
});

test("web session inbound reactivates an operationally excluded contact", async () => {
  resetState({
    contacts: [
      {
        id: "contact_existing",
        clientId: "client_1",
        waId: "5584999997784",
        externalUserRef: "55849999997784",
        legacyWaId: "55849999997784",
        name: "Contato Excluido",
        lifecycle: "ACTIVE",
        operationallyExcludedAt: new Date("2026-08-11T11:00:00.000Z"),
      },
    ],
    leads: [
      {
        id: "lead_existing",
        tenantId: "client_1",
        waId: "5584999997784",
        waIdCanonical: "55849999997784",
        name: "Contato Excluido",
      },
    ],
  });
  withConnectedWebSession();

  const excludedBeforeInbound = await loadOperationallyExcludedWaIds(fakePrisma() as never, {
    clientId: "client_1",
    waIds: ["5584999997784", "55849999997784"],
  });
  assert.equal(excludedBeforeInbound.has("5584999997784") || excludedBeforeInbound.has("55849999997784"), true);

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_REACTIVATE_EXCLUDED_CONTACT", "2026-08-11T12:00:00.000Z");
  });

  assert.equal(state.contacts.length, 1);
  assert.equal(state.leads.length, 1);
  assert.equal(state.contacts[0]?.operationallyExcludedAt, null);
  assert.equal(state.contacts[0]?.lifecycle, "ACTIVE");
  assert.equal(
    state.events.some((event) => event.eventName === CRM_CONTACT_REACTIVATED_EVENT),
    true
  );
});

test("web session does not downgrade an active contact when consent is pending", async () => {
  resetState({
    contacts: [
      {
        id: "contact_existing",
        clientId: "client_1",
        waId: "5584999997784",
        name: "Contato Ativo",
        lifecycle: "ACTIVE",
      },
    ],
    chatbotFlow: {
      id: "flow_consent",
      definition: {
        start: "consent",
        nodes: {
          consent: {
            type: "consent",
            purpose: "service_communications",
            textVersion: "v1",
            message: "Consentimento",
            acceptOption: "1",
            declineOption: "2",
            onAccepted: "done",
          },
          done: { type: "text", text: "OK" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_ACTIVE_NO_DOWNGRADE", "2026-08-11T12:00:00.000Z");
  });

  assert.equal(state.contacts[0]?.lifecycle, "ACTIVE");
});

test("close command creates unattributed CSAT for directed waiting service when policy allows it", async () => {
  resetState({
    config: directedServiceCloseConfig(),
    conversation: conversationFixture(),
    runtimeStates: [runtimeFixture({ status: "WAITING", assignedUserId: null })],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("#ENCERRAR#", "MSG_CLOSE_WAITING_DIRECTED_REQUEST");
    await ingestText("1", "MSG_CLOSE_WAITING_DIRECTED_CONFIRM");
  });

  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.runtimeStates[0]?.assignedUserId, null);
  assert.equal(state.satisfactionSurveys.length, 1);
  assert.equal(state.satisfactionSurveys[0]?.assignedUserId, null);
  assert.equal(state.satisfactionSurveys[0]?.departmentId, "department_general");
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.queueId, "queue_general");
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.attribution, "no_assigned_agent");
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.eligibility, "DIRECTED_SERVICE");
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Pesquisa de Satisfação")), true);
});

test("close command cancellation keeps the previous human queue state", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: "agent_1",
        assignedTo: "Agente Um",
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("#ENCERRAR#", "MSG_CLOSE_CANCEL_REQUEST");
    await ingestText("2", "MSG_CLOSE_CANCEL_NO");
  });

  assert.equal(state.runtimeStates[0]?.mode, "HUMAN");
  assert.equal(state.runtimeStates[0]?.status, "IN_PROGRESS");
  assert.equal(state.runtimeStates[0]?.assignedUserId, "agent_1");
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("closeConfirmation"), false);
  assert.equal(state.satisfactionSurveys.length, 0);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Encerramento cancelado")), true);
});

test("close command cancellation preserves waiting queue without CSAT", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        mode: "HUMAN",
        status: "WAITING",
        handoffStatus: "ACTIVE",
        handoffActivatedAt: new Date("2026-08-11T11:59:00.000Z"),
        departmentId: "department_general",
        queueId: "queue_general",
        assignedUserId: null,
        assignedTo: null,
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("#ENCERRAR#", "MSG_WAITING_CLOSE_CANCEL_REQUEST");
    await ingestText("2", "MSG_WAITING_CLOSE_CANCEL_NO");
  });

  assert.equal(state.runtimeStates[0]?.mode, "HUMAN");
  assert.equal(state.runtimeStates[0]?.status, "WAITING");
  assert.equal(state.runtimeStates[0]?.handoffStatus, "ACTIVE");
  assert.equal(state.runtimeStates[0]?.departmentId, "department_general");
  assert.equal(state.runtimeStates[0]?.queueId, "queue_general");
  assert.equal(state.runtimeStates[0]?.closedAt, null);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("closeConfirmation"), false);
  assert.equal(state.satisfactionSurveys.length, 0);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Encerramento cancelado")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Pesquisa de Satisfação")), false);
});

test("close command creates a single attributed CSAT after human service", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "IN_PROGRESS",
        assignedUserId: "agent_1",
        assignedTo: "Agente Um",
        assignedAt: new Date("2026-08-11T11:55:00.000Z"),
        answers: {
          operationalProtocol: {
            protocol: "CVT-ABCDEF123456",
            issuedAt: "2026-08-11T11:50:00.000Z",
            cycleId: "cycle_1",
            source: "service_cycle",
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("#ENCERRAR#", "MSG_CLOSE_HUMAN_REQUEST");
    await ingestText("1", "MSG_CLOSE_HUMAN_CONFIRM");
    await ingestText("#ENCERRAR#", "MSG_CLOSE_HUMAN_DUP");
  });

  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.runtimeStates[0]?.assignedUserId, null);
  assert.equal(state.satisfactionSurveys.length, 1);
  assert.equal(state.satisfactionSurveys[0]?.assignedUserId, "agent_1");
  assert.equal(state.satisfactionSurveys[0]?.commentEnabled, true);
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.protocol, "CVT-ABCDEF123456");
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.cycleId, "cycle_1");
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(getLastClosedServiceCycle({ answers: state.runtimeStates[0]?.answers })?.protocol, "CVT-ABCDEF123456");
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("CVT-ABCDEF123456")), true);
  assert.equal((state.satisfactionSurveys[0]?.metadata as Record<string, unknown> | undefined)?.queueId, "queue_general");
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("Pesquisa de Satisfação")).length, 1);
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("Atendimento encerrado")).length, 1);
  for (const message of state.outboundMessages.filter((item) =>
    String(item.bodyText).includes("Atendimento encerrado") ||
    String(item.bodyText).includes("Pesquisa de Satisfação")
  )) {
    const serviceCycle = (message.rawPayload as Record<string, unknown> | undefined)?.serviceCycle as
      | Record<string, unknown>
      | undefined;
    assert.equal(serviceCycle?.protocol, "CVT-ABCDEF123456");
    assert.equal(serviceCycle?.cycleId, "cycle_1");
  }
});

test("close command creates a new CSAT after a previous survey was already answered", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "IN_PROGRESS",
        assignedUserId: "agent_1",
        assignedTo: "Agente Um",
        assignedAt: new Date("2026-08-11T12:20:00.000Z"),
      }),
    ],
    satisfactionSurveys: [
      {
        id: "survey_old",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "responded",
        questionText: "Pesquisa anterior",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        contactId: null,
        leadId: null,
      },
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("#ENCERRAR#", "MSG_CLOSE_REOPENED_REQUEST", "2026-08-11T12:30:00.000Z");
    await ingestText("1", "MSG_CLOSE_REOPENED_CONFIRM", "2026-08-11T12:31:00.000Z");
  });

  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.satisfactionSurveys.length, 2);
  assert.equal(state.satisfactionSurveys[1]?.assignedUserId, "agent_1");
  assert.equal(state.satisfactionSurveys[1]?.status, "sent");
  assert.equal(state.satisfactionSurveys[0]?.status, "responded");
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("Pesquisa de Satisfação")).length, 1);
});

test("close command does not close normal bot conversation", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [runtimeFixture({ mode: "BOT", status: null, assignedUserId: null })],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu",
            options: [{ label: "Atendimento", next: "done" }],
          },
          done: { type: "text", text: "Tudo certo" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    const result = await ingestText("#ENCERRAR#", "MSG_CLOSE_BOT");
    assert.equal(result.action, "persisted");
  });

  assert.notEqual(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.satisfactionSurveys.length, 0);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Atendimento encerrado")), false);
});

test("chatbot handoff opens a new human service cycle with persisted operational protocol", async () => {
  const closePolicy = closeConfig();
  closePolicy.chatbotCloseCommand.command = "!SAIR!";
  const handoffEvents: Array<Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>> = [];
  resetState({
    config: closePolicy,
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        mode: "BOT",
        status: null,
        handoffStatus: "NONE",
        handoffRequestedAt: null,
        handoffActivatedAt: null,
        chatbotActive: true,
        chatbotNodeId: "menu",
        answers: {},
        assignedUserId: null,
      }),
    ],
    departments: [
      {
        id: "department_general",
        clientId: "client_1",
        name: "Atendimento Geral",
        slug: "atendimento-geral",
        isActive: true,
      },
    ],
    queues: [
      {
        id: "queue_general",
        clientId: "client_1",
        departmentId: "department_general",
        name: "Fila Geral",
      },
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu inicial",
            options: [
              {
                label: "Outros",
                next: "handoff_1",
                departmentId: "department_general",
                queueId: "queue_general",
              },
            ],
          },
          handoff_1: {
            type: "handoff",
            text: "Aguarde só mais um pouco, estou te direcionando para um/uma atendente.",
          },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    const publishHandoffRealtime = async (
      event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>
    ) => {
      handoffEvents.push(event);
    };
    const result = await ingestText(
      "1",
      "MSG_HANDOFF_CYCLE",
      "2026-08-11T12:00:00.000Z",
      publishHandoffRealtime
    );
    assert.equal(result.action, "persisted");
    const replay = await ingestText(
      "1",
      "MSG_HANDOFF_CYCLE",
      "2026-08-11T12:00:00.000Z",
      publishHandoffRealtime
    );
    assert.equal(replay.action, "duplicate");
  });

  const runtime = state.runtimeStates[0];
  assert.equal(runtime?.mode, "HUMAN");
  assert.equal(runtime?.status, "WAITING");
  assert.equal(runtime?.handoffStatus, "ACTIVE");
  assert.equal(runtime?.chatbotActive, false);
  assert.equal(runtime?.chatbotNodeId, null);
  const answers = runtime?.answers as Record<string, unknown> | undefined;
  const operationalProtocol = answers?.operationalProtocol as Record<string, unknown> | undefined;
  assert.match(String(operationalProtocol?.protocol ?? ""), /^CVT-[A-Z0-9]{12}$/);
  assert.equal(operationalProtocol?.source, "web_session");
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("CVT-")).length, 1);
  const handoffOutbounds = state.outboundMessages.filter((message) =>
    String(message.bodyText).includes("direcionando") ||
    String(message.bodyText).includes("CVT-") ||
    String(message.bodyText).includes("!SAIR!") ||
    String(message.bodyText).includes("fila de atendimento")
  );
  assert.equal(handoffOutbounds.length, 4);
  for (const message of handoffOutbounds) {
    const serviceCycle = (message.rawPayload as Record<string, unknown> | undefined)?.serviceCycle as
      | Record<string, unknown>
      | undefined;
    assert.equal(serviceCycle?.protocol, operationalProtocol?.protocol);
    assert.equal(serviceCycle?.cycleId, operationalProtocol?.cycleId);
  }
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("!SAIR!")).length, 1);
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("#ENCERRAR#")).length, 0);
  assert.equal(state.outboundMessages.filter((message) => String(message.bodyText).includes("fila de atendimento")).length, 1);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("próximo horário")), false);
  assert.equal(handoffEvents.length, 1);
  assert.equal(handoffEvents[0]?.status, "WAITING");
  assert.equal(handoffEvents[0]?.handoffStatus, "active");
  assert.equal(handoffEvents[0]?.departmentId, "department_general");
  assert.equal(handoffEvents[0]?.departmentName, "Atendimento Geral");
  assert.equal(handoffEvents[0]?.queueId, "queue_general");
  assert.equal(handoffEvents[0]?.queueName, "Fila Geral");
  assert.equal(handoffEvents[0]?.lastInboundAt, "2026-08-11T12:00:00.000Z");
  assert.equal(handoffEvents[0]?.notificationMessage?.createdAt, "2026-08-11T12:00:00.000Z");
});

test("chatbot handoff keeps queue and department coherent when a prior default department exists", async () => {
  const handoffEvents: Array<Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>> = [];
  resetState({
    config: closeConfig(),
    conversation: conversationFixture({
      departmentId: "department_secult",
      queueId: "queue_secult",
    }),
    runtimeStates: [
      runtimeFixture({
        mode: "BOT",
        status: null,
        handoffStatus: "NONE",
        handoffRequestedAt: null,
        handoffActivatedAt: null,
        chatbotActive: true,
        chatbotNodeId: "menu",
        answers: {},
        assignedUserId: null,
        departmentId: "department_general",
        queueId: null,
      }),
    ],
    departments: [
      {
        id: "department_general",
        clientId: "client_1",
        name: "Atendimento Geral",
        slug: "atendimento-geral",
        isActive: true,
      },
      {
        id: "department_secult",
        clientId: "client_1",
        name: "Dúvidas Gerais - SECULT / PE",
        slug: "duvidas-gerais-secult-pe",
        isActive: true,
      },
    ],
    queues: [
      {
        id: "queue_secult",
        clientId: "client_1",
        departmentId: "department_secult",
        name: "Dúvidas Gerais - SECULT / PE",
      },
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu inicial",
            options: [
              {
                label: "Dúvidas gerais",
                next: "handoff_1",
                queueId: "queue_secult",
              },
            ],
          },
          handoff_1: {
            type: "handoff",
            text: "Vou encaminhar seu atendimento para a equipe responsável.",
          },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    const result = await ingestText(
      "1",
      "MSG_HANDOFF_QUEUE_DEPARTMENT",
      "2026-08-11T12:00:00.000Z",
      async (event) => {
        handoffEvents.push(event);
      }
    );
    assert.equal(result.action, "persisted");
  });

  const runtime = state.runtimeStates[0];
  assert.equal(runtime?.status, "WAITING");
  assert.equal(runtime?.mode, "HUMAN");
  assert.equal(runtime?.handoffStatus, "ACTIVE");
  assert.equal(runtime?.departmentId, "department_secult");
  assert.equal(runtime?.queueId, "queue_secult");
  assert.equal(handoffEvents.length, 1);
  assert.equal(handoffEvents[0]?.departmentId, "department_secult");
  assert.equal(handoffEvents[0]?.departmentName, "Dúvidas Gerais - SECULT / PE");
  assert.equal(handoffEvents[0]?.queueId, "queue_secult");
  assert.equal(handoffEvents[0]?.queueName, "Dúvidas Gerais - SECULT / PE");
});

test("legacy invalid human handoff without destination returns to bot flow on next inbound", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture({
      departmentId: null,
      queueId: null,
    }),
    runtimeStates: [
      runtimeFixture({
        mode: "HUMAN",
        status: "WAITING",
        handoffStatus: "ACTIVE",
        handoffRequestedAt: null,
        handoffActivatedAt: new Date("2026-08-11T11:50:00.000Z"),
        chatbotActive: false,
        chatbotNodeId: null,
        flow: null,
        answers: {},
        assignedUserId: null,
        departmentId: null,
        queueId: null,
      }),
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu inicial\n\n1 - Dúvidas gerais",
            options: [
              {
                label: "Dúvidas gerais",
                next: "handoff_1",
                departmentId: "department_secult",
                queueId: "queue_secult",
              },
            ],
          },
          handoff_1: {
            type: "handoff",
            text: "Vou encaminhar seu atendimento para a equipe responsável.",
          },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    const result = await ingestText("Oi", "MSG_INVALID_HUMAN_RECOVERY", "2026-08-11T12:00:00.000Z");
    assert.equal(result.action, "persisted");
  });

  const runtime = state.runtimeStates[0];
  assert.equal(runtime?.mode, "BOT");
  assert.equal(runtime?.status, null);
  assert.equal(runtime?.handoffStatus, "NONE");
  assert.equal(runtime?.assignedUserId, null);
  assert.equal(runtime?.departmentId, null);
  assert.equal(runtime?.queueId, null);
  assert.equal(
    state.events.some((event) => event.eventName === "queue.assignment.no_eligible_agent"),
    false
  );
  assert.equal(
    state.events.some((event) => {
      const payload = event.payloadJson as Record<string, unknown> | undefined;
      return payload?.reason === "department_required";
    }),
    false
  );
});

test("CSAT accepts only scores 1 to 5 before TTL and records the response", async () => {
  const closedAt = new Date("2026-08-11T12:00:00.000Z");
  resetState({
    config: closeConfig(),
    conversation: conversationFixture({ closedAt }),
    runtimeStates: [runtimeFixture({ mode: "HUMAN", status: "CLOSED", closedAt })],
    satisfactionSurveys: [
      {
        id: "survey_1",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "sent",
        questionText: "Pesquisa",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        commentEnabled: true,
        contactId: null,
        leadId: null,
      },
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("9", "MSG_CSAT_INVALID", "2026-08-11T12:05:00.000Z");
    await ingestText("5", "MSG_CSAT_VALID", "2026-08-11T12:06:00.000Z");
    await ingestText("4", "MSG_CSAT_DUPLICATE", "2026-08-11T12:07:00.000Z");
  });

  assert.equal(state.satisfactionResponses.length, 1);
  assert.equal(state.satisfactionResponses[0]?.score, 5);
  assert.equal(state.satisfactionSurveys[0]?.status, "pending");
  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(state.runtimeStates[0]?.mode, "HUMAN");
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal((state.runtimeStates[0]?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal((state.conversation?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("commentOffer"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Responda a pesquisa com uma nota de 1 a 5")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Poderia compartilhar conosco")), true);
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_INVALID"))?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_VALID"))?.inboxVisibility, "management_only");
  assert.equal(state.outboundMessages.every((message) => rawPayloadOf(message)?.inboxVisibility === "management_only"), true);
});

test("CSAT comment offer can be skipped after a valid score", async () => {
  const closedAt = new Date("2026-08-11T12:00:00.000Z");
  resetState({
    config: closeConfig(),
    conversation: conversationFixture({ closedAt }),
    runtimeStates: [runtimeFixture({ mode: "HUMAN", status: "CLOSED", closedAt })],
    satisfactionSurveys: [
      {
        id: "survey_1",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "sent",
        questionText: "Pesquisa",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        commentEnabled: true,
        contactId: null,
        leadId: null,
      },
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("4", "MSG_CSAT_SCORE_SKIP", "2026-08-11T12:05:00.000Z");
    await ingestText("2", "MSG_CSAT_COMMENT_SKIP", "2026-08-11T12:06:00.000Z");
  });

  assert.equal(state.satisfactionResponses.length, 1);
  assert.equal(state.satisfactionResponses[0]?.score, 4);
  assert.equal(state.satisfactionResponses[0]?.comment ?? null, null);
  assert.equal(state.satisfactionSurveys[0]?.status, "responded");
  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(state.runtimeStates[0]?.mode, "HUMAN");
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal((state.runtimeStates[0]?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal((state.conversation?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("commentOffer"), false);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("completedSurveyDecision"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Obrigad@ por participar")), true);
  assert.equal(rawPayloadOf(state.inboundMessageCreatePayloads[0])?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessageCreatePayloads[1])?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_SCORE_SKIP"))?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_COMMENT_SKIP"))?.inboxVisibility, "management_only");
  assert.equal(state.outboundMessages.every((message) => rawPayloadOf(message)?.inboxVisibility === "management_only"), true);
});

test("new CSAT score is not routed through stale completed survey decision", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          lastClosedServiceCycle: {
            protocol: "CVT-CLOSED123456",
            issuedAt: "2026-08-11T11:50:00.000Z",
            cycleId: "cycle_closed",
            source: "service_cycle",
            closedAt: "2026-08-11T12:00:00.000Z",
            closeReason: "human_close",
            closeSource: "inbox",
          },
          satisfactionRuntime: {
            completedSurveyDecision: {
              awaiting: true,
              prompted: false,
            },
          },
        },
      }),
    ],
    satisfactionSurveys: [
      {
        id: "survey_new",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "sent",
        questionText: "Pesquisa nova",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        commentEnabled: true,
        contactId: null,
        leadId: null,
      },
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("5", "MSG_NEW_CSAT_WITH_STALE_GATE", "2026-08-11T12:05:00.000Z");
  });

  assert.equal(state.satisfactionResponses.length, 1);
  assert.equal(state.satisfactionResponses[0]?.score, 5);
  assert.equal(state.satisfactionSurveys[0]?.status, "pending");
  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("commentOffer"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), false);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Poderia compartilhar conosco")), true);
});

test("CSAT comment text is saved after the customer opts in", async () => {
  const closedAt = new Date("2026-08-11T12:00:00.000Z");
  resetState({
    config: closeConfig(),
    conversation: conversationFixture({ closedAt }),
    runtimeStates: [runtimeFixture({ mode: "HUMAN", status: "CLOSED", closedAt })],
    satisfactionSurveys: [
      {
        id: "survey_1",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "sent",
        questionText: "Pesquisa",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        commentEnabled: true,
        contactId: null,
        leadId: null,
      },
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("5", "MSG_CSAT_SCORE_COMMENT", "2026-08-11T12:05:00.000Z");
    await ingestText("1", "MSG_CSAT_COMMENT_YES", "2026-08-11T12:06:00.000Z");
    await ingestText("Atendimento muito bom", "MSG_CSAT_COMMENT_TEXT", "2026-08-11T12:07:00.000Z");
  });

  assert.equal(state.satisfactionResponses.length, 1);
  assert.equal(state.satisfactionResponses[0]?.score, 5);
  assert.equal(state.satisfactionResponses[0]?.comment, "Atendimento muito bom");
  assert.equal(state.satisfactionSurveys[0]?.status, "responded");
  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(state.runtimeStates[0]?.mode, "HUMAN");
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal((state.runtimeStates[0]?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal((state.conversation?.closedAt as Date | null)?.getTime(), closedAt.getTime());
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("commentInput"), false);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("completedSurveyDecision"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Digite o texto:")), true);
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_SCORE_COMMENT"))?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_COMMENT_YES"))?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_CSAT_COMMENT_TEXT"))?.inboxVisibility, "management_only");
  assert.equal(state.outboundMessages.every((message) => rawPayloadOf(message)?.inboxVisibility === "management_only"), true);
});

test("completed CSAT asks for a new-service decision before returning to chatbot", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          flowContext: { currentMenu: "old_menu" },
          flowTags: ["old_tag"],
          operationalProtocol: {
            protocol: "CVT-OLDPROTO123",
            issuedAt: "2026-08-11T11:50:00.000Z",
            cycleId: "cycle_old",
            source: "service_cycle",
          },
          chatbotRuntime: {
            acceptedConsents: {
              "service_communications:v-test": true,
            },
          },
          satisfactionRuntime: {
            completedSurveyDecision: {
              awaiting: true,
              prompted: false,
            },
          },
        },
      }),
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "consent",
        nodes: {
          consent: {
            type: "consent",
            purpose: "service_communications",
            textVersion: "v-test",
            message: "Consentimento",
            acceptOption: "1",
            declineOption: "2",
            onAccepted: "menu",
          },
          menu: {
            type: "menu",
            text: "Menu inicial",
            options: [{ label: "Atendimento", next: "done" }],
          },
          done: { type: "text", text: "Tudo certo" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_COMPLETED_GATE_PROMPT", "2026-08-11T12:08:00.000Z");
    assert.equal(state.runtimeStates[0]?.status, "CLOSED");
    assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("\"prompted\":true"), true);
    assert.equal(protocolStartedEvents().length, 0);
    await ingestText("1", "MSG_COMPLETED_GATE_START", "2026-08-11T12:09:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 1);
  assert.equal(state.runtimeStates[0]?.mode, "BOT");
  assert.equal(state.runtimeStates[0]?.status, null);
  assert.equal(state.runtimeStates[0]?.closedAt, null);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("satisfactionRuntime"), false);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("flowContext"), false);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("flowTags"), false);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("OLDPROTO123"), false);
  assert.notEqual(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers })?.protocol, "CVT-OLDPROTO123");
  assert.equal(Boolean(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers })), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Menu inicial")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Tudo certo")), false);
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_COMPLETED_GATE_PROMPT"))?.inboxVisibility, "management_only");
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_COMPLETED_GATE_START"))?.inboxVisibility, "management_only");
});

test("completed CSAT decision repeats options for invalid input after prompt", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          satisfactionRuntime: {
            completedSurveyDecision: {
              awaiting: true,
              prompted: true,
            },
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("qualquer coisa", "MSG_COMPLETED_GATE_INVALID", "2026-08-11T12:09:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("completedSurveyDecision"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), true);
});

test("post-service decision prompt does not create a service cycle before explicit decision", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        mode: "BOT",
        status: null,
        closedAt: null,
        answers: {
          satisfactionRuntime: {
            completedSurveyDecision: {
              awaiting: true,
              prompted: false,
            },
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_POST_SERVICE_PROMPT", "2026-08-11T12:08:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("\"prompted\":true"), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), true);
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_POST_SERVICE_PROMPT"))?.inboxVisibility, "management_only");
  assert.equal(state.outboundMessages.every((message) => rawPayloadOf(message)?.inboxVisibility === "management_only"), true);
});

test("post-service decision option 2 keeps conversation closed without service cycle", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        mode: "BOT",
        status: null,
        closedAt: null,
        answers: {
          satisfactionRuntime: {
            completedSurveyDecision: {
              awaiting: true,
              prompted: true,
            },
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("2", "MSG_POST_SERVICE_NO", "2026-08-11T12:09:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Atendimento encerrado")), true);
  assert.equal(rawPayloadOf(state.inboundMessages.find((message) => message.externalMessageId === "MSG_POST_SERVICE_NO"))?.inboxVisibility, "management_only");
  assert.equal(state.outboundMessages.every((message) => rawPayloadOf(message)?.inboxVisibility === "management_only"), true);
});

test("generic inbound after CLOSED starts a new service cycle", async () => {
  resetState({
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          lastClosedServiceCycle: {
            protocol: "CVT-PREVIOUS1234",
            issuedAt: "2026-08-11T11:50:00.000Z",
            cycleId: "cycle_previous",
            source: "service_cycle",
            closedAt: "2026-08-11T12:00:00.000Z",
            closeReason: "human_close",
            closeSource: "inbox",
          },
        },
      }),
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu inicial",
            options: [{ label: "Atendimento", next: "done" }],
          },
          done: { type: "text", text: "Tudo certo" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("Oi", "MSG_CLOSED_REENTRY", "2026-08-11T12:10:00.000Z");
  });

  const active = getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers });
  assert.equal(protocolStartedEvents().length, 1);
  assert.equal(Boolean(active), true);
  assert.notEqual(active?.protocol, "CVT-PREVIOUS1234");
  assert.equal(state.runtimeStates[0]?.status, null);
});

test("expired CSAT asks for a new-service decision and option 1 returns to bot mode", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
      }),
    ],
    satisfactionSurveys: [
      {
        id: "survey_1",
        clientId: "client_1",
        conversationId: "conversation_1",
        type: "csat",
        source: "human_close",
        status: "sent",
        questionText: "Pesquisa",
        expiresAt: new Date("2026-08-11T12:15:00.000Z"),
        contactId: null,
        leadId: null,
      },
    ],
    chatbotFlow: {
      id: "flow_1",
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Menu inicial",
            options: [{ label: "Atendimento", next: "done" }],
          },
          done: { type: "text", text: "Tudo certo" },
        },
      },
    },
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("5", "MSG_CSAT_EXPIRED", "2026-08-11T12:16:00.000Z");
    assert.equal(state.satisfactionSurveys[0]?.status, "expired");
    assert.equal((state.runtimeStates[0]?.answers as Record<string, unknown> | undefined)?.satisfactionRuntime instanceof Object, true);
    assert.equal(protocolStartedEvents().length, 0);
    await ingestText("1", "MSG_CSAT_NEW_SERVICE", "2026-08-11T12:17:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 1);
  assert.equal(state.runtimeStates[0]?.mode, "BOT");
  assert.equal(state.runtimeStates[0]?.status, null);
  assert.equal(state.runtimeStates[0]?.closedAt, null);
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("satisfactionRuntime"), false);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Menu inicial")), true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Tudo certo")), false);
});

test("expired CSAT option 2 keeps the conversation closed", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          lastClosedServiceCycle: {
            protocol: "CVT-CLOSED123456",
            issuedAt: "2026-08-11T11:50:00.000Z",
            cycleId: "cycle_closed",
            source: "service_cycle",
            closedAt: "2026-08-11T12:00:00.000Z",
            closeReason: "human_close",
            closeSource: "inbox",
          },
          satisfactionRuntime: {
            awaitingExpiredSurveyDecision: true,
            expiredSurveyId: "survey_1",
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("2", "MSG_CSAT_NO_SERVICE", "2026-08-11T12:17:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal(getActiveServiceCycle({ answers: state.runtimeStates[0]?.answers }), null);
  assert.equal(getLastClosedServiceCycle({ answers: state.runtimeStates[0]?.answers })?.protocol, "CVT-CLOSED123456");
  assert.equal(JSON.stringify(state.runtimeStates[0]?.answers).includes("satisfactionRuntime"), false);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Atendimento encerrado")), true);
});

test("expired CSAT decision rejects other input without falling through to the chatbot", async () => {
  resetState({
    config: closeConfig(),
    conversation: conversationFixture(),
    runtimeStates: [
      runtimeFixture({
        status: "CLOSED",
        closedAt: new Date("2026-08-11T12:00:00.000Z"),
        answers: {
          satisfactionRuntime: {
            awaitingExpiredSurveyDecision: true,
            expiredSurveyId: "survey_1",
          },
        },
      }),
    ],
  });
  withConnectedWebSession();

  await withFakeWorker(async () => {
    await ingestText("qualquer coisa", "MSG_CSAT_OTHER", "2026-08-11T12:17:00.000Z");
  });

  assert.equal(protocolStartedEvents().length, 0);
  assert.equal(state.runtimeStates[0]?.status, "CLOSED");
  assert.equal((state.runtimeStates[0]?.answers as Record<string, unknown> | undefined)?.satisfactionRuntime instanceof Object, true);
  assert.equal(state.outboundMessages.some((message) => String(message.bodyText).includes("Deseja iniciar um novo atendimento")), true);
});
