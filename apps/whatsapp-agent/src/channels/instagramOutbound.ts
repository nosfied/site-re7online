import { MessageStatus, MessageType, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { canSendInstagramOutbound } from "./tenantChannelAccount.js";

const GRAPH_INSTAGRAM_BASE_URL = "https://graph.instagram.com";

type PrismaLike = ReturnType<typeof getPrisma>;

export type InstagramOutboundGate =
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

export function resolveInstagramOutboundGate(account?: TenantChannelAccount | null): InstagramOutboundGate {
  if (!account) return { allowed: false, reason: "account_missing" };
  if (account.channel !== "instagram" || !account.enabled) {
    return { allowed: false, reason: "channel_disabled" };
  }
  if (account.status !== "connected") return { allowed: false, reason: "status_not_connected" };
  if (account.runtimeEnabled !== true) return { allowed: false, reason: "runtime_disabled" };
  if (account.inboundPersistenceEnabled !== true) {
    return { allowed: false, reason: "inbound_persistence_disabled" };
  }
  if (account.outboundEnabled !== true) return { allowed: false, reason: "outbound_disabled" };
  if (!account.instagramBusinessAccessToken || account.tokenStatus !== "configured") {
    return { allowed: false, reason: "token_missing" };
  }
  if (!canSendInstagramOutbound(account)) return { allowed: false, reason: "outbound_disabled" };
  return { allowed: true, token: account.instagramBusinessAccessToken };
}

export async function sendInstagramTextMessage(params: {
  instagramBusinessAccessToken: string;
  recipientId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; status: number; messageId: string | null }
  | { ok: false; status: number; errorBody: string | null }
> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(`${GRAPH_INSTAGRAM_BASE_URL}/${env.WHATSAPP_API_VERSION}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.instagramBusinessAccessToken}`,
    },
    body: JSON.stringify({
      messaging_type: "RESPONSE",
      recipient: { id: params.recipientId },
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

export async function persistInstagramOutboundMessage(params: {
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
      channel: "instagram",
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
        source: "app_inbox_instagram",
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
        source: "app_inbox_instagram",
        status: params.status,
      } satisfies Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export function logInstagramOutbound(params: {
  event: "instagram.outbound.attempt" | "instagram.outbound.sent" | "instagram.outbound.failed" | "instagram.outbound.blocked";
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
    channel: "instagram",
    provider: "meta",
    channelAccountId: params.channelAccountId ?? null,
    externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    requestId: params.requestId,
    reason: params.reason,
    status: params.status ?? null,
  });
}
