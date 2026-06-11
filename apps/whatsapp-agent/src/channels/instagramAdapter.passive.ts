import type { NormalizedInboundEvent } from "./channel.types.js";
import type {
  CanSendResult,
  ChannelAdapter,
  ChannelCapabilities,
  OutboundMessageRequest,
  OutboundMessageResult,
} from "./channelAdapter.types.js";

export type InstagramPassiveInboundRaw = {
  tenantKey: string;
  payload: unknown;
};

type InstagramWebhookPayload = {
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
      message_edit?: unknown;
    }>;
  }>;
};

const INSTAGRAM_PASSIVE_CAPABILITIES: ChannelCapabilities = {
  inbound: true,
  outboundText: false,
  outboundMedia: false,
  templates: false,
  humanHandoff: true,
  supportsMedia: false,
  supportsReadReceipts: false,
};

function asRecord(value: unknown): InstagramWebhookPayload {
  if (!value || typeof value !== "object") {
    throw new Error("instagram_payload_invalid");
  }
  return value as InstagramWebhookPayload;
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

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedRecord(record: Record<string, unknown> | null, key: string) {
  return record ? asPlainRecord(record[key]) : null;
}

function normalizeOptionalString(value: unknown) {
  const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return normalized || undefined;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function getInstagramMessageEditParts(messageEditValue: unknown) {
  const messageEdit = asPlainRecord(messageEditValue);
  const nestedMessage = getNestedRecord(messageEdit, "message");
  const sender = getNestedRecord(messageEdit, "sender") ?? getNestedRecord(messageEdit, "from");
  const recipient = getNestedRecord(messageEdit, "recipient") ?? getNestedRecord(messageEdit, "to");

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
  };
}

export class InstagramPassiveAdapter implements ChannelAdapter<InstagramPassiveInboundRaw> {
  readonly channel = "instagram" as const;
  readonly provider = "meta" as const;

  normalizeInbound(raw: InstagramPassiveInboundRaw): NormalizedInboundEvent {
    const payload = asRecord(raw.payload);
    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const messageEdit = getInstagramMessageEditParts(messaging?.message_edit);

    const igAccountId = asRequiredString(
      "instagramAccountId",
      messaging?.recipient?.id ?? messageEdit.recipientId ?? entry?.id
    );
    const senderId = asRequiredString("senderId", messaging?.sender?.id ?? messageEdit.senderId);
    const message = messaging?.message;
    const messageId =
      typeof message?.mid === "string" || typeof message?.mid === "number"
        ? String(message.mid).trim()
        : messageEdit.messageId;
    const text = typeof message?.text === "string" ? message.text.trim() : messageEdit.text;
    if (!text) {
      throw new Error("instagram_text_required");
    }

    return {
      tenantKey: raw.tenantKey,
      channel: "instagram",
      provider: "meta",
      channelAccountId: igAccountId,
      externalUserId: senderId,
      externalMessageId: messageId || undefined,
      externalThreadId: senderId,
      text: text || undefined,
      timestamp: normalizeTimestamp(messaging?.timestamp ?? messageEdit.timestamp),
      raw: raw.payload,
    };
  }

  getCapabilities() {
    return INSTAGRAM_PASSIVE_CAPABILITIES;
  }

  canSend(_request: OutboundMessageRequest): CanSendResult {
    return { ok: false, reason: "passive_mode" };
  }

  async sendText(_request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    return {
      ok: false,
      reason: "passive_mode",
      status: "not_sent",
      errorBody: "Instagram passive adapter does not send outbound messages.",
    };
  }
}

export function createInstagramPassiveAdapter() {
  return new InstagramPassiveAdapter();
}
