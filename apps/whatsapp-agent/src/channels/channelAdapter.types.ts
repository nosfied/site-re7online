import type { Channel, NormalizedInboundEvent, Provider } from "./channel.types.js";

export type ChannelCapabilities = {
  inbound: boolean;
  outboundText: boolean;
  outboundMedia: boolean;
  templates: boolean;
  humanHandoff: boolean;
  supportsMedia?: boolean;
  supportsReadReceipts?: boolean;
};

export type OutboundMessageRequest = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserId: string;
  text: string;
  conversationKey?: string;
  metadata?: Record<string, unknown>;
};

export type OutboundMessageResult =
  | {
      ok: true;
      providerMessageId?: string;
      status?: string;
      raw?: unknown;
    }
  | {
      ok: false;
      reason: "unsupported" | "passive_mode" | "invalid_request" | "provider_error";
      status?: string;
      errorBody?: string;
      raw?: unknown;
    };

export type CanSendResult =
  | { ok: true }
  | { ok: false; reason: OutboundMessageResult extends { ok: false; reason: infer R } ? R : string };

export interface ChannelInboundAdapter<TRaw = unknown> {
  readonly channel: Channel;
  readonly provider: Provider;
  normalizeInbound(raw: TRaw): NormalizedInboundEvent;
  getCapabilities(): ChannelCapabilities;
}

export interface ChannelOutboundAdapter {
  readonly channel: Channel;
  readonly provider: Provider;
  canSend(request: OutboundMessageRequest): CanSendResult;
  sendText(request: OutboundMessageRequest): Promise<OutboundMessageResult>;
  getCapabilities(): ChannelCapabilities;
}

export type ChannelAdapter<TRaw = unknown> = ChannelInboundAdapter<TRaw> & ChannelOutboundAdapter;
