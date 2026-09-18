#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import process from "node:process";
import { Prisma, PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const DEMO_TENANT_KEY = "demo-converta";

type PlannedAction = {
  action: "create" | "update" | "skip" | "manual";
  target: string;
  message: string;
  details?: Record<string, unknown>;
};

type Options = {
  tenantKey: string;
  apply: boolean;
  includeMeta: boolean;
};

type DemoUserInput = {
  name: string;
  email: string;
  role: "ADMIN" | "SUPERVISOR" | "AGENT";
  department?: string;
};

const departments = [
  "Atendimento Geral",
  "Projetos e Editais",
  "Suporte Tecnico",
] as const;

const cannedReplies = [
  {
    title: "Saudacao institucional",
    body: "Ola! Voce esta falando com a equipe de atendimento. Como podemos ajudar?",
    category: "Atendimento",
  },
  {
    title: "Solicitacao de identificacao",
    body: "Para localizar sua solicitacao, por favor informe nome completo e numero do protocolo, se houver.",
    category: "Atendimento",
  },
  {
    title: "Encaminhamento",
    body: "Vamos encaminhar sua demanda para a equipe responsavel e retornaremos assim que houver atualizacao.",
    category: "Fluxo interno",
  },
  {
    title: "Retificacao",
    body: "Correcao: desconsidere a mensagem anterior. A informacao correta e:",
    category: "Atendimento",
  },
  {
    title: "Encerramento",
    body: "Agradecemos o contato. Caso precise de algo mais, estamos a disposicao.",
    category: "Atendimento",
  },
] as const;

const crmDemoLeads = [
  { name: "Ana Exemplo", waId: "demo:crm:ana-exemplo", city: "Cidade Demo", company: "Organizacao Exemplo" },
  { name: "Bruno Demonstracao", waId: "demo:crm:bruno-demonstracao", city: "Cidade Demo", company: "Instituto Demo" },
  { name: "Camila Teste", waId: "demo:crm:camila-teste", city: "Cidade Demo", company: "Projeto Ficticio" },
] as const;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    tenantKey: DEMO_TENANT_KEY,
    apply: false,
    includeMeta: false,
  };
  for (let index = 0; index < argv.length; ) {
    const current = argv[index];
    const next = argv[index + 1];
    const requireValue = (flag: string) => {
      if (!next || next.startsWith("--")) throw new Error(`${flag} exige um valor`);
      return next;
    };
    switch (current) {
      case "--tenant":
      case "--tenant-key":
        options.tenantKey = requireValue(current).trim();
        index += 2;
        break;
      case "--apply":
        options.apply = true;
        index += 1;
        break;
      case "--include-meta":
        options.includeMeta = true;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  if (options.tenantKey !== DEMO_TENANT_KEY) {
    throw new Error(`este script so permite tenant ${DEMO_TENANT_KEY}`);
  }
  return options;
}

function maskIdentifier(input: string | null | undefined) {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length >= 4) return `****${digits.slice(-4)} (len ${digits.length})`;
  return `masked (len ${input.length})`;
}

function parseUsersFromEnv(): DemoUserInput[] {
  const raw = process.env.DEMO_TENANT_USERS_JSON;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("DEMO_TENANT_USERS_JSON deve ser array");
  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("usuario invalido em DEMO_TENANT_USERS_JSON");
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    const role = typeof record.role === "string" ? record.role.trim().toUpperCase() : "";
    const department = typeof record.department === "string" ? record.department.trim() : undefined;
    if (!name || !email || !["ADMIN", "SUPERVISOR", "AGENT"].includes(role)) {
      throw new Error("usuario exige name, email e role ADMIN/SUPERVISOR/AGENT");
    }
    return { name, email, role: role as DemoUserInput["role"], department };
  });
}

function buildCannedReply(title: string, body: string, category: string) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    body,
    active: true,
    category,
    createdAt: now,
    updatedAt: now,
    createdBy: "provision-demo-tenant",
    updatedBy: "provision-demo-tenant",
  };
}

