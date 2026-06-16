import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger.js";
import type { Channel, Provider } from "./channel.types.js";
import type { ResolvedTenantChannelAccount, TenantChannelResolution } from "./tenantChannelResolution.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import {
  getCachedChannelAccountResolution,
  getCachedChannelAccountWithSecret,
  setCachedChannelAccountResolution,
  setCachedChannelAccountWithSecret,
} from "./channelAccountRuntimeCache.js";
import { channelLatencyNow, type ChannelLatencyProfiler } from "./channelLatencyProfiler.js";

type DbChannelAccount = {
  channel: string;
  provider: string;
  channelAccountId: string;
  displayName: string | null;
  externalAccountIds: unknown;
  externalBusinessId: string | null;
  metadata: unknown;
  enabled: boolean;
  automationEnabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: string;
  tokenStatus: string;
  client: { clientKey: string };
  aliases: Array<{ alias: string }>;
  secrets?: Array<{ secretKind: string; secretCiphertext: string | null; status: string }>;
};

const SECRET_PREFIX = "v1:";

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") output[key] = item;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function normalizeExternalAccountIds(account: DbChannelAccount) {
  const jsonAliases = Array.isArray(account.externalAccountIds)
    ? account.externalAccountIds.filter((item): item is string => typeof item === "string")
    : [];
  const relationAliases = account.aliases.map((alias) => alias.alias).filter(Boolean);
  return Array.from(new Set([...jsonAliases, ...relationAliases]));
}

function classifyDbAccount(account: DbChannelAccount): TenantChannelResolution {
  if (account.enabled && (!account.status || account.status === "connected")) return "matched_enabled";
  if (account.status === "pending") return "matched_pending";
  if (account.status === "error") return "matched_error";
  return "matched_disabled";
}

function dbMatchType(account: DbChannelAccount, channelAccountId: string) {
  if (account.channelAccountId === channelAccountId) return "primary" as const;
  if (account.aliases.some((alias) => alias.alias === channelAccountId)) return "alias" as const;
  return null;
}

function getSecretKey(secret = process.env.CHANNEL_ACCOUNT_SECRET_KEY ?? "") {
  const normalized = secret.trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized, "utf8").digest();
}

