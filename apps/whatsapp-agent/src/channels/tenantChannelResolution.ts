import type { TenantConfigMap } from "../config/tenantConfig.js";
import type { Channel, Provider } from "./channel.types.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export type TenantChannelResolution =
  | "matched_enabled"
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
    externalBusinessId: account.externalBusinessId,
    enabled: account.enabled,
    automationEnabled: account.automationEnabled,
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

  const matches: Array<{ tenantKey: string; account: TenantChannelAccount; resolution: TenantChannelResolution }> = [];
  for (const [tenantKey, tenant] of Object.entries(params.tenants)) {
    for (const account of tenant.channelAccounts ?? []) {
      if (
        account.channel === params.channel &&
        account.provider === params.provider &&
        account.channelAccountId === channelAccountId
      ) {
        matches.push({
          tenantKey: tenant.id || tenantKey,
          account,
          resolution: classifyAccount(account),
        });
      }
    }
  }

  if (matches.length === 0) {
    return { resolution: "not_found" };
  }

  const activeMatches = matches.filter((match) => match.resolution === "matched_enabled");
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
