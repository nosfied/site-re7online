import test from "node:test";
import assert from "node:assert/strict";
import { ChannelAdapterRegistry } from "./channelAdapterRegistry.js";
import { createWhatsAppPassiveAdapter } from "./whatsappAdapter.passive.js";

function makeRegistry() {
  const registry = new ChannelAdapterRegistry();
  registry.register(createWhatsAppPassiveAdapter());
  return registry;
}

test("registry resolves whatsapp/meta adapter", () => {
  const registry = makeRegistry();
  const adapter = registry.resolve("whatsapp", "meta");

  assert.equal(adapter.channel, "whatsapp");
  assert.equal(adapter.provider, "meta");
  assert.equal(registry.has("whatsapp", "meta"), true);
});

test("registry fails clearly for missing adapter", () => {
  const registry = makeRegistry();

  assert.throws(() => registry.resolve("instagram", "meta"), /channel_adapter_not_found:meta:instagram/);
});

test("registry prevents duplicate adapter registration", () => {
  const registry = makeRegistry();

  assert.throws(
    () => registry.register(createWhatsAppPassiveAdapter()),
    /channel_adapter_already_registered:meta:whatsapp/
  );
});

test("whatsapp passive adapter normalizes inbound event", () => {
  const adapter = createWhatsAppPassiveAdapter();
  const event = adapter.normalizeInbound({
    tenantKey: "tenant-a",
    phoneNumberId: "phone-1",
    message: {
      messageId: "wamid-1",
      from: "558499049614",
      timestamp: "2026-05-14T12:00:00.000Z",
      type: "text",
      text: "oi",
      raw: { id: "wamid-1", type: "text" },
    },
  });

  assert.equal(event.tenantKey, "tenant-a");
  assert.equal(event.channel, "whatsapp");
  assert.equal(event.provider, "meta");
  assert.equal(event.channelAccountId, "phone-1");
  assert.equal(event.externalUserId, "558499049614");
  assert.equal(event.externalMessageId, "wamid-1");
  assert.equal(event.text, "oi");
});

test("whatsapp passive adapter does not send outbound messages", async () => {
  const adapter = createWhatsAppPassiveAdapter();
  const request = {
    tenantKey: "tenant-a",
    channel: "whatsapp" as const,
    provider: "meta" as const,
    channelAccountId: "phone-1",
    externalUserId: "558499049614",
    text: "teste",
  };

  assert.deepEqual(adapter.canSend(request), { ok: false, reason: "passive_mode" });
  const result = await adapter.sendText(request);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "passive_mode");
    assert.equal(result.status, "not_sent");
  }
});

test("whatsapp passive adapter capabilities declare passive outbound", () => {
  const adapter = createWhatsAppPassiveAdapter();

  assert.deepEqual(adapter.getCapabilities(), {
    inbound: true,
    outboundText: false,
    outboundMedia: false,
    templates: false,
    humanHandoff: true,
  });
});
