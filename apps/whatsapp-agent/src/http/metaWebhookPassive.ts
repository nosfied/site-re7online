import type { ServerResponse } from "node:http";
import crypto from "node:crypto";
import { getTenants, type TenantConfigMap } from "../config/tenantConfig.js";
import { logger } from "../logger/logger.js";
import { ChannelAdapterRegistry } from "../channels/channelAdapterRegistry.js";
import {
  createDefaultChannelAdapterRegistry,
  normalizeChannelInboundEvent,
} from "../channels/channelNormalizationFacade.js";
import { getOrCreateDryRunSession, updateDryRunSession } from "../channels/channelDryRunSessions.js";
import { recordObservedChannelEvent } from "../channels/observedChannelEvents.js";
import { simulateChannelRuntimeDryRun } from "../channels/channelRuntimeDryRun.js";
import {
  buildChannelRuntimeShadowPlan,
  buildChannelRuntimeShadowPlanLog,
} from "../channels/channelRuntimeShadowPlan.js";
import {
  buildChannelPersistencePlan,
  summarizeChannelPersistencePlan,
} from "../channels/channelPersistencePlan.js";
import { persistInstagramInboundEvent } from "../channels/instagramInboundPersistence.js";
import { persistMessengerInboundEvent } from "../channels/messengerInboundPersistence.js";
import { findTenantChannelAccount, resolveChannelRuntimeGate } from "../channels/tenantChannelAccount.js";
import { resolveTenantForChannelAccount } from "../channels/tenantChannelResolution.js";
import type { Channel } from "../channels/channel.types.js";

type MetaWebhookQuery = Record<string, string | undefined>;

type MetaMessagingEvent = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  timestamp?: unknown;
  message?: {
    mid?: unknown;
    text?: unknown;
    is_echo?: unknown;
    attachments?: unknown;
  };
  message_edit?: unknown;
  read?: unknown;
  delivery?: unknown;
  reaction?: unknown;
  standby?: unknown;
  postback?: unknown;
  referral?: unknown;
};

type MetaWebhookPayload = {
  object?: unknown;
  entry?: Array<{
    id?: unknown;
    messaging?: MetaMessagingEvent[];
    changes?: unknown[];
  }>;
};

type MetaWebhookEntry = NonNullable<MetaWebhookPayload["entry"]>[number];

export type PassiveMetaWebhookProcessResult = {
  ok: boolean;
  normalizedCount: number;
  unsupportedCount: number;
};

export type PassiveMetaSignatureVerification =
  | { ok: true; status: "valid"; secretScope: "default" | "instagram" }
  | { ok: true; status: "skipped" }
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

function getMetaWebhookSignatureSecrets() {
  const candidates: Array<{ secretScope: "default" | "instagram"; secret: string }> = [
    { secretScope: "default", secret: String(process.env.META_APP_SECRET ?? "").trim() },
    {
      secretScope: "instagram",
      secret: String(process.env.META_INSTAGRAM_APP_SECRET ?? "").trim(),
    },
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.secret || seen.has(candidate.secret)) {
      return false;
    }
    seen.add(candidate.secret);
    return true;
  });
}

export function verifyPassiveMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  requestId: string
): PassiveMetaSignatureVerification {
  const secrets = getMetaWebhookSignatureSecrets();
  const route = "/meta/webhook";

  if (secrets.length === 0) {
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

  const expectedBuffer = Buffer.from(expected, "hex");
  for (const candidate of secrets) {
    const actual = crypto.createHmac("sha256", candidate.secret).update(rawBody).digest("hex");
    const actualBuffer = Buffer.from(actual, "hex");
    const valid =
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer);

    if (valid) {
      logger.info({
        event: "meta.webhook.signature.valid",
        route,
        requestId,
        secretScope: candidate.secretScope,
      });
      return { ok: true, status: "valid", secretScope: candidate.secretScope };
    }
  }

  logger.warn({
    event: "meta.webhook.signature.invalid",
    route,
    requestId,
    reason: "invalid_signature",
  });
  return { ok: false, statusCode: 403, reason: "invalid_signature" };
}

