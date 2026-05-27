import type { Channel, Provider } from "./channel.types.js";
import type { ChannelAdapter } from "./channelAdapter.types.js";

function adapterKey(channel: Channel, provider: Provider) {
  return `${provider}:${channel}`;
}

export class ChannelAdapterRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter) {
    const key = adapterKey(adapter.channel, adapter.provider);
    if (this.adapters.has(key)) {
      throw new Error(`channel_adapter_already_registered:${key}`);
    }
    this.adapters.set(key, adapter);
  }

  resolve(channel: Channel, provider: Provider) {
    const key = adapterKey(channel, provider);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`channel_adapter_not_found:${key}`);
    }
    return adapter;
  }

  has(channel: Channel, provider: Provider) {
    return this.adapters.has(adapterKey(channel, provider));
  }

  list() {
    return Array.from(this.adapters.values()).map((adapter) => ({
      channel: adapter.channel,
      provider: adapter.provider,
      capabilities: adapter.getCapabilities(),
    }));
  }
}
