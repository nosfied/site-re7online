import type { ServerResponse } from "node:http";
import crypto from "node:crypto";
import { getTenants, type TenantConfigMap } from "../config/tenantConfig.js";
import { logger } from "../logger/logger.js";
import { ChannelAdapterRegistry } from "../channels/channelAdapterRegistry.js";
import {
  createDefaultChannelAdapterRegistry,
  normalizeChannelInboundEvent,
} from "../channels/channelNormalizationFacade.js";
import { recordObservedChannelEvent } from "../channels/observedChannelEvents.js";
import { resolveTenantForChannelAccount } from "../channels/tenantChannelResolution.js";

type MetaWebhookQuery = Record<string, string | undefined>;

type MetaMessagingEvent = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  timestamp?: unknown;
  message?: {
    mid?: unknown;
    text?: unknown;
  };
};

type MetaWebhookPayload = {
  object?: unknown;
  entry?: Array<{
    id?: unknown;
    messaging?: MetaMessagingEvent[];
  }>;
};

export type PassiveMetaWebhookProcessResult = {
  ok: boolean;
  normalizedCount: number;
  unsupportedCount: number;
};

export type PassiveMetaSignatureVerification =
  | { ok: true; status: "valid" | "skipped" }
  | { ok: false; statusCode: 403 | 503; reason: string };

function getVerifyToken() {
  return (
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    process.env.META_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    ""
  );
}

function writeText(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(text);
}

function writeJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function asRecord(value: unknown): MetaWebhookPayload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MetaWebhookPayload)
    : null;
}

function normalizeId(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function hashExternalUserId(value: string) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeSignatureHeader(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}

export function verifyPassiveMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  requestId: string
): PassiveMetaSignatureVerification {
  const appSecret = String(process.env.META_APP_SECRET ?? "").trim();
  const route = "/meta/webhook";

  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error({
        event: "meta.webhook.signature.missing",
        route,
        requestId,
        reason: "missing_app_secret",
      });
      return { ok: false, statusCode: 503, reason: "missing_app_secret" };
    }

    logger.info({
      event: "meta.webhook.signature.skipped",
      route,
      requestId,
      reason: "missing_app_secret_non_production",
    });
    return { ok: true, status: "skipped" };
  }

  const header = normalizeSignatureHeader(signatureHeader);
  if (!header) {
    logger.warn({
      event: "meta.webhook.signature.missing",
      route,
      requestId,
      reason: "missing_header",
    });
    return { ok: false, statusCode: 403, reason: "missing_header" };
  }
  if (!header.startsWith("sha256=")) {
    logger.warn({
      event: "meta.webhook.signature.invalid",
      route,
      requestId,
      reason: "invalid_format",
    });
    return { ok: false, statusCode: 403, reason: "invalid_format" };
  }

  const expected = header.slice("sha256=".length);
  if (!/^[a-fA-F0-9]+$/.test(expected)) {
    logger.warn({
      event: "meta.webhook.signature.invalid",
      route,
      requestId,
      reason: "invalid_format",
    });
    return { ok: false, statusCode: 403, reason: "invalid_format" };
  }

  const actual = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const valid =
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer);

  if (!valid) {
    logger.warn({
      event: "meta.webhook.signature.invalid",
      route,
      requestId,
      reason: "invalid_signature",
    });
    return { ok: false, statusCode: 403, reason: "invalid_signature" };
  }

  logger.info({
    event: "meta.webhook.signature.valid",
    route,
    requestId,
  });
  return { ok: true, status: "valid" };
}

function getMessengerEvents(payload: MetaWebhookPayload) {
  const events: Array<{ pageId: string; event: MetaMessagingEvent }> = [];
  for (const entry of payload.entry ?? []) {
    const entryPageId = normalizeId(entry.id);
    for (const messaging of entry.messaging ?? []) {
      const pageId = normalizeId(messaging.recipient?.id) || entryPageId;
      events.push({ pageId, event: messaging });
    }
  }
  return events;
}

function getEventExternalUserHash(event: MetaMessagingEvent) {
  return hashExternalUserId(normalizeId(event.sender?.id));
}

function getEventMessageId(event: MetaMessagingEvent) {
  const mid = event.message?.mid;
  return typeof mid === "string" || typeof mid === "number" ? String(mid).trim() || null : null;
}

function logPassiveReceived(params: {
  requestId: string;
  channelAccountId: string;
  externalUserHash: string | null;
  externalMessageId: string | null;
  tenantKey?: string;
  resolution: string;
}) {
  logger.info({
    event: "channel.webhook.passive_received",
    route: "/meta/webhook",
    requestId: params.requestId,
    channel: "messenger",
    provider: "meta",
    channelAccountId: params.channelAccountId || null,
    tenantKey: params.tenantKey ?? null,
    externalUserHash: params.externalUserHash,
    externalMessageId: params.externalMessageId,
    resolution: params.resolution,
    passive: true,
  });
}

function logTenantResolution(params: {
  requestId: string;
  channelAccountId: string;
  externalUserHash: string | null;
  externalMessageId: string | null;
  tenantKey?: string;
  resolution: string;
}) {
  logger.info({
    event: `channel.tenant_resolution.${params.resolution}`,
    route: "/meta/webhook",
    requestId: params.requestId,
    channel: "messenger",
    provider: "meta",
    channelAccountId: params.channelAccountId || null,
    tenantKey: params.tenantKey ?? null,
    externalUserHash: params.externalUserHash,
    externalMessageId: params.externalMessageId,
    resolution: params.resolution,
    passive: true,
  });
}

