import crypto from "node:crypto";
import { ConversationOperationalStatus, HandoffStatus, MessageType } from "@prisma/client";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import { encryptMessengerExternalUserRef } from "./messengerOutbound.js";
import { canPersistChannelInbound } from "./tenantChannelAccount.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { env } from "../config/env.js";

export const INSTAGRAM_OUTBOUND_DISABLED_MESSAGE =
  "Envio por Instagram ainda não está habilitado neste canal.";

export type InstagramInboundPersistenceReason =
  | "not_instagram"
  | "account_missing"
  | "channel_disabled"
  | "status_not_connected"
  | "runtime_disabled"
  | "inbound_persistence_disabled"
  | "tenant_missing"
  | "client_missing"
  | "outbound_echo"
  | "duplicate_message"
  | "persisted";

export type InstagramInboundPersistenceResult = {
  persisted: boolean;
  duplicate?: boolean;
  reason: InstagramInboundPersistenceReason;
  syntheticWaId?: string;
  conversationId?: string;
  runtimeStateId?: string;
  inboundMessageId?: string;
};

type PrismaLike = ReturnType<typeof getPrisma>;

export type InstagramUserProfile = {
  displayName: string | null;
};

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

function normalizeInstagramProfileName(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  const data = profile as { name?: unknown; username?: unknown };
  const name = typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  if (name) return name;
  const username =
    typeof data.username === "string" ? data.username.trim().replace(/^@+/, "").replace(/\s+/g, "").slice(0, 120) : "";
  return username ? `@${username}` : null;
}

export async function fetchInstagramUserProfile(params: {
  instagramBusinessAccessToken?: string | null;
  externalUserId: string;
  fetchImpl?: typeof fetch;
}): Promise<InstagramUserProfile> {
  const token = params.instagramBusinessAccessToken?.trim();
  const externalUserId = params.externalUserId.trim();
  if (!token || !externalUserId) return { displayName: null };
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = new URL(`https://graph.instagram.com/${env.WHATSAPP_API_VERSION}/${encodeURIComponent(externalUserId)}`);
  url.searchParams.set("fields", "name,username");
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return { displayName: null };
    const profile = await response.json().catch(() => null);
    return { displayName: normalizeInstagramProfileName(profile) };
  } catch {
    return { displayName: null };
  }
}

export function buildInstagramSyntheticWaId(externalUserHash: string) {
  const normalized = externalUserHash.trim().toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (!normalized) {
    throw new Error("external_user_hash_required");
  }
  return `instagram:${normalized}`;
}

export function buildInstagramInboundMessageId(params: {
  channelAccountId: string;
  externalUserHash: string;
  externalMessageId?: string | null;
  timestamp?: string | null;
}) {
  const mid = params.externalMessageId?.trim();
  if (mid) {
    return `instagram:${sanitizeMessageIdPart(params.channelAccountId)}:${sanitizeMessageIdPart(mid)}`;
  }
  const fallback = crypto
    .createHash("sha256")
    .update(`${params.channelAccountId}:${params.externalUserHash}:${params.timestamp ?? ""}`)
    .digest("hex")
    .slice(0, 24);
  return `instagram:${sanitizeMessageIdPart(params.channelAccountId)}:${fallback}`;
}