export function decryptChannelAccountSecret(ciphertext: string | null | undefined, secret?: string) {
  const raw = ciphertext?.trim();
  const key = getSecretKey(secret);
  if (!raw || !raw.startsWith(SECRET_PREFIX) || !key) return null;
  const parts = raw.slice(SECRET_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

export function mapDbChannelAccountToTenantAccount(params: {
  account: DbChannelAccount;
  tenantKey: string;
  includeSecrets?: boolean;
}) {
  const pageSecret = params.includeSecrets
    ? params.account.secrets?.find((secret) => secret.secretKind === "pageAccessToken")
    : undefined;
  const instagramSecret = params.includeSecrets
    ? params.account.secrets?.find((secret) => secret.secretKind === "instagramBusinessAccessToken")
    : undefined;
  const pageAccessToken =
    pageSecret?.status === "configured"
      ? decryptChannelAccountSecret(pageSecret.secretCiphertext)
      : null;
  const instagramBusinessAccessToken =
    instagramSecret?.status === "configured"
      ? decryptChannelAccountSecret(instagramSecret.secretCiphertext)
      : null;
  return {
    id: `${params.tenantKey}-${params.account.provider}-${params.account.channel}-${params.account.channelAccountId}`,
    tenantKey: params.tenantKey,
    channel: params.account.channel as Channel,
    provider: params.account.provider as Provider,
    displayName: params.account.displayName ?? undefined,
    channelAccountId: params.account.channelAccountId,
    externalAccountIds: normalizeExternalAccountIds(params.account),
    externalBusinessId: params.account.externalBusinessId ?? undefined,
    metadata: normalizeMetadata(params.account.metadata),
    enabled: params.account.enabled,
    automationEnabled: params.account.automationEnabled,
    runtimeEnabled: params.account.runtimeEnabled,
    inboundPersistenceEnabled: params.account.inboundPersistenceEnabled,
    outboundEnabled: params.account.outboundEnabled,
    aiEnabled: params.account.aiEnabled,
    handoffEnabled: params.account.handoffEnabled,
    status: params.account.status as TenantChannelAccount["status"],
    tokenStatus: params.account.tokenStatus as TenantChannelAccount["tokenStatus"],
    ...(pageAccessToken ? { pageAccessToken } : {}),
    ...(instagramBusinessAccessToken ? { instagramBusinessAccessToken } : {}),
  } satisfies TenantChannelAccount;
}

export function resolveDbTenantChannelAccount(params: {
  accounts: DbChannelAccount[];
  channelAccountId: string;
  includeSecrets?: boolean;
}): ResolvedTenantChannelAccount {
  const channelAccountId = normalizeIdentifier(params.channelAccountId);
  if (!channelAccountId) return { resolution: "not_found" };
  const matches = params.accounts
    .map((account) => {
      const matchType = dbMatchType(account, channelAccountId);
      if (!matchType) return null;
      const classified = classifyDbAccount(account);
      return {
        tenantKey: account.client.clientKey,
        account: mapDbChannelAccountToTenantAccount({
          account,
          tenantKey: account.client.clientKey,
          includeSecrets: params.includeSecrets,
        }),
        resolution:
          matchType === "alias" && classified === "matched_enabled"
            ? ("matched_alias" as const)
            : classified,
      };
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match));

  if (matches.length === 0) return { resolution: "not_found" };
  const activeMatches = matches.filter(
    (match) => match.resolution === "matched_enabled" || match.resolution === "matched_alias"
  );
  if (activeMatches.length > 1) return { resolution: "ambiguous" };
  return (
    activeMatches[0] ??
    matches.find((match) => match.resolution === "matched_pending") ??
    matches.find((match) => match.resolution === "matched_error") ??
    matches[0]
  );
}

export async function resolveMessengerTenantChannelAccountDbFirst(params: {
  prisma: PrismaClient;
  channelAccountId: string;
  requestId?: string;
}) {
  return resolveMetaTenantChannelAccountDbFirst({
    ...params,
    channel: "messenger",
  });
}

export async function resolveInstagramTenantChannelAccountDbFirst(params: {
  prisma: PrismaClient;
  channelAccountId: string;
  requestId?: string;
}) {
  return resolveMetaTenantChannelAccountDbFirst({
    ...params,
    channel: "instagram",
  });
}

export async function resolveMetaTenantChannelAccountDbFirst(params: {
  prisma: PrismaClient;
  channel: "messenger" | "instagram";
  channelAccountId: string;
  requestId?: string;
}) {
  const cached = getCachedChannelAccountResolution({
    channel: params.channel,
    provider: "meta",
    channelAccountId: params.channelAccountId,
    requestId: params.requestId,
  });
  if (cached) return cached;
  const startedAt = Date.now();
  const accounts = await params.prisma.channelAccount.findMany({
    where: {
      channel: params.channel,
      provider: "meta",
      OR: [
        { channelAccountId: params.channelAccountId },
        { aliases: { some: { alias: params.channelAccountId } } },
      ],
    },
    include: {
      client: { select: { clientKey: true } },
      aliases: { select: { alias: true } },
    },
  });
  const result = resolveDbTenantChannelAccount({
    accounts,
    channelAccountId: params.channelAccountId,
    includeSecrets: false,
  });
  setCachedChannelAccountResolution({
    channel: params.channel,
    provider: "meta",
    channelAccountId: params.channelAccountId,
    value: result,
  });
  logger.info({
    event: `channel_accounts.db_first_${params.channel}`,
    route: "/meta/webhook",
    requestId: params.requestId ?? null,
    channel: params.channel,
    provider: "meta",
    channelAccountId: params.channelAccountId || null,
    dbTenantKey: result.tenantKey ?? null,
    dbResolution: result.resolution,
    lookupDurationMs: Date.now() - startedAt,
  });
  return result;
}

export async function findMessengerChannelAccountForConversationDbFirst(params: {
  prisma: PrismaClient;
  clientKey: string;
  channelAccountId: string | null | undefined;
  includeSecrets?: boolean;
  latencyProfiler?: ChannelLatencyProfiler;
}) {
  return findMetaChannelAccountForConversationDbFirst({
    ...params,
    channel: "messenger",
  });
}

export async function findInstagramChannelAccountForConversationDbFirst(params: {
  prisma: PrismaClient;
  clientKey: string;
  channelAccountId: string | null | undefined;
  includeSecrets?: boolean;
  latencyProfiler?: ChannelLatencyProfiler;
}) {
  return findMetaChannelAccountForConversationDbFirst({
    ...params,
    channel: "instagram",
  });
}

async function findMetaChannelAccountForConversationDbFirst(params: {
  prisma: PrismaClient;
  clientKey: string;
  channel: "messenger" | "instagram";
  channelAccountId: string | null | undefined;
  includeSecrets?: boolean;
  latencyProfiler?: ChannelLatencyProfiler;
}) {
  const channelAccountId = normalizeIdentifier(params.channelAccountId);
  if (!channelAccountId) return null;
  const tokenLookupStartedAt = channelLatencyNow();
  const cached = params.includeSecrets
    ? getCachedChannelAccountWithSecret({
        tenantKey: params.clientKey,
        channel: params.channel,
        provider: "meta",
        channelAccountId,
      })
    : undefined;
  if (cached !== undefined) {
    params.latencyProfiler?.duration("tokenLookup", tokenLookupStartedAt);
    return cached;
  }
  const startedAt = Date.now();
  const account = await params.prisma.channelAccount.findFirst({
    where: {
      client: { clientKey: params.clientKey },
      channel: params.channel,
      provider: "meta",
      channelAccountId,
    },
    include: {
      client: { select: { clientKey: true } },
      aliases: { select: { alias: true } },
      secrets: params.includeSecrets
        ? { select: { secretKind: true, secretCiphertext: true, status: true } }
        : false,
    },
  });
  const mapped = account
    ? mapDbChannelAccountToTenantAccount({
        account,
        tenantKey: account.client.clientKey,
        includeSecrets: params.includeSecrets,
      })
    : null;
  if (params.includeSecrets) {
    setCachedChannelAccountWithSecret({
      tenantKey: params.clientKey,
      channel: params.channel,
      provider: "meta",
      channelAccountId,
      value: mapped,
    });
    if ((process.env.CHANNEL_ACCOUNTS_RUNTIME_CACHE_LOGS ?? "false") === "true") {
      logger.info({
        event: "channel_accounts.account_secret_lookup",
        route: "/app/inbox",
        channel: params.channel,
        provider: "meta",
        channelAccountId,
        tenantKey: params.clientKey,
        lookupDurationMs: Date.now() - startedAt,
        found: Boolean(mapped),
        tokenPresent: Boolean(mapped?.pageAccessToken || mapped?.instagramBusinessAccessToken),
      });
    }
  }
  params.latencyProfiler?.duration("tokenLookup", tokenLookupStartedAt);
  return mapped;
}
