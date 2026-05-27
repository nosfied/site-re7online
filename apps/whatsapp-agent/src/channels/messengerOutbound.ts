import crypto from "node:crypto";
import { MessageStatus, MessageType, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { canSendMessengerOutbound } from "./tenantChannelAccount.js";

const GRAPH_API_VERSION = "v23.0";
const EXTERNAL_REF_PREFIX = "enc:v1:";

type PrismaLike = ReturnType<typeof getPrisma>;

export type MessengerOutboundGate =
  | { allowed: true; token: string }
  | {
      allowed: false;
      reason:
        | "account_missing"
        | "channel_disabled"
        | "status_not_connected"
        | "runtime_disabled"
        | "inbound_persistence_disabled"
        | "outbound_disabled"
        | "token_missing";
    };

function getSecret() {
  return env.META_APP_SECRET || process.env.META_APP_SECRET || "";
}

function getCipherKey(secret = getSecret()) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptMessengerExternalUserRef(externalUserId: string, secret = getSecret()) {
  const value = externalUserId.trim();
  if (!value || !secret) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCipherKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${EXTERNAL_REF_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptMessengerExternalUserRef(externalUserRef: string | null | undefined, secret = getSecret()) {
  const raw = externalUserRef?.trim();
  if (!raw || !raw.startsWith(EXTERNAL_REF_PREFIX) || !secret) return null;
  const parts = raw.slice(EXTERNAL_REF_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getCipherKey(secret),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return decrypted.trim() || null;
  } catch {
    return null;
  }
}

export function resolveMessengerOutboundGate(account?: TenantChannelAccount | null): MessengerOutboundGate {
  if (!account) return { allowed: false, reason: "account_missing" };
  if (!account.enabled) return { allowed: false, reason: "channel_disabled" };
  if (account.status !== "connected") return { allowed: false, reason: "status_not_connected" };
  if (account.runtimeEnabled !== true) return { allowed: false, reason: "runtime_disabled" };
  if (account.inboundPersistenceEnabled !== true) {
    return { allowed: false, reason: "inbound_persistence_disabled" };
  }
  if (account.outboundEnabled !== true) return { allowed: false, reason: "outbound_disabled" };
  if (!account.pageAccessToken || account.tokenStatus !== "configured") {
    return { allowed: false, reason: "token_missing" };
  }
  if (!canSendMessengerOutbound(account)) return { allowed: false, reason: "outbound_disabled" };
  return { allowed: true, token: account.pageAccessToken };
}

export async function sendMessengerTextMessage(params: {
  pageAccessToken: string;
  recipientPsid: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; status: number; messageId: string | null }
  | { ok: false; status: number; errorBody: string | null }
> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.pageAccessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: params.recipientPsid },
      message: { text: params.text },
    }),
  });
  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorBody: bodyText.slice(0, 2000) || null,
    };
  }
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  const messageId =
    parsed && typeof parsed === "object" && "message_id" in parsed
      ? String((parsed as { message_id?: unknown }).message_id ?? "").trim() || null
      : null;
  return { ok: true, status: response.status, messageId };
}

export async function persistMessengerOutboundMessage(params: {
  prisma?: PrismaLike;
  clientId: string;
  waId: string;
  waIdCanonical?: string | null;
  channelAccountId: string;
  externalUserHash: string;
  externalUserRef: string | null;
  messageId: string;
  status: MessageStatus;
  text: string;
  requestId: string;
  metaMessageId?: string | null;
  errorBody?: string | null;
}) {
  const prisma = params.prisma ?? getPrisma();
  return prisma.outboundMessage.upsert({
    where: {
      clientId_messageId: {
        clientId: params.clientId,
        messageId: params.messageId,
      },
    },
    create: {
      clientId: params.clientId,
      phoneNumberId: null,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? params.waId,
      messageId: params.messageId,
      channel: "messenger",
      provider: "meta",
      channelAccountId: params.channelAccountId,
      externalUserHash: params.externalUserHash,
      externalUserRef: params.externalUserRef,
      externalMessageId: params.metaMessageId ?? null,
      legacyWaId: null,
      type: MessageType.TEXT,
      status: params.status,
      bodyText: params.text,
      requestId: params.requestId,
      metaMessageId: params.metaMessageId ?? null,
      errorBody: params.errorBody ?? null,
      rawPayload: {
        source: "app_inbox_messenger",
        status: params.status,
      } satisfies Prisma.InputJsonValue,
    },
    update: {
      status: params.status,
      bodyText: params.text,
      externalMessageId: params.metaMessageId ?? null,
      metaMessageId: params.metaMessageId ?? null,
      errorBody: params.errorBody ?? null,
      rawPayload: {
        source: "app_inbox_messenger",
        status: params.status,
      } satisfies Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export function logMessengerOutbound(params: {
  event: "messenger.outbound.sent" | "messenger.outbound.failed" | "messenger.outbound.blocked";
  tenantKey: string;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  requestId: string;
  reason?: string;
  status?: number | null;
}) {
  logger.info({
    event: params.event,
    tenantKey: params.tenantKey,
    channel: "messenger",
    provider: "meta",
    channelAccountId: params.channelAccountId ?? null,
    externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    requestId: params.requestId,
    reason: params.reason,
    status: params.status ?? null,
  });
}
