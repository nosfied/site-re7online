import type { PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";

const TELEGRAM_SECRET_KIND = "telegramBotToken";
const DEFAULT_REPLAY_TTL_MS = 10 * 60 * 1000;
const MAX_REPLAY_CACHE_SIZE = 2000;

type TelegramShadowPayload = Record<string, unknown>;

export type TelegramWebhookParsedPayload = {
  updateId: number;
  chatId: string;
  messageId: string;
  fromId: string | null;
  text: string | null;
  textPresent: boolean;
  textLength: number;
  displayName: string | null;
  username: string | null;
};

export type TelegramWebhookShadowResult =
  | {
      ok: true;
      replay: boolean;
      resolution: "matched_channel_account" | "matched_alias";
      tenantKey: string;
      clientId: string;
      channelAccountId: string;
      parsed: {
        updateId: number;
        chatId: string;
        messageId: string;
        fromId: string | null;
        textPresent: boolean;
        textLength: number;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      resolution?: "not_found" | "matched_channel_account" | "matched_alias";
    };

export type ResolvedTelegramAccount = {
  resolution: "matched_channel_account" | "matched_alias";
  account: {
    id: string;
    clientId: string;
    channelAccountId: string;
    enabled: boolean;
    runtimeEnabled: boolean;
    inboundPersistenceEnabled: boolean;
    tokenStatus: string;
    client: {
      id: string;
      clientKey: string;
      status: string;
      features: unknown;
    };
    secrets: Array<{ secretKind: string; status: string; secretCiphertext: string | null }>;
  };
};

const replayCache = new Map<string, number>();

function nowMs() {
  return Date.now();
}

function pruneReplayCache(currentTime = nowMs()) {
  for (const [key, expiresAt] of replayCache) {
    if (expiresAt <= currentTime) replayCache.delete(key);
  }
  while (replayCache.size > MAX_REPLAY_CACHE_SIZE) {
    const firstKey = replayCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    replayCache.delete(firstKey);
  }
}

function normalizeAlias(input: string) {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueToString(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function normalizeTelegramText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return null;
  const normalized = input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
  return normalized || null;
}

function normalizeTelegramNamePart(input: unknown) {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function normalizeTelegramUsername(input: unknown) {
  const value = normalizeTelegramNamePart(input).replace(/^@+/, "").toLowerCase();
  return value || null;
}

function buildTelegramDisplayName(from: Record<string, unknown> | null, chat: Record<string, unknown> | null) {
  const firstName = normalizeTelegramNamePart(from?.first_name);
  const lastName = normalizeTelegramNamePart(from?.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 160);
  if (fullName) return fullName;
  const username = normalizeTelegramUsername(from?.username ?? chat?.username);
  if (username) return `@${username}`;
  const title = normalizeTelegramNamePart(chat?.title);
  return title || null;
}

export function parseTelegramWebhookPayload(payload: unknown) {
  if (!isRecord(payload)) return { ok: false as const, error: "telegram_payload_invalid" };
  const rawUpdateId = payload.update_id;
  if (typeof rawUpdateId !== "number" || !Number.isSafeInteger(rawUpdateId)) {
    return { ok: false as const, error: "telegram_update_id_missing" };
  }
  const message = isRecord(payload.message) ? payload.message : null;
  if (!message) return { ok: false as const, error: "telegram_message_missing" };
  const rawMessageId = message.message_id;
  if (typeof rawMessageId !== "number" && typeof rawMessageId !== "string") {
    return { ok: false as const, error: "telegram_message_id_missing" };
  }
  const chat = isRecord(message.chat) ? message.chat : null;
  const chatId = chat ? valueToString(chat.id) : null;
  if (!chatId) return { ok: false as const, error: "telegram_chat_id_missing" };
  const from = isRecord(message.from) ? message.from : null;
  const fromId = from ? valueToString(from.id) : null;
  const text = normalizeTelegramText(message.text, 4_000);
  const username = normalizeTelegramUsername(from?.username ?? chat?.username);
  return {
    ok: true as const,
    parsed: {
      updateId: rawUpdateId,
      chatId,
      messageId: String(rawMessageId),
      fromId,
      text,
      textPresent: Boolean(text),
      textLength: text?.length ?? 0,
      displayName: buildTelegramDisplayName(from, chat),
      username,
    } satisfies TelegramWebhookParsedPayload,
  };
}

export async function resolveTelegramAccount(params: {
  prisma: PrismaClient;
  tenantOrAlias: string;
}): Promise<ResolvedTelegramAccount | null> {
  const alias = normalizeAlias(params.tenantOrAlias);
  if (!alias) return null;
  const direct = await params.prisma.channelAccount.findFirst({
    where: {
      channel: "telegram",
      provider: "telegram",
      OR: [{ id: params.tenantOrAlias }, { channelAccountId: alias }, { channelAccountId: params.tenantOrAlias }],
    },
    include: {
      client: { select: { id: true, clientKey: true, status: true, features: true } },
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
  });
  if (direct) return { resolution: "matched_channel_account", account: direct };

  const matchedAlias = await params.prisma.channelAccountAlias.findFirst({
    where: {
      alias: { in: [params.tenantOrAlias, alias, `@${alias}`] },
      channelAccount: { channel: "telegram", provider: "telegram" },
    },
    include: {
      channelAccount: {
        include: {
          client: { select: { id: true, clientKey: true, status: true, features: true } },
          secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
        },
      },
    },
  });
  return matchedAlias
    ? { resolution: "matched_alias", account: matchedAlias.channelAccount }
    : null;
}

export function hasConfiguredTelegramToken(account: ResolvedTelegramAccount["account"]) {
  return account.secrets.some(
    (secret) =>
      secret.secretKind === TELEGRAM_SECRET_KIND &&
      secret.status === "configured" &&
      Boolean(secret.secretCiphertext)
  );
}

export function clearTelegramWebhookReplayCache() {
  replayCache.clear();
}

export function markTelegramWebhookReplay(params: {
  accountId: string;
  updateId: number;
  now?: number;
  replayTtlMs?: number;
}) {
  const currentTime = params.now ?? nowMs();
  pruneReplayCache(currentTime);
  const replayKey = `${params.accountId}:${params.updateId}`;
  const replay = replayCache.has(replayKey);
  if (!replay) {
    replayCache.set(replayKey, currentTime + (params.replayTtlMs ?? DEFAULT_REPLAY_TTL_MS));
    pruneReplayCache(currentTime);
  }
  return replay;
}

export async function handleTelegramWebhookShadow(params: {
  prisma: PrismaClient;
  tenantOrAlias: string;
  payload: TelegramShadowPayload;
  now?: number;
  replayTtlMs?: number;
}): Promise<TelegramWebhookShadowResult> {
  const resolved = await resolveTelegramAccount({
    prisma: params.prisma,
    tenantOrAlias: params.tenantOrAlias,
  });
  if (!resolved) {
    return { ok: false, status: 404, error: "telegram_account_not_found", resolution: "not_found" };
  }
  const { account } = resolved;
  if (account.client.status !== "ACTIVE") {
    return { ok: false, status: 403, error: "client_inactive", resolution: resolved.resolution };
  }
  const features = getFeatures(account.client);
  if (!features.telegram || !features.telegramInbound) {
    return { ok: false, status: 403, error: "telegram_feature_disabled", resolution: resolved.resolution };
  }
  if (!account.enabled || !account.runtimeEnabled || !account.inboundPersistenceEnabled) {
    return { ok: false, status: 403, error: "telegram_account_inactive", resolution: resolved.resolution };
  }
  if (!hasConfiguredTelegramToken(account)) {
    return { ok: false, status: 403, error: "telegram_token_missing", resolution: resolved.resolution };
  }

  const parsed = parseTelegramWebhookPayload(params.payload);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error, resolution: resolved.resolution };
  }

  const replay = markTelegramWebhookReplay({
    accountId: account.id,
    updateId: parsed.parsed.updateId,
    now: params.now,
    replayTtlMs: params.replayTtlMs,
  });

  return {
    ok: true,
    replay,
    resolution: resolved.resolution,
    tenantKey: account.client.clientKey,
    clientId: account.clientId,
    channelAccountId: account.channelAccountId,
    parsed: {
      updateId: parsed.parsed.updateId,
      chatId: parsed.parsed.chatId,
      messageId: parsed.parsed.messageId,
      fromId: parsed.parsed.fromId,
      textPresent: parsed.parsed.textPresent,
      textLength: parsed.parsed.textLength,
    },
  };
}
