#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

const CLIENT_KEY = process.env.BOA_ESPERANCA_POC_CLIENT_KEY || "boa-esperanca-poc";
const CLIENT_NAME = process.env.BOA_ESPERANCA_POC_CLIENT_NAME || "Boa Esperanca POC";
const PASSWORD = process.env.BOA_ESPERANCA_POC_PASSWORD || `PocDemo-${crypto.randomBytes(6).toString("hex")}`;
const TENANTS_CONFIG_PATH = path.join(process.cwd(), ".data", "tenants.json");
const WHATSAPP_PHONE_NUMBER_ID = "boa-esperanca-poc-wa-001";
const WEBCHAT_SITE_SLUG = "portal-camara-demo";

const departmentsSeed = [
  { name: "Atendimento Geral", slug: "atendimento-geral", queueName: "Fila Geral" },
  { name: "Ouvidoria", slug: "ouvidoria", queueName: "Fila Ouvidoria" },
  { name: "Protocolo", slug: "protocolo", queueName: "Fila Protocolo" },
  { name: "e-SIC", slug: "e-sic", queueName: "Fila e-SIC" },
  { name: "Diario Oficial", slug: "diario-oficial", queueName: "Fila Diario Oficial" },
];

const usersSeed = [
  { name: "Administrador POC", email: "admin@boa-esperanca-poc.local", role: "ADMIN", department: "Atendimento Geral" },
  { name: "Supervisora POC", email: "supervisor@boa-esperanca-poc.local", role: "SUPERVISOR", department: "Atendimento Geral" },
  { name: "Agente Ouvidoria", email: "ouvidoria@boa-esperanca-poc.local", role: "AGENT", department: "Ouvidoria" },
  { name: "Agente Protocolo", email: "protocolo@boa-esperanca-poc.local", role: "AGENT", department: "Protocolo" },
  { name: "Agente e-SIC", email: "esic@boa-esperanca-poc.local", role: "AGENT", department: "e-SIC" },
  { name: "Agente Diario", email: "diario@boa-esperanca-poc.local", role: "AGENT", department: "Diario Oficial" },
];

const chatbotDefinition = {
  start: "inicio",
  nodes: {
    inicio: {
      type: "menu",
      text: "Ola! Este e o atendimento digital demonstrativo da Camara. Escolha um servico.",
      options: [
        { label: "Consultar protocolo", next: "protocolo" },
        { label: "Ouvidoria", next: "ouvidoria" },
        { label: "e-SIC", next: "esic" },
        { label: "Diario Oficial", next: "diario" },
        { label: "Falar com atendente", next: "handoff" },
      ],
    },
    protocolo: {
      type: "text",
      text: "Informe o numero do protocolo. Para a POC, usaremos a API externa simulada para retornar o status.",
      next: "api_mock",
    },
    api_mock: {
      type: "text",
      text: "Protocolo POC-2026-001 localizado: em analise pela Secretaria Legislativa.",
      next: "handoff_protocolo",
    },
    ouvidoria: {
      type: "text",
      text: "Sua manifestacao sera encaminhada para a Ouvidoria. Descreva a situacao em poucas palavras.",
      next: "handoff_ouvidoria",
    },
    esic: {
      type: "text",
      text: "Para pedido de informacao, informe o tema desejado. A equipe e-SIC fara o acompanhamento.",
      next: "handoff_esic",
    },
    diario: {
      type: "text",
      text: "A publicacao demonstrativa mais recente esta disponivel no portal. Posso encaminhar para o setor responsavel.",
      next: "handoff_diario",
    },
    handoff: {
      type: "handoff",
      text: "Vou encaminhar seu atendimento para um servidor responsavel.",
    },
    handoff_protocolo: {
      type: "handoff",
      text: "Encaminhei sua consulta para o setor de Protocolo.",
    },
    handoff_ouvidoria: {
      type: "handoff",
      text: "Encaminhei sua manifestacao para a Ouvidoria.",
    },
    handoff_esic: {
      type: "handoff",
      text: "Encaminhei seu pedido para a equipe e-SIC.",
    },
    handoff_diario: {
      type: "handoff",
      text: "Encaminhei sua solicitacao para o setor de Diario Oficial.",
    },
  },
};

