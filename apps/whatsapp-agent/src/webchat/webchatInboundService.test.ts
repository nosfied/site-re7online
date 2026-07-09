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
        const existing = state.conversations.find((item) => item.clientId === create.clientId && item.waId === create.waId);
        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "conversation_1", ...create };
        if (existing) {
          state.conversations[state.conversations.indexOf(existing)] = item;
        } else {
          state.conversations.push(item);
        }
        return { id: String(item.id), waId: String(item.waId) };
      },
      updateMany: async ({ where, data }: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        state.conversations = state.conversations.map((item) => {
          if (where?.clientId && item.clientId !== where.clientId) return item;
          if (where?.waId && item.waId !== where.waId) return item;
          if (where?.channel && item.channel !== where.channel) return item;
          if (where?.channelAccountId && item.channelAccountId !== where.channelAccountId) return item;
          count += 1;
          return { ...item, ...data };
        });
        return { count };
      },
    },
    conversationRuntimeState: {
	      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
	        const existing = state.runtimeStates.find((item) => item.clientId === create.clientId && item.waId === create.waId);
	        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "runtime_1", ...create };
	        if (existing) {
	          state.runtimeStates[state.runtimeStates.indexOf(existing)] = item;
	        } else {
	          state.runtimeStates.push(item);
	        }
	        return {
	          id: String(item.id),
	          mode: item.mode,
	          handoffStatus: item.handoffStatus,
	          assignedUserId: item.assignedUserId ?? null,
	          departmentId: item.departmentId ?? null,
	          status: item.status,
	        };
	      },
      updateMany: async ({ where, data }: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        state.runtimeStates = state.runtimeStates.map((item) => {
          if (where?.clientId && item.clientId !== where.clientId) return item;
          if (where?.waId && item.waId !== where.waId) return item;
          if (where?.channel && item.channel !== where.channel) return item;
          if (where?.provider && item.provider !== where.provider) return item;
          if (where?.channelAccountId && item.channelAccountId !== where.channelAccountId) return item;
          count += 1;
          return { ...item, ...data };
        });
        return { count };
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
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const idFilter = where.id as { startsWith?: string } | undefined;
        return state.conversations.find((item) => {
          if (where.clientId && item.clientId !== where.clientId) return false;
          if (idFilter?.startsWith && !String(item.id).startsWith(idFilter.startsWith)) return false;
          return true;
        }) ?? null;
      },
    },
    lead: {
      updateMany: tx.lead.updateMany,
      findUnique: tx.lead.findUnique,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return state.leads.find((item) => {
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          if (where.waId && item.waId !== where.waId) return false;
          return true;
        }) ?? null;
      },
    },
    leadNote: {
      create: tx.leadNote.create,
    },
    department: {
      findFirst: async () => ({ id: "department_1", name: "Atendimento Geral" }),
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      findFirst: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
    webchatVisitor: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return state.webchatVisitors.find((item) => {
          if (where.clientId && item.clientId !== where.clientId) return false;
          if (where.siteId && item.siteId !== where.siteId) return false;
          if (where.visitorIdHash && item.visitorIdHash !== where.visitorIdHash) return false;
          return true;
        }) ?? null;
      },
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
        { label: "Já sou cliente e preciso de suporte", next: "menu_suporte", context: { intent: "suporte" }, tags: ["support"] },
        { label: "Sou órgão público / licitação / governo", next: "handoff_publico", context: { intent: "licitacao", priority: "alta" } },
        { label: "Quero falar com atendimento", next: "handoff_humano", context: { handoff_reason: "solicitado_pelo_usuario" }, tags: ["handoff:direct"] },
        { label: "Já tenho protocolo", next: "protocolo_numero", context: { intent: "protocol_lookup" }, tags: ["protocol_lookup"] },
      ],
    },
    protocolo_numero: {
      type: "capture",
      text: "Informe o protocolo do atendimento. Exemplo: CVT-XXXXXXXXXXXX.",
      field: "protocol_lookup_protocol",
      validation: "non_empty",
      next: "protocolo_confirmacao",
    },
    protocolo_confirmacao: {
      type: "capture",
      text: "Para sua segurança, informe o e-mail ou telefone usado no atendimento.",
      field: "protocol_lookup_contact",
      validation: "non_empty",
      next: "protocolo_resultado",
    },
    protocolo_resultado: {
      type: "text",
      text: "Vou verificar o atendimento informado.",
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
      context: { targetDepartment: "Comercial", targetQueue: "Fila Comercial" },
    },
    handoff_publico: {
      type: "handoff",
      text: "Entendi. Vou encaminhar para atendimento especializado em órgãos públicos e licitações. Se possível, envie órgão, município/UF, prazo e contexto do edital.",
      handoffSummary: "Demanda de órgão público/licitação identificada pela automação.",
      tags: ["handoff:public_sector", "priority:high"],
      context: { targetDepartment: "Governo e Licitações", targetQueue: "Fila Governo" },
    },
    handoff_suporte: {
      type: "handoff",
      text: "Vou direcionar para suporte. Se puder, envie empresa/tenant, canal afetado e uma breve descrição do problema.",
      handoffSummary: "Solicitação de suporte identificada pela automação.",
      tags: ["handoff:support"],
      context: { targetDepartment: "Suporte", targetQueue: "Fila Suporte" },
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
    input: { sessionToken: "wcs_existing", text: "4" },
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
  assert.match(String(prisma.state.outboundMessages[1].bodyText), /Protocolo: CVT-/);
  assert.match(String(prisma.state.outboundMessages[1].bodyText), /Nossa equipe dará continuidade por aqui/);
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
    input: { sessionToken: "wcs_existing", text: "4" },
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

test("createWebchatInboundMessage preserves captured lead name after human handoff", async () => {
  const captureFlow = {
    start: "captura_nome",
    nodes: {
      captura_nome: {
        type: "capture",
        text: "Qual é o seu nome?",
        field: "contact_name",
        validation: "non_empty",
        next: "menu_objetivo",
      },
      menu_objetivo: {
        type: "menu",
        text: "Qual é seu objetivo?",
        options: [{ label: "Atendimento", next: "handoff" }],
      },
      handoff: {
        type: "handoff",
        text: "Vou encaminhar.",
        handoffSummary: "Contato qualificado.",
      },
    },
  };
  const prisma = makePrisma() as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_capture", definition: captureFlow });

  await createWebchatInboundMessage({
    prisma,
    requestId: "req_10a",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.19",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_10b",
    input: { sessionToken: "wcs_existing", text: "Maria Silva" },
    origin: "https://portal.example.com",
    ip: "203.0.113.19",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_10c",
    input: { sessionToken: "wcs_existing", text: "1" },
    origin: "https://portal.example.com",
    ip: "203.0.113.19",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_10d",
    input: { sessionToken: "wcs_existing", text: "Continuo aguardando" },
    origin: "https://portal.example.com",
    ip: "203.0.113.19",
  });

  assert.equal(prisma.state.runtimeStates[0].handoffStatus, "PENDING");
  assert.equal(prisma.state.leads[0].name, "Maria Silva");
});

test("createWebchatInboundMessage applies target department and queue on support handoff", async () => {
  const departments = new Map([
    ["Suporte", { id: "department_support", name: "Suporte" }],
    ["Comercial", { id: "department_commercial", name: "Comercial" }],
    ["Governo e Licitações", { id: "department_government", name: "Governo e Licitações" }],
  ]);
  const queues = new Map([
    ["Fila Suporte", { id: "queue_support", name: "Fila Suporte", departmentId: "department_support" }],
    ["Fila Comercial", { id: "queue_commercial", name: "Fila Comercial", departmentId: "department_commercial" }],
    ["Fila Governo", { id: "queue_government", name: "Fila Governo", departmentId: "department_government" }],
  ]);
  const prisma = makePrisma({
    department: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const serialized = JSON.stringify(where);
        return Array.from(departments.entries()).find(([name]) => serialized.includes(name))?.[1] ?? null;
      },
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const serialized = JSON.stringify(where);
        return Array.from(queues.entries()).find(([name]) => serialized.includes(name))?.[1] ?? null;
      },
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
  }) as any;
  prisma.conversationRuntimeState.findFirst = async () => prisma.state.runtimeStates[0] ?? null;
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });

  await createWebchatInboundMessage({
    prisma,
    requestId: "req_9a",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.18",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_9b",
    input: { sessionToken: "wcs_existing", text: "2" },
    origin: "https://portal.example.com",
    ip: "203.0.113.18",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_9c",
    input: { sessionToken: "wcs_existing", text: "1" },
    origin: "https://portal.example.com",
    ip: "203.0.113.18",
  });

  assert.equal(prisma.state.runtimeStates[0].handoffStatus, "PENDING");
  assert.equal(prisma.state.runtimeStates[0].departmentId, "department_support");
  assert.equal(prisma.state.runtimeStates[0].queueId, "queue_support");
  assert.match(String(prisma.state.outboundMessages.at(-1)?.bodyText), /Protocolo: CVT-/);
  assert.match(String(prisma.state.outboundMessages.at(-1)?.bodyText), /Área responsável: Suporte/);
  assert.match(String(prisma.state.outboundMessages.at(-1)?.bodyText), /Fila: Fila Suporte/);
  assert.match(String(prisma.state.outboundMessages.at(-1)?.bodyText), /SLA operacional/);
});

