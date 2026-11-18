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
  prisma: PrismaClient | Prisma.TransactionClient;
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

export type MetaWabaSubscriptionState =
  | "not_attempted"
  | "subscribed"
  | "subscription_failed";

type MetaWhatsappAccountRow = {
  id: string;
  clientId: string;
  channelAccountId: string;
  displayName: string | null;
  externalBusinessId: string | null;
  metadata: Prisma.JsonValue | null;
  enabled: boolean;
  automationEnabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: string;
  tokenStatus: string;
  aliases: Array<{ alias: string }>;
  client: { clientKey: string };
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

function preservedMetadata(value: Prisma.JsonValue | null | undefined) {
  return isRecord(value) ? { ...value } : {};
}

/**
 * Materializes the authenticated Meta identity without granting operational
 * capabilities. Existing capabilities belong to the tenant configuration and
 * are preserved byte-semantically for the same identity. A superseded identity
 * is retained as historical evidence, but is made non-operational.
 *
 * Callers must invoke this inside the same database transaction that publishes
 * TenantMetaConfig and WaPhoneNumber.
 */
export async function materializeMetaWhatsappChannelAccount(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  tenantKey: string;
  clientId: string;
  phoneNumberId: string;
  previousPhoneNumberId?: string | null;
  wabaId?: string | null;
  displayName?: string | null;
  businessTokenStored: boolean;
  subscriptionState: MetaWabaSubscriptionState;
}) {
  const phoneNumberId = params.phoneNumberId.trim();
  if (!phoneNumberId) throw new Error("meta_channel_account_phone_number_id_missing");

  const identityMatches = await params.prisma.channelAccount.findMany({
    where: {
      channel: "whatsapp",
      provider: "meta",
      OR: [
        { channelAccountId: phoneNumberId },
        { aliases: { some: { alias: phoneNumberId } } },
      ],
    },
    include: {
      aliases: { select: { alias: true } },
      client: { select: { clientKey: true } },
    },
  }) as MetaWhatsappAccountRow[];
  const foreignMatch = identityMatches.find((account) => account.clientId !== params.clientId);
  if (foreignMatch) {
    throw new Error(`meta_channel_account_identity_conflict:${foreignMatch.client.clientKey}`);
  }
  const aliasConflict = identityMatches.find(
    (account) =>
      account.clientId === params.clientId &&
      account.channelAccountId !== phoneNumberId &&
      account.aliases.some((alias) => alias.alias === phoneNumberId)
  );
  if (aliasConflict) throw new Error("meta_channel_account_alias_conflict");

  const existing = identityMatches.find(
    (account) => account.clientId === params.clientId && account.channelAccountId === phoneNumberId
  ) ?? null;
  const subscriptionReady = params.subscriptionState === "subscribed";
  const existingMetadata = preservedMetadata(existing?.metadata);
  const status = existing
    ? params.subscriptionState === "subscription_failed"
      ? "pending"
      : existing.status
    : "pending";

  const account: TenantChannelAccount = {
    id: existing?.id ?? `${params.tenantKey}-meta-whatsapp-${phoneNumberId}`,
    tenantKey: params.tenantKey,
    channel: "whatsapp",
    provider: "meta",
    displayName: params.displayName?.trim() || existing?.displayName || "WhatsApp Meta",
    channelAccountId: phoneNumberId,
    externalAccountIds: existing?.aliases.map((alias) => alias.alias) ?? [],
    externalBusinessId: params.wabaId?.trim() || existing?.externalBusinessId || undefined,
    metadata: {
      ...existingMetadata,
      metaIdentityState: subscriptionReady ? "authenticated" : "pending_dependencies",
      wabaSubscriptionState: params.subscriptionState,
    } as TenantChannelAccount["metadata"],
    enabled: existing?.enabled ?? false,
    automationEnabled: existing?.automationEnabled ?? false,
    runtimeEnabled: existing?.runtimeEnabled ?? false,
    inboundPersistenceEnabled: existing?.inboundPersistenceEnabled ?? false,
    outboundEnabled: existing?.outboundEnabled ?? false,
    aiEnabled: existing?.aiEnabled ?? false,
    handoffEnabled: existing?.handoffEnabled ?? false,
    status: status as TenantChannelAccount["status"],
    tokenStatus: existing?.tokenStatus as TenantChannelAccount["tokenStatus"] ??
      (params.businessTokenStored ? "configured" : "missing"),
  };
  const upserted = await upsertTenantChannelAccountToDb({
    prisma: params.prisma,
    tenantKey: params.tenantKey,
    account,
  });

  const previousPhoneNumberId = params.previousPhoneNumberId?.trim();
  if (previousPhoneNumberId && previousPhoneNumberId !== phoneNumberId) {
    const previous = await params.prisma.channelAccount.findFirst({
      where: {
        clientId: params.clientId,
        provider: "meta",
        channel: "whatsapp",
        OR: [
          { channelAccountId: previousPhoneNumberId },
          { aliases: { some: { alias: previousPhoneNumberId } } },
        ],
      },
      select: { id: true, metadata: true },
    });
    if (previous) {
      await params.prisma.channelAccount.update({
        where: { id: previous.id },
        data: {
          enabled: false,
          automationEnabled: false,
          runtimeEnabled: false,
          inboundPersistenceEnabled: false,
          outboundEnabled: false,
          aiEnabled: false,
          handoffEnabled: false,
          status: "disabled",
          metadata: {
            ...preservedMetadata(previous.metadata),
            metaIdentityState: "historical",
            supersededByPhoneNumberId: phoneNumberId,
          },
        },
      });
    }
  }

  return {
    accountId: upserted.id,
    action: existing ? ("existing" as const) : ("created" as const),
    status,
    operationallyEnabled: account.enabled && account.runtimeEnabled && account.inboundPersistenceEnabled && status === "connected",
  };
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
