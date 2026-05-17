import type { Channel, NormalizedInboundEvent, Provider } from "./channel.types.js";
import { assertValidNormalizedInboundEvent, buildConversationKey } from "./channelIdentity.js";
import { ChannelAdapterRegistry } from "./channelAdapterRegistry.js";
import { createInstagramPassiveAdapter } from "./instagramAdapter.passive.js";
import { createMessengerPassiveAdapter } from "./messengerAdapter.passive.js";
import { createWhatsAppPassiveAdapter } from "./whatsappAdapter.passive.js";

export type NormalizeChannelInboundEventInput<TRaw = unknown> = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  raw: TRaw;
  registry?: ChannelAdapterRegistry;
};

export type NormalizedChannelInboundEvent = NormalizedInboundEvent & {
  conversationKey: string;
};

export function createDefaultChannelAdapterRegistry() {
  const registry = new ChannelAdapterRegistry();
  registry.register(createWhatsAppPassiveAdapter());
  registry.register(createInstagramPassiveAdapter());
  registry.register(createMessengerPassiveAdapter());
  return registry;
}

export function normalizeChannelInboundEvent<TRaw = unknown>(
  input: NormalizeChannelInboundEventInput<TRaw>
): NormalizedChannelInboundEvent {
  const registry = input.registry ?? createDefaultChannelAdapterRegistry();
  const adapter = registry.resolve(input.channel, input.provider);
  const normalized = adapter.normalizeInbound(input.raw);
  const event: NormalizedInboundEvent = {
    ...normalized,
    tenantKey: input.tenantKey,
    channel: input.channel,
    provider: input.provider,
  };

  assertValidNormalizedInboundEvent(event);

  return {
    ...event,
    conversationKey: buildConversationKey({
      tenantKey: event.tenantKey,
      channel: event.channel,
      provider: event.provider,
      channelAccountId: event.channelAccountId,
      externalUserId: event.externalUserId,
    }),
  };
}
