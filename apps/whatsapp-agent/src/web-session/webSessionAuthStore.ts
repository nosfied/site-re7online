import { type PrismaClient } from "@prisma/client";
import {
  CHANNEL_ACCOUNT_SECRET_KEY_REF,
  decryptChannelAccountSecret,
  encryptChannelAccountSecret,
  hashChannelAccountSecret,
} from "../channels/channelAccountSecretCrypto.js";

export const WEB_SESSION_AUTH_SECRET_KIND = "baileysAuthState.v1";
export const WEB_SESSION_AUTH_STAGING_SECRET_KIND = "baileysAuthState.staging.v1";
export const DEFAULT_WEB_SESSION_AUTH_STAGING_TTL_MS = 45 * 60 * 1000;

export type SerializedWebSessionAuthState = Record<string, unknown>;
export type WebSessionAuthWriteResult =
  | { ok: true }
  | { ok: false; error: string };

export type WebSessionAuthStore = {
  load(params: WebSessionAuthScope): Promise<SerializedWebSessionAuthState | null>;
  save(params: WebSessionAuthScope & { state: SerializedWebSessionAuthState }): Promise<WebSessionAuthWriteResult>;
  clear(params: WebSessionAuthScope): Promise<WebSessionAuthWriteResult>;
};

export type StagedWebSessionAuthStore = {
  store: WebSessionAuthStore;
  promote(params: WebSessionAuthScope): Promise<WebSessionAuthWriteResult>;
  discard(): void;
  discardPersisted?(params: WebSessionAuthScope): Promise<WebSessionAuthWriteResult>;
  hasStagedState(): boolean;
  isPromoted(): boolean;
  getAttemptInfo?(): WebSessionAuthStagingAttemptInfo | null;
};

export type WebSessionAuthScope = {
  tenantKey: string;
  channelAccountId: string;
};

export type WebSessionAuthStagingAttemptInfo = {
  attemptId: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
};

type WebSessionAccountRecord = {
  id: string;
  clientId: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  client: { clientKey: string };
  secrets?: Array<{
    secretKind: string;
    status: string;
    secretCiphertext: string | null;
  }>;
};

type WebSessionSecretWriter = Pick<PrismaClient, "channelAccountSecret">;

function normalizeScopeValue(value: string, maxLength = 160) {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, maxLength);
}

function canonicalJson(value: SerializedWebSessionAuthState) {
  return JSON.stringify(value);
}

function parseSerializedAuthState(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as SerializedWebSessionAuthState
      : null;
  } catch {
    return null;
  }
}

