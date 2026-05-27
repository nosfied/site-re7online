import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptMessengerExternalUserRef,
  encryptMessengerExternalUserRef,
  resolveMessengerOutboundGate,
  sendMessengerTextMessage,
} from "./messengerOutbound.js";

test("messenger external user ref encrypts and decrypts without exposing raw PSID", () => {
  const secret = "test-secret";
  const encrypted = encryptMessengerExternalUserRef("psid_user_123", secret);

  assert.ok(encrypted?.startsWith("enc:v1:"));
  assert.equal(encrypted?.includes("psid_user_123"), false);
  assert.equal(decryptMessengerExternalUserRef(encrypted, secret), "psid_user_123");
});

test("resolveMessengerOutboundGate blocks until token and flags are configured", () => {
  assert.deepEqual(resolveMessengerOutboundGate(null), {
    allowed: false,
    reason: "account_missing",
  });
  assert.deepEqual(
    resolveMessengerOutboundGate({
      id: "account-1",
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      status: "connected",
      tokenStatus: "missing",
    }),
    { allowed: false, reason: "token_missing" }
  );

  const allowed = resolveMessengerOutboundGate({
    id: "account-1",
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    status: "connected",
    tokenStatus: "configured",
    pageAccessToken: "token-1",
  });
  assert.equal(allowed.allowed, true);
  if (allowed.allowed) assert.equal(allowed.token, "token-1");
});

test("sendMessengerTextMessage calls Graph API without returning token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendMessengerTextMessage({
    pageAccessToken: "page-token",
    recipientPsid: "psid-user",
    text: "Oi",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ message_id: "mid.1" }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, status: 200, messageId: "mid.1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://graph.facebook.com/v23.0/me/messages");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, "Bearer page-token");
  assert.equal(String(calls[0]?.init?.body).includes("psid-user"), true);
});

test("sendMessengerTextMessage returns safe failed result", async () => {
  const result = await sendMessengerTextMessage({
    pageAccessToken: "page-token",
    recipientPsid: "psid-user",
    text: "Oi",
    fetchImpl: async () => new Response("bad token", { status: 400 }),
  });

  assert.deepEqual(result, { ok: false, status: 400, errorBody: "bad token" });
});