test("createWebchatInboundMessage routes commercial and government handoff to configured queues", async () => {
  const departments = new Map([
    ["Comercial", { id: "department_commercial", name: "Comercial" }],
    ["Governo e Licitações", { id: "department_government", name: "Governo e Licitações" }],
  ]);
  const queues = new Map([
    ["Fila Comercial", { id: "queue_commercial", name: "Fila Comercial", departmentId: "department_commercial" }],
    ["Fila Governo", { id: "queue_government", name: "Fila Governo", departmentId: "department_government" }],
  ]);
  const makeRoutedPrisma = () => makePrisma({
    department: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const serialized = JSON.stringify(where);
        return Array.from(departments.entries()).find(([name]) => serialized.includes(name))?.[1] ?? null;
      },
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const serialized = JSON.stringify(where);
        return Array.from(queues.entries()).find(([name]) => serialized.includes(name))?.[1] ?? null;
      },
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
  }) as any;

  const commercialPrisma = makeRoutedPrisma();
  commercialPrisma.conversationRuntimeState.findFirst = async () => commercialPrisma.state.runtimeStates[0] ?? null;
  commercialPrisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });
  await createWebchatInboundMessage({ prisma: commercialPrisma, requestId: "req_11a", input: { sessionToken: "wcs_existing", text: "Olá" }, origin: "https://portal.example.com", ip: "203.0.113.20" });
  await createWebchatInboundMessage({ prisma: commercialPrisma, requestId: "req_11b", input: { sessionToken: "wcs_existing", text: "1" }, origin: "https://portal.example.com", ip: "203.0.113.20" });
  await createWebchatInboundMessage({ prisma: commercialPrisma, requestId: "req_11c", input: { sessionToken: "wcs_existing", text: "1" }, origin: "https://portal.example.com", ip: "203.0.113.20" });
  await createWebchatInboundMessage({ prisma: commercialPrisma, requestId: "req_11d", input: { sessionToken: "wcs_existing", text: "1" }, origin: "https://portal.example.com", ip: "203.0.113.20" });
  assert.equal(commercialPrisma.state.runtimeStates[0].departmentId, "department_commercial");
  assert.equal(commercialPrisma.state.runtimeStates[0].queueId, "queue_commercial");
  assert.match(String(commercialPrisma.state.outboundMessages.at(-1)?.bodyText), /Fila: Fila Comercial/);
  assert.match(String(commercialPrisma.state.outboundMessages.at(-1)?.bodyText), /Protocolo: CVT-/);

  const governmentPrisma = makeRoutedPrisma();
  governmentPrisma.conversationRuntimeState.findFirst = async () => governmentPrisma.state.runtimeStates[0] ?? null;
  governmentPrisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });
  await createWebchatInboundMessage({ prisma: governmentPrisma, requestId: "req_12a", input: { sessionToken: "wcs_existing", text: "Olá" }, origin: "https://portal.example.com", ip: "203.0.113.21" });
  await createWebchatInboundMessage({ prisma: governmentPrisma, requestId: "req_12b", input: { sessionToken: "wcs_existing", text: "3" }, origin: "https://portal.example.com", ip: "203.0.113.21" });
  assert.equal(governmentPrisma.state.runtimeStates[0].departmentId, "department_government");
  assert.equal(governmentPrisma.state.runtimeStates[0].queueId, "queue_government");
  assert.match(String(governmentPrisma.state.outboundMessages.at(-1)?.bodyText), /Fila: Fila Governo/);
  assert.match(String(governmentPrisma.state.outboundMessages.at(-1)?.bodyText), /Protocolo: CVT-/);
});