const knowledgeSeed = [
  {
    collection: { key: "portal", name: "Portal Institucional", description: "Informacoes publicas do portal demonstrativo." },
    articles: [
      {
        key: "portal-horario-atendimento",
        title: "Horario de atendimento da Camara",
        question: "Qual o horario de atendimento?",
        summary: "Atendimento em dias uteis, em horario comercial demonstrativo.",
        body: "Para a POC, o atendimento institucional ocorre de segunda a sexta, das 7h as 13h. O cidadao tambem pode registrar demanda pelo atendimento digital.",
        tags: ["portal", "horario", "atendimento"],
        intentKeys: ["horario_atendimento", "portal_institucional"],
      },
    ],
  },
  {
    collection: { key: "ouvidoria", name: "Ouvidoria", description: "Orientacoes sobre manifestacoes e acompanhamento." },
    articles: [
      {
        key: "ouvidoria-manifestacao",
        title: "Como registrar manifestacao",
        question: "Como registro uma manifestacao na Ouvidoria?",
        summary: "A manifestacao pode ser registrada pelo atendimento digital e direcionada ao setor responsavel.",
        body: "O cidadao informa o assunto, recebe protocolo demonstrativo e a equipe de Ouvidoria acompanha o andamento pelo Inbox.",
        tags: ["ouvidoria", "manifestacao", "protocolo"],
        intentKeys: ["ouvidoria", "manifestacao"],
      },
    ],
  },
  {
    collection: { key: "protocolo", name: "Protocolo", description: "Consulta e registro de protocolos institucionais." },
    articles: [
      {
        key: "protocolo-consulta",
        title: "Consulta de protocolo",
        question: "Como consultar um protocolo?",
        summary: "O status pode ser consultado por numero de protocolo na API externa simulada da POC.",
        body: "Na POC, o protocolo POC-2026-001 retorna status em analise e registra a consulta na timeline do atendimento.",
        tags: ["protocolo", "api", "consulta"],
        intentKeys: ["protocolo", "api_externa"],
      },
    ],
  },
  {
    collection: { key: "esic", name: "e-SIC", description: "Pedidos de acesso a informacao." },
    articles: [
      {
        key: "esic-pedido-informacao",
        title: "Pedido de acesso a informacao",
        question: "Como faco um pedido pelo e-SIC?",
        summary: "O pedido e direcionado ao setor e-SIC para registro e acompanhamento.",
        body: "O cidadao informa o tema desejado, recebe protocolo e acompanha a resposta pelo canal de atendimento.",
        tags: ["esic", "informacao", "lgpd"],
        intentKeys: ["esic", "acesso_informacao"],
      },
    ],
  },
  {
    collection: { key: "diario-oficial", name: "Diario Oficial", description: "Consulta a publicacoes demonstrativas." },
    articles: [
      {
        key: "diario-consulta-publicacao",
        title: "Consulta ao Diario Oficial",
        question: "Como encontro uma publicacao?",
        summary: "A POC demonstra consulta simulada a publicacao institucional.",
        body: "O atendimento pode orientar o cidadao e registrar a solicitacao para retorno pelo setor de Diario Oficial.",
        tags: ["diario", "publicacao", "portal"],
        intentKeys: ["diario_oficial", "publicacao"],
      },
    ],
  },
];