export function resolveInstagramInboundPersistenceGate(
  account?: TenantChannelAccount | null
): { allowed: boolean; reason: InstagramInboundPersistenceReason } {
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
  event: "instagram.inbound_persistence.blocked" | "instagram.inbound_persistence.persisted";
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
    channel: "instagram",
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

export async function persistInstagramInboundEvent(params: {
  prisma?: PrismaLike;
  event: NormalizedInboundEvent;
  tenantKey: string;
  account?: TenantChannelAccount | null;
  requestId: string;
  fetchImpl?: typeof fetch;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
}): Promise<InstagramInboundPersistenceResult> {
  const { event, tenantKey, requestId } = params;
  if (event.channel !== "instagram" || event.provider !== "meta") {
    return { persisted: false, reason: "not_instagram" };
  }

  const externalUserHash = hashExternalUserId(event.externalUserId);
  const gate = resolveInstagramInboundPersistenceGate(params.account);
  if (!gate.allowed) {
    logPersistence({
      event: "instagram.inbound_persistence.blocked",
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
      event: "instagram.inbound_persistence.blocked",
      requestId,
      tenantKey,
      channelAccountId: event.channelAccountId,
      externalMessageId: event.externalMessageId,
      externalUserHash,
      reason: "client_missing",
    });
    return { persisted: false, reason: "client_missing" };
  }

  const syntheticWaId = buildInstagramSyntheticWaId(externalUserHash);
  const messageId = buildInstagramInboundMessageId({
    channelAccountId: event.channelAccountId,
    externalUserHash,
    externalMessageId: event.externalMessageId,
    timestamp: event.timestamp,
  });
  const createdAt = normalizeDate(event.timestamp);
  if (event.externalMessageId) {
    const outboundEcho = await prisma.outboundMessage.findFirst({
      where: {
        clientId: client.id,
        channel: "instagram",
        OR: [{ metaMessageId: event.externalMessageId }, { externalMessageId: event.externalMessageId }],
      },
      select: { id: true },
    });
    if (outboundEcho) {
      logPersistence({
        event: "instagram.inbound_persistence.blocked",
        requestId,
        tenantKey,
        channelAccountId: event.channelAccountId,
        externalMessageId: event.externalMessageId,
        externalUserHash,
        reason: "outbound_echo",
      });
      return {
        persisted: false,
        reason: "outbound_echo",
        syntheticWaId,
        inboundMessageId: outboundEcho.id,
      };
    }
  }
  const channelFields = {
    channel: "instagram",
    provider: "meta",
    channelAccountId: event.channelAccountId,
    externalUserHash,
    externalUserRef: encryptMessengerExternalUserRef(event.externalUserId),
    legacyWaId: null,
  };
  const profile = await fetchInstagramUserProfile({
    instagramBusinessAccessToken: params.account?.instagramBusinessAccessToken,
    externalUserId: event.externalUserId,
    fetchImpl: params.fetchImpl,
  });
  const displayName = profile.displayName;

  const duplicate = await prisma.inboundMessage.findUnique({
    where: { clientId_messageId: { clientId: client.id, messageId } },
    select: { id: true },
  });
  if (duplicate) {
    logPersistence({
      event: "instagram.inbound_persistence.blocked",
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

  const defaults = await ensureDefaultOperationalDepartmentAndQueue(prisma, client.id);
  const operationalRoute = {
    departmentId: defaults.department.id,
    queueId: defaults.queue.id,
  };

  const [conversation, runtimeState, inbound] = await Promise.all([
    prisma.conversation.upsert({
      where: { clientId_waId: { clientId: client.id, waId: syntheticWaId } },
      create: {
        clientId: client.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        phoneNumberId: null,
        ...channelFields,
        departmentId: operationalRoute.departmentId,
        windowIsOpen: true,
        lastInboundAt: createdAt,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        departmentId: operationalRoute.departmentId,
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
        conversationKey: `${tenantKey}:instagram:${event.channelAccountId}:${externalUserHash}`,
        ...channelFields,
        firstSeenAt: createdAt,
        windowIsOpen: true,
        lastInboundAt: createdAt,
        lastInboundMessageId: messageId,
        handoffStatus: HandoffStatus.NONE,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: operationalRoute.departmentId,
        queueId: operationalRoute.queueId,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: createdAt,
        lastInboundMessageId: messageId,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: operationalRoute.departmentId,
        queueId: operationalRoute.queueId,
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
        name: displayName ?? "Contato Instagram",
        ...channelFields,
      },
      update: {
        ...channelFields,
        ...(displayName ? { name: displayName } : {}),
      },
      select: { id: true },
    }),
    prisma.lead.upsert({
      where: { tenantId_waId: { tenantId: client.id, waId: syntheticWaId } },
      create: {
        tenantId: client.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        name: displayName ?? "Contato Instagram",
        phone: null,
        status: "NEW",
        ...channelFields,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        ...(displayName ? { name: displayName } : {}),
      },
      select: { id: true },
    }),
  ]);

  logPersistence({
    event: "instagram.inbound_persistence.persisted",
    requestId,
    tenantKey,
    channelAccountId: event.channelAccountId,
    externalMessageId: event.externalMessageId,
    externalUserHash,
    reason: "persisted",
  });

  const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
  publish({
    type: "message.created",
    clientId: client.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    mode: "HUMAN",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: operationalRoute.departmentId,
    message: {
      direction: "INBOUND",
      type: event.text ? MessageType.TEXT : MessageType.UNKNOWN,
      status: "RECEIVED",
      intent: null,
      bodyText: event.text ?? null,
      media: undefined,
      templateName: null,
      templateLang: null,
      requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: createdAt.toISOString(),
    },
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
