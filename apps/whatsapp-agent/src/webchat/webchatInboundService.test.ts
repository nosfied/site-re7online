import test from "node:test";
import assert from "node:assert/strict";
import { createWebchatInboundMessage } from "./webchatInboundService.js";

function makeDate(value: string) {
  return new Date(value);
}

function futureDate() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    clientId: "tenant_a",
    siteId: "site_1",
    visitorId: "visitor_1",
    tokenHash: "hash",
    status: "active",
    originDomain: "portal.example.com",
    expiresAt: futureDate(),
    lastSeenAt: makeDate("2026-06-21T10:00:00.000Z"),
    createdAt: makeDate("2026-06-21T10:00:00.000Z"),
    visitor: {
      id: "visitor_1",
      visitorIdHash: "visitor_hash_1",
      name: "Ana",
      email: "ana@example.com",
      phone: null,
    },
    site: {
      id: "site_1",
      clientId: "tenant_a",
      name: "Portal",
      slug: "portal",
      status: "active",
      client: {
        id: "tenant_a",
        clientKey: "demo",
        name: "Demo",
        status: "ACTIVE",
        features: { webchat: true },
        profile: "government",
      },
      allowedDomains: [{ domain: "portal.example.com" }],
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    contacts: [] as Array<Record<string, unknown>>,
    identities: [] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
    runtimeStates: [] as Array<Record<string, unknown>>,
    inboundMessages: [] as Array<Record<string, unknown>>,
    outboundMessages: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
    leadNotes: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    webchatSessions: [] as Array<Record<string, unknown>>,
    webchatVisitors: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    contact: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.contacts[0];
        const item = existing ? { ...existing, ...update } : { id: "contact_1", ...create };
        state.contacts[0] = item;
        return { id: item.id };
      },
    },
    contactChannelIdentity: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.identities[0];
        const item = existing ? { ...existing, ...update } : { id: "identity_1", ...create };
        state.identities[0] = item;
        return { id: item.id };
      },
    },
    conversation: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.conversations[0];
        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "conversation_1", ...create };
        state.conversations[0] = item;
        return { id: String(item.id), waId: String(item.waId) };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.conversations[0]) state.conversations[0] = { ...state.conversations[0], ...data };
        return { count: state.conversations[0] ? 1 : 0 };
      },
    },
    conversationRuntimeState: {
	      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
	        const existing = state.runtimeStates[0];
	        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "runtime_1", ...create };
	        state.runtimeStates[0] = item;
	        return {
	          id: String(item.id),
	          mode: item.mode,
	          handoffStatus: item.handoffStatus,
	          assignedUserId: item.assignedUserId ?? null,
	          departmentId: item.departmentId ?? null,
	          status: item.status,
	        };
	      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.runtimeStates[0]) state.runtimeStates[0] = { ...state.runtimeStates[0], ...data };
        return { count: state.runtimeStates[0] ? 1 : 0 };
      },
    },
    inboundMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: "inbound_1",
          createdAt: makeDate("2026-06-21T10:00:00.000Z"),
          ...data,
        };
        state.inboundMessages.push(item);
        return item;
      },
    },
    lead: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.leads[0];
        const item = existing ? { ...existing, ...update } : { id: "lead_1", ...create };
        state.leads[0] = item;
        return { id: item.id };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.leads[0]) state.leads[0] = { ...state.leads[0], ...data };
        return { count: state.leads[0] ? 1 : 0 };
      },
      findUnique: async () => state.leads[0] ? { id: state.leads[0].id } : null,
    },
    leadNote: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.leadNotes.push({ id: `lead_note_${state.leadNotes.length + 1}`, ...data });
        return state.leadNotes[state.leadNotes.length - 1];
      },
    },
    outboundMessage: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.outboundMessages.find((item) => item.messageId === create.messageId);
        const item = existing ? { ...existing, ...update } : { id: `outbound_${state.outboundMessages.length + 1}`, ...create };
        if (existing) {
          const index = state.outboundMessages.indexOf(existing);
          state.outboundMessages[index] = item;
        } else {
          state.outboundMessages.push(item);
        }
        return { id: item.id };
      },
    },
    webchatSession: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.webchatSessions.push(data);
        return { id: "session_1", ...data };
      },
    },
    webchatVisitor: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.webchatVisitors.push(data);
        return { id: "visitor_1", ...data };
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: "event_1" };
      },
    },
  };
  const base = {
    state,
    webchatSession: {
      findUnique: async () => makeSession(),
      update: tx.webchatSession.update,
    },
    conversationRuntimeState: {
      findFirst: async () => null,
      updateMany: tx.conversationRuntimeState.updateMany,
    },
    chatbotFlow: {
      findFirst: async () => null,
    },
    outboundMessage: {
      upsert: tx.outboundMessage.upsert,
    },
    conversation: {
      updateMany: tx.conversation.updateMany,
    },
    lead: {
      updateMany: tx.lead.updateMany,
      findUnique: tx.lead.findUnique,
    },
    leadNote: {
      create: tx.leadNote.create,
    },
    department: {
      findFirst: async () => ({ id: "department_1", name: "Atendimento Geral" }),
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  };
  return { ...base, ...overrides } as never;
}

