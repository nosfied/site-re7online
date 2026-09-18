#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

const CLIENT_KEY = "re7-demo";
const CLIENT_NAME = "Re7 Demo";
const PASSWORD = "35263526";
const TENANTS_CONFIG_PATH = path.join(process.cwd(), ".data", "tenants.json");

const channelAccounts = {
  whatsapp: "re7-demo-wa-001",
  messenger: "re7-demo-fb-page-001",
  instagram: "re7-demo-ig-001",
};

const departmentsSeed = [
  { name: "Comercial", slug: "comercial", queueName: "Fila Comercial" },
  { name: "Atendimento", slug: "atendimento", queueName: "Fila Atendimento" },
  { name: "Sucesso do Cliente", slug: "sucesso-cliente", queueName: "Fila Sucesso" },
];

const usersSeed = [
  { name: "Administrador Demo", email: "admin@local.com", role: "ADMIN", department: "Comercial" },
  { name: "Marina Costa", email: "marina@re7demo.local", role: "SUPERVISOR", department: "Atendimento" },
  { name: "Bruno Almeida", email: "bruno@re7demo.local", role: "AGENT", department: "Comercial" },
  { name: "Leticia Ramos", email: "leticia@re7demo.local", role: "AGENT", department: "Sucesso do Cliente" },
];

