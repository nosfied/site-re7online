#!/usr/bin/env tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import type { TenantChannelAccount } from "../src/channels/tenantChannelAccount.types.js";

type Options = {
  json: boolean;
  tenant?: string;
  includeMatches: boolean;
};

type CompareItem = {
  tenantKey: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  status: "matched" | "missing_db" | "missing_json" | "mismatched";
  mismatches: string[];
};

type CompareReport = {
  ok: boolean;
  totals: {
    tenants: number;
    jsonAccounts: number;
    dbAccounts: number;
    matched: number;
    missingDb: number;
    missingJson: number;
    mismatched: number;
  };
  items: CompareItem[];
};

type DbChannelAccount = Awaited<ReturnType<typeof loadDbAccounts>>[number];

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    includeMatches: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--include-matches":
        options.includeMatches = true;
        break;
      case "--tenant":
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
        options.tenant = next;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  return options;
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function accountKey(account: {
  tenantKey: string;
  provider: string;
  channel: string;
  channelAccountId: string;
}) {
  return `${account.tenantKey}:${account.provider}:${account.channel}:${account.channelAccountId}`;
}

function sortedStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string").sort();
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string")
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function secretHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonSecrets(account: TenantChannelAccount) {
  const output = new Map<string, string>();
  if (account.pageAccessToken?.trim()) {
    output.set("pageAccessToken", secretHash(account.pageAccessToken.trim()));
  }
  if (account.instagramBusinessAccessToken?.trim()) {
    output.set("instagramBusinessAccessToken", secretHash(account.instagramBusinessAccessToken.trim()));
  }
  return output;
}

async function loadDbAccounts(prisma: PrismaClient, tenant?: string) {
  return prisma.channelAccount.findMany({
    where: tenant ? { client: { clientKey: tenant } } : {},
    include: {
      client: { select: { clientKey: true } },
      aliases: { select: { alias: true, aliasType: true } },
      secrets: { select: { secretKind: true, secretHash: true, secretCiphertext: true, status: true } },
    },
    orderBy: [{ channel: "asc" }, { provider: "asc" }, { channelAccountId: "asc" }],
  });
}

