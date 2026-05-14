import type { NormalizedInboundEvent } from "./channel.types.js";
import type {
  CanSendResult,
  ChannelAdapter,
  ChannelCapabilities,
  OutboundMessageRequest,
  OutboundMessageResult,
} from "./channelAdapter.types.js";

export type MessengerPassiveInboundRaw = {
  tenantKey: string;
  payload: unknown;
};

type MessengerWebhookPayload = {
  entry?: Array<{
    id?: unknown;
    messaging?: Array<{
      sender?: { id?: unknown };
      recipient?: { id?: unknown };
      timestamp?: unknown;
      message?: {
        mid?: unknown;
        text?: unknown;
      };
    }>;
  }>;
};

const MESSENGER_PASSIVE_CAPABILITIES: ChannelCapabilities = {
  inbound: true,
  outboundText: false,
  outboundMedia: false,
  templates: false,
  humanHandoff: true,
  supportsMedia: false,
  supportsReadReceipts: false,
};

function asRecord(value: unknown): MessengerWebhookPayload {
  if (!value || typeof value !== "object") {
    throw new Error("messenger_payload_invalid");
  }
  return value as MessengerWebhookPayload;
}

function asRequiredString(name: string, value: unknown) {
  const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!normalized) {
    throw new Error(`${name}_required`);
  }
  return normalized;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

export class MessengerPassiveAdapter implements ChannelAdapter<MessengerPassiveInboundRaw> {
  readonly channel = "messenger" as const;
  readonly provider = "meta" as const;

  normalizeInbound(raw: MessengerPassiveInboundRaw): NormalizedInboundEvent {
    const payload = asRecord(raw.payload);
    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];

    const pageId = asRequiredString("pageId", messaging?.recipient?.id ?? entry?.id);
    const senderId = asRequiredString("senderId", messaging?.sender?.id);
    const message = messaging?.message;
    const messageId =
      typeof message?.mid === "string" || typeof message?.mid === "number"
        ? String(message.mid).trim()
        : undefined;
    const text = typeof message?.text === "string" ? message.text.trim() : undefined;

    return {
      tenantKey: raw.tenantKey,
      channel: "messenger",
      provider: "meta",
      channelAccountId: pageId,
      externalUserId: senderId,
      externalMessageId: messageId || undefined,
      externalThreadId: senderId,
      text: text || undefined,
      timestamp: normalizeTimestamp(messaging?.timestamp),
      raw: raw.payload,
    };
  }

  getCapabilities() {
    return MESSENGER_PASSIVE_CAPABILITIES;
  }

  canSend(_request: OutboundMessageRequest): CanSendResult {
    return { ok: false, reason: "passive_mode" };
  }

  async sendText(_request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    return {
      ok: false,
      reason: "passive_mode",
      status: "not_sent",
      errorBody: "Messenger passive adapter does not send outbound messages.",
    };
  }
}

export function createMessengerPassiveAdapter() {
  return new MessengerPassiveAdapter();
}