test("createWebchatInboundMessage rejects disabled feature", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findUnique: async () => makeSession({
        site: {
          ...makeSession().site,
          client: { ...makeSession().site.client, features: { webchat: false } },
        },
      }),
    },
  });
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_1",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.10",
  });
  assert.deepEqual(result, { ok: false, error: "feature_not_enabled" });
});

test("createWebchatInboundMessage rejects invalid origin", async () => {
  const result = await createWebchatInboundMessage({
    prisma: makePrisma(),
    requestId: "req_2",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://evil.example.com",
    ip: "203.0.113.11",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_origin_not_allowed" });
});

test("createWebchatInboundMessage rejects missing session", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findUnique: async () => null,
    },
  });
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_3",
    input: { sessionToken: "wcs_missing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.12",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_session_not_found" });
});

test("createWebchatInboundMessage rejects empty message", async () => {
  const result = await createWebchatInboundMessage({
    prisma: makePrisma(),
    requestId: "req_4",
    input: { sessionToken: "wcs_existing", text: "   " },
    origin: "https://portal.example.com",
    ip: "203.0.113.13",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_message_required" });
});

test("createWebchatInboundMessage persists webchat inbound without outbound or raw token leakage", async () => {
  const realtimeEvents: Array<Record<string, unknown>> = [];
  const prisma = makePrisma() as any;
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_5",
    input: { sessionToken: "wcs_existing", text: "Preciso de atendimento" },
    origin: "https://portal.example.com",
    ip: "203.0.113.14",
    publishRealtimeEvent: (event: any) => {
      realtimeEvents.push(event);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(prisma.state.contacts.length, 1);
  assert.equal(prisma.state.identities.length, 1);
  assert.equal(prisma.state.conversations.length, 1);
  assert.equal(prisma.state.runtimeStates.length, 1);
  assert.equal(prisma.state.inboundMessages.length, 1);
  assert.equal(prisma.state.leads.length, 1);
  assert.equal(prisma.state.events.length, 1);
  assert.equal(prisma.state.inboundMessages[0].channel, "webchat");
  assert.equal(prisma.state.inboundMessages[0].provider, "converta");
  assert.equal(prisma.state.inboundMessages[0].bodyText, "Preciso de atendimento");
  assert.equal(prisma.state.runtimeStates[0].mode, "HUMAN");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING");
  assert.equal(realtimeEvents.length, 1);
  assert.equal(realtimeEvents[0].type, "message.created");
  assert.equal(JSON.stringify(prisma.state.events).includes("wcs_existing"), false);
  assert.equal(JSON.stringify(prisma.state.inboundMessages[0].rawPayload).includes("Preciso de atendimento"), false);
});

const re7IntakeFlow = {
  start: "menu_inicial",
  nodes: {
    menu_inicial: {
      type: "menu",
      text: "Olá! Sou o assistente da Re7online.\n\nEscolha o tipo de atendimento:",
      options: [
        { label: "Quero conhecer o Converta", next: "menu_perfil", context: { intent: "conhecer_converta" } },
        { label: "Quero uma apresentação ou proposta", next: "menu_perfil", context: { intent: "demo", lead_temp: "quente" } },
        { label: "Atendimento para órgão público ou licitação", next: "handoff_publico", context: { intent: "licitacao", priority: "alta" } },
        { label: "Suporte para cliente", next: "menu_suporte", context: { intent: "suporte" }, tags: ["support"] },
        { label: "Falar com atendimento humano", next: "handoff_humano", context: { handoff_reason: "solicitado_pelo_usuario" }, tags: ["handoff:direct"] },
      ],
    },
    menu_perfil: {
      type: "menu",
      text: "Qual perfil descreve melhor sua operação?",
      options: [
        { label: "Empresa privada", next: "menu_necessidade", context: { perfil: "empresa_privada" } },
        { label: "Órgão público", next: "handoff_publico", context: { perfil: "orgao_publico", priority: "alta" } },
        { label: "Escritório / serviços", next: "menu_necessidade", context: { perfil: "escritorio_servicos" } },
        { label: "Varejo", next: "menu_necessidade", context: { perfil: "varejo" } },
        { label: "Outro", next: "menu_necessidade", context: { perfil: "outro" } },
      ],
    },
    menu_necessidade: {
      type: "menu",
      text: "Qual necessidade principal você quer resolver primeiro?",
      options: [
        { label: "Centralizar atendimento", next: "handoff_lead", context: { necessidade: "centralizar_atendimento" } },
        { label: "Responder mais rápido", next: "handoff_lead", context: { necessidade: "responder_mais_rapido" } },
        { label: "Organizar histórico", next: "handoff_lead", context: { necessidade: "organizar_historico" } },
        { label: "Filas/equipe", next: "handoff_lead", context: { necessidade: "filas_equipe" } },
        { label: "Relatórios", next: "handoff_lead", context: { necessidade: "relatorios" } },
        { label: "Órgão público ou licitação", next: "handoff_publico", context: { necessidade: "licitacao", priority: "alta" } },
      ],
    },
    menu_suporte: {
      type: "menu",
      text: "Qual área precisa de suporte?",
      options: [
        { label: "Acesso/login", next: "handoff_suporte", context: { suporte_tipo: "acesso_login" } },
        { label: "WhatsApp", next: "handoff_suporte", context: { suporte_tipo: "whatsapp" } },
        { label: "Instagram/Facebook", next: "handoff_suporte", context: { suporte_tipo: "instagram_facebook" } },
        { label: "Webchat", next: "handoff_suporte", context: { suporte_tipo: "webchat" } },
        { label: "Inbox/relatórios", next: "handoff_suporte", context: { suporte_tipo: "inbox_relatorios" } },
        { label: "Instabilidade", next: "handoff_suporte", context: { suporte_tipo: "instabilidade", priority: "alta" } },
      ],
    },
    handoff_lead: {
      type: "handoff",
      text: "Perfeito. Vou encaminhar sua conversa para um consultor da Re7online. Se puder, envie nome, empresa, cidade/UF e melhor contato para retorno.",
      handoffSummary: "Atendimento comercial qualificado pela automação de intake.",
      tags: ["handoff:lead"],
    },
    handoff_publico: {
      type: "handoff",
      text: "Entendi. Vou encaminhar para atendimento especializado em órgãos públicos e licitações. Se possível, envie órgão, município/UF, prazo e contexto do edital.",
      handoffSummary: "Demanda de órgão público/licitação identificada pela automação.",
      tags: ["handoff:public_sector", "priority:high"],
    },
    handoff_suporte: {
      type: "handoff",
      text: "Vou direcionar para suporte. Se puder, envie empresa/tenant, canal afetado e uma breve descrição do problema.",
      handoffSummary: "Solicitação de suporte identificada pela automação.",
      tags: ["handoff:support"],
    },
    handoff_humano: {
      type: "handoff",
      text: "Claro. Vou te encaminhar para um atendimento humano.",
      handoffSummary: "Usuário solicitou atendimento humano.",
      tags: ["handoff:direct"],
    },
  },
};

test("createWebchatInboundMessage replies with active chatbot entry menu when configured", async () => {
  const prisma = makePrisma() as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });

  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_6",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.15",
  });

  assert.equal(result.ok, true);
  assert.equal(prisma.state.outboundMessages.length, 1);
  assert.match(String(prisma.state.outboundMessages[0].bodyText), /conhecer o Converta/i);
  assert.equal(prisma.state.outboundMessages[0].channel, "webchat");
  assert.equal(prisma.state.outboundMessages[0].rawPayload.source, "webchat_chatbot");
  assert.equal(prisma.state.runtimeStates[0].chatbotActive, true);
  assert.equal(prisma.state.runtimeStates[0].chatbotNodeId, "menu_inicial");
  assert.equal(prisma.state.runtimeStates[0].mode, "BOT");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING_USER");
});

