import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultChannelAdapterRegistry, normalizeChannelInboundEvent } from "./channelNormalizationFacade.js";
import { createMessengerPassiveAdapter } from "./messengerAdapter.passive.js";

const messengerPayload = {
  object: "page",
  entry: [
    {
      id: "page-1",
      time: 1778760000000,
      messaging: [
        {
          sender: { id: "psid-1" },
          recipient: { id: "page-1" },
          timestamp: 1778760000000,
          message: {
            mid: "mid-1",
            text: "olá",
          },
        },
      ],
    },
  ],
};

test("messenger passive adapter normalizes webhook payload", () => {
  const adapter = createMessengerPassiveAdapter();
  const event = adapter.normalizeInbound({
    tenantKey: "tenant-a",
    payload: messengerPayload,
  });

  assert.equal(event.tenantKey, "tenant-a");
  assert.equal(event.channel, "messenger");
  assert.equal(event.provider, "meta");
  assert.equal(event.channelAccountId, "page-1");
  assert.equal(event.externalUserId, "psid-1");
  assert.equal(event.externalThreadId, "psid-1");
  assert.equal(event.externalMessageId, "mid-1");
  assert.equal(event.text, "olá");
  assert.equal(event.timestamp, "2026-05-14T12:00:00.000Z");
});

test("messenger inbound facade builds tenant/channel/page/psid conversation key", () => {
  const event = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    raw: {
      tenantKey: "ignored",
      payload: messengerPayload,
    },
  });

  assert.equal(event.conversationKey, "tenant-a:messenger:page-1:psid-1");
  assert.equal(event.text, "olá");
});

test("messenger passive adapter fails clearly without sender", () => {
  const adapter = createMessengerPassiveAdapter();

  assert.throws(
    () =>
      adapter.normalizeInbound({
        tenantKey: "tenant-a",
        payload: {
          entry: [{ id: "page-1", messaging: [{ recipient: { id: "page-1" }, message: { mid: "mid-1" } }] }],
        },
      }),
    /senderId_required/
  );
});

test("messenger passive adapter fails clearly without page id", () => {
  const adapter = createMessengerPassiveAdapter();

  assert.throws(
    () =>
      adapter.normalizeInbound({
        tenantKey: "tenant-a",
        payload: {
          entry: [{ messaging: [{ sender: { id: "psid-1" }, message: { mid: "mid-1" } }] }],
        },
      }),
    /pageId_required/
  );
});

test("messenger passive adapter does not send outbound messages", async () => {
  const adapter = createMessengerPassiveAdapter();
  const request = {
    tenantKey: "tenant-a",
    channel: "messenger" as const,
    provider: "meta" as const,
    channelAccountId: "page-1",
    externalUserId: "psid-1",
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

test("messenger passive adapter capabilities declare passive mode", () => {
  const adapter = createMessengerPassiveAdapter();

  assert.deepEqual(adapter.getCapabilities(), {
    inbound: true,
    outboundText: false,
    outboundMedia: false,
    templates: false,
    humanHandoff: true,
    supportsMedia: false,
    supportsReadReceipts: false,
  });
});

test("default channel registry resolves messenger/meta", () => {
  const registry = createDefaultChannelAdapterRegistry();

  assert.equal(registry.has("messenger", "meta"), true);
  assert.equal(registry.resolve("messenger", "meta").channel, "messenger");
});
