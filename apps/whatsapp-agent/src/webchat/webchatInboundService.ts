import crypto from "node:crypto";
import { ConversationOperationalStatus, HandoffStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { getFeatures } from "../features/clientFeatures.js";
import { publishRealtimeEvent } from "../realtime/hub.js";

const MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const MESSAGE_RATE_LIMIT_MAX = 20;
const MAX_MESSAGE_LENGTH = 4_000;

type JsonInput = Record<string, unknown>;
type RateBucket = { count: number; windowStart: number; lastSeen: number };

const rateBuckets = new Map<string, RateBucket>();

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeWebchatDomain(input: unknown) {
  const value = normalizeText(input, 253).toLowerCase();
  if (!value) return "";
  try {
    const parsed = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return value
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .trim();
  }
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function shortHash(input: string, size = 32) {
  return hashValue(input).slice(0, size);
}

function getRateLimit(key: string) {
  const now = Date.now();
  for (const [bucketKey, value] of rateBuckets.entries()) {
    if (now - value.lastSeen > MESSAGE_RATE_LIMIT_WINDOW_MS * 3) {
      rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= MESSAGE_RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, retryAfterSec: 0 };
  }
  bucket.count += 1;
  bucket.lastSeen = now;
  if (bucket.count > MESSAGE_RATE_LIMIT_MAX) {
    return {
      limited: true as const,
      retryAfterSec: Math.max(1, Math.ceil((MESSAGE_RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000)),
    };
  }
  return { limited: false as const, retryAfterSec: 0 };
}

function serializeInboundMessage(item: {
  id: string;
  messageId: string;
  waId: string;
  waIdCanonical: string | null;
  bodyText: string | null;
  createdAt: Date;
}) {
  return {
    id: item.id,
    messageId: item.messageId,
    waId: item.waId,
    waIdCanonical: item.waIdCanonical,
    bodyText: item.bodyText,
    createdAt: item.createdAt.toISOString(),
  };
}

export type WebchatInboundResult =
  | {
      ok: true;
      conversation: { id: string; waId: string; status: string };
      message: ReturnType<typeof serializeInboundMessage>;
      contact: { id: string };
    }
  | {
      ok: false;
      error:
        | "webchat_token_required"
        | "webchat_origin_required"
        | "webchat_session_not_found"
        | "webchat_session_inactive"
        | "webchat_session_expired"
        | "webchat_site_inactive"
        | "client_inactive"
        | "feature_not_enabled"
        | "webchat_origin_not_allowed"
        | "webchat_rate_limited"
        | "webchat_message_required"
        | "webchat_message_too_long";
      retryAfterSec?: number;
    };

export async function createWebchatInboundMessage(params: {
  prisma: PrismaClient;
  requestId: string;
  input: JsonInput;
  origin: string | null;
  ip: string;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
}): Promise<WebchatInboundResult> {
  const token = normalizeText(params.input.sessionToken, 200);
  if (!token) return { ok: false, error: "webchat_token_required" };
  const originDomain = normalizeWebchatDomain(params.origin);
  if (!originDomain) return { ok: false, error: "webchat_origin_required" };

  const textRaw = typeof params.input.text === "string" ? params.input.text : "";
  const text = normalizeText(textRaw, MAX_MESSAGE_LENGTH);
  if (!text) return { ok: false, error: "webchat_message_required" };
  if (textRaw.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "webchat_message_too_long" };

  const tokenHash = hashValue(token);
  const session = await params.prisma.webchatSession.findUnique({
    where: { tokenHash },
    include: {
      visitor: { select: { id: true, visitorIdHash: true, name: true, email: true, phone: true } },
      site: {
        include: {
          client: { select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true } },
          allowedDomains: { where: { active: true }, select: { domain: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, error: "webchat_session_not_found" };

  const rate = getRateLimit(`message:${session.siteId}:${session.id}:${hashValue(params.ip || "unknown")}`);
  if (rate.limited) return { ok: false, error: "webchat_rate_limited", retryAfterSec: rate.retryAfterSec };
  if (session.status !== "active") return { ok: false, error: "webchat_session_inactive" };
  if (session.expiresAt.getTime() <= Date.now()) {
    await params.prisma.webchatSession.update({ where: { id: session.id }, data: { status: "expired" } });
    return { ok: false, error: "webchat_session_expired" };
  }
  if (session.site.status !== "active") return { ok: false, error: "webchat_site_inactive" };
  if (session.site.client.status !== "ACTIVE") return { ok: false, error: "client_inactive" };
  if (!getFeatures(session.site.client).webchat) return { ok: false, error: "feature_not_enabled" };
  const allowed = session.site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === originDomain);
  if (!allowed || session.originDomain !== originDomain) {
    return { ok: false, error: "webchat_origin_not_allowed" };
  }

  const now = new Date();
  const externalUserHash = session.visitor.visitorIdHash;
  const channelFields = {
    channel: "webchat",
    provider: "converta",
    channelAccountId: session.siteId,
    externalUserHash,
    externalUserRef: null,
    legacyWaId: null,
  };
  const syntheticWaId = `webchat:${shortHash(`${session.siteId}:${externalUserHash}`)}`;
  const messageId = `webchat:${session.siteId}:${shortHash(`${session.id}:${params.requestId}:${now.toISOString()}`, 24)}`;
  const displayName = session.visitor.name ?? session.visitor.email ?? "Visitante Webchat";
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(params.prisma, session.clientId);

  const [conversation, runtimeState, inbound, contact] = await params.prisma.$transaction(async (tx) => {
    const contactRecord = await tx.contact.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        name: displayName,
        ...channelFields,
      },
      update: {
        name: displayName,
        ...channelFields,
      },
      select: { id: true },
    });
    const identity = await tx.contactChannelIdentity.upsert({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: session.clientId,
          channel: "webchat",
          provider: "converta",
          channelAccountId: session.siteId,
          externalUserHash,
        },
      },
      create: {
        clientId: session.clientId,
        contactId: contactRecord.id,
        channel: "webchat",
        provider: "converta",
        channelAccountId: session.siteId,
        externalUserHash,
        displayName,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        contactId: contactRecord.id,
        displayName,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    const conversationRecord = await tx.conversation.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        phoneNumberId: null,
        ...channelFields,
        departmentId: defaults.department.id,
        windowIsOpen: true,
        lastInboundAt: now,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        departmentId: defaults.department.id,
        lastInboundAt: now,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true, waId: true },
    });
    const runtimeRecord = await tx.conversationRuntimeState.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        conversationKey: `${session.site.client.clientKey}:webchat:${session.siteId}:${externalUserHash}`,
        ...channelFields,
        firstSeenAt: now,
        windowIsOpen: true,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        handoffStatus: HandoffStatus.NONE,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
        closedAt: null,
      },
      select: { id: true, status: true },
    });
    const inboundRecord = await tx.inboundMessage.create({
      data: {
        clientId: session.clientId,
        phoneNumberId: null,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        ...channelFields,
        externalMessageId: messageId,
        type: MessageType.TEXT,
        bodyText: text,
        allowlistHit: false,
        requestId: params.requestId,
        createdAt: now,
        rawPayload: {
          source: "webchat",
          siteId: session.siteId,
          sessionId: session.id,
          originDomain,
          messageLength: text.length,
        } satisfies Prisma.InputJsonValue,
      },
      select: { id: true, messageId: true, waId: true, waIdCanonical: true, bodyText: true, createdAt: true },
    });
    await tx.lead.upsert({
      where: { tenantId_waId: { tenantId: session.clientId, waId: syntheticWaId } },
      create: {
        tenantId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        name: displayName,
        phone: session.visitor.phone,
        email: session.visitor.email,
        status: "NEW",
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      update: {
        waIdCanonical: syntheticWaId,
        name: displayName,
        phone: session.visitor.phone,
        email: session.visitor.email,
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      select: { id: true },
    });
    await tx.webchatSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
    await tx.webchatVisitor.update({
      where: { id: session.visitorId },
      data: { lastSeenAt: now },
    });
    await tx.event.create({
      data: {
        clientId: session.clientId,
        conversationId: conversationRecord.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        requestId: params.requestId,
        eventName: "webchat.message.received",
        payloadJson: {
          siteId: session.siteId,
          sessionId: session.id,
          visitorId: session.visitor.id,
          originDomain,
          messageLength: text.length,
        } satisfies Prisma.InputJsonValue,
      },
    });
    return [conversationRecord, runtimeRecord, inboundRecord, contactRecord] as const;
  });

  const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
  publish({
    type: "message.created",
    clientId: session.clientId,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    mode: "HUMAN",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: defaults.department.id,
    message: {
      direction: "INBOUND",
      type: MessageType.TEXT,
      status: "RECEIVED",
      intent: null,
      bodyText: text,
      media: undefined,
      templateName: null,
      templateLang: null,
      requestId: params.requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: now.toISOString(),
    },
  });

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      waId: conversation.waId,
      status: runtimeState.status ?? ConversationOperationalStatus.WAITING,
    },
    message: serializeInboundMessage(inbound),
    contact,
  };
}
