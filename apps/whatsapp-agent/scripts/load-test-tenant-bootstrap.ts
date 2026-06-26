#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { Prisma, PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { getTenants, saveTenants, type TenantConfigMap } from "../src/config/tenantConfig.js";

type Options = {
  command: "status" | "bootstrap";
  tenant: string;
  name: string;
  maxUsers: number;
  execute: boolean;
  json: boolean;
};

const DEFAULT_TENANT = "loadtest-prefeitura";
const DEFAULT_NAME = "Prefeitura Load Test";
const DEFAULT_MAX_USERS = 60;

const FEATURES = {
  webchat: true,
  webchatOutbound: true,
  advancedSearch: true,
  advancedSearchRuntime: true,
  scheduling: false,
  schedulingReminders: false,
  webhooks: false,
  webhookDispatch: false,
  webhookDispatchExecute: false,
  audioTranscription: false,
  audioTranscriptionRuntime: false,
  mfa: false,
  mfaRequired: false,
  mfaEnforced: false,
  telegram: false,
  telegramInbound: false,
  telegramOutbound: false,
  knowledgeBase: false,
  satisfaction: false,
};

const DEPARTMENTS = [
  { name: "Load Test Atendimento", slug: "load-test-atendimento", queueName: "Fila Load Test" },
  { name: "Load Test Suporte", slug: "load-test-suporte", queueName: "Fila Load Test Suporte" },
];

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: "status",
    tenant: DEFAULT_TENANT,
    name: DEFAULT_NAME,
    maxUsers: DEFAULT_MAX_USERS,
    execute: false,
    json: false,
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; ) {
    const current = argv[index] ?? "";
    const next = argv[index + 1] ?? "";
    const value = (flag: string) => {
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value`);
      return next;
    };
    switch (current) {
      case "status":
      case "bootstrap":
        positional.push(current);
        index += 1;
        break;
      case "--tenant":
        options.tenant = value(current).trim();
        index += 2;
        break;
      case "--name":
        options.name = value(current).trim();
        index += 2;
        break;
      case "--max-users":
        options.maxUsers = Number(value(current));
        index += 2;
        break;
      case "--execute":
        options.execute = true;
        index += 1;
        break;
      case "--json":
        options.json = true;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument: ${current}`);
    }
  }
  if (positional[0]) options.command = positional[0] as Options["command"];
  if (!options.tenant) throw new Error("--tenant is required");
  if (!options.name) throw new Error("--name is required");
  if (!Number.isInteger(options.maxUsers) || options.maxUsers < 1 || options.maxUsers > 500) {
    throw new Error("--max-users must be an integer between 1 and 500");
  }
  return options;
}

function loadEnv() {
  const appDir = process.cwd().endsWith("apps/whatsapp-agent")
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/whatsapp-agent");
  dotenv.config({ path: path.join(appDir, ".env") });
}

function mergeJson(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function upsertTenantConfig(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const config = mergeJson(existing?.config);
  const nextConfig = {
    ...config,
    planLimits: {
      planName: "load-test",
      messagesLimit: null,
      quotaMonthlyConversations: null,
      quotaWarnAtPct: 0.9,
      quotaBlockedReplyText: null,
      quotaExcludeWaIds: [],
    },
    templates: {
      ...((config.templates && typeof config.templates === "object" && !Array.isArray(config.templates))
        ? config.templates
        : {}),
      manualHandoff: "loadtest_manual_handoff_v1",
    },
    automationFlags: {
      disableChatbot: true,
      disableAiFallback: true,
      disableIntentClassifier: true,
    },
  };
  return params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: { config: nextConfig as Prisma.InputJsonValue, schemaVersion: 1 },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
  });
}

async function upsertDepartments(params: { prisma: PrismaClient; clientId: string }) {
  const results = [];
  for (const item of DEPARTMENTS) {
    const department = await params.prisma.department.upsert({
      where: { clientId_slug: { clientId: params.clientId, slug: item.slug } },
      update: { name: item.name, isActive: true },
      create: {
        clientId: params.clientId,
        name: item.name,
        slug: item.slug,
        isActive: true,
      },
    });
    const queue = await params.prisma.queue.upsert({
      where: {
        clientId_departmentId_name: {
          clientId: params.clientId,
          departmentId: department.id,
          name: item.queueName,
        },
      },
      update: {},
      create: {
        clientId: params.clientId,
        departmentId: department.id,
        name: item.queueName,
      },
    });
    results.push({ department, queue });
  }
  return results;
}

