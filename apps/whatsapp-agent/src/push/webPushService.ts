import crypto from "node:crypto";
import webPush from "web-push";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import type { InboxRealtimeEvent } from "../realtime/events.js";

export type BrowserPushSubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

const recentPushKeys = new Set<string>();
const recentPushKeyOrder: string[] = [];
const MAX_RECENT_PUSH_KEYS = 1000;
const PUSH_PRESENCE_TTL_MS = 60_000;

type PushPresence = {
  clientId: string;
  userId: string;
  endpoint: string;
  visible: boolean;
  focused: boolean;
  updatedAtMs: number;
};

const pushPresenceByEndpoint = new Map<string, PushPresence>();

function rememberPushKey(key: string) {
  if (recentPushKeys.has(key)) return false;
  recentPushKeys.add(key);
  recentPushKeyOrder.push(key);
  while (recentPushKeyOrder.length > MAX_RECENT_PUSH_KEYS) {
    const oldest = recentPushKeyOrder.shift();
    if (oldest) recentPushKeys.delete(oldest);
  }
  return true;
}

export function isWebPushConfigured() {
  return Boolean(
    env.WEB_PUSH_VAPID_PUBLIC_KEY.trim() &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY.trim() &&
      env.WEB_PUSH_SUBJECT.trim()
  );
}

export function getWebPushPublicKey() {
  return env.WEB_PUSH_VAPID_PUBLIC_KEY.trim();
}

