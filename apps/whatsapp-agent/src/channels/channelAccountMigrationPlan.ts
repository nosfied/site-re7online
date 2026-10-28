import crypto from "node:crypto";
import type { TenantConfig } from "../config/tenantConfig.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export const REQUIRED_META_FLAGS = [
  "enabled", "automationEnabled", "runtimeEnabled", "inboundPersistenceEnabled",
  "outboundEnabled", "aiEnabled", "handoffEnabled",
] as const;

export type MigrationClient = { id: string; clientKey: string };
export type MigrationPhone = { clientId: string; phoneNumberId: string };
export type MigrationMetaConfig = { clientId: string; phoneNumberId: string | null };
export type ExistingMetaAccount = { clientId: string; channelAccountId: string };

export type ChannelAccountMigrationItem = {
  tenantKey: string;
  clientId: string;
  modality: "WHATSAPP_META";
  identitySha256: string;
  account: TenantChannelAccount;
};

export type ChannelAccountMigrationPlan = {
  sourceTenantCount: number;
  metaTenantCount: number;
  webSessionOnlyCount: number;
  webSessionOnlyTenants: string[];
  items: ChannelAccountMigrationItem[];
};

function deny(code: string, tenantKey: string): never {
  throw new Error(`${code}:${tenantKey}`);
}

function ownBoolean(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key) &&
    typeof (value as Record<string, unknown>)[key] === "boolean";
}

function accountIdentities(account: TenantChannelAccount) {
  return new Set([account.channelAccountId, ...(account.externalAccountIds ?? [])].filter(Boolean));
}

function identityHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildChannelAccountMigrationPlan(params: {
  tenants: Record<string, TenantConfig>;
  clients: MigrationClient[];
  phoneNumbers: MigrationPhone[];
  metaConfigs: MigrationMetaConfig[];
  existingMetaAccounts?: ExistingMetaAccount[];
  selectedTenant?: string;
}): ChannelAccountMigrationPlan {
  const entries = Object.entries(params.tenants)
    .filter(([key]) => !params.selectedTenant || key === params.selectedTenant)
    .sort(([a], [b]) => a.localeCompare(b));
  if (params.selectedTenant && entries.length === 0) {
    if (params.selectedTenant === "cra-pr") deny("CRA_CHANNEL_ACCOUNT_SOURCE_UNRESOLVED", params.selectedTenant);
    deny("CHANNEL_ACCOUNT_SOURCE_TENANT_MISSING", params.selectedTenant);
  }

  const clients = new Map(params.clients.map((item) => [item.clientKey, item]));
  const phonesByClient = new Map<string, Set<string>>();
  for (const phone of params.phoneNumbers) {
    const values = phonesByClient.get(phone.clientId) ?? new Set<string>();
    values.add(phone.phoneNumberId);
    phonesByClient.set(phone.clientId, values);
  }
  const metaByClient = new Map(params.metaConfigs.map((item) => [item.clientId, item.phoneNumberId]));
  const existingByClient = new Map<string, string[]>();
  for (const account of params.existingMetaAccounts ?? []) {
    existingByClient.set(account.clientId, [...(existingByClient.get(account.clientId) ?? []), account.channelAccountId]);
  }

  const items: ChannelAccountMigrationItem[] = [];
  const webSessionOnlyTenants: string[] = [];
  const errors: string[] = [];
  for (const [tenantKey, tenant] of entries) {
    try {
    const client = clients.get(tenantKey);
    if (!client) deny("CHANNEL_ACCOUNT_CLIENT_MISSING", tenantKey);
    const sourcePhone = tenant.metaPhoneNumberId?.trim() ?? "";
    const sourceMetaAccounts = (tenant.channelAccounts ?? []).filter(
      (account) => account.channel === "whatsapp" && account.provider === "meta",
    );
    const dbParticipates = (phonesByClient.get(client.id)?.size ?? 0) > 0 ||
      Boolean(metaByClient.get(client.id)) || (existingByClient.get(client.id)?.length ?? 0) > 0;

    if (!sourcePhone && sourceMetaAccounts.length === 0) {
      if (dbParticipates) deny("CHANNEL_ACCOUNT_SOURCE_IDENTITY_AMBIGUOUS", tenantKey);
      webSessionOnlyTenants.push(tenantKey);
      continue;
    }
    if (sourceMetaAccounts.length !== 1) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    const account = sourceMetaAccounts[0];
    if (!account.channelAccountId?.trim()) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    if (account.tenantKey !== tenantKey) deny("CHANNEL_ACCOUNT_PLAN_TENANT_MISMATCH", tenantKey);
    for (const flag of REQUIRED_META_FLAGS) {
      if (!ownBoolean(account, flag)) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    }
    const aliases = account.externalAccountIds ?? [];
    if (aliases.some((alias) => typeof alias !== "string" || !alias.trim()) || new Set(aliases).size !== aliases.length) {
      deny("CHANNEL_ACCOUNT_PLAN_INVALID_ALIASES", tenantKey);
    }
    if (!Object.prototype.hasOwnProperty.call(account, "status") ||
        !Object.prototype.hasOwnProperty.call(account, "tokenStatus")) {
      deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    }
    const identities = accountIdentities(account);
    const expectedIdentity = sourcePhone || account.channelAccountId;
    if (!identities.has(expectedIdentity)) deny("CHANNEL_ACCOUNT_PLAN_IDENTITY_MISMATCH", tenantKey);
    const databaseIdentities = new Set([
      ...(phonesByClient.get(client.id) ?? []),
      ...(metaByClient.get(client.id) ? [metaByClient.get(client.id)!] : []),
    ]);
    if (!databaseIdentities.has(expectedIdentity)) deny("CHANNEL_ACCOUNT_PHONE_IDENTITY_MISMATCH", tenantKey);
    items.push({
      tenantKey,
      clientId: client.id,
      modality: "WHATSAPP_META",
      identitySha256: identityHash(account.channelAccountId),
      account: { ...account, tenantKey },
    });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (errors.length > 0) throw new Error(`CHANNEL_ACCOUNT_PLAN_DENY:${errors.sort().join(",")}`);
  return {
    sourceTenantCount: entries.length,
    metaTenantCount: items.length,
    webSessionOnlyCount: webSessionOnlyTenants.length,
    webSessionOnlyTenants,
    items,
  };
}

export function sanitizedMigrationItem(item: ChannelAccountMigrationItem, action: string) {
  return {
    tenantKey: item.tenantKey,
    modality: item.modality,
    identitySha256: item.identitySha256,
    action,
    aliasCount: item.account.externalAccountIds?.length ?? 0,
    secretKindCount: Number(Boolean(item.account.pageAccessToken?.trim())) +
      Number(Boolean(item.account.instagramBusinessAccessToken?.trim())),
  };
}