async function upsertMinimalTemplate(params: { prisma: PrismaClient; clientId: string }) {
  return params.prisma.template.upsert({
    where: { clientId_name: { clientId: params.clientId, name: "loadtest_manual_handoff_v1" } },
    update: {
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Atendimento de teste de carga registrado.",
    },
    create: {
      clientId: params.clientId,
      name: "loadtest_manual_handoff_v1",
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Atendimento de teste de carga registrado.",
    },
  });
}

async function ensureTenantRuntimeConfig(options: Options) {
  const tenants = await getTenants();
  const current = tenants[options.tenant] ?? {};
  const nextTenants: TenantConfigMap = {
    ...tenants,
    [options.tenant]: {
      ...current,
      id: options.tenant,
      name: options.name,
      metaPhoneNumberId:
        typeof current.metaPhoneNumberId === "string" && current.metaPhoneNumberId.trim()
          ? current.metaPhoneNumberId
          : `loadtest-${options.tenant}`,
      allowlist: Array.isArray(current.allowlist) ? current.allowlist : [],
      handoffAttendantWaid:
        typeof current.handoffAttendantWaid === "string" ? current.handoffAttendantWaid : "",
      defaultLanguage:
        typeof current.defaultLanguage === "string" && current.defaultLanguage.trim()
          ? current.defaultLanguage
          : "pt_BR",
      templates: {
        ...(current.templates ?? {}),
        manualHandoff: current.templates?.manualHandoff ?? "loadtest_manual_handoff_v1",
      },
      maxActiveAppUsers: options.maxUsers,
      disableChatbot: true,
      appDisableChatbot: true,
      disableLegacyFlows: true,
      disableAiFallback: true,
      appDisableAiFallback: true,
      disableIntentClassifier: true,
      appDisableIntentClassifier: true,
    },
  };
  return saveTenants(nextTenants);
}

async function buildStatus(prisma: PrismaClient, options: Options) {
  const client = await prisma.client.findUnique({
    where: { clientKey: options.tenant },
    include: {
      departments: true,
      queues: true,
      users: { where: { isActive: true }, select: { id: true } },
      publicApiKeys: { where: { status: "active" }, select: { id: true } },
      webchatSites: { select: { id: true, status: true } },
      searchIndexes: { select: { id: true } },
      operationalConfig: true,
    },
  });
  const tenants = await getTenants().catch(() => ({}));
  const tenantConfig = tenants[options.tenant];
  return {
    tenant: options.tenant,
    exists: Boolean(client),
    client: client
      ? {
          id: client.id,
          name: client.name,
          status: client.status,
          profile: client.profile,
          features: client.features,
          activeUsers: client.users.length,
          activeApiKeys: client.publicApiKeys.length,
          departments: client.departments.length,
          queues: client.queues.length,
          webchatSites: client.webchatSites.length,
          searchIndexes: client.searchIndexes.length,
          hasOperationalConfig: Boolean(client.operationalConfig),
        }
      : null,
    tenantConfig: tenantConfig
      ? {
          id: tenantConfig.id,
          name: tenantConfig.name,
          maxActiveAppUsers: tenantConfig.maxActiveAppUsers,
          defaultLanguage: tenantConfig.defaultLanguage,
        }
      : null,
  };
}

async function bootstrap(prisma: PrismaClient, options: Options) {
  const before = await buildStatus(prisma, options);
  const actions = [
    "upsert Client profile/features",
    "upsert TenantOperationalConfig",
    "upsert Departments/Queues",
    "upsert minimal Template",
    "upsert tenant runtime config maxActiveAppUsers",
  ];
  if (!options.execute) {
    return {
      ok: true,
      dryRun: true,
      actions,
      before,
      note: "Use --execute to apply the bootstrap.",
    };
  }

  const client = await prisma.client.upsert({
    where: { clientKey: options.tenant },
    update: {
      name: options.name,
      status: "ACTIVE",
      profile: "government",
      features: FEATURES as Prisma.InputJsonValue,
    },
    create: {
      clientKey: options.tenant,
      name: options.name,
      status: "ACTIVE",
      profile: "government",
      adminToken: crypto.randomBytes(32).toString("hex"),
      features: FEATURES as Prisma.InputJsonValue,
    },
  });
  await upsertTenantConfig({ prisma, clientId: client.id });
  await upsertDepartments({ prisma, clientId: client.id });
  await upsertMinimalTemplate({ prisma, clientId: client.id });
  const runtimeConfig = await ensureTenantRuntimeConfig(options);
  const after = await buildStatus(prisma, options);
  return {
    ok: true,
    dryRun: false,
    actions,
    tenant: options.tenant,
    runtimeConfigBackupPath: runtimeConfig.backupPath,
    after,
  };
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result =
      options.command === "bootstrap"
        ? await bootstrap(prisma, options)
        : { ok: true, ...(await buildStatus(prisma, options)) };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
