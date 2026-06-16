import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { mapDbChannelAccountToTenantAccount } from "./channelAccountDbFirst.js";

type UpsertTenantChannelAccountParams = {
  prisma: PrismaClient;
  tenantKey: string;
  account: TenantChannelAccount;
};

type ReplaceTenantChannelAccountsParams = {
  prisma: PrismaClient;
  tenantKey: string;
  accounts: TenantChannelAccount[];
};

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

function jsonOrNull(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
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

function accountKey(account: TenantChannelAccount) {
  return `${account.provider}:${account.channel}:${account.channelAccountId}`;
}

export async function listTenantChannelAccountsFromDb(params: {
  prisma: PrismaClient;
  tenantKey: string;
  includeSecrets?: boolean;
}) {
  const accounts = await params.prisma.channelAccount.findMany({
    where: {
      client: { clientKey: params.tenantKey },
    },
    include: {
      aliases: true,
      secrets: params.includeSecrets
        ? { select: { secretKind: true, secretCiphertext: true, status: true } }
        : false,
      client: { select: { clientKey: true } },
    },
    orderBy: [{ channel: "asc" }, { provider: "asc" }, { channelAccountId: "asc" }],
  });
  return accounts.map((account) =>
    mapDbChannelAccountToTenantAccount({
      account,
      tenantKey: account.client.clientKey,
      includeSecrets: params.includeSecrets === true,
    })
  );
}

export async function upsertTenantChannelAccountToDb(params: UpsertTenantChannelAccountParams) {
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenantKey },
    select: { id: true },
  });
  if (!client) throw new Error("client_not_found");

  const account = params.account;
  const upserted = await params.prisma.channelAccount.upsert({
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

  const aliases = account.externalAccountIds ?? [];
  await params.prisma.channelAccountAlias.deleteMany({
    where: {
      channelAccountId: upserted.id,
      alias: { notIn: aliases.length > 0 ? aliases : ["__none__"] },
    },
  });
  for (const alias of aliases) {
    await params.prisma.channelAccountAlias.upsert({
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

  const secrets = accountSecrets(account);
  if (secrets.length > 0) {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) throw new Error("channel_account_secret_key_missing");
    for (const secret of secrets) {
      const encrypted = encryptSecret(secret.value, encryptionKey);
      await params.prisma.channelAccountSecret.upsert({
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
          encryptionKeyRef: "CHANNEL_ACCOUNT_SECRET_KEY",
          status: "configured",
        },
        update: {
          secretHash: secretHash(secret.value),
          secretCiphertext: encrypted,
          encryptionKeyRef: "CHANNEL_ACCOUNT_SECRET_KEY",
          status: "configured",
        },
      });
    }
  }

  return upserted;
}

export async function replaceTenantChannelAccountsInDb(params: ReplaceTenantChannelAccountsParams) {
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenantKey },
    select: { id: true },
  });
  if (!client) throw new Error("client_not_found");

  const keepKeys = new Set(params.accounts.map(accountKey));
  await params.prisma.$transaction(async (tx) => {
    for (const account of params.accounts) {
      await upsertTenantChannelAccountToDb({
        prisma: tx as PrismaClient,
        tenantKey: params.tenantKey,
        account,
      });
    }
    const existing = await tx.channelAccount.findMany({
      where: { clientId: client.id },
      select: { id: true, provider: true, channel: true, channelAccountId: true },
    });
    const removeIds = existing
      .filter((account) => !keepKeys.has(`${account.provider}:${account.channel}:${account.channelAccountId}`))
      .map((account) => account.id);
    if (removeIds.length > 0) {
      await tx.channelAccount.deleteMany({ where: { id: { in: removeIds } } });
    }
  });
}
