#!/usr/bin/env tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import type { TenantChannelAccount } from "../src/channels/tenantChannelAccount.types.js";

type Options = {
  json: boolean;
  dryRun: boolean;
  tenant?: string;
  allowHashOnlySecrets: boolean;
};

type BackfillAccountReport = {
  tenantKey: string;
  clientId: string | null;
  channel: string;
  provider: string;
  channelAccountId: string;
  action: "would_upsert" | "upserted" | "skipped_missing_client";
  aliasCount: number;
  secretKinds: string[];
  encryptedSecretKinds: string[];
  unencryptedSecretKinds: string[];
};

type BackfillReport = {
  dryRun: boolean;
  processedTenants: number;
  processedAccounts: number;
  skippedMissingClient: number;
  secretMaterialEncryption: "enabled" | "not_configured";
  accounts: BackfillAccountReport[];
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    dryRun: false,
    allowHashOnlySecrets: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--allow-hash-only-secrets":
        options.allowHashOnlySecrets = true;
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

function secretHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function getEncryptionKey() {
  const value = process.env.CHANNEL_ACCOUNT_SECRET_KEY?.trim();
  if (!value) return null;
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function encryptSecret(value: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function accountSecrets(account: TenantChannelAccount) {
  const secrets: Array<{ kind: string; value: string }> = [];
  if (account.pageAccessToken?.trim()) {
    secrets.push({ kind: "pageAccessToken", value: account.pageAccessToken.trim() });
  }
  if (account.instagramBusinessAccessToken?.trim()) {
    secrets.push({
      kind: "instagramBusinessAccessToken",
      value: account.instagramBusinessAccessToken.trim(),
    });
  }
  return secrets;
}

function jsonOrNull(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const encryptionKey = getEncryptionKey();

  try {
    const tenants = await getTenants();
    const tenantEntries = Object.entries(tenants).filter(([tenantKey]) => !options.tenant || tenantKey === options.tenant);
    if (options.tenant && tenantEntries.length === 0) {
      throw new Error(`tenant nao encontrado em tenants.json: ${options.tenant}`);
    }

    const clients = await prisma.client.findMany({
      where: { clientKey: { in: tenantEntries.map(([tenantKey]) => tenantKey) } },
      select: { id: true, clientKey: true },
    });
    const clientsByKey = new Map(clients.map((client) => [client.clientKey, client]));

    const report: BackfillReport = {
      dryRun: options.dryRun,
      processedTenants: tenantEntries.length,
      processedAccounts: 0,
      skippedMissingClient: 0,
      secretMaterialEncryption: encryptionKey ? "enabled" : "not_configured",
      accounts: [],
    };
    const accountsWithSecrets = tenantEntries.flatMap(([, tenant]) => tenant.channelAccounts ?? []).filter(
      (account) => accountSecrets(account).length > 0
    );
    if (!options.dryRun && !encryptionKey && accountsWithSecrets.length > 0 && !options.allowHashOnlySecrets) {
      throw new Error(
        "CHANNEL_ACCOUNT_SECRET_KEY ausente; backfill real com secrets foi bloqueado. Configure a chave ou use --allow-hash-only-secrets apenas para shadow sem material reversivel."
      );
    }

    for (const [tenantKey, tenant] of tenantEntries) {
      const client = clientsByKey.get(tenantKey);
      const accounts = tenant.channelAccounts ?? [];
      for (const account of accounts) {
        report.processedAccounts += 1;
        const secrets = accountSecrets(account);
        const encryptedSecretKinds = encryptionKey ? secrets.map((secret) => secret.kind) : [];
        const unencryptedSecretKinds = encryptionKey ? [] : secrets.map((secret) => secret.kind);
        const item: BackfillAccountReport = {
          tenantKey,
          clientId: client?.id ?? null,
          channel: account.channel,
          provider: account.provider,
          channelAccountId: account.channelAccountId,
          action: client ? (options.dryRun ? "would_upsert" : "upserted") : "skipped_missing_client",
          aliasCount: account.externalAccountIds?.length ?? 0,
          secretKinds: secrets.map((secret) => secret.kind),
          encryptedSecretKinds,
          unencryptedSecretKinds,
        };
        report.accounts.push(item);

        if (!client) {
          report.skippedMissingClient += 1;
          continue;
        }
        if (options.dryRun) continue;

        const upserted = await prisma.channelAccount.upsert({
          where: {
            clientId_provider_channel_channelAccountId: {
              clientId: client.id,
              provider: account.provider,
              channel: account.channel,
              channelAccountId: account.channelAccountId,
            },
          },
          create: {
            clientId: client.id,
            channel: account.channel,
            provider: account.provider,
            displayName: account.displayName ?? null,
            channelAccountId: account.channelAccountId,
            externalAccountIds: jsonOrNull(account.externalAccountIds),
            externalBusinessId: account.externalBusinessId || null,
            metadata: jsonOrNull(account.metadata),
            enabled: account.enabled,
            automationEnabled: account.automationEnabled === true,
            runtimeEnabled: account.runtimeEnabled === true,
            inboundPersistenceEnabled: account.inboundPersistenceEnabled === true,
            outboundEnabled: account.outboundEnabled === true,
            aiEnabled: account.aiEnabled === true,
            handoffEnabled: account.handoffEnabled === true,
            status: account.status ?? "pending",
            tokenStatus: account.tokenStatus ?? "missing",
          },
          update: {
            displayName: account.displayName ?? null,
            externalAccountIds: jsonOrNull(account.externalAccountIds),
            externalBusinessId: account.externalBusinessId || null,
            metadata: jsonOrNull(account.metadata),
            enabled: account.enabled,
            automationEnabled: account.automationEnabled === true,
            runtimeEnabled: account.runtimeEnabled === true,
            inboundPersistenceEnabled: account.inboundPersistenceEnabled === true,
            outboundEnabled: account.outboundEnabled === true,
            aiEnabled: account.aiEnabled === true,
            handoffEnabled: account.handoffEnabled === true,
            status: account.status ?? "pending",
            tokenStatus: account.tokenStatus ?? "missing",
          },
        });

        for (const alias of account.externalAccountIds ?? []) {
          await prisma.channelAccountAlias.upsert({
            where: {
              channelAccountId_alias: {
                channelAccountId: upserted.id,
                alias,
              },
            },
            create: {
              channelAccountId: upserted.id,
              alias,
              aliasType: "externalAccountId",
            },
            update: {
              aliasType: "externalAccountId",
            },
          });
        }

        for (const secret of secrets) {
          const encrypted = encryptionKey ? encryptSecret(secret.value, encryptionKey) : null;
          await prisma.channelAccountSecret.upsert({
            where: {
              channelAccountId_secretKind: {
                channelAccountId: upserted.id,
                secretKind: secret.kind,
              },
            },
            create: {
              channelAccountId: upserted.id,
              secretKind: secret.kind,
              secretHash: secretHash(secret.value),
              secretCiphertext: encrypted,
              encryptionKeyRef: encrypted ? "CHANNEL_ACCOUNT_SECRET_KEY" : null,
              status: "configured",
            },
            update: {
              secretHash: secretHash(secret.value),
              secretCiphertext: encrypted,
              encryptionKeyRef: encrypted ? "CHANNEL_ACCOUNT_SECRET_KEY" : null,
              status: "configured",
            },
          });
        }
      }
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `channel account backfill ok dryRun=${report.dryRun} tenants=${report.processedTenants} accounts=${report.processedAccounts} skippedMissingClient=${report.skippedMissingClient} secretEncryption=${report.secretMaterialEncryption}`
      );
      for (const account of report.accounts) {
        console.log(
          `${account.action} tenant=${account.tenantKey} channel=${account.channel} provider=${account.provider} account=${account.channelAccountId} aliases=${account.aliasCount} secrets=${account.secretKinds.length} encryptedSecrets=${account.encryptedSecretKinds.length}`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`channel account backfill failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
