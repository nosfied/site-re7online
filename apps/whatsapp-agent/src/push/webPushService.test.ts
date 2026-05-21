import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashEndpoint,
  normalizePushSubscriptionInput,
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
