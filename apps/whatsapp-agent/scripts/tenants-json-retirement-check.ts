#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

type UsageKind = "runtime_critical" | "admin" | "onboarding" | "fallback_legacy" | "seed_demo_test";

type Usage = {
  file: string;
  line: number;
  symbol: "getTenants" | "saveTenants";
  kind: UsageKind;
  text: string;
};

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function walk(dir: string, output: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, output);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      output.push(full);
    }
  }
  return output;
}

function classify(file: string): UsageKind {
  const normalized = file.replace(/\\/g, "/");
  if (normalized.includes(".test.") || normalized.includes("/test") || normalized.includes("/scripts/seed") || normalized.includes("/demo")) {
    return "seed_demo_test";
  }
  if (normalized.includes("/scripts/") || normalized.includes("shadow") || normalized.includes("backfill")) {
    return "fallback_legacy";
  }
  if (normalized.includes("/meta/instagramBusinessLogin")) return "fallback_legacy";
  if (normalized.includes("/http/routes")) return "admin";
  if (
    normalized.includes("/http/metaWebhookPassive") ||
    normalized.includes("/whatsapp/") ||
    normalized.includes("/campaigns/") ||
    normalized.includes("/followup/") ||
    normalized.includes("/usage/") ||
    normalized.includes("/index.ts")
  ) {
    return "runtime_critical";
  }
  return "fallback_legacy";
}

