import type { NormalizedMessage } from "../domain/whatsapp/types.js";
import type { ChannelCapabilities } from "./channelAdapter.types.js";
import type {
  CanSendResult,
  ChannelAdapter,
  OutboundMessageRequest,
  OutboundMessageResult,
} from "./channelAdapter.types.js";
import { normalizeWhatsAppInbound } from "./whatsappChannelAdapter.js";

export type WhatsAppPassiveInboundRaw = {
  tenantKey: string;
  phoneNumberId: string;
  message: NormalizedMessage;
};

const WHATSAPP_PASSIVE_CAPABILITIES: ChannelCapabilities = {
  inbound: true,
  outboundText: false,
  outboundMedia: false,
  templates: false,
  humanHandoff: true,
};

export class WhatsAppPassiveAdapter implements ChannelAdapter<WhatsAppPassiveInboundRaw> {
  readonly channel = "whatsapp" as const;
  readonly provider = "meta" as const;

  normalizeInbound(raw: WhatsAppPassiveInboundRaw) {
    return normalizeWhatsAppInbound(raw);
  }

  getCapabilities() {
    return WHATSAPP_PASSIVE_CAPABILITIES;
  }

  canSend(_request: OutboundMessageRequest): CanSendResult {
    return { ok: false, reason: "passive_mode" };
  }

  async sendText(_request: OutboundMessageRequest): Promise<OutboundMessageResult> {
    return {
      ok: false,
      reason: "passive_mode",
      status: "not_sent",
      errorBody: "WhatsApp passive adapter does not send outbound messages.",
    };
  }
}

export function createWhatsAppPassiveAdapter() {
  return new WhatsAppPassiveAdapter();
}
