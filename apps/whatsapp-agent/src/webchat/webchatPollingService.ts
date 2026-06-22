import crypto from "node:crypto";
import { Prisma, type MessageStatus, type MessageType, type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";
import { normalizeWebchatDomain } from "./webchatSessionService.js";

const POLLING_RATE_LIMIT_WINDOW_MS = 60_000;
const POLLING_RATE_LIMIT_MAX = 60;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

type RateBucket = { count: number; windowStart: number; lastSeen: number };
type PollingQuery = Record<string, string | undefined>;
type WebchatMessageDirection = "inbound" | "outbound";
type CursorPayload = { createdAt: string; id: string; direction: WebchatMessageDirection };

const rateBuckets = new Map<string, RateBucket>();

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function publicMessageId(input: { id: string; createdAt: Date; direction: WebchatMessageDirection }) {
  return `wcm_${hashValue(`${input.direction}:${input.id}:${input.createdAt.toISOString()}`).slice(0, 32)}`;
}

function parseLimit(raw: string | undefined) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function encodeCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined) {
  const value = normalizeText(raw, 500);
  if (!value) return { ok: true as const, cursor: null };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(new Date(parsed.createdAt).getTime()) ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      (parsed.direction !== "inbound" && parsed.direction !== "outbound")
    ) {
      return { ok: false as const, error: "webchat_cursor_invalid" };
    }
    return {
      ok: true as const,
      cursor: { createdAt: parsed.createdAt, id: parsed.id, direction: parsed.direction },
    };
  } catch {
    return { ok: false as const, error: "webchat_cursor_invalid" };
  }
}

function compareCursorKey(item: { createdAt: Date; id: string; direction: WebchatMessageDirection }, cursor: CursorPayload) {
  const createdAt = item.createdAt.getTime();
  const cursorCreatedAt = new Date(cursor.createdAt).getTime();
  if (createdAt !== cursorCreatedAt) return createdAt - cursorCreatedAt;
  const itemKey = `${item.direction}:${item.id}`;
  const cursorKey = `${cursor.direction}:${cursor.id}`;
  return itemKey.localeCompare(cursorKey);
}

function getRateLimit(key: string) {
  const now = Date.now();
  for (const [bucketKey, value] of rateBuckets.entries()) {
    if (now - value.lastSeen > POLLING_RATE_LIMIT_WINDOW_MS * 3) {
      rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= POLLING_RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, retryAfterSec: 0 };
  }
  bucket.count += 1;
  bucket.lastSeen = now;
  if (bucket.count > POLLING_RATE_LIMIT_MAX) {
    return {
      limited: true as const,
      retryAfterSec: Math.max(1, Math.ceil((POLLING_RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000)),
    };
  }
  return { limited: false as const, retryAfterSec: 0 };
}

async function recordWebchatPollingEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  requestId: string;
  eventName: "webchat.message.polled" | "webchat.polling.denied";
  payload: Record<string, unknown>;
}) {
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        requestId: params.requestId,
        eventName: params.eventName,
        payloadJson: params.payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    // Audit failure must not block public polling.
  }
}

function serializeType(type: MessageType) {
  return String(type || "UNKNOWN").toLowerCase();
}

function serializeStatus(direction: WebchatMessageDirection, status?: MessageStatus | null) {
  if (direction === "inbound") return "received";
  const value = String(status ?? "SENT").toLowerCase();
  if (value === "failed") return "failed";
  return "sent";
}

type TimelineItem = {
  id: string;
  direction: WebchatMessageDirection;
  type: MessageType;
  text: string | null;
  status?: MessageStatus | null;
  createdAt: Date;
};

function serializeMessage(item: TimelineItem) {
  return {
    id: publicMessageId(item),
    direction: item.direction,
    type: serializeType(item.type),
    text: item.text ?? null,
    createdAt: item.createdAt.toISOString(),
    status: serializeStatus(item.direction, item.status),
    senderLabel: item.direction === "inbound" ? "visitor" : "agent",
  };
}

async function denyPolling(params: {
  prisma: PrismaClient;
  clientId?: string | null;
  requestId: string;
  reason: string;
  siteId?: string | null;
  sessionId?: string | null;
}) {
  if (!params.clientId) return;
  await recordWebchatPollingEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "webchat.polling.denied",
    payload: {
      reason: params.reason,
      siteId: params.siteId ?? null,
      sessionId: params.sessionId ?? null,
    },
  });
}