function useDynamicRuntimeLookup(prisma: any) {
  prisma.conversationRuntimeState.findFirst = async ({ where }: { where: Record<string, unknown> }) => {
    return prisma.state.runtimeStates.find((item: Record<string, unknown>) => {
      if (where.clientId && item.clientId !== where.clientId) return false;
      if (where.waId && item.waId !== where.waId) return false;
      if (where.channel && item.channel !== where.channel) return false;
      if (where.provider && item.provider !== where.provider) return false;
      if (where.channelAccountId && item.channelAccountId !== where.channelAccountId) return false;
      return true;
    }) ?? null;
  };
}

function useProtocolLookupDirectories(prisma: any) {
  prisma.department.findFirst = async ({ where }: { where: Record<string, unknown> }) => {
    if (where.id === "department_support" || JSON.stringify(where).includes("Suporte")) {
      return { id: "department_support", name: "Suporte" };
    }
    return { id: "department_1", name: "Atendimento Geral" };
  };
  prisma.queue.findFirst = async ({ where }: { where: Record<string, unknown> }) => {
    if (where.id === "queue_support" || JSON.stringify(where).includes("Fila Suporte")) {
      return { id: "queue_support", name: "Fila Suporte", departmentId: "department_support" };
    }
    return { id: "queue_1", name: "Fila Geral", departmentId: "department_1" };
  };
}