function mergeOperationalConfig(current: unknown) {
  const config =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  const existingReplies = Array.isArray(config.cannedReplies)
    ? config.cannedReplies.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];
  const existingTitles = new Set(
    existingReplies
      .map((item) => (typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title : ""))
      .filter(Boolean)
  );
  const nextReplies = [
    ...existingReplies,
    ...cannedReplies
      .filter((reply) => !existingTitles.has(reply.title))
      .map((reply) => buildCannedReply(reply.title, reply.body, reply.category)),
  ];

  return {
    ...config,
    cannedReplies: nextReplies,
    queueAssignmentPolicy: {
      enabled: true,
      mode: "round_robin",
      scope: "department",
      maxActivePerAgent: 2,
      includeSupervisors: false,
      requireOnline: false,
      notifyAssignedOnly: false,
    },
  };
}

function readMetaEnv() {
  return {
    businessId: process.env.DEMO_META_BUSINESS_ID?.trim() || null,
    businessPortfolioId: process.env.DEMO_META_BUSINESS_PORTFOLIO_ID?.trim() || null,
    wabaId: process.env.DEMO_META_WABA_ID?.trim() || null,
    phoneNumberId: process.env.DEMO_META_PHONE_NUMBER_ID?.trim() || null,
    businessToken: process.env.DEMO_META_BUSINESS_TOKEN?.trim() || null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const users = parseUsersFromEnv();
  const prisma = new PrismaClient();
  const planned: PlannedAction[] = [];
  const startedAt = new Date().toISOString();

  try {
    let client = await prisma.client.findUnique({
      where: { clientKey: options.tenantKey },
      select: { id: true, clientKey: true, name: true, status: true, profile: true, features: true },
    });

    planned.push({
      action: client ? "skip" : "create",
      target: "Client",
      message: client ? "Tenant ja existe." : "Criar tenant demo-converta ativo.",
      details: client
        ? { clientKey: client.clientKey, status: client.status, profile: client.profile }
        : { clientKey: options.tenantKey, name: "Converta Demo", status: "ACTIVE", profile: "business" },
    });

    if (options.apply && !client) {
      client = await prisma.client.create({
        data: {
          clientKey: options.tenantKey,
          name: "Converta Demo",
          status: "ACTIVE",
          profile: "business",
          features: {
            crm: true,
            campaigns: true,
            templates: true,
            reports: true,
            chatbot: true,
            webchat: true,
          } satisfies Prisma.InputJsonObject,
        },
        select: { id: true, clientKey: true, name: true, status: true, profile: true, features: true },
      });
    }

    if (!client) {
      appendFutureTenantPlan(planned, users, options.includeMeta);
      printReport(options, startedAt, planned);
      return;
    }

    const existingDepartments = await prisma.department.findMany({
      where: { clientId: client.id },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    for (const name of departments) {
      const slug = slugify(name);
      const existing = existingDepartments.find((department) => department.slug === slug || department.name === name);
      planned.push({
        action: existing ? "skip" : "create",
        target: "Department",
        message: existing ? `Departamento ${name} ja existe.` : `Criar departamento ${name}.`,
        details: { name, slug },
      });
      if (options.apply && !existing) {
        await prisma.department.create({ data: { clientId: client.id, name, slug } });
      }
    }

    const refreshedDepartments = options.apply
      ? await prisma.department.findMany({ where: { clientId: client.id }, select: { id: true, name: true, slug: true } })
      : existingDepartments;
    for (const name of departments) {
      const department = refreshedDepartments.find((item) => item.slug === slugify(name) || item.name === name);
      if (!department) continue;
      const existingQueue = await prisma.queue.findFirst({
        where: { clientId: client.id, departmentId: department.id, name: "Fila principal" },
        select: { id: true },
      });
      planned.push({
        action: existingQueue ? "skip" : "create",
        target: "Queue",
        message: existingQueue ? `Fila principal ja existe em ${name}.` : `Criar fila principal em ${name}.`,
        details: { department: name, queue: "Fila principal" },
      });
      if (options.apply && !existingQueue) {
        const queue = await prisma.queue.create({
          data: { clientId: client.id, departmentId: department.id, name: "Fila principal" },
          select: { id: true },
        });
        await prisma.department.update({
          where: { id: department.id },
          data: { operationalQueueId: queue.id },
        });
      } else if (options.apply && existingQueue) {
        await prisma.department.update({
          where: { id: department.id },
          data: { operationalQueueId: existingQueue.id },
        });
      }
    }

    const operationalConfig = await prisma.tenantOperationalConfig.findUnique({
      where: { clientId: client.id },
      select: { config: true },
    });
    const nextConfig = mergeOperationalConfig(operationalConfig?.config);
    planned.push({
      action: operationalConfig ? "update" : "create",
      target: "TenantOperationalConfig",
      message: "Configurar mensagens prontas e queueAssignmentPolicy do tenant demo.",
      details: {
        cannedReplies: Array.isArray(nextConfig.cannedReplies) ? nextConfig.cannedReplies.length : 0,
        queueAssignmentPolicy: {
          enabled: true,
          mode: "round_robin",
          scope: "department",
          maxActivePerAgent: 2,
        },
      },
    });
    if (options.apply) {
      await prisma.tenantOperationalConfig.upsert({
        where: { clientId: client.id },
        update: { config: nextConfig as Prisma.InputJsonObject, schemaVersion: 1 },
        create: { clientId: client.id, config: nextConfig as Prisma.InputJsonObject, schemaVersion: 1 },
      });
    }

    if (users.length === 0) {
      planned.push({
        action: "manual",
        target: "User",
        message: "Usuarios nao serao criados sem DEMO_TENANT_USERS_JSON seguro.",
        details: { requiredRoles: ["ADMIN", "SUPERVISOR", "AGENT"] },
      });
    } else {
      const departmentByName = new Map(refreshedDepartments.map((department) => [department.name, department.id]));
      for (const user of users) {
        const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true, clientId: true } });
        const departmentId = user.department ? departmentByName.get(user.department) ?? null : null;
        planned.push({
          action: existing ? "skip" : "create",
          target: "User",
          message: existing ? `Usuario ${user.email} ja existe.` : `Criar usuario ${user.role}.`,
          details: { name: user.name, email: user.email, role: user.role, department: user.department ?? null },
        });
        if (options.apply && !existing) {
          await prisma.user.create({
            data: {
              clientId: client.id,
              name: user.name,
              email: user.email,
              role: user.role,
              departmentId,
              passwordHash: null,
              isActive: true,
            },
          });
        }
      }
    }

    if (options.includeMeta) {
      const meta = readMetaEnv();
      const canWriteMeta = Boolean(meta.phoneNumberId && meta.wabaId);
      planned.push({
        action: canWriteMeta ? "update" : "manual",
        target: "TenantMetaConfig",
        message: canWriteMeta
          ? "Criar/atualizar configuracao Meta usando variaveis de ambiente."
          : "Meta nao configurada: faltam DEMO_META_WABA_ID e DEMO_META_PHONE_NUMBER_ID.",
        details: {
          businessId: maskIdentifier(meta.businessId),
          businessPortfolioId: maskIdentifier(meta.businessPortfolioId),
          wabaId: maskIdentifier(meta.wabaId),
          phoneNumberId: maskIdentifier(meta.phoneNumberId),
          businessTokenProvided: Boolean(meta.businessToken),
        },
      });
      if (options.apply && canWriteMeta) {
        await prisma.tenantMetaConfig.upsert({
          where: { clientId: client.id },
          update: {
            businessId: meta.businessId,
            businessPortfolioId: meta.businessPortfolioId,
            wabaId: meta.wabaId,
            phoneNumberId: meta.phoneNumberId,
            businessToken: meta.businessToken,
            rawPayload: { source: "provision-demo-tenant", configuredAt: new Date().toISOString() },
          },
          create: {
            clientId: client.id,
            businessId: meta.businessId,
            businessPortfolioId: meta.businessPortfolioId,
            wabaId: meta.wabaId,
            phoneNumberId: meta.phoneNumberId,
            businessToken: meta.businessToken,
            rawPayload: { source: "provision-demo-tenant", configuredAt: new Date().toISOString() },
          },
        });
        await prisma.waPhoneNumber.upsert({
          where: { phoneNumberId: meta.phoneNumberId! },
          update: { clientId: client.id },
          create: { clientId: client.id, phoneNumberId: meta.phoneNumberId!, display: null },
        });
      }
    } else {
      planned.push({
        action: "manual",
        target: "TenantMetaConfig",
        message: "Meta/WABA nao sera alterada sem --include-meta e variaveis seguras.",
      });
    }

    for (const lead of crmDemoLeads) {
      const existing = await prisma.lead.findUnique({
        where: { tenantId_waId: { tenantId: client.id, waId: lead.waId } },
        select: { id: true },
      });
      planned.push({
        action: existing ? "skip" : "create",
        target: "Lead",
        message: existing ? `Lead ficticio ${lead.name} ja existe.` : `Criar lead ficticio ${lead.name}.`,
        details: { name: lead.name, channel: "demo", waId: lead.waId },
      });
      if (options.apply && !existing) {
        await prisma.lead.create({
          data: {
            tenantId: client.id,
            waId: lead.waId,
            waIdCanonical: lead.waId,
            channel: "demo",
            provider: "demo",
            name: lead.name,
            city: lead.city,
            company: lead.company,
            status: "NEW",
          },
        });
      }
    }

    printReport(options, startedAt, planned);
  } finally {
    await prisma.$disconnect();
  }
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function appendFutureTenantPlan(planned: PlannedAction[], users: DemoUserInput[], includeMeta: boolean) {
  for (const name of departments) {
    planned.push({
      action: "create",
      target: "Department",
      message: `Criar departamento ${name}.`,
      details: { name, slug: slugify(name) },
    });
    planned.push({
      action: "create",
      target: "Queue",
      message: `Criar fila principal em ${name}.`,
      details: { department: name, queue: "Fila principal" },
    });
  }
  planned.push({
    action: "create",
    target: "TenantOperationalConfig",
    message: "Configurar mensagens prontas e queueAssignmentPolicy do tenant demo.",
    details: {
      cannedReplies: cannedReplies.length,
      queueAssignmentPolicy: {
        enabled: true,
        mode: "round_robin",
        scope: "department",
        maxActivePerAgent: 2,
      },
    },
  });
  planned.push(
    users.length === 0
      ? {
          action: "manual",
          target: "User",
          message: "Usuarios nao serao criados sem DEMO_TENANT_USERS_JSON seguro.",
          details: { requiredRoles: ["ADMIN", "SUPERVISOR", "AGENT"] },
        }
      : {
          action: "create",
          target: "User",
          message: "Criar usuarios informados por DEMO_TENANT_USERS_JSON.",
          details: {
            total: users.length,
            roles: users.reduce<Record<string, number>>((acc, user) => {
              acc[user.role] = (acc[user.role] ?? 0) + 1;
              return acc;
            }, {}),
          },
        }
  );
  planned.push({
    action: includeMeta ? "manual" : "manual",
    target: "TenantMetaConfig",
    message: includeMeta
      ? "Meta depende de variaveis seguras e so sera escrita no apply."
      : "Meta/WABA nao sera alterada sem --include-meta e variaveis seguras.",
  });
  for (const lead of crmDemoLeads) {
    planned.push({
      action: "create",
      target: "Lead",
      message: `Criar lead ficticio ${lead.name}.`,
      details: { name: lead.name, channel: "demo", waId: lead.waId },
    });
  }
}

function printReport(options: Options, startedAt: string, planned: PlannedAction[]) {
  const summary = planned.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: options.apply ? "apply" : "dry-run",
        tenantKey: options.tenantKey,
        startedAt,
        summary,
        planned,
      },
      null,
      2
    )
  );
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Can't reach database server")) return "database_unavailable";
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(token|password|secret)=\S+/gi, "$1=[redacted]")
    .slice(0, 240);
}

main().catch((error) => {
  console.error(`[provision-demo-tenant] FAIL: ${sanitizeError(error)}`);
  process.exit(1);
});