export async function listWebchatMessages(params: {
  prisma: PrismaClient;
  requestId: string;
  query: PollingQuery;
  origin: string | null;
  ip: string;
}) {
  const token = normalizeText(params.query.sessionToken, 200);
  if (!token) return { ok: false as const, error: "webchat_token_required" };
  const originDomain = normalizeWebchatDomain(params.origin);
  if (!originDomain) return { ok: false as const, error: "webchat_origin_required" };
  const decodedCursor = decodeCursor(params.query.cursor);
  if (!decodedCursor.ok) return { ok: false as const, error: decodedCursor.error };

  const tokenHash = hashValue(token);
  const session = await params.prisma.webchatSession.findUnique({
    where: { tokenHash },
    include: {
      visitor: { select: { id: true, visitorIdHash: true } },
      site: {
        include: {
          client: { select: { id: true, clientKey: true, status: true, features: true, profile: true } },
          allowedDomains: { where: { active: true }, select: { domain: true } },
        },
      },
    },
  });
  if (!session) return { ok: false as const, error: "webchat_session_not_found" };

  const rate = getRateLimit(`poll:${session.siteId}:${hashValue(params.ip || "unknown")}`);
  if (rate.limited) {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "webchat_rate_limited",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "webchat_rate_limited", retryAfterSec: rate.retryAfterSec };
  }
  if (session.status !== "active") {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "webchat_session_inactive",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "webchat_session_inactive" };
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    await params.prisma.webchatSession.update({ where: { id: session.id }, data: { status: "expired" } });
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "webchat_session_expired",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "webchat_session_expired" };
  }
  if (session.site.status !== "active") {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "webchat_site_inactive",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "webchat_site_inactive" };
  }
  if (session.site.client.status !== "ACTIVE") {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "client_inactive",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "client_inactive" };
  }
  if (!getFeatures(session.site.client).webchat) {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "feature_not_enabled",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "feature_not_enabled" };
  }
  const allowed = session.site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === originDomain);
  if (!allowed || session.originDomain !== originDomain) {
    await denyPolling({
      prisma: params.prisma,
      clientId: session.clientId,
      requestId: params.requestId,
      reason: "webchat_origin_not_allowed",
      siteId: session.siteId,
      sessionId: session.id,
    });
    return { ok: false as const, error: "webchat_origin_not_allowed" };
  }

  const limit = parseLimit(params.query.limit);
  const since = decodedCursor.cursor ? new Date(decodedCursor.cursor.createdAt) : null;
  const queryLimit = Math.min(limit * 3 + 5, 200);
  const commonWhere = {
    clientId: session.clientId,
    channel: "webchat",
    provider: "converta",
    channelAccountId: session.siteId,
    externalUserHash: session.visitor.visitorIdHash,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const [inbound, outbound] = await Promise.all([
    params.prisma.inboundMessage.findMany({
      where: commonWhere,
      select: { id: true, type: true, bodyText: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: queryLimit,
    }),
    params.prisma.outboundMessage.findMany({
      where: commonWhere,
      select: { id: true, type: true, bodyText: true, status: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: queryLimit,
    }),
  ]);
  const timeline: TimelineItem[] = [
    ...inbound.map((item) => ({ ...item, text: item.bodyText, direction: "inbound" as const })),
    ...outbound.map((item) => ({ ...item, text: item.bodyText, direction: "outbound" as const })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || `${a.direction}:${a.id}`.localeCompare(`${b.direction}:${b.id}`))
    .filter((item) => (decodedCursor.cursor ? compareCursorKey(item, decodedCursor.cursor) > 0 : true));
  const pageItems = timeline.slice(0, limit);
  const lastItem = pageItems.length > 0 ? pageItems[pageItems.length - 1] : null;
  const nextCursor = lastItem && timeline.length > pageItems.length
    ? encodeCursor({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id, direction: lastItem.direction })
    : null;

  const now = new Date();
  await params.prisma.webchatSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  await params.prisma.webchatVisitor.update({ where: { id: session.visitorId }, data: { lastSeenAt: now } });
  await recordWebchatPollingEvent({
    prisma: params.prisma,
    clientId: session.clientId,
    requestId: params.requestId,
    eventName: "webchat.message.polled",
    payload: {
      siteId: session.siteId,
      sessionId: session.id,
      messageCount: pageItems.length,
      hasNextPage: Boolean(nextCursor),
    },
  });

  return {
    ok: true as const,
    messages: pageItems.map(serializeMessage),
    page: {
      limit,
      nextCursor,
    },
  };
}