async function startProtocolLookupFlow(prisma: any) {
  prisma.chatbotFlow.findFirst = async () => ({ id: "flow_re7", definition: re7IntakeFlow });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_a",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.30",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_b",
    input: { sessionToken: "wcs_existing", text: "5" },
    origin: "https://portal.example.com",
    ip: "203.0.113.30",
  });
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_c",
    input: { sessionToken: "wcs_existing", text: "CVT-123E4567E89B" },
    origin: "https://portal.example.com",
    ip: "203.0.113.30",
  });
}

function seedProtocolConversation(prisma: any, overrides: Record<string, unknown> = {}) {
  prisma.state.conversations.push({
    id: "123e4567-e89b-12d3-a456-426614174000",
    clientId: "tenant_a",
    waId: "webchat:original",
    waIdCanonical: "webchat:original",
    channel: "webchat",
    provider: "converta",
    channelAccountId: "site_1",
    externalUserHash: "visitor_original",
    departmentId: "department_support",
    createdAt: makeDate("2026-07-09T10:00:00.000Z"),
    updatedAt: makeDate("2026-07-09T10:05:00.000Z"),
    lastInboundAt: makeDate("2026-07-09T10:04:00.000Z"),
    lastOutboundAt: null,
    closedAt: null,
    deletedAt: null,
    anonymizedAt: null,
    ...overrides,
  });
  prisma.state.runtimeStates.push({
    clientId: "tenant_a",
    waId: "webchat:original",
    channel: "webchat",
    provider: "converta",
    channelAccountId: "site_1",
    status: "WAITING",
    handoffStatus: "PENDING",
    departmentId: "department_support",
    queueId: "queue_support",
    updatedAt: makeDate("2026-07-09T10:06:00.000Z"),
    closedAt: null,
    ...((overrides.runtimeState as Record<string, unknown> | undefined) ?? {}),
  });
  prisma.state.leads.push({
    id: "lead_original",
    tenantId: "tenant_a",
    waId: "webchat:original",
    email: "cliente@example.com",
    phone: "(84) 99999-0000",
  });
  prisma.state.webchatVisitors.push({
    id: "visitor_original",
    clientId: "tenant_a",
    siteId: "site_1",
    visitorIdHash: "visitor_original",
    email: "cliente@example.com",
    phone: "(84) 99999-0000",
  });
}

