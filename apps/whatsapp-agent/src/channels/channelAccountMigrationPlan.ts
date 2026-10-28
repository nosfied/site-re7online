import crypto from "node:crypto";
import type { TenantConfig } from "../config/tenantConfig.js";
import type { TenantChannelAccount, TenantChannelAccountStatus, TenantChannelTokenStatus } from "./tenantChannelAccount.types.js";

export const REQUIRED_META_FLAGS = ["enabled", "automationEnabled", "runtimeEnabled", "inboundPersistenceEnabled", "outboundEnabled", "aiEnabled", "handoffEnabled"] as const;
const ACCOUNT_STATUSES = new Set<TenantChannelAccountStatus>(["connected", "disabled", "pending", "error"]);
const TOKEN_STATUSES = new Set<TenantChannelTokenStatus>(["not_required", "configured", "expired", "missing"]);
export type ChannelAccountPlanProvenance = "HISTORICAL_SOURCE" | "OWNER_AUTHORIZED_DB_IDENTITY";
export type ChannelAccountPlanDocument = {
  schemaVersion: 1;
  sourceSha256: string;
  tenants: Record<string, { provenance: ChannelAccountPlanProvenance; channelAccounts: TenantChannelAccount[] }>;
};
export type MigrationClient = { id: string; clientKey: string };
export type MigrationPhone = { clientId: string; phoneNumberId: string };
export type MigrationMetaConfig = { clientId: string; phoneNumberId: string | null };
export type ExistingMetaAccount = { clientId: string; clientKey: string; channelAccountId: string; aliases: string[] };
export type ChannelAccountMigrationItem = { tenantKey: string; clientId: string; modality: "WHATSAPP_META"; identitySha256: string; provenance: ChannelAccountPlanProvenance; account: TenantChannelAccount };
export type ChannelAccountMigrationPlan = { sourceTenantCount: number; metaTenantCount: number; webSessionOnlyCount: number; webSessionOnlyTenants: string[]; items: ChannelAccountMigrationItem[] };

function deny(code: string, tenantKey: string): never { throw new Error(`${code}:${tenantKey}`); }
function ownBoolean(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key) && typeof (value as Record<string, unknown>)[key] === "boolean"; }
function identities(account: TenantChannelAccount) { return [account.channelAccountId, ...(account.externalAccountIds ?? [])]; }
const identityHash = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

export function normalizeChannelAccountTenantSelection(values: readonly string[]): string[] {
  if (values.length === 0) throw new Error("CHANNEL_ACCOUNT_TENANT_SELECTOR_EMPTY");
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error("CHANNEL_ACCOUNT_TENANT_SELECTOR_EMPTY");
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`CHANNEL_ACCOUNT_TENANT_SELECTOR_DUPLICATE:${[...new Set(duplicates)].sort().join(",")}`);
  return [...new Set(normalized)].sort();
}

export function channelAccountMigrationTenantKeys(params: {
  tenants: Record<string, TenantConfig>;
  planDocument: ChannelAccountPlanDocument;
  selectedTenants?: readonly string[];
}): string[] {
  const selected = params.selectedTenants ? normalizeChannelAccountTenantSelection(params.selectedTenants) : undefined;
  if (!selected) return [...new Set([...Object.keys(params.tenants), ...Object.keys(params.planDocument.tenants ?? {})])].sort();
  for (const tenantKey of selected) {
    if (params.tenants[tenantKey]) continue;
    const planEntry = params.planDocument.tenants?.[tenantKey];
    if (tenantKey === "cra-pr" && planEntry?.provenance === "OWNER_AUTHORIZED_DB_IDENTITY") continue;
    deny(tenantKey === "cra-pr" ? "CRA_CHANNEL_ACCOUNT_PROVENANCE_DENY" : "CHANNEL_ACCOUNT_SOURCE_TENANT_MISSING", tenantKey);
  }
  return selected;
}

