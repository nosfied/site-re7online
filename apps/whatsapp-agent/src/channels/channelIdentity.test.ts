import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidChannelIdentity,
  buildConversationKey,
  getLegacyWaIdFromIdentity,
  isWhatsAppIdentity,
  toConversationIdentity,
} from "./channelIdentity.js";
import { normalizeWhatsAppInbound } from "./whatsappChannelAdapter.js";

test("WhatsApp identity keeps legacy conversation key compatibility", () => {
  const identity = toConversationIdentity({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    externalUserId: "558499049614",
  });

  assert.equal(identity.conversationKey, "tenant-a:558499049614");
  assert.equal(identity.legacyWaId, "558499049614");
  assert.equal(getLegacyWaIdFromIdentity(identity), "558499049614");
  assert.equal(isWhatsAppIdentity(identity), true);
  assert.doesNotThrow(() => assertValidChannelIdentity(identity));
});

test("Instagram identity uses channel, account and external user in key", () => {
  const key = buildConversationKey({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-account-1",
    externalUserId: "user-1",
  });

  assert.equal(key, "tenant-a:instagram:ig-account-1:user-1");
});

test("Messenger identity uses channel, account and external user in key", () => {
  const key = buildConversationKey({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    externalUserId: "user-1",
  });

  assert.equal(key, "tenant-a:messenger:page-1:user-1");
});

test("different tenants and channels do not collide", () => {
  const tenantA = buildConversationKey({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "account-1",
    externalUserId: "user-1",
  });
  const tenantB = buildConversationKey({
    tenantKey: "tenant-b",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "account-1",
    externalUserId: "user-1",
  });
  const messenger = buildConversationKey({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "account-1",
    externalUserId: "user-1",
  });

  assert.notEqual(tenantA, tenantB);
  assert.notEqual(tenantA, messenger);
});

test("legacy waId is available only for WhatsApp", () => {
  const instagram = toConversationIdentity({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-account-1",
    externalUserId: "user-1",
    legacyWaId: "558499049614",
  });

  assert.equal(instagram.legacyWaId, undefined);
  assert.equal(getLegacyWaIdFromIdentity(instagram), undefined);
});

test("invalid identity throws", () => {
  assert.throws(
    () =>
      buildConversationKey({
        tenantKey: "",
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "phone-1",
        externalUserId: "558499049614",
      }),
    /tenantKey_required/
  );
  assert.throws(
    () =>
      buildConversationKey({
        tenantKey: "tenant-a",
        channel: "instagram",
        provider: "meta",
        channelAccountId: "account:1",
        externalUserId: "user-1",
      }),
    /channelAccountId_invalid/
  );
  assert.throws(
    () =>
      assertValidChannelIdentity({
        tenantKey: "tenant-a",
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "phone-1",
        externalUserId: "558499049614",
        conversationKey: "wrong",
      }),
    /conversationKey_invalid/
  );
});

test("normalizeWhatsAppInbound creates a normalized passive event", () => {
  const event = normalizeWhatsAppInbound({
    tenantKey: "tenant-a",
    phoneNumberId: "phone-1",
    message: {
      messageId: "wamid-1",
      from: "+55 (84) 99049-9614",
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
  assert.equal(event.externalUserId, "5584990499614");
  assert.equal(event.externalThreadId, "5584990499614");
  assert.equal(event.externalMessageId, "wamid-1");
  assert.equal(event.text, "oi");
});
