import crypto from "node:crypto";
import { ConversationOperationalStatus, HandoffStatus, MessageType } from "@prisma/client";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";
import { canPersistChannelInbound } from "./tenantChannelAccount.js";
import { encryptMessengerExternalUserRef } from "./messengerOutbound.js";
import { channelLatencyNow, type ChannelLatencyProfiler } from "./channelLatencyProfiler.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { resolveMetaContactDisplayName, upsertMetaContactIdentity } from "./metaContactProfile.js";
import { guardAgainstAnonymizedIdentityRehydration } from "../privacy/anonymizedIdentityGuard.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { CONTACT_LIFECYCLE_ACTIVE } from "../contacts/contactLifecycle.js";
import { reactivateOperationallyExcludedContactIfNeeded } from "../contacts/contactOperationalExclusion.js";
import { recordCrmConversationContactOrigin } from "../crm/crmContactUpsert.js";

export const MESSENGER_OUTBOUND_DISABLED_MESSAGE =
  "Envio por Facebook/Messenger ainda não está habilitado neste canal.";
const GRAPH_API_VERSION = "v23.0";

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
  | "anonymized_identity"
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

export type MessengerUserProfile = {
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

function normalizeMessengerProfileName(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  const data = profile as { first_name?: unknown; last_name?: unknown; name?: unknown };
  const fromParts = [data.first_name, data.last_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (fromParts) return fromParts;
  return typeof data.name === "string"
    ? data.name.trim().replace(/\s+/g, " ").slice(0, 120) || null
    : null;
}

export async function fetchMessengerUserProfile(params: {
  pageAccessToken?: string | null;
  externalUserId: string;
  fetchImpl?: typeof fetch;
}): Promise<MessengerUserProfile> {
  const token = params.pageAccessToken?.trim();
  const externalUserId = params.externalUserId.trim();
  if (!token || !externalUserId) return { displayName: null };
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(externalUserId)}`);
  url.searchParams.set("fields", "first_name,last_name,name");
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return { displayName: null };
    const profile = await response.json().catch(() => null);
    return { displayName: normalizeMessengerProfileName(profile) };
  } catch {
    return { displayName: null };
  }
}

export async function persistMessengerInboundEvent(params: {
  prisma?: PrismaLike;
  event: NormalizedInboundEvent;
  tenantKey: string;
  account?: TenantChannelAccount | null;
  requestId: string;
  fetchImpl?: typeof fetch;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
  latencyProfiler?: ChannelLatencyProfiler;
}): Promise<MessengerInboundPersistenceResult> {
  const { event, tenantKey, requestId } = params;
  const latency = params.latencyProfiler;
  const persistenceStartedAt = channelLatencyNow();
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
  const clientLookupStartedAt = channelLatencyNow();
  const client = await prisma.client.findUnique({
    where: { clientKey: tenantKey },
    select: { id: true, clientKey: true, status: true },
  });
  latency?.duration("clientLookup", clientLookupStartedAt);
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
    externalUserRef: encryptMessengerExternalUserRef(event.externalUserId),
    legacyWaId: null,
  };
  const anonymizedGuard = await guardAgainstAnonymizedIdentityRehydration({
    prisma,
    clientId: client.id,
    tenantKey,
    channel: "messenger",
    provider: "meta",
    channelAccountId: event.channelAccountId,
    waId: syntheticWaId,
    requestId,
    source: "messenger_inbound",
  });
  if (anonymizedGuard.blocked) {
    logPersistence({
      event: "messenger.inbound_persistence.blocked",
      requestId,
      tenantKey,
      channelAccountId: event.channelAccountId,
      externalMessageId: event.externalMessageId,
      externalUserHash,
      reason: "anonymized_identity",
    });
    return { persisted: false, reason: "anonymized_identity", syntheticWaId };
  }
  const duplicateLookupStartedAt = channelLatencyNow();
  const duplicate = await prisma.inboundMessage.findUnique({
    where: { clientId_messageId: { clientId: client.id, messageId } },
    select: { id: true },
  });
  latency?.duration("duplicateLookup", duplicateLookupStartedAt);
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

  const profileLookupStartedAt = channelLatencyNow();
  const profile = await resolveMetaContactDisplayName({
    prisma,
    clientId: client.id,
    tenantKey,
    channel: "messenger",
    provider: "meta",
    channelAccountId: event.channelAccountId,
    externalUserHash,
    requestId,
    fetchProfile: () =>
      fetchMessengerUserProfile({
        pageAccessToken: params.account?.pageAccessToken,
        externalUserId: event.externalUserId,
        fetchImpl: params.fetchImpl,
      }),
  });
  latency?.duration("profileLookup", profileLookupStartedAt);
  const displayName = profile.displayName;

  const defaultRouteStartedAt = channelLatencyNow();
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(prisma, client.id);
  latency?.duration("defaultRouteLookup", defaultRouteStartedAt);
  const operationalRoute = {
    departmentId: defaults.department.id,
    queueId: defaults.queue.id,
  };

  const persistenceDbStartedAt = channelLatencyNow();
  const [conversation, runtimeState, inbound, contact, lead] = await Promise.all([
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
      select: {
        id: true,
        assignedUserId: true,
        departmentId: true,
        queueId: true,
        status: true,
      },
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
        name: displayName,
        lifecycle: CONTACT_LIFECYCLE_ACTIVE,
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
        name: displayName ?? "Messenger User",
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
  await upsertMetaContactIdentity({
    prisma,
    clientId: client.id,
    contactId: contact.id,
    channel: "messenger",
    provider: "meta",
    channelAccountId: event.channelAccountId,
    externalUserHash,
    externalUserRef: channelFields.externalUserRef,
    legacyWaId: channelFields.legacyWaId,
    displayName,
    seenAt: createdAt,
  });
  await reactivateOperationallyExcludedContactIfNeeded(prisma, {
    clientId: client.id,
    leadId: lead.id,
    contactId: contact.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    requestId,
    source: "messenger_inbound",
  });
  await recordCrmConversationContactOrigin({
    clientId: client.id,
    leadId: lead.id,
    contactId: contact.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    conversationId: conversation.id,
    requestId,
    source: "messenger_inbound",
  });
  latency?.duration("persistenceDb", persistenceDbStartedAt);
  latency?.duration("persistence", persistenceStartedAt);
  const assignment = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtimeState.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    departmentId: runtimeState.departmentId ?? operationalRoute.departmentId,
    queueId: runtimeState.queueId ?? operationalRoute.queueId,
    status: runtimeState.status,
    assignedUserId: runtimeState.assignedUserId,
    requestId,
    source: "messenger.inbound",
  });
  const assignedUserId = assignment.applied ? assignment.selectedUserId : runtimeState.assignedUserId ?? null;

  logPersistence({
    event: "messenger.inbound_persistence.persisted",
    requestId,
    tenantKey,
    channelAccountId: event.channelAccountId,
    externalMessageId: event.externalMessageId,
    externalUserHash,
    reason: "persisted",
  });

  const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
  const realtimeStartedAt = channelLatencyNow();
  publish({
    type: "message.created",
    clientId: client.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    mode: "HUMAN",
    handoffStatus: "none",
    humanInboxVisible: true,
    assignedUserId,
    departmentId: operationalRoute.departmentId,
    message: {
      inboxVisibility: "human_timeline",
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
  latency?.duration("realtime", realtimeStartedAt);

  return {
    persisted: true,
    reason: "persisted",
    syntheticWaId,
    conversationId: conversation.id,
    runtimeStateId: runtimeState.id,
    inboundMessageId: inbound.id,
  };
}
