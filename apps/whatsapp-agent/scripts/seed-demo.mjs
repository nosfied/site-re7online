#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const CLIENT_KEY = "demo-prefeitura";
const CLIENT_NAME = "Prefeitura Municipal Demo";
const DEMO_PHONE_NUMBER_ID = "demo-prefeitura-controlled";
const DEMO_PASSWORD = process.env.DEMO_TENANT_PASSWORD || "Demo@2026";
const DEMO_RETENTION_DAYS = 365;

const departmentsSeed = [
  { name: "Atendimento Geral", slug: "atendimento-geral", queueName: "Fila Geral" },
  { name: "Saude", slug: "saude", queueName: "Fila Saude" },
  { name: "Educacao", slug: "educacao", queueName: "Fila Educacao" },
  { name: "Assistencia Social", slug: "assistencia-social", queueName: "Fila Assistencia Social" },
];

const chatbotDefinition = {
  start: "inicio",
  nodes: {
    inicio: {
      type: "menu",
      text: "Ola! Como podemos ajudar?",
      options: [
        { label: "Aposentadoria", next: "aposentadoria" },
        { label: "Revisao de beneficio", next: "revisao" },
        { label: "Auxilio-doenca", next: "auxilio" },
        { label: "Falar com atendente", next: "handoff_direto" },
      ],
    },
    aposentadoria: {
      type: "text",
      text: "Certo. Para avaliarmos aposentadoria, informe idade aproximada e tempo de contribuicao.",
      next: "coleta_dados",
    },
    revisao: {
      type: "text",
      text: "Entendi. Para revisao, precisamos confirmar o tipo de beneficio e ha quanto tempo ele foi concedido.",
      next: "coleta_dados",
    },
    auxilio: {
      type: "text",
      text: "Certo. Para auxilio-doenca, informe se ja existe atestado medico e se o pedido foi feito ao INSS.",
      next: "coleta_dados",
    },
    coleta_dados: {
      type: "text",
      text: "Dados registrados para a demonstracao. Vou transferir para atendimento humano.",
      next: "handoff_qualificado",
    },
    handoff_qualificado: {
      type: "handoff",
      text: "Seu atendimento foi encaminhado para um servidor responsavel. Aguarde um instante.",
    },
    handoff_direto: {
      type: "handoff",
      text: "Vou encaminhar voce diretamente para um atendente.",
    },
  },
};