const conversationsSeed = [
  {
    channel: "whatsapp",
    contact: "Juliana Martins",
    handle: "+55 84 98888-1042",
    department: "Comercial",
    assigned: "bruno@re7demo.local",
    status: "IN_PROGRESS",
    service: "Demonstração Converta",
    minutesAgo: 8,
    messages: [
      ["INBOUND", "Olá, vi o Converta no site e quero entender os planos para minha loja."],
      ["OUTBOUND", "Olá, Juliana. Posso te mostrar como centralizamos WhatsApp, Instagram e Messenger no mesmo inbox."],
      ["INBOUND", "Perfeito. Hoje minha equipe perde muito histórico entre os canais."],
      ["OUTBOUND", "Esse é exatamente o ponto que o Converta resolve: conversa, CRM e follow-up no mesmo fluxo."],
    ],
  },
  {
    channel: "instagram",
    contact: "Ateliê Flor de Lis",
    handle: "@atelieflordelis",
    department: "Comercial",
    assigned: null,
    status: "WAITING",
    service: "Pedido via Instagram",
    minutesAgo: 18,
    messages: [
      ["INBOUND", "Oi! Vocês conseguem automatizar respostas do Instagram Direct?"],
      ["OUTBOUND", "Conseguimos centralizar o Direct no inbox para a equipe acompanhar com histórico e CRM."],
      ["INBOUND", "Quero uma demonstração ainda hoje."],
    ],
  },
  {
    channel: "messenger",
    contact: "Rafael Lima",
    handle: "Facebook Lead",
    department: "Atendimento",
    assigned: "marina@re7demo.local",
    status: "IN_PROGRESS",
    service: "Atendimento Facebook",
    minutesAgo: 32,
    messages: [
      ["INBOUND", "Boa tarde. Mandei mensagem pela página do Facebook."],
      ["OUTBOUND", "Boa tarde, Rafael. Recebemos por aqui e vamos continuar seu atendimento neste canal."],
      ["INBOUND", "Ótimo, preciso integrar minha equipe comercial."],
      ["OUTBOUND", "Vou registrar no CRM e te encaminhar o plano mais adequado."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Dra. Camila Nogueira",
    handle: "+55 84 97777-2201",
    department: "Sucesso do Cliente",
    assigned: "leticia@re7demo.local",
    status: "WAITING_USER",
    service: "Follow-up automático",
    minutesAgo: 65,
    messages: [
      ["INBOUND", "Preciso de uma campanha para reativar pacientes antigos."],
      ["OUTBOUND", "Podemos criar uma campanha oficial com segmentação e acompanhamento no CRM."],
      ["OUTBOUND", "Te enviei um resumo das opções. Fico aguardando sua confirmação."],
    ],
  },
  {
    channel: "instagram",
    contact: "Studio Corpo Livre",
    handle: "@studiocorpolivre",
    department: "Comercial",
    assigned: "bruno@re7demo.local",
    status: "IN_PROGRESS",
    service: "CRM conversacional",
    minutesAgo: 105,
    messages: [
      ["INBOUND", "Quero saber se consigo separar leads por interesse."],
      ["OUTBOUND", "Sim. Cada conversa vira lead com etapa, observações e histórico por canal."],
      ["INBOUND", "Isso ajudaria muito na organização da equipe."],
    ],
  },
  {
    channel: "messenger",
    contact: "Clínica Vida Norte",
    handle: "Página Facebook",
    department: "Atendimento",
    assigned: null,
    status: "WAITING",
    service: "Triagem de atendimento",
    minutesAgo: 150,
    messages: [
      ["INBOUND", "Olá, gostaria de falar com a equipe sobre atendimento automático."],
      ["OUTBOUND", "Olá. Já registrei seu interesse e um atendente vai assumir o atendimento."],
      ["INBOUND", "Obrigado. Fico no aguardo."],
    ],
  },
  {
    channel: "whatsapp",
    contact: "Mercadinho São João",
    handle: "+55 84 96666-3010",
    department: "Sucesso do Cliente",
    assigned: "leticia@re7demo.local",
    status: "CLOSED",
    service: "Campanha de ofertas",
    minutesAgo: 260,
    messages: [
      ["INBOUND", "A campanha de ofertas trouxe bastante retorno."],
      ["OUTBOUND", "Excelente. Fechamos o relatório com 31 respostas e 12 oportunidades qualificadas."],
      ["INBOUND", "Pode finalizar esse atendimento. Obrigado."],
    ],
  },
];

const campaignsSeed = [
  {
    name: "Reativação de Leads - Maio",
    templateName: "reativacao_leads_maio",
    status: "completed",
    totalRecipients: 420,
    sentCount: 398,
    blockedCount: 22,
    minutesAgo: 1440,
  },
  {
    name: "Convite Demonstração Converta",
    templateName: "convite_demo_converta",
    status: "sending",
    totalRecipients: 180,
    sentCount: 74,
    blockedCount: 3,
    minutesAgo: 120,
  },
  {
    name: "Follow-up Pós-Orçamento",
    templateName: "followup_orcamento",
    status: "draft",
    totalRecipients: 96,
    sentCount: 0,
    blockedCount: 0,
    minutesAgo: 35,
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

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function iso(date) {
  return date ? date.toISOString() : null;
}

function canonicalize(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function syntheticWaId(channel, index) {
  const hash = sha256(`${CLIENT_KEY}:${channel}:${index}`).slice(0, 24);
  return channel === "whatsapp" ? `55849888${String(index).padStart(4, "0")}` : `${channel}:${hash}`;
}

function messageId(channel, direction, conversationIndex, messageIndex) {
  return `demo.${channel}.${direction.toLowerCase()}.${conversationIndex + 1}.${messageIndex + 1}`;
}

async function upsertClient() {
  return prisma.client.upsert({
    where: { clientKey: CLIENT_KEY },
    update: {
      name: CLIENT_NAME,
      status: "ACTIVE",
      profile: "converta-demo",
      features: {
        inbox: true,
        campaigns: true,
        crm: true,
        reports: true,
        omnichannel: true,
      },
    },
    create: {
      clientKey: CLIENT_KEY,
      name: CLIENT_NAME,
      status: "ACTIVE",
      profile: "converta-demo",
      features: {
        inbox: true,
        campaigns: true,
        crm: true,
        reports: true,
        omnichannel: true,
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
    allowlist: [],
    handoffAttendantWaid: "",
    metaPhoneNumberId: channelAccounts.whatsapp,
    defaultLanguage: "pt_BR",
    maxActiveAppUsers: 10,
    disableChatbot: true,
    appDisableChatbot: false,
    disableLegacyFlows: true,
    disableAiFallback: true,
    appDisableAiFallback: false,
    channelAccounts: [
      {
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: channelAccounts.whatsapp,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        aiEnabled: false,
        handoffEnabled: true,
        status: "connected",
      },
      {
        channel: "messenger",
        provider: "meta",
        channelAccountId: channelAccounts.messenger,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        status: "connected",
      },
      {
        channel: "instagram",
        provider: "meta",
        channelAccountId: channelAccounts.instagram,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
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
      where: {
        clientId_departmentId_name: {
          clientId,
          departmentId: department.id,
          name: item.queueName,
        },
      },
      update: {},
      create: { clientId, departmentId: department.id, name: item.queueName },
    });
    await prisma.department.update({
      where: { id: department.id },
      data: { operationalQueueId: queue.id },
    });
    departments[item.name] = { ...department, queue };
  }
  return departments;
}

async function upsertUsers(clientId, departments) {
  const passwordHash = hashPassword(PASSWORD);
  const users = {};
  for (const item of usersSeed) {
    const existingUser = await prisma.user.findUnique({ where: { email: item.email } });
    if (existingUser && existingUser.clientId !== clientId) {
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

  await prisma.user.updateMany({
    where: {
      email: "admin@local.com",
      NOT: { clientId },
    },
    data: { email: "admin+default@local.com" },
  });

  return users;
}

async function clearDemoData(clientId) {
  const conversations = await prisma.conversation.findMany({ where: { clientId }, select: { id: true } });
  const conversationIds = conversations.map((item) => item.id);
  await prisma.$transaction([
    prisma.conversationAssignment.deleteMany({ where: { conversationId: { in: conversationIds } } }),
    prisma.conversationMetrics.deleteMany({ where: { clientId } }),
    prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } }),
    prisma.conversation.deleteMany({ where: { clientId } }),
    prisma.conversationRuntimeState.deleteMany({ where: { clientId } }),
    prisma.inboundMessage.deleteMany({ where: { clientId } }),
    prisma.outboundMessage.deleteMany({ where: { clientId } }),
    prisma.event.deleteMany({ where: { clientId, eventName: { startsWith: "demo." } } }),
    prisma.leadNote.deleteMany({ where: { tenantId: clientId } }),
    prisma.lead.deleteMany({ where: { tenantId: clientId } }),
    prisma.contactChannelIdentity.deleteMany({ where: { clientId } }),
    prisma.contact.deleteMany({ where: { clientId } }),
    prisma.campaign.deleteMany({ where: { clientId } }),
    prisma.template.deleteMany({ where: { clientId } }),
  ]);
}

async function seedConversations(client, departments, users) {
  const now = new Date();
  const runtimeStates = [];
  for (let index = 0; index < conversationsSeed.length; index += 1) {
    const seed = conversationsSeed[index];
    const startAt = addMinutes(now, -seed.minutesAgo);
    const channelAccountId = channelAccounts[seed.channel];
    const waId = syntheticWaId(seed.channel, index + 1);
    const waIdCanonical = seed.channel === "whatsapp" ? canonicalize(waId) : waId;
    const externalUserHash = sha256(`${CLIENT_KEY}:${seed.channel}:${seed.handle}`);
    const department = departments[seed.department];
    const assignedUser = seed.assigned ? users[seed.assigned] : null;
    const firstAssignedAt = assignedUser ? addMinutes(startAt, 3) : null;
    const closedAt = seed.status === "CLOSED" ? addMinutes(startAt, seed.messages.length * 4 + 6) : null;

    const timeline = seed.messages.map(([direction, text], messageIndex) => ({
      direction,
      text,
      at: addMinutes(startAt, messageIndex * 4),
      id: messageId(seed.channel, direction, index, messageIndex),
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
        provider: "meta",
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
        provider: "meta",
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
        phoneNumberId: seed.channel === "whatsapp" ? channelAccountId : null,
        channel: seed.channel,
        provider: "meta",
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
        provider: "meta",
        channelAccountId,
        externalUserHash,
        legacyWaId: seed.channel === "whatsapp" ? waId : null,
        contactChannelIdentityId: identity.id,
        name: seed.contact,
        phone: seed.channel === "whatsapp" ? seed.handle : null,
        company: seed.channel === "whatsapp" ? null : seed.contact,
        city: "Natal/RN",
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
        body: `Lead de demonstração capturado via ${seed.channel}. Interesse: ${seed.service}.`,
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
          requestId: `demo-screenshot-${index + 1}`,
          metaMessageId: item.direction === "OUTBOUND" ? `meta.${item.id}` : null,
          createdAt: item.at,
        },
      });
      if (item.direction === "INBOUND") {
        await prisma.inboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: seed.channel === "whatsapp" ? channelAccountId : null,
            waId,
            waIdCanonical,
            messageId: item.id,
            channel: seed.channel,
            provider: "meta",
            channelAccountId,
            externalUserHash,
            externalMessageId: item.id,
            legacyWaId: seed.channel === "whatsapp" ? waId : null,
            type: "TEXT",
            bodyText: item.text,
            allowlistHit: true,
            requestId: `demo-screenshot-${index + 1}`,
            rawPayload: { demo: true, screenshot: true, channel: seed.channel },
            createdAt: item.at,
          },
        });
      } else {
        await prisma.outboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: seed.channel === "whatsapp" ? channelAccountId : null,
            waId,
            waIdCanonical,
            messageId: item.id,
            channel: seed.channel,
            provider: "meta",
            channelAccountId,
            externalUserHash,
            externalMessageId: item.id,
            legacyWaId: seed.channel === "whatsapp" ? waId : null,
            type: "TEXT",
            status: "SENT",
            bodyText: item.text,
            requestId: `demo-screenshot-${index + 1}`,
            metaMessageId: `meta.${item.id}`,
            rawPayload: { demo: true, screenshot: true, status: { lastStatus: "DELIVERED" } },
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
        provider: "meta",
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
        intent: "sales",
        handoffStatus: seed.status === "WAITING" ? "PENDING" : "ACTIVE",
        handoffRequestedAt: addMinutes(startAt, 1),
        handoffActivatedAt: assignedUser ? addMinutes(startAt, 3) : null,
        mode: "HUMAN",
        assignedUserId: assignedUser?.id ?? null,
        assignedTo: assignedUser?.name ?? null,
        assignedAt: assignedUser ? addMinutes(startAt, 3) : null,
        departmentId: department.id,
        queueId: department.queue.id,
        status: seed.status,
        closedAt,
        chatbotActive: false,
        answers: { service: seed.service, source: seed.channel },
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
      lastInboundMessageId: [...timeline].reverse().find((item) => item.direction === "INBOUND")?.id ?? null,
      lastOutboundMessageId: [...timeline].reverse().find((item) => item.direction === "OUTBOUND")?.id ?? null,
      window: {
        isOpen: seed.status !== "CLOSED",
        expiresAt: seed.status === "CLOSED" ? null : iso(addMinutes(now, 24 * 60)),
      },
      intent: "sales",
      handoff: {
        status: seed.status === "WAITING" ? "pending" : "active",
        requestedAt: iso(addMinutes(startAt, 1)),
        activatedAt: assignedUser ? iso(addMinutes(startAt, 3)) : null,
      },
      mode: "HUMAN",
      assignedUserId: assignedUser?.id ?? null,
      assignedTo: assignedUser?.name ?? null,
      assignedAt: assignedUser ? iso(addMinutes(startAt, 3)) : null,
      departmentId: department.id,
      queueId: department.queue.id,
      status: seed.status,
      closedAt: iso(closedAt),
      chatbotActive: false,
      answers: { service: seed.service, source: seed.channel },
    });

    await prisma.conversationMetrics.create({
      data: {
        clientId: client.id,
        conversationId: conversation.id,
        firstResponseTimeSec: lastOutboundAt ? 240 : null,
        totalResponseTimeSec: lastOutboundAt ? 540 : null,
        responseCount: timeline.filter((item) => item.direction === "OUTBOUND").length,
        avgResponseTimeSec: lastOutboundAt ? 180 : null,
        resolutionTimeSec: closedAt ? Math.round((closedAt.getTime() - startAt.getTime()) / 1000) : null,
        totalMessages: timeline.length,
        totalAgentMessages: timeline.filter((item) => item.direction === "OUTBOUND").length,
        startedAt: startAt,
        closedAt,
        createdAt: startAt,
        updatedAt,
      },
    });
  }
  await writeRuntimeConversationFile(client.clientKey, runtimeStates);
}

async function writeRuntimeConversationFile(clientKey, states) {
  const dataDir = path.resolve(process.cwd(), ".data", clientKey);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "conversations.json"), `${JSON.stringify(states, null, 2)}\n`, "utf8");
}

async function seedCampaigns(clientId) {
  for (const item of campaignsSeed) {
    const template = await prisma.template.create({
      data: {
        clientId,
        name: item.templateName,
        category: "MARKETING",
        language: "pt_BR",
        status: item.status === "draft" ? "DRAFT" : "APPROVED",
        content: "Olá, {{1}}! Temos uma atualização importante para seu atendimento.",
        variables: [{ name: "nome", example: "Juliana" }],
        createdAt: addMinutes(new Date(), -item.minutesAgo - 30),
      },
    });
    await prisma.campaign.create({
      data: {
        clientId,
        templateId: template.id,
        name: item.name,
        templateName: item.templateName,
        status: item.status,
        totalRecipients: item.totalRecipients,
        sentCount: item.sentCount,
        blockedCount: item.blockedCount,
        createdAt: addMinutes(new Date(), -item.minutesAgo),
        updatedAt: addMinutes(new Date(), -Math.max(1, item.minutesAgo - 20)),
      },
    });
  }
}

async function main() {
  const database = await prisma.$queryRawUnsafe("select current_database() as db");
  const currentDatabase = database?.[0]?.db;
  if (currentDatabase !== "whatsapp_agent") {
    throw new Error(`refusing_to_seed_unexpected_database:${currentDatabase}`);
  }

  const client = await upsertClient();
  await upsertTenantConfig();
  const departments = await upsertDepartments(client.id);
  const users = await upsertUsers(client.id, departments);
  await clearDemoData(client.id);
  await prisma.waPhoneNumber.upsert({
    where: { phoneNumberId: channelAccounts.whatsapp },
    update: { clientId: client.id, display: "Re7 Demo WhatsApp" },
    create: { clientId: client.id, phoneNumberId: channelAccounts.whatsapp, display: "Re7 Demo WhatsApp" },
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
  await seedConversations(client, departments, users);
  await seedCampaigns(client.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: currentDatabase,
        tenant: { clientKey: client.clientKey, name: client.name },
        login: { email: "admin@local.com", password: PASSWORD },
        counts: {
          conversations: conversationsSeed.length,
          campaigns: campaignsSeed.length,
          users: usersSeed.length,
          channels: Object.keys(channelAccounts),
        },
        screenshotRoutes: [
          "/app/inbox",
          "/app/campaigns",
          "/app/settings/crm",
          "/app/settings/users",
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