test("createWebchatInboundMessage routes explicit human request to handoff", async () => {
  const realtimeEvents: Array<Record<string, unknown>> = [];
  const prisma = makePrisma() as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });

  await createWebchatInboundMessage({
    prisma,
    requestId: "req_7a",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.16",
    publishRealtimeEvent: (event: any) => realtimeEvents.push(event),
  });
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_7b",
    input: { sessionToken: "wcs_existing", text: "5" },
    origin: "https://portal.example.com",
    ip: "203.0.113.16",
    publishRealtimeEvent: (event: any) => realtimeEvents.push(event),
  });

  assert.equal(result.ok, true);
  assert.equal(prisma.state.outboundMessages.length, 2);
  assert.match(String(prisma.state.outboundMessages[1].bodyText), /atendimento humano/);
  assert.equal(prisma.state.runtimeStates[0].handoffStatus, "PENDING");
  assert.equal(prisma.state.runtimeStates[0].mode, "HUMAN");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING");
  assert.equal(prisma.state.runtimeStates[0].chatbotActive, false);
  assert.equal(prisma.state.leads[0].status, "QUALIFIED");
  assert.equal(prisma.state.leadNotes.length, 1);
  assert.match(String(prisma.state.leadNotes[0].body), /Usuário solicitou atendimento humano/);
  assert.equal(realtimeEvents.some((event) => event.type === "conversation.handoff.updated"), true);
});

