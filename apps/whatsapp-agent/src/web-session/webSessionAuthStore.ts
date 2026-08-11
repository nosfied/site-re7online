import { type PrismaClient } from "@prisma/client";
import {
  CHANNEL_ACCOUNT_SECRET_KEY_REF,
  decryptChannelAccountSecret,
  encryptChannelAccountSecret,
  hashChannelAccountSecret,
} from "../channels/channelAccountSecretCrypto.js";

export const WEB_SESSION_AUTH_SECRET_KIND = "baileysAuthState.v1";

export type SerializedWebSessionAuthState = Record<string, unknown>;
export type WebSessionAuthWriteResult =
  | { ok: true }
  | { ok: false; error: string };

export type WebSessionAuthStore = {
  load(params: WebSessionAuthScope): Promise<SerializedWebSessionAuthState | null>;
  save(params: WebSessionAuthScope & { state: SerializedWebSessionAuthState }): Promise<WebSessionAuthWriteResult>;
  clear(params: WebSessionAuthScope): Promise<WebSessionAuthWriteResult>;
};

export type WebSessionAuthScope = {
  tenantKey: string;
  channelAccountId: string;
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

export function createQueuedWebSessionAuthStore(prisma: PrismaClient): WebSessionAuthStore {
  const queue = new Map<string, Promise<void>>();

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
      const result = await loadWebSessionAuthState({ prisma, ...params });
      return result.ok ? result.state : null;
    },
    save: (params) => withQueue(params, () => saveWebSessionAuthState({ prisma, ...params })),
    clear: (params) => withQueue(params, () => clearWebSessionAuthState({ prisma, ...params })),
  };
}

async function findWebSessionAccount(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
  includeSecret?: boolean;
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
            where: { secretKind: WEB_SESSION_AUTH_SECRET_KIND },
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
}) {
  const account = await findWebSessionAccount({ ...params, includeSecret: true });
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const secret = account.secrets?.find((item) => item.secretKind === WEB_SESSION_AUTH_SECRET_KIND);
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
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  const serialized = canonicalJson(params.state);
  const encrypted = encryptChannelAccountSecret(serialized);
  if (!encrypted) return { ok: false as const, error: "channel_account_secret_key_missing" };
  await params.prisma.channelAccountSecret.upsert({
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
  return { ok: true as const };
}

export async function clearWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, error: "web_session_account_not_found" };
  await params.prisma.channelAccountSecret.deleteMany({
    where: {
      channelAccountId: account.id,
      secretKind: WEB_SESSION_AUTH_SECRET_KIND,
    },
  });
  return { ok: true as const };
}