const conversationSeed = [
  {
    channel: "webchat",
    contact: "Cidadao POC Webchat",
    handle: "webchat:portal-visitante-001",
    department: "Protocolo",
    assigned: "protocolo@boa-esperanca-poc.local",
    status: "IN_PROGRESS",
    service: "consulta de protocolo",
    minutesAgo: 12,
    messages: [
      ["INBOUND", "Quero consultar o protocolo POC-2026-001."],
      ["OUTBOUND", "Seu protocolo de atendimento e CV-2026-POC-001. Guarde este numero para acompanhamento."],
      ["OUTBOUND", "Consulta simulada: POC-2026-001 esta em analise pela Secretaria Legislativa."],
      ["INBOUND", "Obrigado, quero receber retorno quando houver atualizacao."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Maria POC Ouvidoria",
    handle: "+55 66 98888-0101",
    department: "Ouvidoria",
    assigned: "ouvidoria@boa-esperanca-poc.local",
    status: "IN_PROGRESS",
    service: "manifestacao de ouvidoria",
    minutesAgo: 28,
    messages: [
      ["INBOUND", "Preciso registrar uma manifestacao sobre iluminacao publica."],
      ["OUTBOUND", "Recebemos sua manifestacao. Vou encaminhar para a Ouvidoria."],
      ["OUTBOUND", "Seu protocolo de atendimento e CV-2026-POC-002."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Joao POC e-SIC",
    handle: "+55 66 98888-0102",
    department: "e-SIC",
    assigned: "esic@boa-esperanca-poc.local",
    status: "WAITING_USER",
    service: "pedido de informacao",
    minutesAgo: 47,
    messages: [
      ["INBOUND", "Como faco pedido de informacao pelo e-SIC?"],
      ["OUTBOUND", "Voce pode informar o tema por aqui. Nossa equipe e-SIC registrara o acompanhamento."],
      ["INBOUND", "Quero dados sobre sessoes legislativas do mes."],
    ],
  },
  {
    channel: "webchat",
    contact: "Visitante Diario Oficial",
    handle: "webchat:portal-visitante-002",
    department: "Diario Oficial",
    assigned: "diario@boa-esperanca-poc.local",
    status: "WAITING",
    service: "consulta diario oficial",
    minutesAgo: 65,
    messages: [
      ["INBOUND", "Onde encontro a publicacao da ultima sessao?"],
      ["OUTBOUND", "Vou consultar a publicacao demonstrativa no fluxo do Diario Oficial."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Ana POC Geral",
    handle: "+55 66 98888-0103",
    department: "Atendimento Geral",
    assigned: null,
    status: "WAITING",
    service: "triagem geral",
    minutesAgo: 96,
    messages: [
      ["INBOUND", "Quero falar com um atendente."],
      ["OUTBOUND", "Vou encaminhar voce para a fila de Atendimento Geral."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Pedro POC Resolvido",
    handle: "+55 66 98888-0104",
    department: "Protocolo",
    assigned: "protocolo@boa-esperanca-poc.local",
    status: "CLOSED",
    service: "segunda via de protocolo",
    minutesAgo: 240,
    messages: [
      ["INBOUND", "Preciso da segunda via do meu protocolo."],
      ["OUTBOUND", "Seu protocolo de atendimento e CV-2026-POC-003."],
      ["OUTBOUND", "Enviei as orientacoes para acompanhamento. Atendimento finalizado."],
    ],
  },
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function canonicalize(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return String(value);
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function iso(date) {
  return date ? date.toISOString() : null;
}

function syntheticIdentity(channel, handle) {
  if (channel === "whatsapp") return canonicalize(handle);
  return `${channel}:${sha256(`${CLIENT_KEY}:${handle}`).slice(0, 24)}`;
}

async function assertSafeDatabase() {
  const database = await prisma.$queryRawUnsafe("select current_database() as db");
  const currentDatabase = database?.[0]?.db;
  if (currentDatabase !== "whatsapp_agent") {
    throw new Error(`refusing_to_seed_unexpected_database:${currentDatabase}`);
  }
  return currentDatabase;
}

async function upsertClient() {
  return prisma.client.upsert({
    where: { clientKey: CLIENT_KEY },
    update: {
      name: CLIENT_NAME,
      status: "ACTIVE",
      profile: "government",
      features: {
        webchat: true,
        webchatOutbound: true,
        advancedSearch: true,
        advancedSearchRuntime: true,
        publicApi: true,
        reports: true,
        scheduling: false,
        crm: false,
        campaigns: false,
      },
    },
    create: {
      clientKey: CLIENT_KEY,
      name: CLIENT_NAME,
      status: "ACTIVE",
      profile: "government",
      features: {
        webchat: true,
        webchatOutbound: true,
        advancedSearch: true,
        advancedSearchRuntime: true,
        publicApi: true,
        reports: true,
        scheduling: false,
        crm: false,
        campaigns: false,
      },
    },
  });
}

async function upsertTenantConfig() {
  await fs.mkdir(path.dirname(TENANTS_CONFIG_PATH), { recursive: true });
  let tenants = {};
  try {
    tenants = JSON.parse(await fs.readFile(TENANTS_CONFIG_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const current = tenants && typeof tenants === "object" && !Array.isArray(tenants) ? tenants[CLIENT_KEY] ?? {} : {};
  tenants[CLIENT_KEY] = {
    ...current,
    id: CLIENT_KEY,
    name: CLIENT_NAME,
    allowlist: Array.isArray(current.allowlist) ? current.allowlist : [],
    handoffAttendantWaid: "",
    metaPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    defaultLanguage: "pt_BR",
    maxActiveAppUsers: 15,
    disableChatbot: false,
    appDisableChatbot: false,
    disableLegacyFlows: true,
    disableAiFallback: false,
    appDisableAiFallback: false,
    channelAccounts: [
      {
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: WHATSAPP_PHONE_NUMBER_ID,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        aiEnabled: true,
        handoffEnabled: true,
        status: "connected",
      },
      {
        channel: "webchat",
        provider: "converta",
        channelAccountId: `${CLIENT_KEY}-webchat`,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        aiEnabled: true,
        handoffEnabled: true,
        status: "connected",
      },
    ],
  };
  await fs.writeFile(TENANTS_CONFIG_PATH, `${JSON.stringify(tenants, null, 2)}\n`, "utf8");
}

async function upsertDepartments(clientId) {
  const departments = {};
  for (const item of departmentsSeed) {
    const department = await prisma.department.upsert({
      where: { clientId_slug: { clientId, slug: item.slug } },
      update: { name: item.name, isActive: true },
      create: { clientId, name: item.name, slug: item.slug, isActive: true },
    });
    const queue = await prisma.queue.upsert({
      where: { clientId_departmentId_name: { clientId, departmentId: department.id, name: item.queueName } },
      update: {},
      create: { clientId, departmentId: department.id, name: item.queueName },
    });
    departments[item.name] = { ...department, queue };
  }
  return departments;
}

async function upsertUsers(clientId, departments) {
  const passwordHash = hashPassword(PASSWORD);
  const users = {};
  for (const item of usersSeed) {
    const existing = await prisma.user.findUnique({ where: { email: item.email } });
    if (existing && existing.clientId !== clientId) {
      throw new Error(`user_email_already_in_use:${item.email}`);
    }
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        name: item.name,
        role: item.role,
        isActive: true,
        departmentId: departments[item.department].id,
        passwordHash,
      },
      create: {
        clientId,
        name: item.name,
        email: item.email,
        role: item.role,
        isActive: true,
        departmentId: departments[item.department].id,
        passwordHash,
      },
    });
    users[item.email] = user;
  }
  return users;
}

async function clearDemoData(clientId) {
  const conversations = await prisma.conversation.findMany({ where: { clientId }, select: { id: true } });
  const conversationIds = conversations.map((item) => item.id);
  const deliveries = await prisma.webhookDelivery.findMany({ where: { clientId }, select: { id: true } });
  const deliveryIds = deliveries.map((item) => item.id);
  const sites = await prisma.webchatSite.findMany({ where: { clientId }, select: { id: true } });
  const siteIds = sites.map((item) => item.id);

  await prisma.$transaction([
    prisma.conversationAssignment.deleteMany({ where: { conversationId: { in: conversationIds } } }),
    prisma.conversationMetrics.deleteMany({ where: { clientId } }),
    prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } }),
    prisma.conversation.deleteMany({ where: { clientId } }),
    prisma.conversationRuntimeState.deleteMany({ where: { clientId } }),
    prisma.inboundMessage.deleteMany({ where: { clientId } }),
    prisma.outboundMessage.deleteMany({ where: { clientId } }),
    prisma.event.deleteMany({ where: { clientId } }),
    prisma.leadNote.deleteMany({ where: { tenantId: clientId } }),
    prisma.lead.deleteMany({ where: { tenantId: clientId } }),
    prisma.contactChannelIdentity.deleteMany({ where: { clientId } }),
    prisma.contact.deleteMany({ where: { clientId } }),
    prisma.webhookAttempt.deleteMany({ where: { deliveryId: { in: deliveryIds } } }),
    prisma.webhookDelivery.deleteMany({ where: { clientId } }),
    prisma.webhookEndpoint.deleteMany({ where: { clientId } }),
    prisma.publicApiKey.deleteMany({ where: { clientId } }),
    prisma.webchatSession.deleteMany({ where: { siteId: { in: siteIds } } }),
    prisma.webchatVisitor.deleteMany({ where: { siteId: { in: siteIds } } }),
    prisma.webchatAllowedDomain.deleteMany({ where: { siteId: { in: siteIds } } }),
    prisma.webchatSettings.deleteMany({ where: { clientId } }),
    prisma.webchatSite.deleteMany({ where: { clientId } }),
    prisma.knowledgeBaseArticle.deleteMany({ where: { clientId } }),
    prisma.knowledgeBaseCollection.deleteMany({ where: { clientId } }),
  ]);
}

async function seedKnowledgeBase(clientId, users) {
  const adminId = users["admin@boa-esperanca-poc.local"]?.id ?? null;
  let articles = 0;
  for (const item of knowledgeSeed) {
    const collection = await prisma.knowledgeBaseCollection.upsert({
      where: { clientId_key: { clientId, key: item.collection.key } },
      update: { name: item.collection.name, description: item.collection.description, status: "active", visibility: "tenant" },
      create: { clientId, ...item.collection, status: "active", visibility: "tenant" },
    });
    for (const article of item.articles) {
      await prisma.knowledgeBaseArticle.upsert({
        where: { clientId_key: { clientId, key: article.key } },
        update: {
          collectionId: collection.id,
          title: article.title,
          summary: article.summary,
          question: article.question,
          body: article.body,
          tags: article.tags,
          intentKeys: article.intentKeys,
          status: "published",
          visibility: "tenant",
          updatedByUserId: adminId,
          publishedByUserId: adminId,
          publishedAt: new Date(),
        },
        create: {
          clientId,
          collectionId: collection.id,
          ...article,
          tags: article.tags,
          intentKeys: article.intentKeys,
          sourceType: "manual",
          sourceNote: "Conteudo ficticio para POC Boa Esperanca.",
          status: "published",
          visibility: "tenant",
          createdByUserId: adminId,
          updatedByUserId: adminId,
          publishedByUserId: adminId,
          publishedAt: new Date(),
        },
      });
      articles += 1;
    }
  }
  return { collections: knowledgeSeed.length, articles };
}

async function seedChatbotFlow(clientId) {
  await prisma.chatbotFlow.updateMany({ where: { clientId }, data: { entryPoint: false, isActive: false } });
  return prisma.chatbotFlow.create({
    data: {
      clientId,
      name: "POC Boa Esperanca - Atendimento Institucional",
      isActive: true,
      entryPoint: true,
      definition: chatbotDefinition,
    },
  });
}

async function seedWebchat(clientId) {
  const site = await prisma.webchatSite.upsert({
    where: { clientId_slug: { clientId, slug: WEBCHAT_SITE_SLUG } },
    update: {
      name: "Portal Institucional Demonstrativo",
      status: "active",
      metadata: { poc: true, source: "seed-boa-esperanca-poc" },
    },
    create: {
      clientId,
      name: "Portal Institucional Demonstrativo",
      slug: WEBCHAT_SITE_SLUG,
      status: "active",
      metadata: { poc: true, source: "seed-boa-esperanca-poc" },
    },
  });
  await prisma.webchatSettings.upsert({
    where: { siteId: site.id },
    update: {
      welcomeMessage: "Bem-vindo ao atendimento digital demonstrativo da Camara.",
      collectName: true,
      collectEmail: false,
      collectPhone: false,
      allowAnonymous: true,
      theme: { primaryColor: "#0f766e", position: "bottom-right" },
      metadata: { poc: true },
    },
    create: {
      clientId,
      siteId: site.id,
      welcomeMessage: "Bem-vindo ao atendimento digital demonstrativo da Camara.",
      collectName: true,
      collectEmail: false,
      collectPhone: false,
      allowAnonymous: true,
      theme: { primaryColor: "#0f766e", position: "bottom-right" },
      metadata: { poc: true },
    },
  });
  await prisma.webchatAllowedDomain.upsert({
    where: { siteId_domain: { siteId: site.id, domain: "poc.boa-esperanca.local" } },
    update: { active: true },
    create: { clientId, siteId: site.id, domain: "poc.boa-esperanca.local", active: true },
  });
  return site;
}

async function seedApiEvidence(clientId, users) {
  const demoKeyMaterial = `${CLIENT_KEY}:public-api-poc:do-not-use-as-secret`;
  await prisma.publicApiKey.create({
    data: {
      clientId,
      name: "POC API Externa Simulada",
      keyPrefix: "poc_be",
      keyHash: sha256(demoKeyMaterial),
      scopes: ["conversations:read", "reports:read", "webhooks:write"],
      status: "active",
      rateLimitPerMinute: 60,
      createdByUserId: users["admin@boa-esperanca-poc.local"]?.id ?? null,
    },
  });
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      clientId,
      name: "Mock Protocolo Institucional",
      url: "https://poc.boa-esperanca.local/api/protocolo",
      signingSecretHash: sha256(`${CLIENT_KEY}:mock-webhook-secret`),
      active: true,
      createdByUserId: users["admin@boa-esperanca-poc.local"]?.id ?? null,
    },
  });
  const delivery = await prisma.webhookDelivery.create({
    data: {
      clientId,
      endpointId: endpoint.id,
      eventType: "poc.protocol.lookup",
      payloadHash: sha256(JSON.stringify({ protocol: "POC-2026-001", status: "em_analise" })),
      status: "delivered",
    },
  });
  await prisma.webhookAttempt.create({
    data: {
      clientId,
      deliveryId: delivery.id,
      attemptNumber: 1,
      status: "success",
      responseCode: 200,
    },
  });
  await prisma.event.create({
    data: {
      clientId,
      requestId: "boa-esperanca-poc-api-mock",
      eventName: "poc.external_api.mocked",
      payloadJson: {
        protocol: "POC-2026-001",
        endpoint: "https://poc.boa-esperanca.local/api/protocolo",
        result: "em_analise",
        note: "Evidencia ficticia para POC; nao contem credenciais reais.",
      },
    },
  });
}

async function seedConversations(client, departments, users) {
  const now = new Date();
  const runtimeStates = [];
  for (let index = 0; index < conversationSeed.length; index += 1) {
    const seed = conversationSeed[index];
    const startAt = addMinutes(now, -seed.minutesAgo);
    const waId = syntheticIdentity(seed.channel, seed.handle);
    const waIdCanonical = seed.channel === "whatsapp" ? canonicalize(seed.handle) : waId;
    const channelAccountId = seed.channel === "whatsapp" ? WHATSAPP_PHONE_NUMBER_ID : `${CLIENT_KEY}-webchat`;
    const externalUserHash = sha256(`${CLIENT_KEY}:${seed.channel}:${seed.handle}`);
    const department = departments[seed.department];
    const assignedUser = seed.assigned ? users[seed.assigned] : null;
    const firstAssignedAt = assignedUser ? addMinutes(startAt, 4) : null;
    const closedAt = seed.status === "CLOSED" ? addMinutes(startAt, seed.messages.length * 4 + 10) : null;
    const timeline = seed.messages.map(([direction, text], messageIndex) => ({
      direction,
      text,
      id: `boa-poc-${index + 1}-${messageIndex + 1}`,
      at: addMinutes(startAt, messageIndex * 4),
    }));
    const lastInboundAt = [...timeline].reverse().find((item) => item.direction === "INBOUND")?.at ?? startAt;
    const lastOutboundAt = [...timeline].reverse().find((item) => item.direction === "OUTBOUND")?.at ?? null;
    const updatedAt = timeline[timeline.length - 1].at;

    const contact = await prisma.contact.create({
      data: {
        clientId: client.id,
        waId,
        name: seed.contact,
        channel: seed.channel,
        provider: seed.channel === "whatsapp" ? "meta" : "converta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        createdAt: startAt,
        updatedAt,
      },
    });
    const identity = await prisma.contactChannelIdentity.create({
      data: {
        clientId: client.id,
        contactId: contact.id,
        channel: seed.channel,
        provider: seed.channel === "whatsapp" ? "meta" : "converta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        displayName: seed.contact,
        firstSeenAt: startAt,
        lastSeenAt: lastInboundAt,
        createdAt: startAt,
        updatedAt,
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        clientId: client.id,
        departmentId: department.id,
        waId,
        waIdCanonical,
        phoneNumberId: seed.channel === "whatsapp" ? WHATSAPP_PHONE_NUMBER_ID : null,
        channel: seed.channel,
        provider: seed.channel === "whatsapp" ? "meta" : "converta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        windowIsOpen: seed.status !== "CLOSED",
        windowExpiresAt: seed.status === "CLOSED" ? null : addMinutes(now, 24 * 60),
        firstAssignedAt,
        firstResponseAt: lastOutboundAt ? addMinutes(startAt, 4) : null,
        lastResponseAt: lastOutboundAt,
        closedAt,
        lastInboundAt,
        lastOutboundAt,
        createdAt: startAt,
        updatedAt,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        tenantId: client.id,
        waId,
        waIdCanonical,
        channel: seed.channel,
        provider: seed.channel === "whatsapp" ? "meta" : "converta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        contactChannelIdentityId: identity.id,
        name: seed.contact,
        phone: seed.channel === "whatsapp" ? seed.handle : null,
        city: "Boa Esperanca do Norte/MT - POC ficticia",
        service: seed.service,
        status: seed.status === "CLOSED" ? "RESOLVED" : seed.status === "WAITING" ? "NEW" : "QUALIFIED",
        createdAt: startAt,
        updatedAt,
      },
    });
    await prisma.leadNote.create({
      data: {
        tenantId: client.id,
        leadId: lead.id,
        body: `POC Boa Esperanca: ${seed.service}. Dados ficticios para demonstracao.`,
        createdAt: addMinutes(startAt, 2),
      },
    });
    for (const item of timeline) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: item.direction,
          messageId: item.id,
          waId,
          type: "TEXT",
          bodyText: item.text,
          status: item.direction === "INBOUND" ? "RECEIVED" : "SENT",
          requestId: `boa-esperanca-poc-${index + 1}`,
          metaMessageId: item.direction === "OUTBOUND" ? `meta.${item.id}` : null,
          createdAt: item.at,
        },
      });
      if (item.direction === "INBOUND") {
        await prisma.inboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: seed.channel === "whatsapp" ? WHATSAPP_PHONE_NUMBER_ID : null,
            waId,
            waIdCanonical,
            messageId: item.id,
            channel: seed.channel,
            provider: seed.channel === "whatsapp" ? "meta" : "converta",
            channelAccountId,
            externalUserHash,
            externalMessageId: item.id,
            legacyWaId: seed.channel === "whatsapp" ? waId : null,
            type: "TEXT",
            bodyText: item.text,
            allowlistHit: true,
            requestId: `boa-esperanca-poc-${index + 1}`,
            rawPayload: { demo: true, bid: "boa-esperanca", channel: seed.channel },
            createdAt: item.at,
          },
        });
      } else {
        await prisma.outboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: seed.channel === "whatsapp" ? WHATSAPP_PHONE_NUMBER_ID : null,
            waId,
            waIdCanonical,
            messageId: item.id,
            channel: seed.channel,
            provider: seed.channel === "whatsapp" ? "meta" : "converta",
            channelAccountId,
            externalUserHash,
            externalMessageId: item.id,
            legacyWaId: seed.channel === "whatsapp" ? waId : null,
            type: "TEXT",
            status: "SENT",
            bodyText: item.text,
            requestId: `boa-esperanca-poc-${index + 1}`,
            metaMessageId: `meta.${item.id}`,
            rawPayload: { demo: true, bid: "boa-esperanca", status: { lastStatus: "DELIVERED" } },
            createdAt: item.at,
          },
        });
      }
    }
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: client.id,
        waId,
        waIdCanonical,
        conversationKey: `${client.clientKey}:${waIdCanonical}`,
        channel: seed.channel,
        provider: seed.channel === "whatsapp" ? "meta" : "converta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        firstSeenAt: startAt,
        windowIsOpen: seed.status !== "CLOSED",
        windowExpiresAt: seed.status === "CLOSED" ? null : addMinutes(now, 24 * 60),
        lastInboundAt,
        lastOutboundAt,
        lastInboundMessageId: [...timeline].reverse().find((item) => item.direction === "INBOUND")?.id ?? null,
        lastOutboundMessageId: [...timeline].reverse().find((item) => item.direction === "OUTBOUND")?.id ?? null,
        intent: seed.service,
        handoffStatus: seed.status === "WAITING" ? "PENDING" : "ACTIVE",
        handoffRequestedAt: addMinutes(startAt, 1),
        handoffActivatedAt: assignedUser ? addMinutes(startAt, 4) : null,
        mode: "HUMAN",
        assignedUserId: assignedUser?.id ?? null,
        assignedTo: assignedUser?.name ?? null,
        assignedAt: assignedUser ? addMinutes(startAt, 4) : null,
        departmentId: department.id,
        queueId: department.queue.id,
        status: seed.status,
        closedAt,
        chatbotActive: false,
        flow: "chatbot:POC Boa Esperanca - Atendimento Institucional",
        answers: { service: seed.service, source: seed.channel, protocol: `CV-2026-POC-00${index + 1}` },
        createdAt: startAt,
        updatedAt,
      },
    });
    await prisma.conversationMetrics.create({
      data: {
        clientId: client.id,
        conversationId: conversation.id,
        firstResponseTimeSec: lastOutboundAt ? 240 : null,
        totalResponseTimeSec: lastOutboundAt ? 600 : null,
        responseCount: timeline.filter((item) => item.direction === "OUTBOUND").length,
        avgResponseTimeSec: lastOutboundAt ? 200 : null,
        resolutionTimeSec: closedAt ? Math.round((closedAt.getTime() - startAt.getTime()) / 1000) : null,
        totalMessages: timeline.length,
        totalAgentMessages: timeline.filter((item) => item.direction === "OUTBOUND").length,
        startedAt: startAt,
        closedAt,
        createdAt: startAt,
        updatedAt,
      },
    });
    runtimeStates.push({
      clientKey: client.clientKey,
      conversationKey: `${client.clientKey}:${waIdCanonical}`,
      waId,
      waIdCanonical,
      firstSeenAt: iso(startAt),
      lastInboundAt: iso(lastInboundAt),
      lastOutboundAt: iso(lastOutboundAt),
      window: { isOpen: seed.status !== "CLOSED", expiresAt: seed.status === "CLOSED" ? null : iso(addMinutes(now, 24 * 60)) },
      intent: seed.service,
      handoff: {
        status: seed.status === "WAITING" ? "pending" : "active",
        requestedAt: iso(addMinutes(startAt, 1)),
        activatedAt: assignedUser ? iso(addMinutes(startAt, 4)) : null,
      },
      mode: "HUMAN",
      assignedUserId: assignedUser?.id ?? null,
      assignedTo: assignedUser?.name ?? null,
      assignedAt: assignedUser ? iso(addMinutes(startAt, 4)) : null,
      departmentId: department.id,
      queueId: department.queue.id,
      status: seed.status,
      closedAt: iso(closedAt),
      chatbotActive: false,
      answers: { service: seed.service, source: seed.channel },
    });
  }
  const dataDir = path.resolve(process.cwd(), ".data", client.clientKey);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "conversations.json"), `${JSON.stringify(runtimeStates, null, 2)}\n`, "utf8");
}

