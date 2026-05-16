import crypto from "node:crypto";
import { ConversationOperationalStatus, HandoffStatus, MessageType } from "@prisma/client";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { canPersistChannelInbound } from "./tenantChannelAccount.js";

export const MESSENGER_OUTBOUND_DISABLED_MESSAGE =
  "Envio por Facebook/Messenger ainda não está habilitado neste canal.";

export type MessengerInboundPersistenceReason =
  | "not_messenger"
  | "account_missing"
  | "channel_disabled"
  | "status_not_connected"
  | "runtime_disabled"
  | "inbound_persistence_disabled"
  | "tenant_missing"
  | "client_missing"
  | "duplicate_message"
  | "persisted";

export type MessengerInboundPersistenceResult = {
  persisted: boolean;
  duplicate?: boolean;
  reason: MessengerInboundPersistenceReason;
  syntheticWaId?: string;
  conversationId?: string;
  runtimeStateId?: string;
  inboundMessageId?: string;
};

type PrismaLike = ReturnType<typeof getPrisma>;

function hashExternalUserId(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}

function sanitizeMessageIdPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
}

export function buildMessengerSyntheticWaId(externalUserHash: string) {
  const normalized = externalUserHash.trim().toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (!normalized) {
    throw new Error("external_user_hash_required");
  }
  return `messenger:${normalized}`;
}

export function buildMessengerInboundMessageId(params: {
  channelAccountId: string;
  externalUserHash: string;
  externalMessageId?: string | null;
  timestamp?: string | null;
}) {
  const mid = params.externalMessageId?.trim();
  if (mid) {
    return `messenger:${sanitizeMessageIdPart(params.channelAccountId)}:${sanitizeMessageIdPart(mid)}`;
  }
  const fallback = crypto
    .createHash("sha256")
    .update(`${params.channelAccountId}:${params.externalUserHash}:${params.timestamp ?? ""}`)
    .digest("hex")
    .slice(0, 24);
  return `messenger:${sanitizeMessageIdPart(params.channelAccountId)}:${fallback}`;
}

export function resolveMessengerInboundPersistenceGate(
  account?: TenantChannelAccount | null
): { allowed: boolean; reason: MessengerInboundPersistenceReason } {
  if (!account) return { allowed: false, reason: "account_missing" };
  if (!account.enabled) return { allowed: false, reason: "channel_disabled" };
  if (account.status !== "connected") return { allowed: false, reason: "status_not_connected" };
  if (account.runtimeEnabled !== true) return { allowed: false, reason: "runtime_disabled" };
  if (account.inboundPersistenceEnabled !== true) {
    return { allowed: false, reason: "inbound_persistence_disabled" };
  }
  return { allowed: canPersistChannelInbound(account), reason: "persisted" };
}

function logPersistence(params: {
  event: "messenger.inbound_persistence.blocked" | "messenger.inbound_persistence.persisted";
  requestId: string;
  tenantKey: string | null;
  channelAccountId: string | null;
  externalMessageId?: string | null;
  externalUserHash?: string | null;
  reason?: string;
  duplicate?: boolean;
}) {
  logger.info({
    event: params.event,
    requestId: params.requestId,
    tenantKey: params.tenantKey,
    channel: "messenger",
    provider: "meta",
    channelAccountId: params.channelAccountId,
    externalMessageId: params.externalMessageId ?? null,
    externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    reason: params.reason,
    duplicate: params.duplicate,
    passive: false,
    outboundEnabled: false,
  });
}