function validateGlobalIdentities(accounts: ExistingMetaAccount[], planned: Array<{ tenantKey: string; clientId: string; account: TenantChannelAccount }>) {
  const owners = new Map<string, Set<string>>();
  const add = (identity: string, owner: string) => { const set = owners.get(identity) ?? new Set<string>(); set.add(owner); owners.set(identity, set); };
  for (const account of accounts) for (const identity of [account.channelAccountId, ...account.aliases]) add(identity, `${account.clientId}:${account.channelAccountId}`);
  for (const item of planned) for (const identity of identities(item.account)) add(identity, `${item.clientId}:${item.account.channelAccountId}`);
  const collisions = [...owners.entries()].filter(([, ownerSet]) => ownerSet.size > 1);
  if (collisions.length) throw new Error(`CHANNEL_ACCOUNT_GLOBAL_IDENTITY_COLLISION:${collisions.map(([value]) => identityHash(value)).sort().join(",")}`);
}

export function buildChannelAccountMigrationPlan(params: {
  tenants: Record<string, TenantConfig>;
  planDocument: ChannelAccountPlanDocument;
  expectedSourceSha256: string;
  clients: MigrationClient[];
  phoneNumbers: MigrationPhone[];
  metaConfigs: MigrationMetaConfig[];
  existingMetaAccounts: ExistingMetaAccount[];
  selectedTenants?: readonly string[];
}): ChannelAccountMigrationPlan {
  if (params.planDocument.schemaVersion !== 1) throw new Error("CHANNEL_ACCOUNT_PLAN_SCHEMA_INVALID");
  if (params.planDocument.sourceSha256 !== params.expectedSourceSha256.toLowerCase()) throw new Error("CHANNEL_ACCOUNT_PLAN_SOURCE_SHA256_MISMATCH");
  if (!params.planDocument.tenants || typeof params.planDocument.tenants !== "object") throw new Error("CHANNEL_ACCOUNT_PLAN_TENANTS_INVALID");
  const selectedKeys = channelAccountMigrationTenantKeys(params);
  const selected = params.selectedTenants ? new Set(selectedKeys) : null;
  const sourceEntries = Object.entries(params.tenants).filter(([key]) => !selected || selected.has(key)).sort(([a], [b]) => a.localeCompare(b));
  const plannedKeys = Object.keys(params.planDocument.tenants).filter((key) => !selected || selected.has(key)).sort();
  for (const key of plannedKeys) if (!params.tenants[key] && !(key === "cra-pr" && params.planDocument.tenants[key].provenance === "OWNER_AUTHORIZED_DB_IDENTITY")) deny(key === "cra-pr" ? "CRA_CHANNEL_ACCOUNT_PROVENANCE_DENY" : "CHANNEL_ACCOUNT_PLAN_TENANT_NOT_IN_SOURCE", key);

  const clients = new Map(params.clients.map((item) => [item.clientKey, item]));
  const phones = new Map<string, Set<string>>();
  for (const phone of params.phoneNumbers) { const set = phones.get(phone.clientId) ?? new Set<string>(); set.add(phone.phoneNumberId); phones.set(phone.clientId, set); }
  const meta = new Map(params.metaConfigs.map((item) => [item.clientId, item.phoneNumberId]));
  const existingByClient = new Map<string, ExistingMetaAccount[]>();
  for (const account of params.existingMetaAccounts) existingByClient.set(account.clientId, [...(existingByClient.get(account.clientId) ?? []), account]);
  const keys = selectedKeys;
  const items: ChannelAccountMigrationItem[] = []; const webSessionOnlyTenants: string[] = []; const errors: string[] = [];
  for (const tenantKey of keys) try {
    const tenant = params.tenants[tenantKey]; const planEntry = params.planDocument.tenants[tenantKey]; const client = clients.get(tenantKey);
    if (!client) deny("CHANNEL_ACCOUNT_CLIENT_MISSING", tenantKey);
    const sourcePhone = tenant?.metaPhoneNumberId?.trim() ?? "";
    const dbParticipates = (phones.get(client.id)?.size ?? 0) > 0 || Boolean(meta.get(client.id)) || (existingByClient.get(client.id)?.length ?? 0) > 0;
    if (!planEntry) { if (sourcePhone || dbParticipates) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey); webSessionOnlyTenants.push(tenantKey); continue; }
    if (!["HISTORICAL_SOURCE", "OWNER_AUTHORIZED_DB_IDENTITY"].includes(planEntry.provenance)) deny("CHANNEL_ACCOUNT_PLAN_PROVENANCE_INVALID", tenantKey);
    if (tenantKey === "cra-pr" && planEntry.provenance !== "OWNER_AUTHORIZED_DB_IDENTITY") deny("CRA_CHANNEL_ACCOUNT_PROVENANCE_DENY", tenantKey);
    const metaAccounts = planEntry.channelAccounts?.filter((account) => account.channel === "whatsapp" && account.provider === "meta") ?? [];
    if (metaAccounts.length !== 1 || planEntry.channelAccounts.length !== 1) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    const account = metaAccounts[0];
    if (!account.channelAccountId?.trim() || account.tenantKey !== tenantKey) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    for (const flag of REQUIRED_META_FLAGS) if (!ownBoolean(account, flag)) deny("CHANNEL_ACCOUNT_PLAN_INCOMPLETE", tenantKey);
    if (!ACCOUNT_STATUSES.has(account.status as TenantChannelAccountStatus)) deny("CHANNEL_ACCOUNT_STATUS_INVALID", tenantKey);
    if (!TOKEN_STATUSES.has(account.tokenStatus as TenantChannelTokenStatus)) deny("CHANNEL_ACCOUNT_TOKEN_STATUS_INVALID", tenantKey);
    const aliases = account.externalAccountIds ?? [];
    if (aliases.some((alias) => typeof alias !== "string" || !alias.trim()) || new Set(aliases).size !== aliases.length || aliases.includes(account.channelAccountId)) deny("CHANNEL_ACCOUNT_PLAN_INVALID_ALIASES", tenantKey);
    const expectedIdentity = sourcePhone || account.channelAccountId; const accountIdentities = new Set(identities(account));
    if (!accountIdentities.has(expectedIdentity)) deny("CHANNEL_ACCOUNT_PLAN_IDENTITY_MISMATCH", tenantKey);
    const dbIdentities = new Set([...(phones.get(client.id) ?? []), ...(meta.get(client.id) ? [meta.get(client.id)!] : [])]);
    if (!dbIdentities.has(expectedIdentity)) deny("CHANNEL_ACCOUNT_PHONE_IDENTITY_MISMATCH", tenantKey);
    items.push({ tenantKey, clientId: client.id, modality: "WHATSAPP_META", identitySha256: identityHash(account.channelAccountId), provenance: planEntry.provenance, account: { ...account, tenantKey } });
  } catch (error) { errors.push((error as Error).message); }
  if (errors.length) throw new Error(`CHANNEL_ACCOUNT_PLAN_DENY:${errors.sort().join(",")}`);
  validateGlobalIdentities(params.existingMetaAccounts, items);
  return { sourceTenantCount: sourceEntries.length, metaTenantCount: items.length, webSessionOnlyCount: webSessionOnlyTenants.length, webSessionOnlyTenants, items };
}

export function sanitizedMigrationItem(item: ChannelAccountMigrationItem, action: string) {
  return { tenantKey: item.tenantKey, modality: item.modality, provenance: item.provenance, identitySha256: item.identitySha256, action, aliasCount: item.account.externalAccountIds?.length ?? 0, secretKindCount: Number(Boolean(item.account.pageAccessToken?.trim())) + Number(Boolean(item.account.instagramBusinessAccessToken?.trim())) };
}
