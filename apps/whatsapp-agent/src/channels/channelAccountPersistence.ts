import { Prisma, type PrismaClient } from "@prisma/client";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { mapDbChannelAccountToTenantAccount } from "./channelAccountDbFirst.js";
import {
  CHANNEL_ACCOUNT_SECRET_KEY_REF,
  encryptChannelAccountSecret,
  getChannelAccountSecretKey,
  hashChannelAccountSecret,
} from "./channelAccountSecretCrypto.js";

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

type ExistingChannelAccountRuntimeState = {
  metadata: Prisma.JsonValue | null;
  status: string | null;
};

function getEncryptionKey() {
  return getChannelAccountSecretKey();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataWithPreservedWebSessionLifecycle(params: {
  incoming: TenantChannelAccount["metadata"];
  existing: ExistingChannelAccountRuntimeState | null;
}) {
  const incoming: Record<string, unknown> = isRecord(params.incoming) ? { ...params.incoming } : {};
  const existingMetadata = isRecord(params.existing?.metadata) ? params.existing?.metadata : null;
  if (existingMetadata && Object.prototype.hasOwnProperty.call(existingMetadata, "webSession")) {
    incoming.webSession = existingMetadata.webSession;
  } else {
    delete incoming.webSession;
  }
  return Object.keys(incoming).length > 0 ? (incoming as TenantChannelAccount["metadata"]) : undefined;
}

export function preserveGenericWebSessionLifecycleState(
  account: TenantChannelAccount,
  existing: ExistingChannelAccountRuntimeState | null
) {
  if (account.channel !== "whatsapp" || account.provider !== "web_session" || !existing) {
    return account;
  }
  return {
    ...account,
    status: (existing.status as TenantChannelAccount["status"]) ?? account.status,
    metadata: metadataWithPreservedWebSessionLifecycle({
      incoming: account.metadata,
      existing,
    }),
  } satisfies TenantChannelAccount;
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
  const existingAccount = await params.prisma.channelAccount.findUnique({
    where: {
      clientId_provider_channel_channelAccountId: {
        clientId: client.id,
        provider: account.provider,
        channel: account.channel,
        channelAccountId: account.channelAccountId,
      },
    },
    select: { metadata: true, status: true },
  });
  const writableAccount = preserveGenericWebSessionLifecycleState(account, existingAccount);
  const upserted = await params.prisma.channelAccount.upsert({
    where: {
      clientId_provider_channel_channelAccountId: {
        clientId: client.id,
        provider: writableAccount.provider,
        channel: writableAccount.channel,
        channelAccountId: writableAccount.channelAccountId,
      },
    },
    create: {
      clientId: client.id,
      channel: writableAccount.channel,
      provider: writableAccount.provider,
      displayName: writableAccount.displayName ?? null,
      channelAccountId: writableAccount.channelAccountId,
      externalAccountIds: jsonOrNull(writableAccount.externalAccountIds),
      externalBusinessId: writableAccount.externalBusinessId || null,
      metadata: jsonOrNull(writableAccount.metadata),
      enabled: writableAccount.enabled,
      automationEnabled: writableAccount.automationEnabled === true,
      runtimeEnabled: writableAccount.runtimeEnabled === true,
      inboundPersistenceEnabled: writableAccount.inboundPersistenceEnabled === true,
      outboundEnabled: writableAccount.outboundEnabled === true,
      aiEnabled: writableAccount.aiEnabled === true,
      handoffEnabled: writableAccount.handoffEnabled === true,
      status: writableAccount.status ?? "pending",
      tokenStatus: writableAccount.tokenStatus ?? "missing",
    },
    update: {
      displayName: writableAccount.displayName ?? null,
      externalAccountIds: jsonOrNull(writableAccount.externalAccountIds),
      externalBusinessId: writableAccount.externalBusinessId || null,
      metadata: jsonOrNull(writableAccount.metadata),
      enabled: writableAccount.enabled,
      automationEnabled: writableAccount.automationEnabled === true,
      runtimeEnabled: writableAccount.runtimeEnabled === true,
      inboundPersistenceEnabled: writableAccount.inboundPersistenceEnabled === true,
      outboundEnabled: writableAccount.outboundEnabled === true,
      aiEnabled: writableAccount.aiEnabled === true,
      handoffEnabled: writableAccount.handoffEnabled === true,
      status: writableAccount.status ?? "pending",
      tokenStatus: writableAccount.tokenStatus ?? "missing",
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
      const encrypted = encryptChannelAccountSecret(secret.value);
      if (!encrypted) throw new Error("channel_account_secret_key_missing");
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
          secretHash: hashChannelAccountSecret(secret.value),
          secretCiphertext: encrypted,
          encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
          status: "configured",
        },
        update: {
          secretHash: hashChannelAccountSecret(secret.value),
          secretCiphertext: encrypted,
          encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
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
