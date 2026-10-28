#!/usr/bin/env tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { readAuthenticatedTenantJsonSource } from "../src/config/authenticatedTenantJsonSource.js";
import { buildChannelAccountMigrationPlan } from "../src/channels/channelAccountMigrationPlan.js";
import type { TenantChannelAccount } from "../src/channels/tenantChannelAccount.types.js";

type Options = { source: string; expectedSourceSha256: string; json: boolean; tenant?: string; includeMatches: boolean };
function parseArgs(argv: string[]): Options {
  let source = ""; let expectedSourceSha256 = ""; const result = { json: false, includeMatches: false } as Options;
  for (let i = 0; i < argv.length; i += 1) { const current = argv[i]; const next = argv[i + 1];
    if (["--source", "--expected-source-sha256", "--tenant", "--client-key"].includes(current)) { if (!next || next.startsWith("--")) throw new Error(`${current}_requires_value`); if (current === "--source") source = next; else if (current === "--expected-source-sha256") expectedSourceSha256 = next; else result.tenant = next; i += 1; }
    else if (current === "--json") result.json = true; else if (current === "--include-matches") result.includeMatches = true; else throw new Error(`unknown_flag:${current}`);
  }
  if (!path.isAbsolute(source)) throw new Error("source_must_be_absolute");
  if (!/^[a-f0-9]{64}$/i.test(expectedSourceSha256)) throw new Error("expected_source_sha256_required");
  return { ...result, source, expectedSourceSha256: expectedSourceSha256.toLowerCase() };
}
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; return JSON.stringify(value); }
const digest = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const secretHash = digest;
function desired(account: TenantChannelAccount) { return { displayName: account.displayName ?? null, externalAccountIds: account.externalAccountIds ?? null, externalBusinessId: account.externalBusinessId ?? null, metadata: account.metadata ?? null, enabled: account.enabled, automationEnabled: account.automationEnabled, runtimeEnabled: account.runtimeEnabled, inboundPersistenceEnabled: account.inboundPersistenceEnabled, outboundEnabled: account.outboundEnabled, aiEnabled: account.aiEnabled, handoffEnabled: account.handoffEnabled, status: account.status, tokenStatus: account.tokenStatus }; }

async function main() {
  const options = parseArgs(process.argv.slice(2)); const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent"); dotenv.config({ path: process.cwd().endsWith("apps/whatsapp-agent") ? path.join(process.cwd(), ".env") : path.join(appDir, ".env") });
  const tenants = await readAuthenticatedTenantJsonSource({ source: options.source, expectedSha256: options.expectedSourceSha256 });
  const keys = Object.keys(tenants).filter((key) => !options.tenant || key === options.tenant).sort(); const prisma = new PrismaClient();
  try {
    const clients = await prisma.client.findMany({ where: { clientKey: { in: keys } }, select: { id: true, clientKey: true } }); const cra = options.tenant && options.tenant !== "cra-pr" ? null : await prisma.client.findUnique({ where: { clientKey: "cra-pr" }, select: { id: true, clientKey: true } }); const clientIds = [...clients.map((item) => item.id), ...(cra ? [cra.id] : [])];
    const [phones, metaConfigs, existing] = await Promise.all([
      prisma.waPhoneNumber.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, phoneNumberId: true } }),
      prisma.tenantMetaConfig.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, phoneNumberId: true } }),
      prisma.channelAccount.findMany({ where: { clientId: { in: clientIds }, channel: "whatsapp", provider: "meta" }, include: { aliases: true, secrets: true, client: { select: { clientKey: true } } } }),
    ]);
    if (cra && !Object.prototype.hasOwnProperty.call(tenants, "cra-pr") && (phones.some((item) => item.clientId === cra.id) || metaConfigs.some((item) => item.clientId === cra.id && item.phoneNumberId) || existing.some((item) => item.clientId === cra.id))) throw new Error("CRA_CHANNEL_ACCOUNT_SOURCE_UNRESOLVED:cra-pr");
    const plan = buildChannelAccountMigrationPlan({ tenants, clients, phoneNumbers: phones, metaConfigs, existingMetaAccounts: existing, selectedTenant: options.tenant });
    const byKey = new Map(existing.map((row) => [`${row.clientId}:${row.channelAccountId}`, row])); const expectedKeys = new Set<string>(); const items: Array<Record<string, unknown>> = [];
    for (const item of plan.items) {
      const key = `${item.clientId}:${item.account.channelAccountId}`; expectedKeys.add(key); const row = byKey.get(key); const mismatches: string[] = [];
      if (!row) mismatches.push("missing_db"); else {
        const prior = Object.fromEntries(Object.keys(desired(item.account)).map((field) => [field, (row as unknown as Record<string, unknown>)[field]])); if (stable(desired(item.account)) !== stable(prior)) mismatches.push("account_fields");
        for (const alias of item.account.externalAccountIds ?? []) if (!row.aliases.some((entry) => entry.alias === alias)) mismatches.push("alias_missing");
        for (const [kind, value] of [["pageAccessToken", item.account.pageAccessToken], ["instagramBusinessAccessToken", item.account.instagramBusinessAccessToken]] as const) if (value?.trim() && row.secrets.find((entry) => entry.secretKind === kind)?.secretHash !== secretHash(value.trim())) mismatches.push(`secret:${kind}`);
      }
      if (mismatches.length || options.includeMatches) items.push({ tenantKey: item.tenantKey, modality: item.modality, identitySha256: item.identitySha256, status: mismatches.length ? "DENY" : "MATCHED", mismatches: [...new Set(mismatches)].sort() });
    }
    for (const row of existing) if (!expectedKeys.has(`${row.clientId}:${row.channelAccountId}`)) items.push({ tenantKey: row.client.clientKey, modality: "WHATSAPP_META", identitySha256: digest(row.channelAccountId), status: "DENY", mismatches: ["missing_authenticated_source_plan"] });
    const ok = !items.some((item) => item.status === "DENY"); const report = { ok, sourceSha256: options.expectedSourceSha256, tenants: plan.sourceTenantCount, metaTenants: plan.metaTenantCount, webSessionOnlyTenants: plan.webSessionOnlyTenants, items };
    console.log(options.json ? JSON.stringify(report, null, 2) : `CHANNEL_ACCOUNT_SHADOW_${ok ? "PASS" : "DENY"} tenants=${report.tenants} meta=${report.metaTenants}`); if (!ok) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(`CHANNEL_ACCOUNT_SHADOW_DENY:${(error as Error).message}`); process.exitCode = 1; });