function getMetaMessagingEvents(payload: MetaWebhookPayload) {
  const events: Array<{
    pageId: string;
    event: MetaMessagingEvent;
    entryIndex: number;
    eventIndex: number;
  }> = [];
  for (const [entryIndex, entry] of (payload.entry ?? []).entries()) {
    const entryPageId = normalizeId(entry.id);
    for (const [eventIndex, messaging] of (entry.messaging ?? []).entries()) {
      const pageId = normalizeId(messaging.recipient?.id) || entryPageId;
      events.push({ pageId, event: messaging, entryIndex, eventIndex });
    }
  }
  return events;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedRecord(record: Record<string, unknown> | null, key: string) {
  return record ? asPlainRecord(record[key]) : null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }
  return "";
}

function getInstagramMessageEditRecord(event: MetaMessagingEvent) {
  return asPlainRecord(event.message_edit);
}

function getInstagramMessageEditParts(event: MetaMessagingEvent) {
  const messageEdit = getInstagramMessageEditRecord(event);
  const nestedMessage = getNestedRecord(messageEdit, "message");
  const sender = getNestedRecord(messageEdit, "sender") ?? getNestedRecord(messageEdit, "from");
  const recipient =
    getNestedRecord(messageEdit, "recipient") ?? getNestedRecord(messageEdit, "to");

  return {
    senderId: pickString(sender?.id, messageEdit?.sender_id, messageEdit?.from_id),
    recipientId: pickString(recipient?.id, messageEdit?.recipient_id, messageEdit?.to_id),
    messageId: pickString(
      nestedMessage?.mid,
      nestedMessage?.id,
      messageEdit?.mid,
      messageEdit?.message_id,
      messageEdit?.id
    ),
    text: pickString(nestedMessage?.text, messageEdit?.text),
    timestamp: pickString(messageEdit?.timestamp, nestedMessage?.timestamp),
    messageEdit,
    nestedMessage,
    sender,
    recipient,
  };
}

function getEventExternalUserId(channel: Channel, event: MetaMessagingEvent) {
  if (channel === "instagram") {
    return normalizeId(event.sender?.id) || getInstagramMessageEditParts(event).senderId;
  }
  return normalizeId(event.sender?.id);
}

function getChannelEventExternalUserHash(channel: Channel, event: MetaMessagingEvent) {
  return hashExternalUserId(getEventExternalUserId(channel, event));
}

function getEventMessageId(channel: Channel, event: MetaMessagingEvent) {
  if (channel === "instagram") {
    const messageEditId = getInstagramMessageEditParts(event).messageId;
    if (messageEditId) return messageEditId;
  }
  const mid = event.message?.mid;
  return typeof mid === "string" || typeof mid === "number" ? String(mid).trim() || null : null;
}

function isMetaEchoEvent(event: MetaMessagingEvent) {
  return event.message?.is_echo === true;
}

function hasMetaText(event: MetaMessagingEvent) {
  return typeof event.message?.text === "string" && event.message.text.trim().length > 0;
}

function hasChannelText(channel: Channel, event: MetaMessagingEvent) {
  if (hasMetaText(event)) return true;
  if (channel === "instagram") {
    return getInstagramMessageEditParts(event).text.length > 0;
  }
  return false;
}