test("createWebchatInboundMessage validates protocol lookup and routes continuation to original queue", async () => {
  const prisma = makePrisma() as any;
  useDynamicRuntimeLookup(prisma);
  useProtocolLookupDirectories(prisma);
  seedProtocolConversation(prisma);

  await startProtocolLookupFlow(prisma);
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_d",
    input: { sessionToken: "wcs_existing", text: "CLIENTE@example.com" },
    origin: "https://portal.example.com",
    ip: "203.0.113.30",
  });

  const response = String(prisma.state.outboundMessages.at(-1)?.bodyText);
  const currentRuntime = prisma.state.runtimeStates.find((item: Record<string, unknown>) => item.waId !== "webchat:original");
  assert.match(response, /Encontramos seu atendimento/);
  assert.match(response, /Protocolo: CVT-123E4567E89B/);
  assert.match(response, /Área: Suporte/);
  assert.match(response, /Fila: Fila Suporte/);
  assert.match(response, /Status: Aguardando atendimento/);
  assert.equal(currentRuntime?.departmentId, "department_support");
  assert.equal(currentRuntime?.queueId, "queue_support");
  assert.equal(currentRuntime?.handoffStatus, "PENDING");
  assert.equal(currentRuntime?.mode, "HUMAN");
  const event = prisma.state.events.find((item: Record<string, unknown>) => item.eventName === "webchat.protocol.lookup");
  assert.equal(event?.payloadJson.protocolLookup.ok, true);
  assert.equal(event?.payloadJson.protocolLookup.originalConversationId, "123e4567-e89b-12d3-a456-426614174000");
});

test("createWebchatInboundMessage does not enumerate protocol on wrong confirmation", async () => {
  const prisma = makePrisma() as any;
  useDynamicRuntimeLookup(prisma);
  useProtocolLookupDirectories(prisma);
  seedProtocolConversation(prisma);

  await startProtocolLookupFlow(prisma);
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_wrong",
    input: { sessionToken: "wcs_existing", text: "outra@example.com" },
    origin: "https://portal.example.com",
    ip: "203.0.113.31",
  });

  const response = String(prisma.state.outboundMessages.at(-1)?.bodyText);
  const currentRuntime = prisma.state.runtimeStates.find((item: Record<string, unknown>) => item.waId !== "webchat:original");
  assert.match(response, /Não consegui confirmar esse atendimento/);
  assert.doesNotMatch(response, /CVT-123E4567E89B/);
  assert.doesNotMatch(response, /Suporte/);
  assert.notEqual(currentRuntime?.queueId, "queue_support");
  const event = prisma.state.events.find((item: Record<string, unknown>) => item.eventName === "webchat.protocol.lookup");
  assert.equal(event?.payloadJson.protocolLookup.ok, false);
  assert.equal(event?.payloadJson.protocolLookup.reason, "confirmation_failed");
});

test("createWebchatInboundMessage does not reveal protocol from another tenant", async () => {
  const prisma = makePrisma() as any;
  useDynamicRuntimeLookup(prisma);
  useProtocolLookupDirectories(prisma);
  seedProtocolConversation(prisma, { clientId: "tenant_b" });

  await startProtocolLookupFlow(prisma);
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_cross_tenant",
    input: { sessionToken: "wcs_existing", text: "cliente@example.com" },
    origin: "https://portal.example.com",
    ip: "203.0.113.32",
  });

  const response = String(prisma.state.outboundMessages.at(-1)?.bodyText);
  assert.match(response, /Não consegui confirmar esse atendimento/);
  assert.doesNotMatch(response, /CVT-123E4567E89B/);
  assert.doesNotMatch(response, /Suporte/);
  const event = prisma.state.events.find((item: Record<string, unknown>) => item.eventName === "webchat.protocol.lookup");
  assert.equal(event?.payloadJson.protocolLookup.ok, false);
  assert.equal(event?.payloadJson.protocolLookup.reason, "not_found_or_cross_tenant");
});

test("createWebchatInboundMessage returns closed status only after valid protocol confirmation", async () => {
  const prisma = makePrisma() as any;
  useDynamicRuntimeLookup(prisma);
  useProtocolLookupDirectories(prisma);
  seedProtocolConversation(prisma, {
    closedAt: makeDate("2026-07-09T10:30:00.000Z"),
    runtimeState: {
      status: "CLOSED",
      closedAt: makeDate("2026-07-09T10:30:00.000Z"),
      updatedAt: makeDate("2026-07-09T10:30:00.000Z"),
    },
  });

  await startProtocolLookupFlow(prisma);
  await createWebchatInboundMessage({
    prisma,
    requestId: "req_protocol_closed",
    input: { sessionToken: "wcs_existing", text: "(84) 99999-0000" },
    origin: "https://portal.example.com",
    ip: "203.0.113.33",
  });

  const response = String(prisma.state.outboundMessages.at(-1)?.bodyText);
  assert.match(response, /Encontramos seu atendimento/);
  assert.match(response, /Status: Fechado/);
  assert.match(response, /Última atualização:/);
});
