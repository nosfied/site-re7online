import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashEndpoint,
  normalizePushSubscriptionInput,
  shouldSuppressPushForForegroundSubscription,
  updatePushPresence,
} from "./webPushService.js";

test("normalizePushSubscriptionInput accepts valid subscription", () => {
  const result = normalizePushSubscriptionInput({
    endpoint: "https://push.example.test/abc",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  });
  assert.deepEqual(result, {
    endpoint: "https://push.example.test/abc",
    p256dh: "p256dh-key",
    auth: "auth-key",
  });
});

test("normalizePushSubscriptionInput rejects invalid subscription", () => {
  assert.equal(normalizePushSubscriptionInput({ endpoint: "http://example.test", keys: { p256dh: "a", auth: "b" } }), null);
  assert.equal(normalizePushSubscriptionInput({ endpoint: "https://example.test", keys: { p256dh: "", auth: "b" } }), null);
});

test("hashEndpoint redacts endpoint deterministically", () => {
  const endpoint = "https://push.example.test/secret-token";
  assert.equal(hashEndpoint(endpoint), hashEndpoint(endpoint));
  assert.equal(hashEndpoint(endpoint).length, 16);
  assert.equal(hashEndpoint(endpoint).includes("secret-token"), false);
});

test("foreground presence suppresses push only for the matching device", () => {
  const endpointA = "https://push.example.test/device-a";
  const endpointB = "https://push.example.test/device-b";
  assert.deepEqual(
    updatePushPresence({
      clientId: "client-1",
      userId: "user-1",
      endpoint: endpointA,
      visible: true,
      focused: true,
      nowMs: 10_000,
    }),
    { ok: true }
  );

  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint: endpointA,
      nowMs: 20_000,
    }),
    true
  );
  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint: endpointB,
      nowMs: 20_000,
    }),
    false
  );
});

test("hidden or expired presence does not suppress push", () => {
  const endpoint = "https://push.example.test/hidden-device";
  updatePushPresence({
    clientId: "client-1",
    userId: "user-1",
    endpoint,
    visible: false,
    focused: false,
    nowMs: 100_000,
  });
  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint,
      nowMs: 101_000,
    }),
    false
  );

  updatePushPresence({
    clientId: "client-1",
    userId: "user-1",
    endpoint,
    visible: true,
    focused: true,
    nowMs: 200_000,
  });
  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint,
      nowMs: 212_001,
    }),
    false
  );
});

test("desktop visible but unfocused presence does not suppress push", () => {
  const endpoint = "https://push.example.test/desktop-visible-unfocused";
  updatePushPresence({
    clientId: "client-1",
    userId: "user-1",
    endpoint,
    visible: true,
    focused: false,
    nowMs: 300_000,
  });

  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/125",
      deviceLabel: "Desktop",
      nowMs: 301_000,
    }),
    false
  );
});

test("mobile visible presence suppresses push even when focus is unreliable", () => {
  const endpoint = "https://push.example.test/ios-background-stale-visible";
  updatePushPresence({
    clientId: "client-1",
    userId: "user-1",
    endpoint,
    visible: true,
    focused: false,
    nowMs: 300_000,
  });

  assert.equal(
    shouldSuppressPushForForegroundSubscription({
      clientId: "client-1",
      userId: "user-1",
      endpoint,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
      deviceLabel: "iOS PWA",
      nowMs: 301_000,
    }),
    true
  );
});
