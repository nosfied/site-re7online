import type { Channel, Provider } from "./channel.types.js";
import type {
  TenantChannelAccount,
  TenantChannelAccountStatus,
  TenantChannelTokenStatus,
} from "./tenantChannelAccount.types.js";

const CHANNELS = new Set<Channel>(["whatsapp", "instagram", "messenger"]);
const PROVIDERS = new Set<Provider>(["meta"]);
const ACCOUNT_STATUSES = new Set<TenantChannelAccountStatus>([
  "connected",
  "disabled",
  "pending",
  "error",
]);
const TOKEN_STATUSES = new Set<TenantChannelTokenStatus>([
  "not_required",
  "configured",
  "expired",
  "missing",
]);

type TenantChannelAccountInput = Partial<TenantChannelAccount> & {
  token?: unknown;
  accessToken?: unknown;
  pageAccessToken?: unknown;
  longLivedToken?: unknown;
  businessToken?: unknown;
};

function sanitizeIdentifier(value: unknown, maxLength = 120) {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[^a-zA-Z0-9_.:-]/g, "")
        .slice(0, maxLength)
    : "";
}

function sanitizeText(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : undefined;
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStatus<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function buildDefaultChannelAccountId(params: {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
}) {
  return sanitizeIdentifier(
    `${params.tenantKey}-${params.provider}-${params.channel}-${params.channelAccountId}`,
    160
  );
}

export function normalizeTenantChannelAccount(input: TenantChannelAccountInput) {
  const tenantKey = sanitizeIdentifier(input.tenantKey);
  const channel = input.channel;
  const provider = input.provider;
  const channelAccountId = sanitizeIdentifier(input.channelAccountId);

  if (!tenantKey || !CHANNELS.has(channel as Channel) || !PROVIDERS.has(provider as Provider) || !channelAccountId) {
    return null;
  }

  const enabled = normalizeBoolean(input.enabled, false);
  const status = normalizeStatus(
    input.status,
    ACCOUNT_STATUSES,
    enabled ? "connected" : "disabled"
  );

  return {
    id:
      sanitizeIdentifier(input.id, 160) ||
      buildDefaultChannelAccountId({
        tenantKey,
        channel: channel as Channel,
        provider: provider as Provider,
        channelAccountId,
      }),
    tenantKey,
    channel: channel as Channel,
    provider: provider as Provider,
    displayName: sanitizeText(input.displayName),
    channelAccountId,
    externalBusinessId: sanitizeIdentifier(input.externalBusinessId),
    enabled,
    automationEnabled: normalizeBoolean(input.automationEnabled, false),
    aiEnabled: normalizeBoolean(input.aiEnabled, false),
    handoffEnabled: normalizeBoolean(input.handoffEnabled, false),
    status,
    tokenStatus: normalizeStatus(input.tokenStatus, TOKEN_STATUSES, "missing"),
    createdAt: sanitizeText(input.createdAt, 40),
    updatedAt: sanitizeText(input.updatedAt, 40),
  } satisfies TenantChannelAccount;
}

export function normalizeTenantChannelAccountsForTenant(input: unknown, tenantKey: string) {
  if (!Array.isArray(input)) return undefined;
  const normalizedTenantKey = sanitizeIdentifier(tenantKey);
  if (!normalizedTenantKey) return [];

  const seen = new Set<string>();
  const accounts: TenantChannelAccount[] = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as TenantChannelAccountInput;
    const normalized = normalizeTenantChannelAccount({
      ...item,
      tenantKey: normalizedTenantKey,
    });
    if (!normalized) continue;
    const key = `${normalized.tenantKey}:${normalized.provider}:${normalized.channel}:${normalized.channelAccountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(normalized);
  }
  return accounts;
}

export function validateTenantChannelAccount(input: TenantChannelAccountInput) {
  const normalized = normalizeTenantChannelAccount(input);
  if (!normalized) {
    throw new Error("tenant_channel_account_invalid");
  }
  return normalized;
}

export function isChannelAutomationEnabled(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.automationEnabled);
}

export function isChannelAiEnabled(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.aiEnabled);
}

export function isChannelHandoffEnabled(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.handoffEnabled);
}

export function findTenantChannelAccount(
  accounts: TenantChannelAccount[],
  criteria: {
    tenantKey: string;
    channel: Channel;
    provider: Provider;
    channelAccountId: string;
  }
) {
  const tenantKey = sanitizeIdentifier(criteria.tenantKey);
  const channelAccountId = sanitizeIdentifier(criteria.channelAccountId);
  return accounts.find(
    (account) =>
      account.tenantKey === tenantKey &&
      account.channel === criteria.channel &&
      account.provider === criteria.provider &&
      account.channelAccountId === channelAccountId
  );
}

export function listEnabledTenantChannels(accounts: TenantChannelAccount[], tenantKey?: string) {
  const normalizedTenantKey = sanitizeIdentifier(tenantKey);
  return accounts.filter(
    (account) => account.enabled && (!normalizedTenantKey || account.tenantKey === normalizedTenantKey)
  );
}
