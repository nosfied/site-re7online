import type { TenantConfigMap } from "../config/tenantConfig.js";
import type { Channel, Provider } from "./channel.types.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export type TenantChannelResolution =
  | "matched_enabled"
  | "matched_alias"
  | "matched_disabled"
  | "matched_pending"
  | "matched_error"
  | "not_found"
  | "ambiguous";

export type ResolvedTenantChannelAccount = {
  tenantKey?: string;
  account?: TenantChannelAccount;
  resolution: TenantChannelResolution;
};

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function redactAccount(account: TenantChannelAccount): TenantChannelAccount {
  return {
    id: account.id,
    tenantKey: account.tenantKey,
    channel: account.channel,
    provider: account.provider,
    displayName: account.displayName,
    channelAccountId: account.channelAccountId,
    externalAccountIds: account.externalAccountIds,
    externalBusinessId: account.externalBusinessId,
    metadata: account.metadata,
    enabled: account.enabled,
    automationEnabled: account.automationEnabled,
    runtimeEnabled: account.runtimeEnabled,
    inboundPersistenceEnabled: account.inboundPersistenceEnabled,
    outboundEnabled: account.outboundEnabled,
    aiEnabled: account.aiEnabled,
    handoffEnabled: account.handoffEnabled,
    status: account.status,
    tokenStatus: account.tokenStatus,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function classifyAccount(account: TenantChannelAccount): TenantChannelResolution {
  if (account.enabled && (!account.status || account.status === "connected")) return "matched_enabled";
  if (account.status === "pending") return "matched_pending";
  if (account.status === "error") return "matched_error";
  return "matched_disabled";
}

function accountMatchesChannelAccountId(account: TenantChannelAccount, channelAccountId: string) {
  if (account.channelAccountId === channelAccountId) return "primary" as const;
  if ((account.externalAccountIds ?? []).includes(channelAccountId)) return "alias" as const;
  return null;
}

export function resolveTenantForChannelAccount(params: {
  tenants: TenantConfigMap;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
}): ResolvedTenantChannelAccount {
  const channelAccountId = normalizeIdentifier(params.channelAccountId);
  if (!channelAccountId) {
    return { resolution: "not_found" };
  }

  const matches: Array<{
    tenantKey: string;
    account: TenantChannelAccount;
    resolution: TenantChannelResolution;
  }> = [];
  for (const [tenantKey, tenant] of Object.entries(params.tenants)) {
    for (const account of tenant.channelAccounts ?? []) {
      const matchType =
        account.channel === params.channel && account.provider === params.provider
          ? accountMatchesChannelAccountId(account, channelAccountId)
          : null;
      if (
        matchType
      ) {
        const classified = classifyAccount(account);
        matches.push({
          tenantKey: tenant.id || tenantKey,
          account,
          resolution:
            matchType === "alias" && classified === "matched_enabled"
              ? "matched_alias"
              : classified,
        });
      }
    }
  }

  if (matches.length === 0) {
    return { resolution: "not_found" };
  }

  const activeMatches = matches.filter(
    (match) => match.resolution === "matched_enabled" || match.resolution === "matched_alias"
  );
  if (activeMatches.length > 1) {
    return { resolution: "ambiguous" };
  }

  const selected =
    activeMatches[0] ??
    matches.find((match) => match.resolution === "matched_pending") ??
    matches.find((match) => match.resolution === "matched_error") ??
    matches[0];

  return {
    tenantKey: selected.tenantKey,
    account: redactAccount(selected.account),
    resolution: selected.resolution,
  };
}
