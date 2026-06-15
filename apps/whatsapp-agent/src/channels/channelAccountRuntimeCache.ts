import { logger } from "../logger/logger.js";
import type { ResolvedTenantChannelAccount } from "./tenantChannelResolution.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export const CHANNEL_ACCOUNT_RUNTIME_CACHE_TTL_MS = 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const resolutionCache = new Map<string, CacheEntry<ResolvedTenantChannelAccount>>();
const accountCache = new Map<string, CacheEntry<TenantChannelAccount | null>>();
let nowProvider = () => Date.now();

function nowMs() {
  return nowProvider();
}

function cacheLoggingEnabled() {
  return (process.env.CHANNEL_ACCOUNTS_RUNTIME_CACHE_LOGS ?? "false") === "true";
}

function cacheKey(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).join(":");
}

function cloneAccount(account: TenantChannelAccount): TenantChannelAccount {
  return {
    ...account,
    externalAccountIds: account.externalAccountIds ? [...account.externalAccountIds] : undefined,
    metadata: account.metadata ? { ...account.metadata } : undefined,
  };
}

function cloneResolution(value: ResolvedTenantChannelAccount): ResolvedTenantChannelAccount {
  return {
    ...value,
    account: value.account ? cloneAccount(value.account) : undefined,
  };
}

function cloneCachedAccount(value: TenantChannelAccount | null) {
  return value ? cloneAccount(value) : null;
}

function readCache<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  clone: (value: T) => T,
  now = nowMs()
) {
  const entry = map.get(key);
  if (!entry) return { hit: false as const };
  if (entry.expiresAt <= now) {
    map.delete(key);
    return { hit: false as const, expired: true };
  }
  return { hit: true as const, value: clone(entry.value) };
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, clone: (value: T) => T) {
  map.set(key, {
    value: clone(value),
    expiresAt: nowMs() + CHANNEL_ACCOUNT_RUNTIME_CACHE_TTL_MS,
  });
}

function logCache(params: {
  event: "channel_accounts.cache_hit" | "channel_accounts.cache_miss";
  cache: "resolution" | "account_secret";
  channel: string;
  channelAccountId: string;
  requestId?: string | null;
  durationMs?: number;
  expired?: boolean;
}) {
  if (!cacheLoggingEnabled()) return;
  logger.info({
    event: params.event,
    requestId: params.requestId ?? null,
    cache: params.cache,
    channel: params.channel,
    channelAccountId: params.channelAccountId,
    durationMs: params.durationMs,
    expired: params.expired === true || undefined,
  });
}

export function getCachedChannelAccountResolution(params: {
  channel: string;
  provider: string;
  channelAccountId: string;
  requestId?: string | null;
}) {
  const key = cacheKey(["resolution", params.provider, params.channel, params.channelAccountId]);
  const result = readCache(resolutionCache, key, cloneResolution);
  logCache({
    event: result.hit ? "channel_accounts.cache_hit" : "channel_accounts.cache_miss",
    cache: "resolution",
    channel: params.channel,
    channelAccountId: params.channelAccountId,
    requestId: params.requestId,
    expired: result.hit ? false : result.expired,
  });
  return result.hit ? result.value : null;
}

export function setCachedChannelAccountResolution(params: {
  channel: string;
  provider: string;
  channelAccountId: string;
  value: ResolvedTenantChannelAccount;
}) {
  const key = cacheKey(["resolution", params.provider, params.channel, params.channelAccountId]);
  writeCache(resolutionCache, key, params.value, cloneResolution);
}

export function getCachedChannelAccountWithSecret(params: {
  tenantKey: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  requestId?: string | null;
}) {
  const key = cacheKey([
    "account_secret",
    params.tenantKey,
    params.provider,
    params.channel,
    params.channelAccountId,
  ]);
  const result = readCache(accountCache, key, cloneCachedAccount);
  logCache({
    event: result.hit ? "channel_accounts.cache_hit" : "channel_accounts.cache_miss",
    cache: "account_secret",
    channel: params.channel,
    channelAccountId: params.channelAccountId,
    requestId: params.requestId,
    expired: result.hit ? false : result.expired,
  });
  return result.hit ? result.value : undefined;
}

export function setCachedChannelAccountWithSecret(params: {
  tenantKey: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  value: TenantChannelAccount | null;
}) {
  const key = cacheKey([
    "account_secret",
    params.tenantKey,
    params.provider,
    params.channel,
    params.channelAccountId,
  ]);
  writeCache(accountCache, key, params.value, cloneCachedAccount);
}

export function clearChannelAccountRuntimeCache() {
  resolutionCache.clear();
  accountCache.clear();
}

export function setChannelAccountRuntimeCacheNowForTest(provider?: () => number) {
  nowProvider = provider ?? (() => Date.now());
}

export function getChannelAccountRuntimeCacheStats() {
  return {
    ttlMs: CHANNEL_ACCOUNT_RUNTIME_CACHE_TTL_MS,
    resolutionEntries: resolutionCache.size,
    accountSecretEntries: accountCache.size,
  };
}