function compareJsonToDb(jsonAccount: TenantChannelAccount, dbAccount: DbChannelAccount) {
  const mismatches: string[] = [];
  const boolFields: Array<keyof TenantChannelAccount> = [
    "enabled",
    "automationEnabled",
    "runtimeEnabled",
    "inboundPersistenceEnabled",
    "outboundEnabled",
    "aiEnabled",
    "handoffEnabled",
  ];

  if ((jsonAccount.displayName ?? null) !== dbAccount.displayName) mismatches.push("displayName");
  if ((jsonAccount.externalBusinessId || null) !== (dbAccount.externalBusinessId || null)) {
    mismatches.push("externalBusinessId");
  }
  if ((jsonAccount.status ?? "pending") !== dbAccount.status) mismatches.push("status");
  if ((jsonAccount.tokenStatus ?? "missing") !== dbAccount.tokenStatus) mismatches.push("tokenStatus");

  for (const field of boolFields) {
    if ((jsonAccount[field] === true) !== (dbAccount[field] === true)) mismatches.push(String(field));
  }

  const jsonAliases = sortedStrings(jsonAccount.externalAccountIds);
  const dbAliases = dbAccount.aliases.map((alias) => alias.alias).sort();
  if (stableJson(jsonAliases) !== stableJson(dbAliases)) mismatches.push("aliases");

  if (stableJson(normalizeMetadata(jsonAccount.metadata)) !== stableJson(normalizeMetadata(dbAccount.metadata))) {
    mismatches.push("metadata");
  }

  const jsonSecretHashes = jsonSecrets(jsonAccount);
  const dbSecretsByKind = new Map(dbAccount.secrets.map((secret) => [secret.secretKind, secret]));
  const secretKinds = Array.from(new Set([...jsonSecretHashes.keys(), ...dbSecretsByKind.keys()])).sort();
  for (const kind of secretKinds) {
    const jsonHash = jsonSecretHashes.get(kind);
    const dbSecret = dbSecretsByKind.get(kind);
    const dbPresent = dbSecret?.status === "configured" || Boolean(dbSecret?.secretHash);
    if (Boolean(jsonHash) !== dbPresent) {
      mismatches.push(`secretPresence:${kind}`);
      continue;
    }
    if (jsonHash && dbSecret?.secretHash && jsonHash !== dbSecret.secretHash) {
      mismatches.push(`secretHash:${kind}`);
    }
    if (jsonHash && !dbSecret?.secretCiphertext) {
      mismatches.push(`secretCiphertextMissing:${kind}`);
    }
  }

  return mismatches;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const tenants = await getTenants();
    const tenantEntries = Object.entries(tenants).filter(([tenantKey]) => !options.tenant || tenantKey === options.tenant);
    if (options.tenant && tenantEntries.length === 0) {
      throw new Error(`tenant nao encontrado em tenants.json: ${options.tenant}`);
    }

    const dbAccounts = await loadDbAccounts(prisma, options.tenant);
    const dbByKey = new Map(
      dbAccounts.map((account) => [
        accountKey({
          tenantKey: account.client.clientKey,
          provider: account.provider,
          channel: account.channel,
          channelAccountId: account.channelAccountId,
        }),
        account,
      ])
    );

    const jsonAccounts: TenantChannelAccount[] = tenantEntries.flatMap(([tenantKey, tenant]) =>
      (tenant.channelAccounts ?? []).map((account) => ({ ...account, tenantKey }))
    );
    const jsonByKey = new Map(jsonAccounts.map((account) => [accountKey(account), account]));

    const report: CompareReport = {
      ok: true,
      totals: {
        tenants: tenantEntries.length,
        jsonAccounts: jsonAccounts.length,
        dbAccounts: dbAccounts.length,
        matched: 0,
        missingDb: 0,
        missingJson: 0,
        mismatched: 0,
      },
      items: [],
    };

    for (const jsonAccount of jsonAccounts) {
      const key = accountKey(jsonAccount);
      const dbAccount = dbByKey.get(key);
      if (!dbAccount) {
        report.ok = false;
        report.totals.missingDb += 1;
        report.items.push({
          tenantKey: jsonAccount.tenantKey,
          channel: jsonAccount.channel,
          provider: jsonAccount.provider,
          channelAccountId: jsonAccount.channelAccountId,
          status: "missing_db",
          mismatches: ["missing_db"],
        });
        continue;
      }

      const mismatches = compareJsonToDb(jsonAccount, dbAccount);
      if (mismatches.length > 0) {
        report.ok = false;
        report.totals.mismatched += 1;
        report.items.push({
          tenantKey: jsonAccount.tenantKey,
          channel: jsonAccount.channel,
          provider: jsonAccount.provider,
          channelAccountId: jsonAccount.channelAccountId,
          status: "mismatched",
          mismatches,
        });
      } else {
        report.totals.matched += 1;
        if (options.includeMatches) {
          report.items.push({
            tenantKey: jsonAccount.tenantKey,
            channel: jsonAccount.channel,
            provider: jsonAccount.provider,
            channelAccountId: jsonAccount.channelAccountId,
            status: "matched",
            mismatches: [],
          });
        }
      }
    }

    for (const dbAccount of dbAccounts) {
      const key = accountKey({
        tenantKey: dbAccount.client.clientKey,
        provider: dbAccount.provider,
        channel: dbAccount.channel,
        channelAccountId: dbAccount.channelAccountId,
      });
      if (jsonByKey.has(key)) continue;
      report.ok = false;
      report.totals.missingJson += 1;
      report.items.push({
        tenantKey: dbAccount.client.clientKey,
        channel: dbAccount.channel,
        provider: dbAccount.provider,
        channelAccountId: dbAccount.channelAccountId,
        status: "missing_json",
        mismatches: ["missing_json"],
      });
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `channel account shadow compare ok=${report.ok} tenants=${report.totals.tenants} jsonAccounts=${report.totals.jsonAccounts} dbAccounts=${report.totals.dbAccounts} matched=${report.totals.matched} missingDb=${report.totals.missingDb} missingJson=${report.totals.missingJson} mismatched=${report.totals.mismatched}`
      );
      for (const item of report.items) {
        console.log(
          `${item.status} tenant=${item.tenantKey} channel=${item.channel} provider=${item.provider} account=${item.channelAccountId} mismatches=${item.mismatches.join(",") || "-"}`
        );
      }
    }

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`channel account shadow compare failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