const caseSeed = [
  ["WAITING", "Ana Paula Ribeiro", "Saude", "consulta medica", "Preciso remarcar minha consulta na UBS Central."],
  ["WAITING", "Carlos Henrique Lima", "Atendimento Geral", "aposentadoria", "Gostaria de orientacao sobre aposentadoria por idade."],
  ["WAITING", "Patricia Moura", "Educacao", "matricula escolar", "Preciso saber sobre vaga para o ensino fundamental."],
  ["WAITING", "Jose Roberto Alves", "Assistencia Social", "cadastro unico", "Quero atualizar meu CadUnico."],
  ["WAITING", "Marina Costa", "Saude", "medicamento", "O posto esta sem meu medicamento controlado."],
  ["IN_PROGRESS", "Joao da Silva", "Atendimento Geral", "beneficio negado", "Meu beneficio foi negado e preciso de ajuda."],
  ["IN_PROGRESS", "Maria Souza", "Saude", "exame", "Tenho pedido de exame parado ha semanas."],
  ["IN_PROGRESS", "Roberto Nascimento", "Educacao", "transporte escolar", "O transporte escolar nao passou esta semana."],
  ["IN_PROGRESS", "Luciana Gomes", "Assistencia Social", "cesta basica", "Preciso acompanhar solicitacao de cesta basica."],
  ["IN_PROGRESS", "Fernando Rocha", "Atendimento Geral", "protocolo", "Quero consultar um protocolo aberto."],
  ["WAITING_USER", "Beatriz Araujo", "Educacao", "documentos escola", "Vou enviar os documentos da matricula ainda hoje."],
  ["WAITING_USER", "Rafael Martins", "Saude", "laudo medico", "Estou separando o laudo para anexar."],
  ["WAITING_USER", "Camila Teixeira", "Assistencia Social", "visita tecnica", "Preciso confirmar o horario da visita tecnica."],
  ["WAITING_USER", "Eduardo Batista", "Atendimento Geral", "segunda via", "Vou conferir meus dados e retorno."],
  ["WAITING_USER", "Renata Oliveira", "Saude", "vacina", "Vou confirmar a carteira de vacinacao."],
  ["CLOSED", "Helena Duarte", "Educacao", "boletim", "Obrigado, consegui acessar o boletim."],
  ["CLOSED", "Paulo Cesar Melo", "Saude", "agendamento resolvido", "Consulta reagendada com sucesso."],
  ["CLOSED", "Sandra Regina", "Assistencia Social", "beneficio eventual", "Atendimento finalizado com encaminhamento."],
  ["CLOSED", "Felipe Andrade", "Atendimento Geral", "informacao", "Duvida respondida pela central."],
  ["CLOSED", "Tatiana Barros", "Educacao", "creche", "Inscricao em creche concluida."],
  ["WAITING", "Nadia Carvalho", "Assistencia Social", "sla violado", "Estou aguardando retorno desde ontem."],
  ["IN_PROGRESS", "Gustavo Pereira", "Saude", "transferencia setor", "Fui transferido da central para a saude."],
  ["IN_PROGRESS", "Elaine Santos", "Educacao", "conversa longa", "Preciso relatar varios pontos sobre a escola."],
  ["WAITING", "Sergio Almeida", "Atendimento Geral", "fala com atendente", "Quero falar com uma pessoa responsavel."],
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function canonicalizeBrazilWaId(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function makeWaId(index) {
  return `55849888${String(index).padStart(4, "0")}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function iso(date) {
  return date.toISOString();
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function upsertClient() {
  return prisma.client.upsert({
    where: { clientKey: CLIENT_KEY },
    update: { name: CLIENT_NAME, status: "ACTIVE", profile: "government" },
    create: { clientKey: CLIENT_KEY, name: CLIENT_NAME, status: "ACTIVE", profile: "government" },
  });
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
    departments[item.name] = { ...department, queue };
  }
  return departments;
}

async function upsertUsers(clientId, departments) {
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const seeds = [
    { name: "Administrador Demo", email: "admin@demo-prefeitura.local", role: "ADMIN", department: "Atendimento Geral" },
    { name: "Supervisor Demo", email: "supervisor@demo-prefeitura.local", role: "SUPERVISOR", department: "Atendimento Geral" },
    { name: "Agente Saude", email: "agente_saude@demo-prefeitura.local", role: "AGENT", department: "Saude" },
    { name: "Agente Educacao", email: "agente_educacao@demo-prefeitura.local", role: "AGENT", department: "Educacao" },
    { name: "Agente Social", email: "agente_social@demo-prefeitura.local", role: "AGENT", department: "Assistencia Social" },
  ];
  const users = {};
  for (const item of seeds) {
    const user = await prisma.user.upsert({
      where: { clientId_email: { clientId, email: item.email } },
      update: {
        name: item.name,
        role: item.role,
        isActive: true,
        departmentId: departments[item.department].id,
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

async function clearDemoOperationalData(clientId) {
  const conversations = await prisma.conversation.findMany({
    where: { clientId },
    select: { id: true },
  });
  const conversationIds = conversations.map((item) => item.id);
  await prisma.$transaction([
    prisma.conversationMetrics.deleteMany({ where: { clientId } }),
    prisma.conversation.deleteMany({ where: { clientId } }),
    prisma.conversationRuntimeState.deleteMany({ where: { clientId } }),
    prisma.inboundMessage.deleteMany({ where: { clientId } }),
    prisma.outboundMessage.deleteMany({ where: { clientId } }),
    prisma.event.deleteMany({
      where: {
        clientId,
        OR: [{ eventName: { startsWith: "demo." } }, { conversationId: { in: conversationIds } }],
      },
    }),
    prisma.leadNote.deleteMany({ where: { tenantId: clientId } }),
    prisma.lead.deleteMany({ where: { tenantId: clientId } }),
    prisma.contact.deleteMany({ where: { clientId } }),
  ]);
}

function buildMessages(seed, index, startAt, status) {
  const isLong = seed[3] === "conversa longa";
  const items = [
    { direction: "INBOUND", text: seed[4], at: startAt },
    { direction: "OUTBOUND", text: "Ola, este e o atendimento digital da Prefeitura Demo. Vou registrar sua solicitacao.", at: addMinutes(startAt, 2) },
    { direction: "INBOUND", text: "Certo, obrigado pelo retorno.", at: addMinutes(startAt, 4) },
  ];
  if (status !== "WAITING") {
    items.push({
      direction: "OUTBOUND",
      text: `Sua demanda sobre ${seed[3]} foi encaminhada para o setor responsavel.`,
      at: addMinutes(startAt, 8),
    });
  }
  if (isLong) {
    for (let i = 0; i < 18; i += 1) {
      items.push({
        direction: i % 2 === 0 ? "INBOUND" : "OUTBOUND",
        text:
          i % 2 === 0
            ? `Relato complementar ${i + 1}: a situacao envolve alunos, responsaveis e transporte no turno da manha.`
            : `Registro complementar ${i + 1}: informacao anotada para acompanhamento pela equipe de educacao.`,
        at: addMinutes(startAt, 10 + i * 2),
      });
    }
  }
  if (status === "CLOSED") {
    items.push({ direction: "OUTBOUND", text: "Atendimento finalizado. Permanecemos a disposicao.", at: addMinutes(startAt, 18) });
  }
  if (seed[3] === "sla violado") {
    items.push({ direction: "INBOUND", text: "Ainda nao recebi resposta. Preciso de prioridade.", at: addMinutes(startAt, 180) });
  }
  return items.map((item, messageIndex) => ({
    ...item,
    id: `demo-${index + 1}-${messageIndex + 1}`,
  }));
}

async function seedConversations(client, departments, users) {
  const now = new Date();
  const runtimeStates = [];
  const statusCounts = {};

  for (let index = 0; index < caseSeed.length; index += 1) {
    const seed = caseSeed[index];
    const [status, name, departmentName, service] = seed;
    const waId = makeWaId(index + 1);
    const waIdCanonical = canonicalizeBrazilWaId(waId);
    const department = departments[departmentName];
    const assignedUser =
      status === "IN_PROGRESS"
        ? departmentName === "Saude"
          ? users["agente_saude@demo-prefeitura.local"]
          : departmentName === "Educacao"
            ? users["agente_educacao@demo-prefeitura.local"]
            : departmentName === "Assistencia Social"
              ? users["agente_social@demo-prefeitura.local"]
              : users["supervisor@demo-prefeitura.local"]
        : null;
    const startAt = addMinutes(now, -(index + 3) * 37);
    const messages = buildMessages(seed, index, startAt, status);
    const lastInboundAt = [...messages].reverse().find((item) => item.direction === "INBOUND")?.at ?? startAt;
    const lastOutboundAt = [...messages].reverse().find((item) => item.direction === "OUTBOUND")?.at ?? null;
    const updatedAt = messages[messages.length - 1].at;
    const firstAssignedAt = status === "WAITING" ? null : addMinutes(startAt, 5);
    const closedAt = status === "CLOSED" ? updatedAt : null;

    const conversation = await prisma.conversation.create({
      data: {
        clientId: client.id,
        departmentId: department.id,
        waId,
        waIdCanonical,
        phoneNumberId: DEMO_PHONE_NUMBER_ID,
        windowIsOpen: true,
        windowExpiresAt: addMinutes(now, 24 * 60),
        firstAssignedAt,
        firstResponseAt: status === "WAITING" ? null : addMinutes(startAt, 2),
        lastResponseAt: lastOutboundAt,
        closedAt,
        lastInboundAt,
        lastOutboundAt,
        createdAt: startAt,
        updatedAt,
      },
    });

    await prisma.contact.create({ data: { clientId: client.id, waId, name, createdAt: startAt } });
    const lead = await prisma.lead.create({
      data: {
        tenantId: client.id,
        waId,
        waIdCanonical,
        name,
        phone: waId,
        city: "Cidade Demo",
        service,
        status: status === "CLOSED" ? "RESOLVED" : "OPEN",
        createdAt: startAt,
      },
    });
    await prisma.leadNote.create({
      data: {
        tenantId: client.id,
        leadId: lead.id,
        body: `Contexto POC: ${service}.`,
        createdAt: addMinutes(startAt, 1),
      },
    });

    for (const message of messages) {
      if (message.direction === "INBOUND") {
        await prisma.inboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: DEMO_PHONE_NUMBER_ID,
            waId,
            waIdCanonical,
            messageId: `wamid.demo.in.${message.id}`,
            type: "TEXT",
            bodyText: message.text,
            allowlistHit: true,
            requestId: `demo-seed-${index + 1}`,
            rawPayload: { demo: true, source: "seed-demo" },
            createdAt: message.at,
          },
        });
      } else {
        await prisma.outboundMessage.create({
          data: {
            clientId: client.id,
            phoneNumberId: DEMO_PHONE_NUMBER_ID,
            waId,
            waIdCanonical,
            messageId: `demo-out-${message.id}`,
            metaMessageId: `wamid.demo.out.${message.id}`,
            type: "TEXT",
            status: "SENT",
            bodyText: message.text,
            requestId: `demo-seed-${index + 1}`,
            rawPayload: { demo: true, status: { lastStatus: "READ" } },
            createdAt: message.at,
          },
        });
      }
    }

    await prisma.conversationMetrics.create({
      data: {
        clientId: client.id,
        conversationId: conversation.id,
        firstResponseTimeSec: status === "WAITING" ? null : 120,
        totalResponseTimeSec: status === "WAITING" ? null : 420,
        responseCount: status === "WAITING" ? 0 : Math.max(1, messages.filter((item) => item.direction === "OUTBOUND").length),
        avgResponseTimeSec: status === "WAITING" ? null : 180,
        resolutionTimeSec: status === "CLOSED" ? Math.round((closedAt.getTime() - startAt.getTime()) / 1000) : null,
        totalMessages: messages.length,
        totalAgentMessages: messages.filter((item) => item.direction === "OUTBOUND").length,
        startedAt: startAt,
        closedAt,
        createdAt: startAt,
        updatedAt,
      },
    });

    const handoffStatus = status === "WAITING" ? "pending" : "active";
    const runtimeState = {
      clientKey: client.clientKey,
      conversationKey: `${client.clientKey}:${waIdCanonical}`,
      waId,
      waIdCanonical,
      firstSeenAt: iso(startAt),
      lastInboundAt: iso(lastInboundAt),
      lastOutboundAt: lastOutboundAt ? iso(lastOutboundAt) : undefined,
      lastInboundMessageId: `wamid.demo.in.${messages.filter((item) => item.direction === "INBOUND").at(-1)?.id}`,
      lastOutboundMessageId: lastOutboundAt ? `demo-out-${messages.filter((item) => item.direction === "OUTBOUND").at(-1)?.id}` : undefined,
      window: { isOpen: true, expiresAt: iso(addMinutes(now, 24 * 60)) },
      intent: "support",
      handoff: {
        status: handoffStatus,
        requestedAt: iso(addMinutes(startAt, 3)),
        activatedAt: handoffStatus === "active" ? iso(addMinutes(startAt, 5)) : undefined,
      },
      mode: "HUMAN",
      assignedUserId: assignedUser?.id ?? null,
      assignedTo: assignedUser?.name ?? null,
      assignedAt: assignedUser ? iso(addMinutes(startAt, 5)) : null,
      departmentId: department.id,
      queueId: department.queue.id,
      status,
      closedAt: closedAt ? iso(closedAt) : null,
      chatbotActive: false,
      flow: "chatbot:Atendimento Previdenciario",
    };
    runtimeStates.push(runtimeState);

    await prisma.conversationRuntimeState.create({
      data: {
        clientId: client.id,
        waId,
        waIdCanonical,
        conversationKey: runtimeState.conversationKey,
        firstSeenAt: startAt,
        windowIsOpen: true,
        windowExpiresAt: addMinutes(now, 24 * 60),
        lastInboundAt,
        lastOutboundAt,
        lastInboundMessageId: runtimeState.lastInboundMessageId,
        lastOutboundMessageId: runtimeState.lastOutboundMessageId,
        intent: "support",
        handoffStatus: handoffStatus === "pending" ? "PENDING" : "ACTIVE",
        handoffRequestedAt: addMinutes(startAt, 3),
        handoffActivatedAt: handoffStatus === "active" ? addMinutes(startAt, 5) : null,
        flow: "chatbot:Atendimento Previdenciario",
        chatbotActive: false,
        answers: { service },
        mode: "HUMAN",
        assignedUserId: assignedUser?.id ?? null,
        assignedTo: assignedUser?.name ?? null,
        assignedAt: assignedUser ? addMinutes(startAt, 5) : null,
        departmentId: department.id,
        queueId: department.queue.id,
        status,
        closedAt,
        createdAt: startAt,
        updatedAt,
      },
    });

    await prisma.event.create({
      data: {
        clientId: client.id,
        conversationId: conversation.id,
        waId,
        waIdCanonical,
        requestId: `demo-seed-${index + 1}`,
        eventName: "demo.conversation.seeded",
        payloadJson: {
          action: "demo.conversation.seeded",
          status,
          department: departmentName,
          service,
          slaViolated: service === "sla violado",
          timestamp: iso(updatedAt),
        },
        createdAt: updatedAt,
      },
    });
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  await writeRuntimeConversationFile(client.clientKey, runtimeStates);
  return statusCounts;
}

async function writeRuntimeConversationFile(clientKey, states) {
  const dataDir = path.resolve(process.cwd(), ".data", clientKey);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "conversations.json"), `${JSON.stringify(states, null, 2)}\n`, "utf8");
}

async function upsertChatbotFlow(clientId) {
  await prisma.chatbotFlow.updateMany({ where: { clientId }, data: { entryPoint: false, isActive: false } });
  const existing = await prisma.chatbotFlow.findFirst({
    where: { clientId, name: "Atendimento Previdenciario" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return prisma.chatbotFlow.update({
      where: { id: existing.id },
      data: { isActive: true, entryPoint: true, definition: chatbotDefinition },
    });
  }
  return prisma.chatbotFlow.create({
    data: { clientId, name: "Atendimento Previdenciario", isActive: true, entryPoint: true, definition: chatbotDefinition },
  });
}

async function simulateInboundMessage(client, waId, text = "Nova mensagem simulada para a banca.") {
  const waIdCanonical = canonicalizeBrazilWaId(waId);
  const conversation = await prisma.conversation.findFirst({
    where: { clientId: client.id, OR: [{ waId }, { waIdCanonical }] },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) throw new Error(`conversation_not_found:${waId}`);
  const now = new Date();
  await prisma.inboundMessage.create({
    data: {
      clientId: client.id,
      phoneNumberId: DEMO_PHONE_NUMBER_ID,
      waId: conversation.waId,
      waIdCanonical: conversation.waIdCanonical ?? waIdCanonical,
      messageId: `wamid.demo.sim.${Date.now()}`,
      type: "TEXT",
      bodyText: text,
      allowlistHit: true,
      requestId: "demo-simulate-inbound",
      rawPayload: { demo: true, simulated: true },
      createdAt: now,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: now, updatedAt: now, deletedAt: null },
  });
  console.log(JSON.stringify({ event: "demo.inbound.simulated", waId: conversation.waId, text }));
}

async function simulateHandoff(client, departments, waId) {
  const waIdCanonical = canonicalizeBrazilWaId(waId);
  const conversation = await prisma.conversation.findFirst({
    where: { clientId: client.id, OR: [{ waId }, { waIdCanonical }] },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) throw new Error(`conversation_not_found:${waId}`);
  const department = departments["Atendimento Geral"];
  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { departmentId: department.id, updatedAt: now, deletedAt: null },
  });
  await prisma.conversationRuntimeState.upsert({
    where: { clientId_waId: { clientId: client.id, waId: conversation.waId } },
    update: {
      mode: "HUMAN",
      handoffStatus: "PENDING",
      handoffRequestedAt: now,
      departmentId: department.id,
      queueId: department.queue.id,
      status: "WAITING",
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
    },
    create: {
      clientId: client.id,
      waId: conversation.waId,
      waIdCanonical: conversation.waIdCanonical ?? waIdCanonical,
      conversationKey: `${client.clientKey}:${conversation.waIdCanonical ?? waIdCanonical}`,
      firstSeenAt: now,
      lastInboundAt: now,
      windowIsOpen: true,
      handoffStatus: "PENDING",
      handoffRequestedAt: now,
      mode: "HUMAN",
      departmentId: department.id,
      queueId: department.queue.id,
      status: "WAITING",
    },
  });
  console.log(JSON.stringify({ event: "demo.handoff.simulated", waId: conversation.waId }));
}

async function main() {
  const client = await upsertClient();
  const departments = await upsertDepartments(client.id);
  const users = await upsertUsers(client.id, departments);

  await prisma.retentionConfig.upsert({
    where: { clientId: client.id },
    update: { retentionDays: DEMO_RETENTION_DAYS },
    create: { clientId: client.id, retentionDays: DEMO_RETENTION_DAYS },
  });
  await prisma.sLAConfig.upsert({
    where: { clientId: client.id },
    update: { firstResponseLimitSec: 300, resolutionTimeLimitSec: 86400 },
    create: { clientId: client.id, firstResponseLimitSec: 300, resolutionTimeLimitSec: 86400 },
  });
  await prisma.waPhoneNumber.deleteMany({ where: { phoneNumberId: DEMO_PHONE_NUMBER_ID } });
  await upsertChatbotFlow(client.id);

  const simulateInboundArg = process.argv.indexOf("--simulate-inbound");
  const simulateHandoffArg = process.argv.indexOf("--simulate-handoff");
  if (simulateInboundArg >= 0) {
    await simulateInboundMessage(client, process.argv[simulateInboundArg + 1], process.argv.slice(simulateInboundArg + 2).join(" ") || undefined);
    return;
  }
  if (simulateHandoffArg >= 0) {
    await simulateHandoff(client, departments, process.argv[simulateHandoffArg + 1]);
    return;
  }

  await clearDemoOperationalData(client.id);
  const statusCounts = await seedConversations(client, departments, users);
  console.log(
    JSON.stringify(
      {
        event: "demo.seed.completed",
        clientKey: client.clientKey,
        clientName: client.name,
        credentials: {
          admin: "admin@demo-prefeitura.local",
          supervisor: "supervisor@demo-prefeitura.local",
          agenteSaude: "agente_saude@demo-prefeitura.local",
          agenteEducacao: "agente_educacao@demo-prefeitura.local",
          agenteSocial: "agente_social@demo-prefeitura.local",
          password: DEMO_PASSWORD,
        },
        departments: departmentsSeed.map((item) => item.name),
        conversations: caseSeed.length,
        statusCounts,
        chatbotFlow: "Atendimento Previdenciario",
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: "demo.seed.failed", error: error.message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