function configureWebPush() {
  if (!isWebPushConfigured()) return false;
  webPush.setVapidDetails(
    env.WEB_PUSH_SUBJECT,
    env.WEB_PUSH_VAPID_PUBLIC_KEY,
    env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
  return true;
}

export function hashEndpoint(endpoint: string) {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

export function normalizePushSubscriptionInput(input: BrowserPushSubscriptionInput) {
  const endpoint = String(input.endpoint ?? "").trim();
  const p256dh = String(input.keys?.p256dh ?? "").trim();
  const auth = String(input.keys?.auth ?? "").trim();
  if (!endpoint || !/^https:\/\//i.test(endpoint)) return null;
  if (!p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

function pruneExpiredPushPresence(nowMs = Date.now()) {
  for (const [endpoint, presence] of pushPresenceByEndpoint.entries()) {
    if (nowMs - presence.updatedAtMs > PUSH_PRESENCE_TTL_MS) {
      pushPresenceByEndpoint.delete(endpoint);
    }
  }
}

export function updatePushPresence(params: {
  clientId: string;
  userId: string;
  endpoint: string;
  visible: boolean;
  focused: boolean;
  nowMs?: number;
}) {
  const endpoint = params.endpoint.trim();
  if (!endpoint || !/^https:\/\//i.test(endpoint)) {
    return { ok: false as const, reason: "invalid_endpoint" as const };
  }
  const nowMs = params.nowMs ?? Date.now();
  pruneExpiredPushPresence(nowMs);
  pushPresenceByEndpoint.set(endpoint, {
    clientId: params.clientId,
    userId: params.userId,
    endpoint,
    visible: params.visible,
    focused: params.focused,
    updatedAtMs: nowMs,
  });
  return { ok: true as const };
}

export function shouldSuppressPushForForegroundSubscription(params: {
  clientId: string;
  userId: string;
  endpoint: string;
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  pruneExpiredPushPresence(nowMs);
  const presence = pushPresenceByEndpoint.get(params.endpoint);
  if (!presence) return false;
  if (presence.clientId !== params.clientId || presence.userId !== params.userId) return false;
  if (!presence.visible) return false;
  return nowMs - presence.updatedAtMs <= PUSH_PRESENCE_TTL_MS;
}

export async function getPushStatus(params: { clientId: string; userId: string }) {
  const configured = isWebPushConfigured();
  if (!configured) {
    return {
      configured,
      publicKey: null,
      subscribed: false,
      subscriptions: 0,
    };
  }
  const subscriptions = await getPrisma().pushSubscription.count({
    where: {
      clientId: params.clientId,
      userId: params.userId,
      revokedAt: null,
    },
  });
  return {
    configured,
    publicKey: getWebPushPublicKey(),
    subscribed: subscriptions > 0,
    subscriptions,
  };
}

export async function upsertPushSubscription(params: {
  clientId: string;
  userId: string;
  subscription: BrowserPushSubscriptionInput;
  userAgent?: string | null;
  deviceLabel?: string | null;
}) {
  if (!isWebPushConfigured()) {
    return { ok: false as const, reason: "push_not_configured" as const };
  }
  const normalized = normalizePushSubscriptionInput(params.subscription);
  if (!normalized) {
    return { ok: false as const, reason: "invalid_subscription" as const };
  }
  const prisma = getPrisma();
  const record = await prisma.pushSubscription.upsert({
    where: { endpoint: normalized.endpoint },
    create: {
      clientId: params.clientId,
      userId: params.userId,
      endpoint: normalized.endpoint,
      p256dh: normalized.p256dh,
      auth: normalized.auth,
      userAgent: params.userAgent?.slice(0, 500) ?? null,
      deviceLabel: params.deviceLabel?.slice(0, 120) ?? null,
      revokedAt: null,
    },
    update: {
      clientId: params.clientId,
      userId: params.userId,
      p256dh: normalized.p256dh,
      auth: normalized.auth,
      userAgent: params.userAgent?.slice(0, 500) ?? null,
      deviceLabel: params.deviceLabel?.slice(0, 120) ?? null,
      revokedAt: null,
    },
    select: {
      id: true,
      endpoint: true,
      updatedAt: true,
    },
  });
  logger.info({
    event: "push.subscription.saved",
    clientId: params.clientId,
    userId: params.userId,
    endpointHash: hashEndpoint(record.endpoint),
  });
  return {
    ok: true as const,
    subscription: {
      id: record.id,
      endpointHash: hashEndpoint(record.endpoint),
      updatedAt: record.updatedAt,
    },
  };
}

export async function revokePushSubscription(params: {
  clientId: string;
  userId: string;
  endpoint?: string | null;
}) {
  const where: Prisma.PushSubscriptionWhereInput = {
    clientId: params.clientId,
    userId: params.userId,
    revokedAt: null,
    ...(params.endpoint ? { endpoint: params.endpoint } : {}),
  };
  const result = await getPrisma().pushSubscription.updateMany({
    where,
    data: { revokedAt: new Date() },
  });
  logger.info({
    event: "push.subscription.revoked",
    clientId: params.clientId,
    userId: params.userId,
    count: result.count,
    endpointHash: params.endpoint ? hashEndpoint(params.endpoint) : null,
  });
  return { revoked: result.count };
}

function buildPushDedupeKey(event: Extract<InboxRealtimeEvent, { type: "message.created" }>) {
  return [
    event.clientId,
    event.waIdCanonical ?? event.waId,
    event.message.messageId ?? event.message.requestId ?? event.message.createdAt,
  ].join(":");
}

function buildPushPayload(event: Extract<InboxRealtimeEvent, { type: "message.created" }>) {
  return JSON.stringify({
    title: "Nova mensagem no Converta",
    body: "Voce recebeu uma nova mensagem.",
    url: "/app/inbox",
    channel: null,
    tag: buildPushDedupeKey(event),
  });
}

async function revokeDeadEndpoint(endpoint: string, statusCode?: number) {
  const result = await getPrisma().pushSubscription.updateMany({
    where: { endpoint, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logger.info({
    event: "push.subscription.revoked",
    reason: "dead_endpoint",
    statusCode,
    endpointHash: hashEndpoint(endpoint),
    count: result.count,
  });
}

export async function dispatchWebPushForRealtimeEvent(event: InboxRealtimeEvent) {
  if (event.type !== "message.created") return;
  if (event.message.direction !== "INBOUND") return;
  if (!configureWebPush()) {
    logger.info({ event: "push.skipped", reason: "vapid_not_configured", clientId: event.clientId });
    return;
  }
  const dedupeKey = buildPushDedupeKey(event);
  if (!rememberPushKey(dedupeKey)) {
    logger.info({ event: "push.skipped", reason: "duplicate", clientId: event.clientId });
    return;
  }

  const prisma = getPrisma();
  const userWhere = event.assignedUserId
    ? { id: event.assignedUserId }
    : event.departmentId
      ? { OR: [{ role: "ADMIN" }, { departmentId: event.departmentId }] }
      : {};

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      clientId: event.clientId,
      revokedAt: null,
      user: {
        isActive: true,
        ...userWhere,
      },
    },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
      userId: true,
    },
  });

  if (subscriptions.length === 0) {
    logger.info({ event: "push.skipped", reason: "no_subscriptions", clientId: event.clientId });
    return;
  }

  const payload = buildPushPayload(event);
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    if (
      shouldSuppressPushForForegroundSubscription({
        clientId: event.clientId,
        userId: subscription.userId,
        endpoint: subscription.endpoint,
      })
    ) {
      logger.info({
        event: "push.skipped",
        reason: "foreground_visible",
        clientId: event.clientId,
        userId: subscription.userId,
        endpointHash: hashEndpoint(subscription.endpoint),
      });
      continue;
    }
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      );
      sent += 1;
      logger.info({
        event: "push.sent",
        clientId: event.clientId,
        userId: subscription.userId,
        endpointHash: hashEndpoint(subscription.endpoint),
      });
    } catch (error) {
      failed += 1;
      const statusCode = (error as { statusCode?: number }).statusCode;
      logger.warn({
        event: "push.failed",
        clientId: event.clientId,
        userId: subscription.userId,
        endpointHash: hashEndpoint(subscription.endpoint),
        statusCode,
        message: (error as Error).message,
      });
      if (statusCode === 404 || statusCode === 410) {
        await revokeDeadEndpoint(subscription.endpoint, statusCode);
      }
    }
  }
  logger.info({ event: "push.completed", clientId: event.clientId, sent, failed });
}
