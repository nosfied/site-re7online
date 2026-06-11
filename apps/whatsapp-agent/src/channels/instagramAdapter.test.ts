import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultChannelAdapterRegistry, normalizeChannelInboundEvent } from "./channelNormalizationFacade.js";
import { createInstagramPassiveAdapter } from "./instagramAdapter.passive.js";

const instagramPayload = {
  object: "instagram",
  entry: [
    {
      id: "ig-account-1",
      time: 1760000000000,
      messaging: [
        {
          sender: { id: "ig-user-1" },
          recipient: { id: "ig-account-1" },
          timestamp: 1760000000000,
          message: {
            mid: "ig-mid-1",
            text: "oi instagram",
          },
        },
      ],
    },
  ],
};

test("instagram passive adapter normalizes webhook payload", () => {
  const adapter = createInstagramPassiveAdapter();
  const event = adapter.normalizeInbound({
    tenantKey: "tenant-a",
    payload: instagramPayload,
  });

  assert.equal(event.tenantKey, "tenant-a");
  assert.equal(event.channel, "instagram");
  assert.equal(event.provider, "meta");
  assert.equal(event.channelAccountId, "ig-account-1");
  assert.equal(event.externalUserId, "ig-user-1");
  assert.equal(event.externalMessageId, "ig-mid-1");
  assert.equal(event.text, "oi instagram");
  assert.equal(event.raw, instagramPayload);
});

test("instagram passive adapter normalizes message_edit payload shape", () => {
  const adapter = createInstagramPassiveAdapter();
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        time: 1760000000000,
        messaging: [
          {
            timestamp: 1760000000000,
            message_edit: {
              sender: { id: "ig-user-1" },
              message: {
                mid: "ig-mid-1",
                text: "oi instagram",
              },
            },
          },
        ],
      },
    ],
  };

  const event = adapter.normalizeInbound({
    tenantKey: "tenant-a",
    payload,
  });

  assert.equal(event.tenantKey, "tenant-a");
  assert.equal(event.channelAccountId, "ig-account-1");
  assert.equal(event.externalUserId, "ig-user-1");
  assert.equal(event.externalMessageId, "ig-mid-1");
  assert.equal(event.text, "oi instagram");
});

test("instagram passive adapter fails clearly on message_edit without text", () => {
  const adapter = createInstagramPassiveAdapter();
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        time: 1760000000000,
        messaging: [
          {
            timestamp: 1760000000000,
            sender: { id: "ig-user-1" },
            recipient: { id: "ig-account-1" },
            message_edit: {
              mid: "ig-mid-1",
              num_edit: 1,
            },
          },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      adapter.normalizeInbound({
        tenantKey: "tenant-a",
        payload,
      }),
    /instagram_text_required/
  );
});

test("instagram inbound facade builds tenant/channel/account/user conversation key", () => {
  const event = normalizeChannelInboundEvent({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    raw: {
      tenantKey: "tenant-a",
      payload: instagramPayload,
    },
  });

  assert.equal(event.conversationKey, "tenant-a:instagram:ig-account-1:ig-user-1");
});

test("instagram passive adapter fails clearly without sender", () => {
  const adapter = createInstagramPassiveAdapter();

  assert.throws(
    () =>
      adapter.normalizeInbound({
        tenantKey: "tenant-a",
        payload: {
          object: "instagram",
          entry: [{ id: "ig-account-1", messaging: [{ recipient: { id: "ig-account-1" } }] }],
        },
      }),
    /senderId_required/
  );
});

test("instagram passive adapter fails clearly without account id", () => {
  const adapter = createInstagramPassiveAdapter();

  assert.throws(
    () =>
      adapter.normalizeInbound({
        tenantKey: "tenant-a",
        payload: {
          object: "instagram",
          entry: [{ messaging: [{ sender: { id: "ig-user-1" } }] }],
        },
      }),
    /instagramAccountId_required/
  );
});

test("instagram passive adapter does not send outbound messages", async () => {
  const adapter = createInstagramPassiveAdapter();
  const request = {
    tenantKey: "tenant-a",
    channel: "instagram" as const,
    provider: "meta" as const,
    channelAccountId: "ig-account-1",
    externalUserId: "ig-user-1",
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

test("default channel registry resolves instagram/meta", () => {
  const registry = createDefaultChannelAdapterRegistry();

  assert.equal(registry.has("instagram", "meta"), true);
  assert.equal(registry.resolve("instagram", "meta").channel, "instagram");
});