function getEventTimestamp(channel: Channel, event: MetaMessagingEvent) {
  if (typeof event.timestamp === "number" && Number.isFinite(event.timestamp)) {
    return new Date(event.timestamp).toISOString();
  }
  if (channel === "instagram") {
    const timestamp = getInstagramMessageEditParts(event).timestamp;
    if (timestamp) {
      const parsed = Number(timestamp);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      return timestamp;
    }
  }
  return undefined;
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function safeKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function getEntryShape(entry: MetaWebhookEntry) {
  return {
    keys: safeKeys(entry),
    messagingCount: Array.isArray(entry.messaging) ? entry.messaging.length : 0,
    changesCount: Array.isArray(entry.changes) ? entry.changes.length : 0,
    messagingType: valueType(entry.messaging),
    changesType: valueType(entry.changes),
  };
}

function classifyInstagramUnsupportedEvent(event: MetaMessagingEvent) {
  if (event.message?.is_echo === true) return "echo";
  if (event.read) return "read";
  if (event.delivery) return "delivery";
  if (event.reaction) return "reaction";
  if (event.standby) return "standby";
  if (Array.isArray(event.message?.attachments) && event.message.attachments.length > 0) {
    return "attachment_candidate";
  }
  const messageEdit = getInstagramMessageEditParts(event);
  if (messageEdit.text) return "supported_candidate";
  if (messageEdit.messageEdit) return "unsupported_message_edit";
  if (event.message && typeof event.message === "object") return "unsupported_non_text";
  return "unsupported_unknown_shape";
}

function logInstagramPayloadShapeAudit(params: {
  payload: MetaWebhookPayload;
  entryIndex: number;
  eventIndex: number;
  event: MetaMessagingEvent;
  requestId: string;
  tenantKey?: string;
  channelAccountId: string;
  unsupportedClass: string;
}) {
  const entry = params.payload.entry?.[params.entryIndex];
  const event = params.event;
  const messageEdit = getInstagramMessageEditParts(event);
  logger.info({
    event: "instagram.payload_shape.audit",
    route: "/meta/webhook",
    requestId: params.requestId,
    object: typeof params.payload.object === "string" ? params.payload.object : "unknown",
    tenantKey: params.tenantKey ?? null,
    channelAccountId: params.channelAccountId || null,
    unsupportedClass: params.unsupportedClass,
    topLevelKeys: safeKeys(params.payload),
    entryIndex: params.entryIndex,
    entryShape: entry ? getEntryShape(entry) : null,
    eventIndex: params.eventIndex,
    eventKeys: safeKeys(event),
    sender: {
      present: Boolean(event.sender),
      keys: safeKeys(event.sender),
      idType: valueType(event.sender?.id),
    },
    recipient: {
      present: Boolean(event.recipient),
      keys: safeKeys(event.recipient),
      idType: valueType(event.recipient?.id),
    },
    message: {
      present: Boolean(event.message),
      keys: safeKeys(event.message),
      midType: valueType(event.message?.mid),
      textType: valueType(event.message?.text),
      hasText: typeof event.message?.text === "string" && event.message.text.trim().length > 0,
      isEcho: event.message?.is_echo === true,
      attachmentsType: valueType(event.message?.attachments),
      attachmentsCount: Array.isArray(event.message?.attachments)
        ? event.message.attachments.length
        : 0,
    },
    messageEdit: {
      present: Boolean(messageEdit.messageEdit),
      type: valueType(event.message_edit),
      keys: safeKeys(event.message_edit),
      senderKeys: safeKeys(messageEdit.sender),
      senderIdType: valueType(messageEdit.sender?.id),
      recipientKeys: safeKeys(messageEdit.recipient),
      recipientIdType: valueType(messageEdit.recipient?.id),
      messageKeys: safeKeys(messageEdit.nestedMessage),
      midType: valueType(messageEdit.nestedMessage?.mid ?? messageEdit.messageEdit?.mid),
      textType: valueType(messageEdit.nestedMessage?.text ?? messageEdit.messageEdit?.text),
      hasText: messageEdit.text.length > 0,
      timestampType: valueType(
        messageEdit.messageEdit?.timestamp ?? messageEdit.nestedMessage?.timestamp
      ),
    },
    callbackPresence: {
      read: Boolean(event.read),
      delivery: Boolean(event.delivery),
      reaction: Boolean(event.reaction),
      standby: Boolean(event.standby),
      postback: Boolean(event.postback),
      referral: Boolean(event.referral),
    },
    callbackKeys: {
      read: safeKeys(event.read),
      delivery: safeKeys(event.delivery),
      reaction: safeKeys(event.reaction),
      standby: safeKeys(event.standby),
      postback: safeKeys(event.postback),
      referral: safeKeys(event.referral),
    },
  });
}

function logPassiveReceived(params: {
  requestId: string;
  channel: Channel;
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
    channel: params.channel,
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
  channel: Channel;
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
    channel: params.channel,
    provider: "meta",
    channelAccountId: params.channelAccountId || null,
    tenantKey: params.tenantKey ?? null,
    externalUserHash: params.externalUserHash,
    externalMessageId: params.externalMessageId,
    resolution: params.resolution,
    passive: true,
  });
}

