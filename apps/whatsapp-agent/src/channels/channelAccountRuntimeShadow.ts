import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger.js";
import type { Channel, Provider } from "./channel.types.js";
import type { ResolvedTenantChannelAccount, TenantChannelResolution } from "./tenantChannelResolution.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

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
  secrets: Array<{ secretKind: string; secretHash: string | null; status: string }>;
};

export type ChannelAccountRuntimeShadowResult = {
  dbResolution: TenantChannelResolution;
  dbTenantKey?: string;
  mismatchFields: string[];
};

export type ChannelAccountRuntimeShadowLogParams = {
  requestId: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  jsonResolution: ResolvedTenantChannelAccount;
};

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
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

function jsonSecretHashes(account?: TenantChannelAccount) {
  const output = new Map<string, string>();
  if (account?.pageAccessToken?.trim()) {
    output.set("pageAccessToken", secretHash(account.pageAccessToken.trim()));
  }
  if (account?.instagramBusinessAccessToken?.trim()) {
    output.set("instagramBusinessAccessToken", secretHash(account.instagramBusinessAccessToken.trim()));
  }
  return output;
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

export function resolveDbChannelAccountShadow(params: {
  accounts: DbChannelAccount[];
  channelAccountId: string;
}): {
  tenantKey?: string;
  account?: DbChannelAccount;
  resolution: TenantChannelResolution;
} {
  const channelAccountId = normalizeIdentifier(params.channelAccountId);
  if (!channelAccountId) return { resolution: "not_found" };

  const matches = params.accounts
    .map((account) => {
      const matchType = dbMatchType(account, channelAccountId);
      if (!matchType) return null;
      const classified = classifyDbAccount(account);
      return {
        tenantKey: account.client.clientKey,
        account,
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

  const selected =
    activeMatches[0] ??
    matches.find((match) => match.resolution === "matched_pending") ??
    matches.find((match) => match.resolution === "matched_error") ??
    matches[0];

  return selected;
}

export function compareChannelAccountRuntimeShadow(params: {
  jsonResolution: ResolvedTenantChannelAccount;
  dbResolution: {
    tenantKey?: string;
    account?: DbChannelAccount;
    resolution: TenantChannelResolution;
  };
}): ChannelAccountRuntimeShadowResult {
  const mismatchFields: string[] = [];
  const jsonAccount = params.jsonResolution.account;
  const dbAccount = params.dbResolution.account;

  if (params.jsonResolution.resolution !== params.dbResolution.resolution) mismatchFields.push("resolution");
  if ((params.jsonResolution.tenantKey ?? null) !== (params.dbResolution.tenantKey ?? null)) {
    mismatchFields.push("tenantKey");
  }
  if (!jsonAccount && !dbAccount) {
    return {
      dbResolution: params.dbResolution.resolution,
      dbTenantKey: params.dbResolution.tenantKey,
      mismatchFields,
    };
  }
  if (!jsonAccount || !dbAccount) {
    mismatchFields.push(jsonAccount ? "missingDbAccount" : "missingJsonAccount");
    return {
      dbResolution: params.dbResolution.resolution,
      dbTenantKey: params.dbResolution.tenantKey,
      mismatchFields,
    };
  }

  const boolFields: Array<
    | "enabled"
    | "automationEnabled"
    | "runtimeEnabled"
    | "inboundPersistenceEnabled"
    | "outboundEnabled"
    | "aiEnabled"
    | "handoffEnabled"
  > = [
    "enabled",
    "automationEnabled",
    "runtimeEnabled",
    "inboundPersistenceEnabled",
    "outboundEnabled",
    "aiEnabled",
    "handoffEnabled",
  ];
  if (jsonAccount.channel !== dbAccount.channel) mismatchFields.push("channel");
  if (jsonAccount.provider !== dbAccount.provider) mismatchFields.push("provider");
  if (jsonAccount.channelAccountId !== dbAccount.channelAccountId) mismatchFields.push("channelAccountId");
  if ((jsonAccount.externalBusinessId || null) !== (dbAccount.externalBusinessId || null)) {
    mismatchFields.push("externalBusinessId");
  }
  if ((jsonAccount.status ?? "pending") !== dbAccount.status) mismatchFields.push("status");
  if ((jsonAccount.tokenStatus ?? "missing") !== dbAccount.tokenStatus) mismatchFields.push("tokenStatus");
  for (const field of boolFields) {
    if ((jsonAccount[field] === true) !== (dbAccount[field] === true)) mismatchFields.push(String(field));
  }
  const jsonAliases = sortedStrings(jsonAccount.externalAccountIds);
  const dbAliases = dbAccount.aliases.map((alias) => alias.alias).sort();
  if (stableJson(jsonAliases) !== stableJson(dbAliases)) mismatchFields.push("aliases");
  if (stableJson(normalizeMetadata(jsonAccount.metadata)) !== stableJson(normalizeMetadata(dbAccount.metadata))) {
    mismatchFields.push("metadata");
  }

  const jsonHashes = jsonSecretHashes(jsonAccount);
  const dbSecrets = new Map(dbAccount.secrets.map((secret) => [secret.secretKind, secret]));
  const secretKinds = Array.from(new Set([...jsonHashes.keys(), ...dbSecrets.keys()])).sort();
  for (const kind of secretKinds) {
    const jsonHash = jsonHashes.get(kind);
    const dbSecret = dbSecrets.get(kind);
    const dbPresent = dbSecret?.status === "configured" || Boolean(dbSecret?.secretHash);
    if (Boolean(jsonHash) !== dbPresent) {
      mismatchFields.push(`secretPresence:${kind}`);
      continue;
    }
    if (jsonHash && dbSecret?.secretHash && jsonHash !== dbSecret.secretHash) {
      mismatchFields.push(`secretHash:${kind}`);
    }
  }

  return {
    dbResolution: params.dbResolution.resolution,
    dbTenantKey: params.dbResolution.tenantKey,
    mismatchFields,
  };
}

export async function logChannelAccountRuntimeShadow(params: ChannelAccountRuntimeShadowLogParams & {
  prisma: PrismaClient;
}) {
  try {
    const accounts = await params.prisma.channelAccount.findMany({
      where: {
        channel: params.channel,
        provider: params.provider,
        OR: [
          { channelAccountId: params.channelAccountId },
          { aliases: { some: { alias: params.channelAccountId } } },
        ],
      },
      include: {
        client: { select: { clientKey: true } },
        aliases: { select: { alias: true } },
        secrets: { select: { secretKind: true, secretHash: true, status: true } },
      },
    });
    const dbResolution = resolveDbChannelAccountShadow({
      accounts,
      channelAccountId: params.channelAccountId,
    });
    const comparison = compareChannelAccountRuntimeShadow({
      jsonResolution: params.jsonResolution,
      dbResolution,
    });
    const matched = comparison.mismatchFields.length === 0;
    if (!matched) {
      logger.warn({
        event: "channel_accounts.runtime_shadow_mismatch",
        route: "/meta/webhook",
        requestId: params.requestId,
        channel: params.channel,
        provider: params.provider,
        channelAccountId: params.channelAccountId || null,
        jsonTenantKey: params.jsonResolution.tenantKey ?? null,
        dbTenantKey: comparison.dbTenantKey ?? null,
        jsonResolution: params.jsonResolution.resolution,
        dbResolution: comparison.dbResolution,
        mismatchType: "resolution_or_account_mismatch",
        fields: comparison.mismatchFields,
      });
      return;
    }
    if ((process.env.CHANNEL_ACCOUNTS_RUNTIME_SHADOW_LOG_MATCHES ?? "false") === "true") {
      logger.info({
        event: "channel_accounts.runtime_shadow_matched",
        route: "/meta/webhook",
        requestId: params.requestId,
        channel: params.channel,
        provider: params.provider,
        channelAccountId: params.channelAccountId || null,
        jsonTenantKey: params.jsonResolution.tenantKey ?? null,
        dbTenantKey: comparison.dbTenantKey ?? null,
        jsonResolution: params.jsonResolution.resolution,
        dbResolution: comparison.dbResolution,
      });
    }
  } catch (error) {
    logger.warn({
      event: "channel_accounts.runtime_shadow_failed",
      route: "/meta/webhook",
      requestId: params.requestId,
      channel: params.channel,
      provider: params.provider,
      channelAccountId: params.channelAccountId || null,
      reason: (error as Error).message,
    });
  }
}
