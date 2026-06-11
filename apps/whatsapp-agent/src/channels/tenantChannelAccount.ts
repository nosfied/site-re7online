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

type TenantChannelAccountInput = Partial<Omit<TenantChannelAccount, "externalAccountIds" | "metadata">> & {
  externalAccountIds?: unknown;
  metadata?: unknown;
  token?: unknown;
  accessToken?: unknown;
  pageAccessToken?: unknown;
  instagramBusinessAccessToken?: unknown;
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

function sanitizeSecret(value: unknown, maxLength = 4096) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function sanitizeIdentifierList(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const normalized = sanitizeIdentifier(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
    if (items.length >= maxItems) break;
  }
  return items.length > 0 ? items : undefined;
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = sanitizeIdentifier(rawKey, 80);
    const normalizedValue = sanitizeText(rawValue, 180);
    if (!key || !normalizedValue) continue;
    output[key] = normalizedValue;
  }
  return Object.keys(output).length > 0 ? output : undefined;
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
  const pageAccessToken = sanitizeSecret(input.pageAccessToken);
  const instagramBusinessAccessToken = sanitizeSecret(input.instagramBusinessAccessToken);
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
    externalAccountIds: sanitizeIdentifierList(input.externalAccountIds),
    externalBusinessId: sanitizeIdentifier(input.externalBusinessId),
    metadata: sanitizeMetadata(input.metadata),
    enabled,
    automationEnabled: normalizeBoolean(input.automationEnabled, false),
    runtimeEnabled: normalizeBoolean(input.runtimeEnabled, false),
    inboundPersistenceEnabled: normalizeBoolean(input.inboundPersistenceEnabled, false),
    outboundEnabled: normalizeBoolean(input.outboundEnabled, false),
    aiEnabled: normalizeBoolean(input.aiEnabled, false),
    handoffEnabled: normalizeBoolean(input.handoffEnabled, false),
    status,
    tokenStatus: pageAccessToken || instagramBusinessAccessToken
      ? "configured"
      : normalizeStatus(input.tokenStatus, TOKEN_STATUSES, "missing"),
    pageAccessToken,
    instagramBusinessAccessToken,
    createdAt: sanitizeText(input.createdAt, 40),
    updatedAt: sanitizeText(input.updatedAt, 40),
  } satisfies TenantChannelAccount;
}

function hasIncomingPageAccessToken(input: TenantChannelAccountInput) {
  return typeof input.pageAccessToken === "string" && input.pageAccessToken.trim().length > 0;
}

function hasIncomingInstagramBusinessAccessToken(input: TenantChannelAccountInput) {
  return typeof input.instagramBusinessAccessToken === "string" && input.instagramBusinessAccessToken.trim().length > 0;
}

function buildAccountKey(account: {
  tenantKey: string;
  provider: Provider;
  channel: Channel;
  channelAccountId: string;
}) {
  return `${account.tenantKey}:${account.provider}:${account.channel}:${account.channelAccountId}`;
}

export function redactTenantChannelAccount(account: TenantChannelAccount): TenantChannelAccount {
  const {
    pageAccessToken: _pageAccessToken,
    instagramBusinessAccessToken: _instagramBusinessAccessToken,
    ...redacted
  } = account;
  return redacted;
}

export function redactTenantChannelAccounts(accounts?: TenantChannelAccount[]) {
  return (accounts ?? []).map(redactTenantChannelAccount);
}

export function normalizeTenantChannelAccountsForTenant(
  input: unknown,
  tenantKey: string,
  existingAccounts?: TenantChannelAccount[]
) {
  if (!Array.isArray(input)) return undefined;
  const normalizedTenantKey = sanitizeIdentifier(tenantKey);
  if (!normalizedTenantKey) return [];

  const existingByKey = new Map<string, TenantChannelAccount>();
  for (const existing of existingAccounts ?? []) {
    existingByKey.set(buildAccountKey(existing), existing);
  }

  const seen = new Set<string>();
  const accounts: TenantChannelAccount[] = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as TenantChannelAccountInput;
    const normalizedKeyInput = {
      tenantKey: normalizedTenantKey,
      provider: item.provider as Provider,
      channel: item.channel as Channel,
      channelAccountId: sanitizeIdentifier(item.channelAccountId),
    };
    const existing = existingByKey.get(buildAccountKey(normalizedKeyInput));
    const normalized = normalizeTenantChannelAccount({
      ...item,
      tenantKey: normalizedTenantKey,
      pageAccessToken: hasIncomingPageAccessToken(item)
        ? item.pageAccessToken
        : existing?.pageAccessToken,
      instagramBusinessAccessToken: hasIncomingInstagramBusinessAccessToken(item)
        ? item.instagramBusinessAccessToken
        : existing?.instagramBusinessAccessToken,
      tokenStatus:
        hasIncomingPageAccessToken(item) ||
        hasIncomingInstagramBusinessAccessToken(item) ||
        existing?.pageAccessToken ||
        existing?.instagramBusinessAccessToken
          ? "configured"
          : item.tokenStatus,
    });
    if (!normalized) continue;
    const key = buildAccountKey(normalized);
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

export function canRunChannelRuntime(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.automationEnabled && account.runtimeEnabled);
}