async function main() {
  const database = await assertSafeDatabase();
  const command = process.argv[2] || "seed";
  if (command === "status") {
    const client = await prisma.client.findUnique({ where: { clientKey: CLIENT_KEY }, select: { id: true, clientKey: true, name: true, profile: true } });
    if (!client) {
      console.log(JSON.stringify({ ok: false, tenant: CLIENT_KEY, error: "tenant_not_found" }, null, 2));
      return;
    }
    const [
      users,
      departments,
      queues,
      conversations,
      webchatSites,
      knowledgeCollections,
      knowledgeArticles,
      apiKeys,
      webhookEndpoints,
      metrics,
    ] = await Promise.all([
      prisma.user.count({ where: { clientId: client.id, isActive: true } }),
      prisma.department.count({ where: { clientId: client.id, isActive: true } }),
      prisma.queue.count({ where: { clientId: client.id } }),
      prisma.conversation.count({ where: { clientId: client.id } }),
      prisma.webchatSite.count({ where: { clientId: client.id, status: "active" } }),
      prisma.knowledgeBaseCollection.count({ where: { clientId: client.id, status: "active" } }),
      prisma.knowledgeBaseArticle.count({ where: { clientId: client.id, status: "published" } }),
      prisma.publicApiKey.count({ where: { clientId: client.id, status: "active" } }),
      prisma.webhookEndpoint.count({ where: { clientId: client.id, active: true } }),
      prisma.conversationMetrics.count({ where: { clientId: client.id } }),
    ]);
    const prepared =
      users >= usersSeed.length &&
      departments >= departmentsSeed.length &&
      queues >= departmentsSeed.length &&
      conversations >= conversationSeed.length &&
      webchatSites >= 1 &&
      knowledgeCollections >= knowledgeSeed.length &&
      knowledgeArticles >= knowledgeSeed.reduce((total, item) => total + item.articles.length, 0) &&
      apiKeys >= 1 &&
      webhookEndpoints >= 1 &&
      metrics >= conversationSeed.length;
    console.log(
      JSON.stringify(
        {
          ok: true,
          database,
          tenant: client,
          prepared,
          counts: {
            users,
            departments,
            queues,
            conversations,
            webchatSites,
            knowledgeCollections,
            knowledgeArticles,
            apiKeys,
            webhookEndpoints,
            metrics,
          },
        },
        null,
        2
      )
    );
    return;
  }
  if (command !== "seed") {
    throw new Error(`unknown_command:${command}`);
  }
  const client = await upsertClient();
  await upsertTenantConfig();
  const departments = await upsertDepartments(client.id);
  const users = await upsertUsers(client.id, departments);
  await clearDemoData(client.id);
  await prisma.waPhoneNumber.upsert({
    where: { phoneNumberId: WHATSAPP_PHONE_NUMBER_ID },
    update: { clientId: client.id, display: "Boa Esperanca POC WhatsApp" },
    create: { clientId: client.id, phoneNumberId: WHATSAPP_PHONE_NUMBER_ID, display: "Boa Esperanca POC WhatsApp" },
  });
  await prisma.retentionConfig.upsert({
    where: { clientId: client.id },
    update: { retentionDays: 365 },
    create: { clientId: client.id, retentionDays: 365 },
  });
  await prisma.sLAConfig.upsert({
    where: { clientId: client.id },
    update: { firstResponseLimitSec: 300, resolutionTimeLimitSec: 86400 },
    create: { clientId: client.id, firstResponseLimitSec: 300, resolutionTimeLimitSec: 86400 },
  });
  const knowledge = await seedKnowledgeBase(client.id, users);
  await seedChatbotFlow(client.id);
  const webchatSite = await seedWebchat(client.id);
  await seedApiEvidence(client.id, users);
  await seedConversations(client, departments, users);

  console.log(
    JSON.stringify(
      {
        ok: true,
        database,
        tenant: { clientKey: client.clientKey, name: client.name },
        login: { email: "admin@boa-esperanca-poc.local", password: PASSWORD },
        users: usersSeed.length,
        departments: departmentsSeed.map((item) => item.name),
        knowledge,
        webchat: { slug: webchatSite.slug, demoDomain: "poc.boa-esperanca.local" },
        apiMock: {
          endpoint: "https://poc.boa-esperanca.local/api/protocolo",
          protocol: "POC-2026-001",
          expectedStatus: "em_analise",
        },
        routes: [
          "/app/dashboard",
          "/app/inbox",
          "/app/chatbot",
          "/app/knowledge-base",
          "/app/webchat",
          "/app/reports",
          "/app/settings/users",
          "/app/settings/departments",
          "/app/api-keys",
          "/app/webhooks",
        ],
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
