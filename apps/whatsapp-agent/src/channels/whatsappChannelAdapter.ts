import type { NormalizedMessage } from "../domain/whatsapp/types.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import type { NormalizedInboundEvent } from "./channel.types.js";

export type NormalizeWhatsAppInboundInput = {
  tenantKey: string;
  phoneNumberId: string;
  message: NormalizedMessage;
};

function normalizeTimestamp(timestamp?: string | null) {
  const value = typeof timestamp === "string" ? timestamp.trim() : "";
  return value || undefined;
}

function normalizeText(text?: string | null) {
  if (typeof text !== "string") {
    return undefined;
  }
  return text;
}

export function normalizeWhatsAppInbound(input: NormalizeWhatsAppInboundInput): NormalizedInboundEvent {
  const externalUserId = normalizeWaIdDigits(input.message.from);
  const media = input.message.raw?.media ? [input.message.raw.media] : undefined;

  return {
    tenantKey: input.tenantKey,
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: input.phoneNumberId,
    externalUserId,
    externalMessageId: input.message.messageId,
    externalThreadId: externalUserId,
    text: normalizeText(input.message.text),
    ...(media ? { media } : {}),
    timestamp: normalizeTimestamp(input.message.timestamp),
    raw: input.message.raw,
  };
}
