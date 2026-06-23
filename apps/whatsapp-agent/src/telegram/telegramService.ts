import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

const TELEGRAM_SECRET_KIND = "telegramBotToken";
const MAX_NAME_LENGTH = 160;
const MAX_USERNAME_LENGTH = 80;
const MAX_ID_LENGTH = 120;

type JsonInput = Record<string, unknown>;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

function normalizeBoolean(input: unknown, fallback = false) {
  return typeof input === "boolean" ? input : fallback;
}

function normalizeAccountStatus(input: unknown) {
  return input === "connected" || input === "disabled" || input === "error" ? input : "pending";
}

function normalizeBotUsername(input: unknown) {
  const value = normalizeText(input, MAX_USERNAME_LENGTH).replace(/^@+/, "");
  return value ? value.toLowerCase() : null;
}

function normalizeTelegramId(input: unknown) {
  const value = normalizeText(input, MAX_ID_LENGTH);
  return value || null;
}

function buildChannelAccountId(input: JsonInput) {
  return normalizeTelegramId(input.channelAccountId) || normalizeTelegramId(input.botId) || normalizeBotUsername(input.botUsername);
}

function secretHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function getEncryptionKey() {
  const value = process.env.CHANNEL_ACCOUNT_SECRET_KEY?.trim();
  if (!value) return null;
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function encryptSecret(value: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function buildMetadata(input: JsonInput, existing?: unknown): Prisma.InputJsonObject {
  const botUsername = normalizeBotUsername(input.botUsername);
  const botId = normalizeTelegramId(input.botId);
  return {
    ...metadataObject(existing),
    ...(botUsername ? { botUsername } : {}),
    ...(botId ? { botId } : {}),
    webhookStatus: normalizeText(input.webhookStatus, 40) || "not_configured",
    source: "telegram_settings",
  } as Prisma.InputJsonObject;
}

function buildAliases(params: { botUsername: string | null; botId: string | null; channelAccountId: string }) {
  const aliases: Array<{ alias: string; aliasType: string }> = [];
  const seen = new Set<string>();
  const push = (alias: string | null, aliasType: string) => {
    if (!alias || seen.has(alias)) return;
    seen.add(alias);
    aliases.push({ alias, aliasType });
  };
  push(params.botUsername, "botUsername");
  push(params.botUsername ? `@${params.botUsername}` : null, "botUsername");
  push(params.botId, "botId");
  push(params.channelAccountId, "channelAccountId");
  return aliases;
}

function serializeTelegramAccount(account: {
  id: string;
  displayName: string | null;
  channelAccountId: string;
  metadata: Prisma.JsonValue | null;
  enabled: boolean;
  automationEnabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: string;
  tokenStatus: string;
  createdAt: Date;
  updatedAt: Date;
  secrets?: Array<{ secretKind: string; status: string; secretCiphertext: string | null }>;
  aliases?: Array<{ alias: string; aliasType: string }>;
}) {
  const metadata = metadataObject(account.metadata);
  const tokenSecret = account.secrets?.find((secret) => secret.secretKind === TELEGRAM_SECRET_KIND);
  const tokenConfigured = Boolean(tokenSecret?.secretCiphertext && tokenSecret.status === "configured");
  return {
    id: account.id,
    displayName: account.displayName,
    channel: "telegram",
    provider: "telegram",
    channelAccountId: account.channelAccountId,
    botUsername: typeof metadata.botUsername === "string" ? metadata.botUsername : null,
    botId: typeof metadata.botId === "string" ? metadata.botId : null,
    webhookStatus: typeof metadata.webhookStatus === "string" ? metadata.webhookStatus : "not_configured",
    tokenConfigured,
    tokenStatus: tokenConfigured ? "configured" : account.tokenStatus,
    enabled: account.enabled,
    automationEnabled: account.automationEnabled,
    runtimeEnabled: account.runtimeEnabled,
    inboundPersistenceEnabled: account.inboundPersistenceEnabled,
    outboundEnabled: account.outboundEnabled,
    aiEnabled: account.aiEnabled,
    handoffEnabled: account.handoffEnabled,
    status: account.status,
    aliases: account.aliases?.map((alias) => ({ alias: alias.alias, aliasType: alias.aliasType })) ?? [],
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

async function writeAliases(params: {
  prisma: PrismaClient;
  accountId: string;
  aliases: Array<{ alias: string; aliasType: string }>;
}) {
  await params.prisma.channelAccountAlias.deleteMany({ where: { channelAccountId: params.accountId } });
  for (const alias of params.aliases) {
    await params.prisma.channelAccountAlias.create({
      data: {
        channelAccountId: params.accountId,
        alias: alias.alias,
        aliasType: alias.aliasType,
      },
    });
  }
}

async function upsertTelegramToken(params: {
  prisma: PrismaClient;
  accountId: string;
  token: string;
}) {
  const token = params.token.trim();
  if (!token) return false;
  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) throw new Error("channel_account_secret_key_missing");
  const encrypted = encryptSecret(token, encryptionKey);
  await params.prisma.channelAccountSecret.upsert({
    where: {
      channelAccountId_secretKind: {
        channelAccountId: params.accountId,
        secretKind: TELEGRAM_SECRET_KIND,
      },
    },
    create: {
      channelAccountId: params.accountId,
      secretKind: TELEGRAM_SECRET_KIND,
      secretHash: secretHash(token),
      secretCiphertext: encrypted,
      encryptionKeyRef: "CHANNEL_ACCOUNT_SECRET_KEY",
      status: "configured",
    },
    update: {
      secretHash: secretHash(token),
      secretCiphertext: encrypted,
      encryptionKeyRef: "CHANNEL_ACCOUNT_SECRET_KEY",
      status: "configured",
    },
  });
  return true;
}

function buildAccountData(input: JsonInput, existingMetadata?: unknown) {
  const displayName = normalizeText(input.displayName ?? input.name, MAX_NAME_LENGTH);
  if (!displayName) return { ok: false as const, error: "telegram_display_name_required" };
  const channelAccountId = buildChannelAccountId(input);
  if (!channelAccountId) return { ok: false as const, error: "telegram_account_id_required" };
  const botUsername = normalizeBotUsername(input.botUsername);
  const botId = normalizeTelegramId(input.botId);
  return {
    ok: true as const,
    data: {
      displayName,
      channelAccountId,
      botUsername,
      botId,
      metadata: buildMetadata(input, existingMetadata),
      enabled: normalizeBoolean(input.enabled, false),
      automationEnabled: false,
      runtimeEnabled: normalizeBoolean(input.runtimeEnabled, false),
      inboundPersistenceEnabled: normalizeBoolean(input.inboundPersistenceEnabled, false),
      outboundEnabled: normalizeBoolean(input.outboundEnabled, false),
      aiEnabled: false,
      handoffEnabled: normalizeBoolean(input.handoffEnabled, true),
      status: normalizeAccountStatus(input.status),
    },
  };
}

export async function listTelegramAccounts(params: { prisma: PrismaClient; clientId: string }) {
  const accounts = await params.prisma.channelAccount.findMany({
    where: { clientId: params.clientId, channel: "telegram", provider: "telegram" },
    include: {
      aliases: { orderBy: [{ aliasType: "asc" }, { alias: "asc" }] },
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
    orderBy: [{ enabled: "desc" }, { displayName: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return {
    accounts: accounts.map(serializeTelegramAccount),
    diagnostics: {
      runtimeImplemented: false,
      webhookImplemented: false,
      botApiCallsEnabled: false,
      webhookStatus: "placeholder",
    },
  };
}

export async function createTelegramAccount(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildAccountData(params.input);
  if (!normalized.ok) return normalized;
  const token = normalizeOptionalText(params.input.token, 4096);
  const tokenStatus = token ? "configured" : "missing";
  const account = await params.prisma.channelAccount.create({
    data: {
      clientId: params.clientId,
      channel: "telegram",
      provider: "telegram",
      displayName: normalized.data.displayName,
      channelAccountId: normalized.data.channelAccountId,
      externalAccountIds: Prisma.JsonNull,
      externalBusinessId: null,
      metadata: normalized.data.metadata,
      enabled: normalized.data.enabled,
      automationEnabled: false,
      runtimeEnabled: normalized.data.runtimeEnabled,
      inboundPersistenceEnabled: normalized.data.inboundPersistenceEnabled,
      outboundEnabled: normalized.data.outboundEnabled,
      aiEnabled: false,
      handoffEnabled: normalized.data.handoffEnabled,
      status: normalized.data.status,
      tokenStatus,
    },
  });
  await writeAliases({
    prisma: params.prisma,
    accountId: account.id,
    aliases: buildAliases({
      botUsername: normalized.data.botUsername,
      botId: normalized.data.botId,
      channelAccountId: normalized.data.channelAccountId,
    }),
  });
  if (token) {
    await upsertTelegramToken({ prisma: params.prisma, accountId: account.id, token });
  }
  const saved = await params.prisma.channelAccount.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      aliases: { orderBy: [{ aliasType: "asc" }, { alias: "asc" }] },
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
  });
  return { ok: true as const, account: serializeTelegramAccount(saved) };
}

export async function updateTelegramAccount(params: {
  prisma: PrismaClient;
  clientId: string;
  accountId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.channelAccount.findFirst({
    where: { id: params.accountId, clientId: params.clientId, channel: "telegram", provider: "telegram" },
    include: { secrets: { select: { secretKind: true, status: true, secretCiphertext: true } } },
  });
  if (!existing) return { ok: false as const, error: "telegram_account_not_found" };
  const normalized = buildAccountData(params.input, existing.metadata);
  if (!normalized.ok) return normalized;
  const tokenConfigured = existing.secrets.some(
    (secret) => secret.secretKind === TELEGRAM_SECRET_KIND && secret.status === "configured" && secret.secretCiphertext
  );
  const account = await params.prisma.channelAccount.update({
    where: { id: existing.id },
    data: {
      displayName: normalized.data.displayName,
      channelAccountId: normalized.data.channelAccountId,
      metadata: normalized.data.metadata,
      enabled: normalized.data.enabled,
      automationEnabled: false,
      runtimeEnabled: normalized.data.runtimeEnabled,
      inboundPersistenceEnabled: normalized.data.inboundPersistenceEnabled,
      outboundEnabled: normalized.data.outboundEnabled,
      aiEnabled: false,
      handoffEnabled: normalized.data.handoffEnabled,
      status: normalized.data.status,
      tokenStatus: tokenConfigured ? "configured" : "missing",
    },
  });
  await writeAliases({
    prisma: params.prisma,
    accountId: account.id,
    aliases: buildAliases({
      botUsername: normalized.data.botUsername,
      botId: normalized.data.botId,
      channelAccountId: normalized.data.channelAccountId,
    }),
  });
  const saved = await params.prisma.channelAccount.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      aliases: { orderBy: [{ aliasType: "asc" }, { alias: "asc" }] },
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
  });
  return { ok: true as const, account: serializeTelegramAccount(saved) };
}

export async function rotateTelegramToken(params: {
  prisma: PrismaClient;
  clientId: string;
  accountId: string;
  input: JsonInput;
}) {
  const token = normalizeOptionalText(params.input.token, 4096);
  if (!token) return { ok: false as const, error: "telegram_token_required" };
  const account = await params.prisma.channelAccount.findFirst({
    where: { id: params.accountId, clientId: params.clientId, channel: "telegram", provider: "telegram" },
    select: { id: true, metadata: true },
  });
  if (!account) return { ok: false as const, error: "telegram_account_not_found" };
  await upsertTelegramToken({ prisma: params.prisma, accountId: account.id, token });
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      tokenStatus: "configured",
      metadata: {
        ...metadataObject(account.metadata),
        tokenRotatedAt: new Date().toISOString(),
        source: "telegram_settings",
      } as Prisma.InputJsonObject,
    },
  });
  const saved = await params.prisma.channelAccount.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      aliases: { orderBy: [{ aliasType: "asc" }, { alias: "asc" }] },
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
  });
  return { ok: true as const, account: serializeTelegramAccount(saved) };
}

export async function getTelegramDiagnostics(params: {
  prisma: PrismaClient;
  clientId: string;
  accountId: string;
}) {
  const account = await params.prisma.channelAccount.findFirst({
    where: { id: params.accountId, clientId: params.clientId, channel: "telegram", provider: "telegram" },
    include: {
      aliases: true,
      secrets: { select: { secretKind: true, status: true, secretCiphertext: true } },
    },
  });
  if (!account) return { ok: false as const, error: "telegram_account_not_found" };
  return {
    ok: true as const,
    diagnostics: {
      account: serializeTelegramAccount(account),
      webhookImplemented: false,
      botApiCallsEnabled: false,
      runtimeImplemented: false,
      message: "Telegram settings are configured locally. Webhook, Bot API and messaging runtime are not implemented in Sprint 74C.",
    },
  };
}