export function canSendChannelOutbound(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.outboundEnabled);
}

export function canSendMessengerOutbound(account?: TenantChannelAccount | null) {
  return Boolean(
    account?.channel === "messenger" &&
      account.enabled &&
      account.runtimeEnabled === true &&
      account.inboundPersistenceEnabled === true &&
      account.outboundEnabled === true &&
      account.status === "connected" &&
      account.tokenStatus === "configured" &&
      account.pageAccessToken
  );
}

export function canSendInstagramOutbound(account?: TenantChannelAccount | null) {
  return Boolean(
    account?.channel === "instagram" &&
      account.enabled &&
      account.runtimeEnabled === true &&
      account.inboundPersistenceEnabled === true &&
      account.outboundEnabled === true &&
      account.status === "connected" &&
      account.tokenStatus === "configured" &&
      account.instagramBusinessAccessToken
  );
}

export function canPersistChannelInbound(account?: TenantChannelAccount | null) {
  return Boolean(
    account?.enabled &&
      account.runtimeEnabled === true &&
      account.inboundPersistenceEnabled === true &&
      account.status === "connected"
  );
}

export function isChannelAiEnabled(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.aiEnabled);
}

export function canUseChannelAi(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.aiEnabled);
}

export function isChannelHandoffEnabled(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.handoffEnabled);
}

export function canUseChannelHandoff(account?: TenantChannelAccount | null) {
  return Boolean(account?.enabled && account.handoffEnabled);
}

export type ChannelRuntimeGateDecision = {
  allowed: boolean;
  reason:
    | "account_missing"
    | "channel_disabled"
    | "automation_disabled"
    | "runtime_disabled"
    | "runtime_allowed";
  outboundAllowed: boolean;
  aiAllowed: boolean;
  handoffAllowed: boolean;
};

export function resolveChannelRuntimeGate(
  account?: TenantChannelAccount | null
): ChannelRuntimeGateDecision {
  const outboundAllowed = canSendChannelOutbound(account);
  const aiAllowed = canUseChannelAi(account);
  const handoffAllowed = canUseChannelHandoff(account);
  if (!account) {
    return {
      allowed: false,
      reason: "account_missing",
      outboundAllowed,
      aiAllowed,
      handoffAllowed,
    };
  }
  if (!account.enabled) {
    return {
      allowed: false,
      reason: "channel_disabled",
      outboundAllowed,
      aiAllowed,
      handoffAllowed,
    };
  }
  if (account.automationEnabled !== true) {
    return {
      allowed: false,
      reason: "automation_disabled",
      outboundAllowed,
      aiAllowed,
      handoffAllowed,
    };
  }
  if (account.runtimeEnabled !== true) {
    return {
      allowed: false,
      reason: "runtime_disabled",
      outboundAllowed,
      aiAllowed,
      handoffAllowed,
    };
  }
  return {
    allowed: true,
    reason: "runtime_allowed",
    outboundAllowed,
    aiAllowed,
    handoffAllowed,
  };
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
      (account.channelAccountId === channelAccountId ||
        (account.externalAccountIds ?? []).includes(channelAccountId))
  );
}

export function listEnabledTenantChannels(accounts: TenantChannelAccount[], tenantKey?: string) {
  const normalizedTenantKey = sanitizeIdentifier(tenantKey);
  return accounts.filter(
    (account) => account.enabled && (!normalizedTenantKey || account.tenantKey === normalizedTenantKey)
  );
}