export async function persistMessengerInboundEvent(params: {
  prisma?: PrismaLike;
  event: NormalizedInboundEvent;
  tenantKey: string;
  account?: TenantChannelAccount | null;
  requestId: string;
}): Promise<MessengerInboundPersistenceResult> {
  const { event, tenantKey, requestId } = params;
  if (event.channel !== "messenger" || event.provider !== "meta") {
    return { persisted: false, reason: "not_messenger" };
  }

  const externalUserHash = hashExternalUserId(event.externalUserId);
  const gate = resolveMessengerInboundPersistenceGate(params.account);
  if (!gate.allowed) {
    logPersistence({
      event: "messenger.inbound_persistence.blocked",
      requestId,
      tenantKey,
      channelAccountId: event.channelAccountId,
      externalMessageId: event.externalMessageId,
      externalUserHash,
      reason: gate.reason,
    });
    return { persisted: false, reason: gate.reason };
  }

  const prisma = params.prisma ?? getPrisma();
  const client = await prisma.client.findUnique({
    where: { clientKey: tenantKey },
    select: { id: true, clientKey: true, status: true },
  });
  if (!client) {
    logPersistence({
      event: "messenger.inbound_persistence.blocked",
      requestId,
      tenantKey,
      channelAccountId: event.channelAccountId,
      externalMessageId: event.externalMessageId,
      externalUserHash,
      reason: "client_missing",
    });
    return { persisted: false, reason: "client_missing" };
  }

  const syntheticWaId = buildMessengerSyntheticWaId(externalUserHash);
  const messageId = buildMessengerInboundMessageId({
    channelAccountId: event.channelAccountId,
    externalUserHash,
    externalMessageId: event.externalMessageId,
    timestamp: event.timestamp,
  });
  const createdAt = normalizeDate(event.timestamp);
  const channelFields = {
    channel: "messenger",
    provider: "meta",
    channelAccountId: event.channelAccountId,
    externalUserHash,
    externalUserRef: null,
    legacyWaId: null,
  };

  const duplicate = await prisma.inboundMessage.findUnique({
    where: { clientId_messageId: { clientId: client.id, messageId } },
    select: { id: true },
  });
  if (duplicate) {
    logPersistence({
      event: "messenger.inbound_persistence.blocked",
      requestId,
      tenantKey,
      channelAccountId: event.channelAccountId,
      externalMessageId: event.externalMessageId,
      externalUserHash,
      reason: "duplicate_message",
      duplicate: true,
    });
    return {
      persisted: false,
      duplicate: true,
      reason: "duplicate_message",
      syntheticWaId,
      inboundMessageId: duplicate.id,
    };
  }

  const [conversation, runtimeState, inbound] = await Promise.all([
    prisma.conversation.upsert({
      where: { clientId_waId: { clientId: client.id, waId: syntheticWaId } },
      create: {
        clientId: client.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        phoneNumberId: null,
        ...channelFields,
        windowIsOpen: true,
        lastInboundAt: createdAt,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: createdAt,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true },
    }),
    prisma.conversationRuntimeState.upsert({
      where: { clientId_waId: { clientId: client.id, waId: syntheticWaId } },
      create: {
        clientId: client.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        conversationKey: `${tenantKey}:messenger:${event.channelAccountId}:${externalUserHash}`,
        ...channelFields,
        firstSeenAt: createdAt,
        windowIsOpen: true,
        lastInboundAt: createdAt,
        lastInboundMessageId: messageId,
        handoffStatus: HandoffStatus.NONE,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: createdAt,
        lastInboundMessageId: messageId,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        closedAt: null,
      },
      select: { id: true },
    }),
    prisma.inboundMessage.create({
      data: {
        clientId: client.id,
        phoneNumberId: null,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        ...channelFields,
        externalMessageId: event.externalMessageId ?? null,
        type: event.text ? MessageType.TEXT : MessageType.UNKNOWN,
        bodyText: event.text ?? null,
        allowlistHit: false,
        requestId,
        createdAt,
      },
      select: { id: true },
    }),
    prisma.contact.upsert({
      where: { clientId_waId: { clientId: client.id, waId: syntheticWaId } },
      create: {
        clientId: client.id,
        waId: syntheticWaId,
        name: null,
        ...channelFields,
      },
      update: {
        ...channelFields,
      },
      select: { id: true },
    }),
    prisma.lead.upsert({
      where: { tenantId_waId: { tenantId: client.id, waId: syntheticWaId } },
      create: {
        tenantId: client.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        name: "Contato Facebook/Messenger",
        phone: null,
        status: "NEW",
        ...channelFields,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
      },
      select: { id: true },
    }),
  ]);

  logPersistence({
    event: "messenger.inbound_persistence.persisted",
    requestId,
    tenantKey,
    channelAccountId: event.channelAccountId,
    externalMessageId: event.externalMessageId,
    externalUserHash,
    reason: "persisted",
  });

  return {
    persisted: true,
    reason: "persisted",
    syntheticWaId,
    conversationId: conversation.id,
    runtimeStateId: runtimeState.id,
    inboundMessageId: inbound.id,
  };
}