export function handlePassiveMetaWebhookChallenge(
  query: MetaWebhookQuery,
  res: ServerResponse,
  requestId: string
) {
  const mode = String(query["hub.mode"] ?? "").trim();
  const token = String(query["hub.verify_token"] ?? "").trim();
  const challenge = String(query["hub.challenge"] ?? "");
  const verifyToken = getVerifyToken();

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    logger.info({
      event: "meta.webhook.challenge.ok",
      route: "/meta/webhook",
      requestId,
    });
    writeText(res, 200, challenge);
    return;
  }

  logger.warn({
    event: "meta.webhook.challenge.denied",
    route: "/meta/webhook",
    requestId,
    reason: !verifyToken ? "missing_verify_token" : "invalid_verify_token",
  });
  writeJson(res, 403, { error: "forbidden" });
}

export async function processPassiveMetaWebhookPayload(
  payload: unknown,
  options: {
    requestId: string;
    registry?: ChannelAdapterRegistry;
    tenants?: TenantConfigMap;
  }
): Promise<PassiveMetaWebhookProcessResult> {
  const parsed = asRecord(payload);
  if (!parsed) {
    recordObservedChannelEvent({
      provider: "meta",
      channel: "messenger",
      channelAccountId: "unknown",
      resolution: "payload_invalid",
      eventType: "unknown",
    });
    logger.warn({
      event: "meta.webhook.unsupported",
      route: "/meta/webhook",
      requestId: options.requestId,
      reason: "payload_invalid",
    });
    return { ok: true, normalizedCount: 0, unsupportedCount: 1 };
  }

  logger.info({
    event: "meta.webhook.received",
    route: "/meta/webhook",
    requestId: options.requestId,
    object: typeof parsed.object === "string" ? parsed.object : "unknown",
  });

  if (parsed.object !== "page") {
    recordObservedChannelEvent({
      provider: "meta",
      channel: parsed.object === "instagram" ? "instagram" : "messenger",
      channelAccountId: "unknown",
      resolution: "unsupported_object",
      eventType: "unsupported",
    });
    logger.info({
      event: "meta.webhook.unsupported",
      route: "/meta/webhook",
      requestId: options.requestId,
      object: typeof parsed.object === "string" ? parsed.object : "unknown",
      reason: "unsupported_object",
    });
    return { ok: true, normalizedCount: 0, unsupportedCount: 1 };
  }

  const events = getMessengerEvents(parsed);
  if (events.length === 0) {
    recordObservedChannelEvent({
      provider: "meta",
      channel: "messenger",
      channelAccountId: "unknown",
      resolution: "no_messaging_events",
      eventType: "unsupported",
    });
    logger.info({
      event: "meta.webhook.unsupported",
      route: "/meta/webhook",
      requestId: options.requestId,
      object: "page",
      reason: "no_messaging_events",
    });
    return { ok: true, normalizedCount: 0, unsupportedCount: 1 };
  }

  const registry = options.registry ?? createDefaultChannelAdapterRegistry();
  const tenants = options.tenants ?? (await getTenants());
  let normalizedCount = 0;
  let unsupportedCount = 0;

  for (const item of events) {
    const externalUserHash = getEventExternalUserHash(item.event);
    const externalMessageId = getEventMessageId(item.event);
    const resolution = resolveTenantForChannelAccount({
      tenants,
      channel: "messenger",
      provider: "meta",
      channelAccountId: item.pageId,
    });
    logPassiveReceived({
      requestId: options.requestId,
      channelAccountId: item.pageId,
      externalUserHash,
      externalMessageId,
      tenantKey: resolution.tenantKey,
      resolution: resolution.resolution,
    });
    logTenantResolution({
      requestId: options.requestId,
      channelAccountId: item.pageId,
      externalUserHash,
      externalMessageId,
      tenantKey: resolution.tenantKey,
      resolution: resolution.resolution,
    });
    recordObservedChannelEvent({
      provider: "meta",
      channel: "messenger",
      channelAccountId: item.pageId || "unknown",
      tenantKey: resolution.tenantKey,
      resolution: resolution.resolution,
      externalMessageId: externalMessageId ?? undefined,
      externalUserHash: externalUserHash ?? undefined,
      eventType: "message",
    });

    if (resolution.resolution !== "matched_enabled") {
      unsupportedCount += 1;
      continue;
    }

    try {
      const tenantKey = resolution.tenantKey ?? "unknown";
      const normalized = normalizeChannelInboundEvent({
        tenantKey,
        channel: "messenger",
        provider: "meta",
        registry,
        raw: {
          tenantKey,
          payload: {
            object: parsed.object,
            entry: [
              {
                id: item.pageId,
                messaging: [item.event],
              },
            ],
          },
        },
      });

      normalizedCount += 1;
      logger.info({
        event: "meta.webhook.normalized",
        route: "/meta/webhook",
        requestId: options.requestId,
        tenantKey,
        channel: normalized.channel,
        provider: normalized.provider,
        channelAccountId: normalized.channelAccountId,
        externalUserHash: hashExternalUserId(normalized.externalUserId),
        externalMessageId: normalized.externalMessageId ?? null,
        passive: true,
      });
    } catch (error) {
      unsupportedCount += 1;
      logger.warn({
        event: "meta.webhook.error",
        route: "/meta/webhook",
        requestId: options.requestId,
        channel: "messenger",
        provider: "meta",
        channelAccountId: item.pageId || null,
        reason: (error as Error).message,
      });
    }
  }

  return { ok: true, normalizedCount, unsupportedCount };
}

export async function handlePassiveMetaWebhookPost(payload: unknown, requestId: string) {
  return processPassiveMetaWebhookPayload(payload, { requestId });
}