function createAttemptId() {
  return `pair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function isExpiredIso(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= now;
}

function wrapStagingState(params: {
  state: SerializedWebSessionAuthState;
  attempt: WebSessionAuthStagingAttemptInfo | null;
  ttlMs: number;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const startedAt = params.attempt?.startedAt ?? nowIso(now);
  const attemptId = params.attempt?.attemptId ?? createAttemptId();
  return {
    kind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
    attemptId,
    startedAt,
    updatedAt: nowIso(now),
    expiresAt: nowIso(now + params.ttlMs),
    state: params.state,
  };
}

function unwrapStagingState(value: SerializedWebSessionAuthState | null, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== WEB_SESSION_AUTH_STAGING_SECRET_KIND) return null;
  if (typeof record.attemptId !== "string" || !record.attemptId) return null;
  if (typeof record.startedAt !== "string" || typeof record.updatedAt !== "string" || typeof record.expiresAt !== "string") {
    return null;
  }
  if (isExpiredIso(record.expiresAt, now)) return { expired: true as const };
  const state = record.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return {
    expired: false as const,
    state: state as SerializedWebSessionAuthState,
    attempt: {
      attemptId: record.attemptId,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    },
  };
}

export function createQueuedWebSessionAuthStore(
  prisma: PrismaClient,
  options: { secretKind?: string } = {}
): WebSessionAuthStore {
  const queue = new Map<string, Promise<void>>();
  const secretKind = options.secretKind ?? WEB_SESSION_AUTH_SECRET_KIND;

  async function withQueue<T>(scope: WebSessionAuthScope, operation: () => Promise<T>) {
    const key = `${scope.tenantKey}:${scope.channelAccountId}`;
    const previous = queue.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const queued = next.then(() => undefined, () => undefined);
    queue.set(key, queued);
    try {
      return await next;
    } finally {
      if (queue.get(key) === queued) queue.delete(key);
    }
  }

  return {
    load: async (params) => {
      const result = await loadWebSessionAuthState({ prisma, ...params, secretKind });
      return result.ok ? result.state : null;
    },
    save: (params) => withQueue(params, () => saveWebSessionAuthState({ prisma, ...params, secretKind })),
    clear: (params) => withQueue(params, () => clearWebSessionAuthState({ prisma, ...params, secretKind })),
  };
}

export function createStagedWebSessionAuthStore(baseStore: WebSessionAuthStore): StagedWebSessionAuthStore {
  let stagedState: SerializedWebSessionAuthState | null = null;
  let promoted = false;

  return {
    store: {
      load: (params) => baseStore.load(params),
      save: async (params) => {
        if (promoted) return baseStore.save(params);
        stagedState = params.state;
        return { ok: true };
      },
      clear: async (params) => {
        stagedState = null;
        promoted = false;
        return baseStore.clear(params);
      },
    },
    async promote(params) {
      promoted = true;
      if (!stagedState) return { ok: true };
      const result = await baseStore.save({ ...params, state: stagedState });
      if (!result.ok) promoted = false;
      return result;
    },
    discard() {
      stagedState = null;
      promoted = false;
    },
    hasStagedState() {
      return stagedState !== null;
    },
    isPromoted() {
      return promoted;
    },
  };
}

export function createDurableStagedWebSessionAuthStore(params: {
  prisma: PrismaClient;
  ttlMs?: number;
  now?: () => number;
}): StagedWebSessionAuthStore {
  const ttlMs = params.ttlMs ?? DEFAULT_WEB_SESSION_AUTH_STAGING_TTL_MS;
  const now = params.now ?? Date.now;
  const approvedStore = createQueuedWebSessionAuthStore(params.prisma, { secretKind: WEB_SESSION_AUTH_SECRET_KIND });
  const stagingStore = createQueuedWebSessionAuthStore(params.prisma, { secretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND });
  let loadedKind: "approved" | "staging" | "new" = "new";
  let attempt: WebSessionAuthStagingAttemptInfo | null = null;
  let latestStagingState: SerializedWebSessionAuthState | null = null;
  let promoted = false;

  function discardLocalStaging() {
    if (loadedKind !== "approved") {
      loadedKind = "new";
      promoted = false;
    }
    attempt = null;
    latestStagingState = null;
  }

  return {
    store: {
      async load(scope) {
        const approved = await approvedStore.load(scope);
        if (approved) {
          await stagingStore.clear(scope);
          loadedKind = "approved";
          promoted = true;
          return approved;
        }
        const staging = await stagingStore.load(scope);
        const unwrapped = unwrapStagingState(staging, now());
        if (unwrapped?.expired) {
          await stagingStore.clear(scope);
          loadedKind = "new";
          attempt = null;
          latestStagingState = null;
          return null;
        }
        if (unwrapped && !unwrapped.expired) {
          loadedKind = "staging";
          attempt = unwrapped.attempt;
          latestStagingState = unwrapped.state;
          return unwrapped.state;
        }
        loadedKind = "new";
        return null;
      },
      async save(scope) {
        if (loadedKind === "approved" || promoted) return approvedStore.save(scope);
        latestStagingState = scope.state;
        const wrapped = wrapStagingState({ state: scope.state, attempt, ttlMs, now: now() });
        attempt = {
          attemptId: wrapped.attemptId,
          startedAt: wrapped.startedAt,
          updatedAt: wrapped.updatedAt,
          expiresAt: wrapped.expiresAt,
        };
        loadedKind = "staging";
        return stagingStore.save({ ...scope, state: wrapped });
      },
      async clear(scope) {
        loadedKind = "new";
        promoted = false;
        attempt = null;
        latestStagingState = null;
        const approved = await approvedStore.clear(scope);
        const staging = await stagingStore.clear(scope);
        return approved.ok ? staging : approved;
      },
    },
    async promote(scope) {
      if (loadedKind === "approved" || promoted) {
        promoted = true;
        await stagingStore.clear(scope);
        return { ok: true };
      }
      if (!latestStagingState) {
        const staging = await stagingStore.load(scope);
        const unwrapped = unwrapStagingState(staging, now());
        if (unwrapped?.expired) {
          await stagingStore.clear(scope);
          return { ok: false, error: "web_session_pairing_staging_expired" };
        }
        if (unwrapped && !unwrapped.expired) {
          latestStagingState = unwrapped.state;
          attempt = unwrapped.attempt;
        }
      }
      if (!latestStagingState) return { ok: false, error: "web_session_pairing_staging_missing" };
      const result = await promoteWebSessionAuthState({
        prisma: params.prisma,
        ...scope,
        state: latestStagingState,
      });
      if (!result.ok) return result;
      promoted = true;
      loadedKind = "approved";
      attempt = null;
      latestStagingState = null;
      return { ok: true };
    },
    discard() {
      discardLocalStaging();
    },
    async discardPersisted(scope) {
      discardLocalStaging();
      return stagingStore.clear(scope);
    },
    hasStagedState() {
      return latestStagingState !== null;
    },
    isPromoted() {
      return promoted;
    },
    getAttemptInfo() {
      return attempt;
    },
  };
}

export async function clearAllWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
}) {
  const approved = await clearWebSessionAuthState({
    ...params,
    secretKind: WEB_SESSION_AUTH_SECRET_KIND,
  });
  const staging = await clearWebSessionAuthState({
    ...params,
    secretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
  });
  return approved.ok ? staging : approved;
}

async function findWebSessionAccount(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  includeSecret?: boolean;
  secretKind?: string;
}) {
  const tenantKey = normalizeScopeValue(params.tenantKey, 120);
  const channelAccountId = normalizeScopeValue(params.channelAccountId);
  if (!tenantKey || !channelAccountId) return null;
  return params.prisma.channelAccount.findFirst({
    where: {
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      client: { clientKey: tenantKey },
    },
    include: {
      client: { select: { clientKey: true } },
      secrets: params.includeSecret
        ? {
            where: { secretKind: params.secretKind ?? WEB_SESSION_AUTH_SECRET_KIND },
            select: { secretKind: true, status: true, secretCiphertext: true },
          }
        : false,
    },
  }) as Promise<WebSessionAccountRecord | null>;
}

export async function loadWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  secretKind?: string;
}) {
  const secretKind = params.secretKind ?? WEB_SESSION_AUTH_SECRET_KIND;
  const account = await findWebSessionAccount({ ...params, includeSecret: true, secretKind });
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const secret = account.secrets?.find((item) => item.secretKind === secretKind);
  if (!secret || secret.status !== "configured" || !secret.secretCiphertext) {
    return { ok: true as const, state: null };
  }
  const decrypted = decryptChannelAccountSecret(secret.secretCiphertext);
  const state = parseSerializedAuthState(decrypted);
  if (!state) return { ok: false as const, error: "web_session_auth_state_unavailable" };
  return { ok: true as const, state };
}

export async function saveWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  state: SerializedWebSessionAuthState;
  secretKind?: string;
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const secretKind = params.secretKind ?? WEB_SESSION_AUTH_SECRET_KIND;
  const serialized = canonicalJson(params.state);
  const encrypted = encryptChannelAccountSecret(serialized);
  if (!encrypted) return { ok: false as const, error: "channel_account_secret_key_missing" };
  await params.prisma.channelAccountSecret.upsert({
    where: {
      channelAccountId_secretKind: {
        channelAccountId: account.id,
        secretKind,
      },
    },
    create: {
      channelAccountId: account.id,
      secretKind,
      secretHash: hashChannelAccountSecret(serialized),
      secretCiphertext: encrypted,
      encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
      status: "configured",
    },
    update: {
      secretHash: hashChannelAccountSecret(serialized),
      secretCiphertext: encrypted,
      encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
      status: "configured",
    },
  });
  return { ok: true as const };
}

async function promoteWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  state: SerializedWebSessionAuthState;
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const serialized = canonicalJson(params.state);
  const encrypted = encryptChannelAccountSecret(serialized);
  if (!encrypted) return { ok: false as const, error: "channel_account_secret_key_missing" };
  const write = async (prisma: WebSessionSecretWriter) => {
    await prisma.channelAccountSecret.upsert({
      where: {
        channelAccountId_secretKind: {
          channelAccountId: account.id,
          secretKind: WEB_SESSION_AUTH_SECRET_KIND,
        },
      },
      create: {
        channelAccountId: account.id,
        secretKind: WEB_SESSION_AUTH_SECRET_KIND,
        secretHash: hashChannelAccountSecret(serialized),
        secretCiphertext: encrypted,
        encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
        status: "configured",
      },
      update: {
        secretHash: hashChannelAccountSecret(serialized),
        secretCiphertext: encrypted,
        encryptionKeyRef: CHANNEL_ACCOUNT_SECRET_KEY_REF,
        status: "configured",
      },
    });
    await prisma.channelAccountSecret.deleteMany({
      where: {
        channelAccountId: account.id,
        secretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
      },
    });
  };
  if (typeof params.prisma.$transaction === "function") await params.prisma.$transaction((prisma) => write(prisma));
  else await write(params.prisma);
  return { ok: true as const };
}

export async function clearWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  secretKind?: string;
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const secretKind = params.secretKind ?? WEB_SESSION_AUTH_SECRET_KIND;
  await params.prisma.channelAccountSecret.deleteMany({
    where: {
      channelAccountId: account.id,
      secretKind,
    },
  });
  return { ok: true as const };
}