test("createWebchatInboundMessage does not resume chatbot after handoff before closure", async () => {
  const prisma = makePrisma() as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });

  await createWebchatInboundMessage({
    prisma,
    requestId: "req_7c",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.16",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_7d",
    input: { sessionToken: "wcs_existing", text: "5" },
    origin: "https://portal.example.com",
    ip: "203.0.113.16",
  });

  const outboundCountAfterHandoff = prisma.state.outboundMessages.length;
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_7e",
    input: { sessionToken: "wcs_existing", text: "Ainda estou aguardando" },
    origin: "https://portal.example.com",
    ip: "203.0.113.16",
  });

  assert.equal(prisma.state.runtimeStates[0].mode, "HUMAN");
  assert.equal(prisma.state.runtimeStates[0].handoffStatus, "PENDING");
  assert.equal(prisma.state.outboundMessages.length, outboundCountAfterHandoff);
});

test("createWebchatInboundMessage persists captured contact fields on lead before handoff", async () => {
  const captureFlow = {
    start: "captura_nome",
    nodes: {
      captura_nome: {
        type: "capture",
        text: "Qual é o seu nome?",
        field: "contact_name",
        validation: "non_empty",
        next: "captura_email",
      },
      captura_email: {
        type: "capture",
        text: "Informe seu e-mail.",
        field: "contact_email",
        validation: "email",
        next: "captura_telefone",
      },
      captura_telefone: {
        type: "capture",
        text: "Informe telefone com DDD.",
        field: "contact_phone",
        validation: "phone_br",
        next: "menu_objetivo",
      },
      menu_objetivo: {
        type: "menu",
        text: "Qual é seu objetivo?",
        options: [{ label: "Conhecer o Converta", next: "handoff" }],
      },
      handoff: {
        type: "handoff",
        text: "Vou encaminhar.",
        handoffSummary: "Lead qualificado.",
      },
    },
  };
  const prisma = makePrisma() as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_capture", definition: captureFlow });

  await createWebchatInboundMessage({
    prisma,
    requestId: "req_8a",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.17",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_8b",
    input: { sessionToken: "wcs_existing", text: "Maria Silva" },
    origin: "https://portal.example.com",
    ip: "203.0.113.17",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_8c",
    input: { sessionToken: "wcs_existing", text: "MARIA@EXAMPLE.COM" },
    origin: "https://portal.example.com",
    ip: "203.0.113.17",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_8d",
    input: { sessionToken: "wcs_existing", text: "(84) 99999-9999" },
    origin: "https://portal.example.com",
    ip: "203.0.113.17",
  });

  assert.equal(prisma.state.leads[0].name, "Maria Silva");
  assert.equal(prisma.state.leads[0].email, "maria@example.com");
  assert.equal(prisma.state.leads[0].phone, "(84) 99999-9999");
  assert.equal(prisma.state.leads[0].status, "NEW");
  assert.equal(prisma.state.runtimeStates[0].mode, "BOT");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING_USER");
});
