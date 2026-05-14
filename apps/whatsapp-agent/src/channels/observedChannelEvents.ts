import crypto from "node:crypto";
import type { Channel, Provider } from "./channel.types.js";

const MAX_OBSERVED_CHANNEL_EVENTS = 500;

export type ObservedChannelEvent = {
  id: string;
  receivedAt: string;
  provider: Provider;
  channel: Channel;
  channelAccountId: string;
  tenantKey?: string;
  resolution: string;
  externalMessageId?: string;
  externalUserHash?: string;
  conversationKey?: string;
  eventType?: "message" | "unsupported" | "unknown";
  passive: true;
};

export type ObservedChannelEventInput = Partial<ObservedChannelEvent> & {
  text?: unknown;
  raw?: unknown;
  token?: unknown;
  accessToken?: unknown;
  externalUserId?: unknown;
};

const observedEvents: ObservedChannelEvent[] = [];

function normalizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeOptionalText(value: unknown, maxLength = 160) {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
}

function normalizeEventType(value: unknown): ObservedChannelEvent["eventType"] {
  return value === "message" || value === "unsupported" || value === "unknown" ? value : "unknown";
}

function isChannel(value: unknown): value is Channel {
  return value === "whatsapp" || value === "instagram" || value === "messenger";
}

function createEventId() {
  return `obs_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function sanitizeObservedChannelEvent(input: ObservedChannelEventInput): ObservedChannelEvent | null {
  const provider = input.provider;
  const channel = input.channel;
  const channelAccountId = normalizeText(input.channelAccountId, 160);
  const resolution = normalizeText(input.resolution, 80);
  if (provider !== "meta" || !isChannel(channel)) {
    return null;
  }
  if (!channelAccountId || !resolution) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id, 120) ?? createEventId(),
    receivedAt: normalizeOptionalText(input.receivedAt, 40) ?? new Date().toISOString(),
    provider,
    channel,
    channelAccountId,
    tenantKey: normalizeOptionalText(input.tenantKey, 120),
    resolution,
    externalMessageId: normalizeOptionalText(input.externalMessageId, 160),
    externalUserHash: normalizeOptionalText(input.externalUserHash, 120),
    conversationKey: normalizeOptionalText(input.conversationKey, 240),
    eventType: normalizeEventType(input.eventType),
    passive: true,
  };
}

export function recordObservedChannelEvent(input: ObservedChannelEventInput) {
  const event = sanitizeObservedChannelEvent(input);
  if (!event) return null;

  observedEvents.push(event);
  while (observedEvents.length > MAX_OBSERVED_CHANNEL_EVENTS) {
    observedEvents.shift();
  }
  return event;
}

export function listObservedChannelEvents(filter?: {
  channel?: Channel;
  provider?: Provider;
  tenantKey?: string;
  resolution?: string;
  limit?: number;
}) {
  let events = observedEvents;
  if (filter?.channel) {
    events = events.filter((event) => event.channel === filter.channel);
  }
  if (filter?.provider) {
    events = events.filter((event) => event.provider === filter.provider);
  }
  if (filter?.tenantKey) {
    events = events.filter((event) => event.tenantKey === filter.tenantKey);
  }
  if (filter?.resolution) {
    events = events.filter((event) => event.resolution === filter.resolution);
  }

  const limit = typeof filter?.limit === "number" && Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(500, Math.trunc(filter.limit)))
    : 100;
  return events.slice(-limit).reverse();
}

export function clearObservedChannelEvents() {
  const count = observedEvents.length;
  observedEvents.length = 0;
  return count;
}

export function getObservedChannelEventStats() {
  const byChannel: Record<string, number> = {};
  const byResolution: Record<string, number> = {};
  const byChannelResolution: Record<string, number> = {};

  for (const event of observedEvents) {
    byChannel[event.channel] = (byChannel[event.channel] ?? 0) + 1;
    byResolution[event.resolution] = (byResolution[event.resolution] ?? 0) + 1;
    const channelResolutionKey = `${event.channel}:${event.resolution}`;
    byChannelResolution[channelResolutionKey] = (byChannelResolution[channelResolutionKey] ?? 0) + 1;
  }

  return {
    total: observedEvents.length,
    max: MAX_OBSERVED_CHANNEL_EVENTS,
    byChannel,
    byResolution,
    byChannelResolution,
  };
}
