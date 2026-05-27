import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelCapabilities } from "./channelAdapter.types.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import { buildConversationKey } from "./channelIdentity.js";
import { ChannelAdapterRegistry } from "./channelAdapterRegistry.js";
import {
  createDefaultChannelAdapterRegistry,
  normalizeChannelInboundEvent,
} from "./channelNormalizationFacade.js";

const whatsappRaw = {
  tenantKey: "tenant-from-raw",
  phoneNumberId: "phone-1",
  message: {
    messageId: "wamid-1",
    from: "558499049614",
    timestamp: "2026-05-14T12:00:00.000Z",
    type: "text" as const,
    text: "oi",
    raw: { id: "wamid-1", type: "text" },
  },
};

test("normalizeChannelInboundEvent normalizes WhatsApp inbound through registry", () => {
  const event = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    raw: whatsappRaw,
  });

  assert.equal(event.tenantKey, "tenant-a");
  assert.equal(event.channel, "whatsapp");
  assert.equal(event.provider, "meta");
  assert.equal(event.channelAccountId, "phone-1");
  assert.equal(event.externalUserId, "558499049614");
  assert.equal(event.externalMessageId, "wamid-1");
  assert.equal(event.text, "oi");
  assert.equal(event.conversationKey, "tenant-a:558499049614");
});

test("normalizeChannelInboundEvent fails clearly when adapter is missing", () => {
  assert.throws(
    () =>
      normalizeChannelInboundEvent({
        tenantKey: "tenant-a",
        channel: "messenger",
        provider: "meta",
        raw: {},
        registry: new ChannelAdapterRegistry(),
      }),
    /channel_adapter_not_found:meta:messenger/
  );
});

test("normalizeChannelInboundEvent preserves WhatsApp conversation key compatibility", () => {
  const event = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    raw: whatsappRaw,
  });

  const compatibleKey = buildConversationKey({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    externalUserId: "558499049614",
  });

  assert.equal(event.conversationKey, compatibleKey);
  assert.equal(event.conversationKey, "tenant-a:558499049614");
});

test("normalizeChannelInboundEvent keeps tenants isolated", () => {
  const tenantA = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    raw: whatsappRaw,
  });
  const tenantB = normalizeChannelInboundEvent({
    tenantKey: "tenant-b",
    channel: "whatsapp",
    provider: "meta",
    raw: whatsappRaw,
  });

  assert.notEqual(tenantA.conversationKey, tenantB.conversationKey);
});

test("normalizeChannelInboundEvent keeps future channels isolated by channel and account", () => {
  const capabilities: ChannelCapabilities = {
    inbound: true,
    outboundText: false,
    outboundMedia: false,
    templates: false,
    humanHandoff: false,
  };
  const registry = new ChannelAdapterRegistry();
  registry.register({
    channel: "instagram",
    provider: "meta",
    getCapabilities: () => capabilities,
    canSend: () => ({ ok: false, reason: "passive_mode" }),
    sendText: async () => ({ ok: false, reason: "passive_mode" }),
    normalizeInbound: () =>
      ({
        tenantKey: "ignored",
        channel: "instagram",
        provider: "meta",
        channelAccountId: "ig-account-1",
        externalUserId: "user-1",
        externalMessageId: "ig-mid-1",
        text: "oi",
      }) satisfies NormalizedInboundEvent,
  });
  registry.register({
    channel: "messenger",
    provider: "meta",
    getCapabilities: () => capabilities,
    canSend: () => ({ ok: false, reason: "passive_mode" }),
    sendText: async () => ({ ok: false, reason: "passive_mode" }),
    normalizeInbound: () =>
      ({
        tenantKey: "ignored",
        channel: "messenger",
        provider: "meta",
        channelAccountId: "page-1",
        externalUserId: "user-1",
        externalMessageId: "mid-1",
        text: "oi",
      }) satisfies NormalizedInboundEvent,
  });

  const instagram = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    raw: {},
    registry,
  });
  const messenger = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    raw: {},
    registry,
  });

  assert.equal(instagram.conversationKey, "tenant-a:instagram:ig-account-1:user-1");
  assert.equal(messenger.conversationKey, "tenant-a:messenger:page-1:user-1");
  assert.notEqual(instagram.conversationKey, messenger.conversationKey);
});

test("createDefaultChannelAdapterRegistry includes passive WhatsApp, Instagram and Messenger adapters", () => {
  const registry = createDefaultChannelAdapterRegistry();

  assert.equal(registry.has("whatsapp", "meta"), true);
  assert.equal(registry.has("instagram", "meta"), true);
  assert.equal(registry.has("messenger", "meta"), true);
});