function logRuntimeDryRun(params: {
  requestId: string;
  normalized: ReturnType<typeof normalizeChannelInboundEvent>;
  tenantKey: string;
  externalUserHash: string | null;
  phase: "started" | "completed" | "skipped" | "failed";
  details?: Record<string, unknown>;
}) {
  logger.info({
    event: `channel.runtime_dry_run.${params.phase}`,
    route: "/meta/webhook",
    requestId: params.requestId,
    tenantKey: params.tenantKey,
    channel: params.normalized.channel,
    provider: params.normalized.provider,
    channelAccountId: params.normalized.channelAccountId,
    externalMessageId: params.normalized.externalMessageId ?? null,
    externalUserHash: params.externalUserHash,
    passive: true,
    dryRun: true,
    ...(params.details ?? {}),
  });
}

function logRuntimeGate(params: {
  requestId: string;
  channel: Channel;
  tenantKey?: string;
  channelAccountId: string;
  reason: string;
  allowed: boolean;
  outboundAllowed: boolean;
  aiAllowed: boolean;
  handoffAllowed: boolean;
}) {
  logger.info({
    event: params.allowed ? "channel.runtime_gate.allowed" : "channel.runtime_gate.blocked",
    route: "/meta/webhook",
    requestId: params.requestId,
    tenantKey: params.tenantKey ?? null,
    channel: params.channel,
    provider: "meta",
    channelAccountId: params.channelAccountId || null,
    reason: params.reason,
    outboundAllowed: params.outboundAllowed,
    aiAllowed: params.aiAllowed,
    handoffAllowed: params.handoffAllowed,
    passive: true,
    wouldEnterRuntime: params.allowed,
    wouldSendOutbound: false,
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

  const channel: Channel = parsed.object === "instagram" ? "instagram" : "messenger";

  if (parsed.object !== "page" && parsed.object !== "instagram") {
    recordObservedChannelEvent({
      provider: "meta",
      channel,
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

  const events = getMetaMessagingEvents(parsed);
  if (events.length === 0) {
    recordObservedChannelEvent({
      provider: "meta",
      channel,
      channelAccountId: "unknown",
      resolution: "no_messaging_events",
      eventType: "unsupported",
    });
    logger.info({
      event: "meta.webhook.unsupported",
      route: "/meta/webhook",
      requestId: options.requestId,
      object: typeof parsed.object === "string" ? parsed.object : "unknown",
      reason: "no_messaging_events",
    });
    return { ok: true, normalizedCount: 0, unsupportedCount: 1 };
  }

  const registry = options.registry ?? createDefaultChannelAdapterRegistry();
  const tenants = options.tenants ?? (await getTenants());
  let normalizedCount = 0;
  let unsupportedCount = 0;

  for (const item of events) {
    const externalUserHash = getChannelEventExternalUserHash(channel, item.event);
    const externalMessageId = getEventMessageId(channel, item.event);
    const resolution = resolveTenantForChannelAccount({
      tenants,
      channel,
      provider: "meta",
      channelAccountId: item.pageId,
    });
    logPassiveReceived({
      requestId: options.requestId,
      channel,
      channelAccountId: item.pageId,
      externalUserHash,
      externalMessageId,
      tenantKey: resolution.tenantKey,
      resolution: resolution.resolution,
    });
    logTenantResolution({
      requestId: options.requestId,
      channel,
      channelAccountId: item.pageId,
      externalUserHash,
      externalMessageId,
      tenantKey: resolution.tenantKey,
      resolution: resolution.resolution,
    });
    recordObservedChannelEvent({
      provider: "meta",
      channel,
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
    if (isMetaEchoEvent(item.event)) {
      unsupportedCount += 1;
      logger.info({
        event: "meta.webhook.unsupported",
        route: "/meta/webhook",
        requestId: options.requestId,
        object: typeof parsed.object === "string" ? parsed.object : "unknown",
        channel,
        provider: "meta",
        channelAccountId: item.pageId || null,
        tenantKey: resolution.tenantKey ?? null,
        externalUserHash,
        externalMessageId,
        reason: `${channel}_echo`,
      });
      continue;
    }
    if (!hasChannelText(channel, item.event)) {
      unsupportedCount += 1;
      const unsupportedClass =
        channel === "instagram"
          ? classifyInstagramUnsupportedEvent(item.event)
          : `${channel}_non_text_event`;
      if (channel === "instagram") {
        logInstagramPayloadShapeAudit({
          payload: parsed,
          entryIndex: item.entryIndex,
          eventIndex: item.eventIndex,
          event: item.event,
          requestId: options.requestId,
          tenantKey: resolution.tenantKey,
          channelAccountId: item.pageId,
          unsupportedClass,
        });
      }
      logger.info({
        event: "meta.webhook.unsupported",
        route: "/meta/webhook",
        requestId: options.requestId,
        object: typeof parsed.object === "string" ? parsed.object : "unknown",
        channel,
        provider: "meta",
        channelAccountId: item.pageId || null,
        tenantKey: resolution.tenantKey ?? null,
        externalUserHash,
        externalMessageId,
        reason: `${channel}_non_text_event`,
        unsupportedClass,
      });
      continue;
    }
    const tenantKey = resolution.tenantKey ?? "unknown";
    const tenant = tenants[tenantKey];
    const accountForPersistence =
      tenant && resolution.tenantKey
        ? findTenantChannelAccount(tenant.channelAccounts ?? [], {
            tenantKey: resolution.tenantKey,
            channel,
            provider: "meta",
            channelAccountId: item.pageId,
          }) ?? resolution.account
        : resolution.account;
    const runtimeGate = resolveChannelRuntimeGate(accountForPersistence);
    const persistencePlan = buildChannelPersistencePlan(
      {
        tenantKey,
        channel,
        provider: "meta",
        channelAccountId: item.pageId,
        externalUserId: getEventExternalUserId(channel, item.event),
        ...(externalMessageId ? { externalMessageId } : {}),
        ...(getEventTimestamp(channel, item.event)
          ? { timestamp: getEventTimestamp(channel, item.event) }
          : {}),
      },
      tenant
    );
    const shadowPlan = buildChannelRuntimeShadowPlan({
      tenantKey,
      channel,
      provider: "meta",
      channelAccountId: item.pageId,
      externalUserHash,
      resolution: resolution.resolution,
      gate: runtimeGate,
      qualificationEnabled: tenant?.aiQualification?.enabled === true,
      persistencePlanSummary: summarizeChannelPersistencePlan(persistencePlan),
    });
    logRuntimeGate({
      requestId: options.requestId,
      channel,
      tenantKey: resolution.tenantKey,
      channelAccountId: item.pageId,
      reason: runtimeGate.reason,
      allowed: runtimeGate.allowed,
      outboundAllowed: runtimeGate.outboundAllowed,
      aiAllowed: runtimeGate.aiAllowed,
      handoffAllowed: runtimeGate.handoffAllowed,
    });
    logger.info({
      ...buildChannelRuntimeShadowPlanLog(shadowPlan),
      route: "/meta/webhook",
      requestId: options.requestId,
    });

    try {
      const normalized = normalizeChannelInboundEvent({
        tenantKey,
        channel,
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

      if (!tenant) {
        logRuntimeDryRun({
          requestId: options.requestId,
          normalized,
          tenantKey,
          externalUserHash: hashExternalUserId(normalized.externalUserId),
          phase: "skipped",
          details: { reason: "tenant_config_missing" },
        });
        continue;
      }

      if (normalized.channel === "instagram") {
        await persistInstagramInboundEvent({
          event: normalized,
          tenantKey,
          account: accountForPersistence,
          requestId: options.requestId,
        });
      } else {
        await persistMessengerInboundEvent({
          event: normalized,
          tenantKey,
          account: accountForPersistence,
          requestId: options.requestId,
        });
      }

      try {
        logRuntimeDryRun({
          requestId: options.requestId,
          normalized,
          tenantKey,
          externalUserHash: hashExternalUserId(normalized.externalUserId),
          phase: "started",
        });
        const runtimeIdentity = {
          tenantKey,
          channel: normalized.channel,
          provider: normalized.provider,
          channelAccountId: normalized.channelAccountId,
          externalUserHash: hashExternalUserId(normalized.externalUserId) ?? "",
        };
        const session = getOrCreateDryRunSession(runtimeIdentity);
        const dryRun = simulateChannelRuntimeDryRun({
          event: normalized,
          tenant,
          externalUserHash: hashExternalUserId(normalized.externalUserId),
          initialState: {
            aiQualification: session.aiQualification,
            flowContext: session.flowContext,
            flowTags: session.flowTags,
          },
        });
        const updatedSession = updateDryRunSession(runtimeIdentity, dryRun, { shadowPlan });
        logRuntimeDryRun({
          requestId: options.requestId,
          normalized,
          tenantKey,
          externalUserHash: hashExternalUserId(normalized.externalUserId),
          phase: "completed",
          details: {
            dryRunSessionId: updatedSession.id,
            dryRunTurnCount: updatedSession.turnCount,
            qualificationRan: dryRun.qualification.ran,
            qualificationStage: dryRun.qualification.stage ?? null,
            capturedSlotCount: dryRun.qualification.capturedSlotKeys.length,
            completedSlotCount: dryRun.qualification.completedSlots.length,
            missingSlotCount: dryRun.qualification.missingSlots.length,
            readyForHandoff: dryRun.qualification.readyForHandoff,
            crmEnriched: dryRun.crm.enriched,
            flowContextKeys: dryRun.crm.flowContextKeys,
            flowTagCount: dryRun.crm.flowTagCount,
            summaryLineCount: dryRun.crm.summaryLineCount,
            wouldPromptHandoff: dryRun.handoff.wouldPrompt,
            wouldActivateHandoff: dryRun.handoff.wouldActivate,
            wouldContinueToOrchestrator: dryRun.orchestrator.wouldContinue,
            orchestratorExecuted: dryRun.orchestrator.executed,
            wouldPersist: dryRun.persistence.wouldPersist,
            wouldSendOutbound: dryRun.outbound.wouldSend,
          },
        });
      } catch (error) {
        logRuntimeDryRun({
          requestId: options.requestId,
          normalized,
          tenantKey,
          externalUserHash: hashExternalUserId(normalized.externalUserId),
          phase: "failed",
          details: { reason: (error as Error).message },
        });
      }
    } catch (error) {
      unsupportedCount += 1;
      logger.warn({
        event: "meta.webhook.error",
        route: "/meta/webhook",
        requestId: options.requestId,
        channel,
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
