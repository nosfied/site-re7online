#!/usr/bin/env tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { readAuthenticatedTenantJsonSource } from "../src/config/authenticatedTenantJsonSource.js";
import { readAuthenticatedPrivateJsonSource } from "../src/config/authenticatedPrivateJsonSource.js";
import { buildChannelAccountMigrationPlan, sanitizedMigrationItem, type ChannelAccountPlanDocument } from "../src/channels/channelAccountMigrationPlan.js";
import type { TenantChannelAccount } from "../src/channels/tenantChannelAccount.types.js";

type Options = { source: string; expectedSourceSha256: string; plan: string; expectedPlanSha256: string; json: boolean; dryRun: boolean; tenant?: string };
function parseArgs(argv: string[]): Options {
  let source = ""; let expectedSourceSha256 = ""; let plan = ""; let expectedPlanSha256 = "";
  const options = { json: false, dryRun: false } as Options;
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]; const next = argv[i + 1];
    if (["--source", "--expected-source-sha256", "--plan", "--expected-plan-sha256", "--tenant", "--client-key"].includes(current)) {
      if (!next || next.startsWith("--")) throw new Error(`${current}_requires_value`);
      if (current === "--source") source = next;
      else if (current === "--expected-source-sha256") expectedSourceSha256 = next;
      else if (current === "--plan") plan = next;
      else if (current === "--expected-plan-sha256") expectedPlanSha256 = next;
      else options.tenant = next;
      i += 1;
    } else if (current === "--json") options.json = true;
    else if (current === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown_flag:${current}`);
  }
  if (!path.isAbsolute(source)) throw new Error("source_must_be_absolute");
  if (!path.isAbsolute(plan)) throw new Error("plan_must_be_absolute");
  if (!/^[a-f0-9]{64}$/i.test(expectedSourceSha256)) throw new Error("expected_source_sha256_required");
  if (!/^[a-f0-9]{64}$/i.test(expectedPlanSha256)) throw new Error("expected_plan_sha256_required");
  return { ...options, source, plan, expectedSourceSha256: expectedSourceSha256.toLowerCase(), expectedPlanSha256: expectedPlanSha256.toLowerCase() };
}
function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  dotenv.config({ path: process.cwd().endsWith("apps/whatsapp-agent") ? path.join(process.cwd(), ".env") : path.join(appDir, ".env") });
}
const secretHash = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function getEncryptionKey() { const value = process.env.CHANNEL_ACCOUNT_SECRET_KEY?.trim(); return value ? crypto.createHash("sha256").update(value, "utf8").digest() : null; }
function encryptSecret(value: string, key: Buffer) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}
function accountSecrets(account: TenantChannelAccount) {
  return [...(account.pageAccessToken?.trim() ? [{ kind: "pageAccessToken", value: account.pageAccessToken.trim() }] : []), ...(account.instagramBusinessAccessToken?.trim() ? [{ kind: "instagramBusinessAccessToken", value: account.instagramBusinessAccessToken.trim() }] : [])];
}
const jsonOrNull = (value: unknown) => value === undefined || value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const tenants = await readAuthenticatedTenantJsonSource({ source: options.source, expectedSha256: options.expectedSourceSha256 });
  const planDocument = await readAuthenticatedPrivateJsonSource<ChannelAccountPlanDocument>({ source: options.plan, expectedSha256: options.expectedPlanSha256 });
  const sourceKeys = [...new Set([...Object.keys(tenants), ...Object.keys(planDocument.tenants ?? {})])].filter((key) => !options.tenant || key === options.tenant).sort();
  const prisma = new PrismaClient(); const encryptionKey = getEncryptionKey();
  try {
    const report = await prisma.$transaction(async (tx) => {
      const clients = await tx.client.findMany({ where: { clientKey: { in: sourceKeys } }, select: { id: true, clientKey: true } });
      if (!options.dryRun) for (const client of [...clients].sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id}::uuid FOR UPDATE`;
      const clientIds = clients.map((item) => item.id);
      const [phones, metaConfigs, existing] = await Promise.all([
        tx.waPhoneNumber.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, phoneNumberId: true } }),
        tx.tenantMetaConfig.findMany({ where: { clientId: { in: clientIds } }, select: { clientId: true, phoneNumberId: true } }),
        tx.channelAccount.findMany({ where: { channel: "whatsapp", provider: "meta" }, include: { aliases: true, secrets: true, client: { select: { clientKey: true } } } }),
      ]);
      const plan = buildChannelAccountMigrationPlan({ tenants, planDocument, expectedSourceSha256: options.expectedSourceSha256, clients, phoneNumbers: phones, metaConfigs, existingMetaAccounts: existing.map((row) => ({ clientId: row.clientId, clientKey: row.client.clientKey, channelAccountId: row.channelAccountId, aliases: row.aliases.map((alias) => alias.alias) })), selectedTenant: options.tenant });
      const existingByKey = new Map(existing.map((item) => [`${item.clientId}:${item.channelAccountId}`, item]));
      const prepared = plan.items.map((item) => {
        const prior = existingByKey.get(`${item.clientId}:${item.account.channelAccountId}`); const secrets = accountSecrets(item.account);
        if (!options.dryRun && secrets.length && !encryptionKey) throw new Error(`CHANNEL_ACCOUNT_SECRET_KEY_REQUIRED:${item.tenantKey}`);
        const desired = { displayName: item.account.displayName ?? null, externalAccountIds: item.account.externalAccountIds ?? null, externalBusinessId: item.account.externalBusinessId ?? null, metadata: item.account.metadata ?? null, enabled: item.account.enabled, automationEnabled: item.account.automationEnabled!, runtimeEnabled: item.account.runtimeEnabled!, inboundPersistenceEnabled: item.account.inboundPersistenceEnabled!, outboundEnabled: item.account.outboundEnabled!, aiEnabled: item.account.aiEnabled!, handoffEnabled: item.account.handoffEnabled!, status: item.account.status!, tokenStatus: item.account.tokenStatus! };
        const priorComparable = prior ? Object.fromEntries(Object.keys(desired).map((key) => [key, (prior as unknown as Record<string, unknown>)[key]])) : null;
        const desiredAliases = [...(item.account.externalAccountIds ?? [])].sort(); const priorAliases = prior?.aliases.map((row) => row.alias).sort() ?? [];
        const desiredSecrets = secrets.map((secret) => `${secret.kind}:${secretHash(secret.value)}`).sort(); const priorSecrets = prior?.secrets.map((secret) => `${secret.secretKind}:${secret.secretHash ?? ""}`).sort() ?? [];
        if (prior && stable(desiredAliases) !== stable(priorAliases)) throw new Error(`CHANNEL_ACCOUNT_ALIAS_DIVERGENCE:${item.tenantKey}`);
        if (prior && stable(desiredSecrets) !== stable(priorSecrets)) throw new Error(`CHANNEL_ACCOUNT_SECRET_DIVERGENCE:${item.tenantKey}`);
        return { item, prior, desired, secrets, changed: !prior || stable(desired) !== stable(priorComparable) };
      });
      if (!options.dryRun) for (const entry of prepared) {
        if (!entry.changed) continue;
        const account = await tx.channelAccount.upsert({ where: { clientId_provider_channel_channelAccountId: { clientId: entry.item.clientId, provider: "meta", channel: "whatsapp", channelAccountId: entry.item.account.channelAccountId } }, create: { clientId: entry.item.clientId, provider: "meta", channel: "whatsapp", channelAccountId: entry.item.account.channelAccountId, ...entry.desired, externalAccountIds: jsonOrNull(entry.desired.externalAccountIds), metadata: jsonOrNull(entry.desired.metadata) }, update: { ...entry.desired, externalAccountIds: jsonOrNull(entry.desired.externalAccountIds), metadata: jsonOrNull(entry.desired.metadata) } });
        if (!entry.prior) for (const alias of entry.item.account.externalAccountIds ?? []) await tx.channelAccountAlias.create({ data: { channelAccountId: account.id, alias, aliasType: "externalAccountId" } });
        if (!entry.prior) for (const secret of entry.secrets) { const ciphertext = encryptionKey ? encryptSecret(secret.value, encryptionKey) : null; await tx.channelAccountSecret.create({ data: { channelAccountId: account.id, secretKind: secret.kind, secretHash: secretHash(secret.value), secretCiphertext: ciphertext, encryptionKeyRef: ciphertext ? "CHANNEL_ACCOUNT_SECRET_KEY" : null, status: "configured" } }); }
      }
      return { ok: true, dryRun: options.dryRun, sourceSha256: options.expectedSourceSha256, planSha256: options.expectedPlanSha256, sourceTenantCount: plan.sourceTenantCount, metaTenantCount: plan.metaTenantCount, webSessionOnlyCount: plan.webSessionOnlyCount, webSessionOnlyTenants: plan.webSessionOnlyTenants, changes: prepared.map(({ item, prior, changed }) => sanitizedMigrationItem(item, !changed ? "unchanged" : options.dryRun ? (prior ? "would_update" : "would_create") : (prior ? "updated" : "created"))) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(options.json ? JSON.stringify(report, null, 2) : `CHANNEL_ACCOUNT_BACKFILL_PASS dryRun=${report.dryRun} meta=${report.metaTenantCount} webSessionOnly=${report.webSessionOnlyCount}`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(`CHANNEL_ACCOUNT_BACKFILL_DENY:${(error as Error).message}`); process.exitCode = 1; });
