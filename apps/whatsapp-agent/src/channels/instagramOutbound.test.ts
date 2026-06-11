import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveInstagramOutboundGate,
  sendInstagramTextMessage,
} from "./instagramOutbound.js";

test("resolveInstagramOutboundGate blocks until Instagram token and flags are configured", () => {
  assert.deepEqual(resolveInstagramOutboundGate(null), {
    allowed: false,
    reason: "account_missing",
  });
  assert.deepEqual(
    resolveInstagramOutboundGate({
      id: "account-1",
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-1",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: false,
      status: "connected",
      tokenStatus: "configured",
      instagramBusinessAccessToken: "ig-token",
    }),
    { allowed: false, reason: "outbound_disabled" }
  );
  assert.deepEqual(
    resolveInstagramOutboundGate({
      id: "account-1",
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-1",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      status: "connected",
      tokenStatus: "missing",
    }),
    { allowed: false, reason: "token_missing" }
  );

  const allowed = resolveInstagramOutboundGate({
    id: "account-1",
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-1",
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    status: "connected",
    tokenStatus: "configured",
    instagramBusinessAccessToken: "ig-token",
  });
  assert.equal(allowed.allowed, true);
  if (allowed.allowed) assert.equal(allowed.token, "ig-token");
});

test("resolveInstagramOutboundGate blocks non-Instagram accounts", () => {
  assert.deepEqual(
    resolveInstagramOutboundGate({
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
      pageAccessToken: "page-token",
    }),
    { allowed: false, reason: "channel_disabled" }
  );
});

test("sendInstagramTextMessage calls Instagram Graph API without returning token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendInstagramTextMessage({
    instagramBusinessAccessToken: "ig-token",
    recipientId: "ig-user",
    text: "Oi",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ message_id: "mid.ig.1" }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, status: 200, messageId: "mid.ig.1" });
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.url ?? "", /^https:\/\/graph\.instagram\.com\/v[0-9.]+\/me\/messages$/);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, "Bearer ig-token");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.messaging_type, "RESPONSE");
  assert.equal(body.recipient.id, "ig-user");
  assert.equal(body.message.text, "Oi");
});

test("sendInstagramTextMessage returns safe failed result", async () => {
  const result = await sendInstagramTextMessage({
    instagramBusinessAccessToken: "ig-token",
    recipientId: "ig-user",
    text: "Oi",
    fetchImpl: async () => new Response("blocked", { status: 400 }),
  });

  assert.deepEqual(result, { ok: false, status: 400, errorBody: "blocked" });
});