function collectUsages(root: string) {
  const usages: Usage[] = [];
  for (const file of walk(root)) {
    const relative = path.relative(process.cwd(), file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const symbol of ["getTenants", "saveTenants"] as const) {
        if (!line.includes(symbol)) continue;
        if (/^\s*import\b/.test(line)) continue;
        if (relative.endsWith("tenantConfig.ts") && line.includes(`function ${symbol}`)) continue;
        usages.push({
          file: relative,
          line: index + 1,
          symbol,
          kind: classify(relative),
          text: line.trim().slice(0, 220),
        });
      }
    });
  }
  return usages;
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const root = path.resolve(process.cwd(), "src");
    const scriptRoot = path.resolve(process.cwd(), "scripts");
    const usages = [
      ...collectUsages(root),
      ...(fs.existsSync(scriptRoot) ? collectUsages(scriptRoot) : []),
    ];
    let databaseReachable = true;
    let databaseError: string | null = null;
    let clients: Array<{ id: string; clientKey: string; status: string }> = [];
    let operationalConfigs: Array<{ clientId: string; config: unknown }> = [];
    let channelAccounts: Array<{
      clientId: string;
      channel: string;
      provider: string;
      channelAccountId: string;
      tokenStatus: string;
      automationEnabled: boolean;
      runtimeEnabled: boolean;
      inboundPersistenceEnabled: boolean;
      outboundEnabled: boolean;
      aiEnabled: boolean;
      secrets: Array<{ secretKind: string; status: string }>;
      aliases: Array<{ alias: string }>;
    }> = [];
    let metaConfigs: Array<{ clientId: string; phoneNumberId: string | null; wabaId: string | null }> = [];
    let phoneNumbers: Array<{ clientId: string; phoneNumberId: string }> = [];
    try {
      [clients, operationalConfigs, channelAccounts, metaConfigs, phoneNumbers] = await Promise.all([
        prisma.client.findMany({ select: { id: true, clientKey: true, status: true } }),
        prisma.tenantOperationalConfig.findMany({ select: { clientId: true, config: true } }),
        prisma.channelAccount.findMany({
          select: {
            clientId: true,
            channel: true,
            provider: true,
            channelAccountId: true,
            tokenStatus: true,
            automationEnabled: true,
            runtimeEnabled: true,
            inboundPersistenceEnabled: true,
            outboundEnabled: true,
            aiEnabled: true,
            secrets: { select: { secretKind: true, status: true } },
            aliases: { select: { alias: true } },
          },
        }),
        prisma.tenantMetaConfig.findMany({ select: { clientId: true, phoneNumberId: true, wabaId: true } }),
        prisma.waPhoneNumber.findMany({ select: { clientId: true, phoneNumberId: true } }),
      ]);
    } catch (error) {
      databaseReachable = false;
      databaseError = (error as Error).message;
    }
    const operationalByClient = new Map(operationalConfigs.map((item) => [item.clientId, item.config]));
    const channelAccountsByClient = new Map<string, typeof channelAccounts>();
    for (const account of channelAccounts) {
      channelAccountsByClient.set(account.clientId, [...(channelAccountsByClient.get(account.clientId) ?? []), account]);
    }
    const metaByClient = new Set(metaConfigs.map((item) => item.clientId));
    const phonesByClient = new Set(phoneNumbers.map((item) => item.clientId));
    const tenants = clients.map((client) => {
      const accounts = channelAccountsByClient.get(client.id) ?? [];
      return {
        clientKey: client.clientKey,
        status: client.status,
        operationalConfig: operationalByClient.has(client.id),
        operationalReadiness: inspectOperationalConfig(
          operationalByClient.get(client.id),
          accounts.some((account) => account.channel === "whatsapp" && account.provider === "meta" && account.aiEnabled)
        ),
        tenantMetaConfig: metaByClient.has(client.id),
        waPhoneNumber: phonesByClient.has(client.id),
        channelAccounts: accounts.map((account) => ({
          channel: account.channel,
          provider: account.provider,
          channelAccountId: account.channelAccountId,
          tokenStatus: account.tokenStatus,
          automationEnabled: account.automationEnabled,
          runtimeEnabled: account.runtimeEnabled,
          inboundPersistenceEnabled: account.inboundPersistenceEnabled,
          outboundEnabled: account.outboundEnabled,
          aiEnabled: account.aiEnabled,
          aliasCount: account.aliases.length,
          secretKinds: account.secrets.map((secret) => `${secret.secretKind}:${secret.status}`),
        })),
      };
    });
    const usageCounts = usages.reduce<Record<UsageKind, number>>((acc, usage) => {
      acc[usage.kind] = (acc[usage.kind] ?? 0) + 1;
      return acc;
    }, {
      runtime_critical: 0,
      admin: 0,
      onboarding: 0,
      fallback_legacy: 0,
      seed_demo_test: 0,
    });
    const blocking = usages.filter((usage) => usage.kind === "runtime_critical" || usage.kind === "onboarding");
    const incompleteTenants = databaseReachable
      ? tenants.filter(
          (tenant) => tenant.status === "ACTIVE" && (
            !tenant.operationalConfig ||
            !tenant.operationalReadiness.ready ||
            (!tenant.waPhoneNumber && !tenant.tenantMetaConfig) ||
            !tenant.channelAccounts.some((account) => account.channel === "whatsapp" && account.provider === "meta")
          )
        )
      : [];
    const activeTenantsWithoutChannelAccounts = databaseReachable
      ? tenants.filter((tenant) => tenant.status === "ACTIVE" && tenant.channelAccounts.length === 0)
      : [];
    console.log(JSON.stringify({
      ok: databaseReachable && blocking.length === 0 && incompleteTenants.length === 0,
      generatedAt: new Date().toISOString(),
      database: {
        reachable: databaseReachable,
        error: databaseError,
      },
      env: {
        enableTenantsJsonFallback: process.env.ENABLE_TENANTS_JSON_FALLBACK === "true",
        allowTenantsJsonWrite: process.env.ALLOW_TENANTS_JSON_WRITE === "true",
        channelAccountsDbFirstMessenger: (process.env.CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER ?? "false") === "true",
        channelAccountsDbFirstInstagram: (process.env.CHANNEL_ACCOUNTS_DB_FIRST_INSTAGRAM ?? "false") === "true",
      },
      usageCounts,
      blockingUsages: blocking,
      incompleteTenants,
      warnings: {
        activeTenantsWithoutChannelAccounts,
      },
      tenants,
    }, null, 2));
    if (!databaseReachable || blocking.length > 0 || incompleteTenants.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inspectOperationalConfig(config: unknown, aiEnabled: boolean) {
  const reasons: string[] = [];
  if (!isRecord(config)) return { ready: false, reasons: ["operational_config_missing"] };
  const base = isRecord(config.baseConfig) ? config.baseConfig : null;
  if (!base) reasons.push("base_config_missing");
  else {
    if (!Array.isArray(base.allowlist) || base.allowlist.some((value) => typeof value !== "string")) reasons.push("base_allowlist_invalid");
    if (typeof base.handoffAttendantWaid !== "string") reasons.push("base_handoff_invalid");
    if (typeof base.defaultLanguage !== "string" || !base.defaultLanguage) reasons.push("base_language_invalid");
    if (typeof base.disableAutoReply !== "boolean") reasons.push("base_disable_auto_reply_invalid");
  }
  const ai = isRecord(config.aiAssistantConfig) ? config.aiAssistantConfig : null;
  if (aiEnabled && !ai) reasons.push("ai_config_missing");
  if (ai && (typeof ai.aiAssistantEnabled !== "boolean" || typeof ai.aiAssistantFallbackToHandoff !== "boolean")) {
    reasons.push("ai_toggles_invalid");
  }
  return { ready: reasons.length === 0, reasons };
}

main().catch((error) => {
  console.error(`tenants json retirement check failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
