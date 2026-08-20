import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashEndpoint,
  isOperationalMessagePushCandidate,
  isPushSubscriptionCurrentForActiveSession,
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

test("visible presence suppresses push even when focus is unreliable", () => {
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
      nowMs: 301_000,
    }),
    true
  );
});

test("operational message push skips automated bot-only conversations", () => {
  assert.equal(
    isOperationalMessagePushCandidate({
      type: "message.created",
      clientId: "client-1",
      waId: "masked",
      mode: "BOT",
      handoffStatus: "none",
      assignedUserId: null,
      departmentId: null,
      message: {
        direction: "INBOUND",
        type: "TEXT",
        status: "RECEIVED",
        intent: null,
        bodyText: "ola",
        templateName: null,
        templateLang: null,
        requestId: null,
        messageId: "message-1",
        metaMessageId: null,
        errorBody: null,
        createdAt: new Date().toISOString(),
      },
    }),
    false
  );
});

test("operational message push skips management-only messages", () => {
  assert.equal(
    isOperationalMessagePushCandidate({
      type: "message.created",
      clientId: "client-1",
      waId: "masked",
      mode: "HUMAN",
      handoffStatus: "active",
      assignedUserId: null,
      departmentId: "department-1",
      message: {
        inboxVisibility: "management_only",
        direction: "INBOUND",
        type: "TEXT",
        status: "RECEIVED",
        intent: null,
        bodyText: "5",
        templateName: null,
        templateLang: null,
        requestId: null,
        messageId: "message-management",
        metaMessageId: null,
        errorBody: null,
        createdAt: new Date().toISOString(),
      },
    }),
    false
  );
});

test("operational message push allows assigned and human conversations", () => {
  const base = {
    type: "message.created" as const,
    clientId: "client-1",
    waId: "masked",
    message: {
      direction: "INBOUND" as const,
      type: "TEXT",
      status: "RECEIVED" as const,
      intent: null,
      bodyText: "ola",
      templateName: null,
      templateLang: null,
      requestId: null,
      messageId: "message-1",
      metaMessageId: null,
      errorBody: null,
      createdAt: new Date().toISOString(),
    },
  };

  assert.equal(
    isOperationalMessagePushCandidate({
      ...base,
      mode: "BOT",
      handoffStatus: "none",
      assignedUserId: "user-1",
      departmentId: null,
    }),
    true
  );
  assert.equal(
    isOperationalMessagePushCandidate({
      ...base,
      mode: "HUMAN",
      handoffStatus: "active",
      assignedUserId: null,
      departmentId: "department-1",
    }),
    true
  );
});

test("push subscription must be newer than the active session", () => {
  assert.equal(
    isPushSubscriptionCurrentForActiveSession({
      subscriptionUpdatedAt: new Date("2026-06-05T19:01:39.898Z"),
      activeSessionCreatedAt: new Date("2026-06-06T12:26:58.910Z"),
    }),
    false
  );
  assert.equal(
    isPushSubscriptionCurrentForActiveSession({
      subscriptionUpdatedAt: new Date("2026-06-06T12:27:02.000Z"),
      activeSessionCreatedAt: new Date("2026-06-06T12:26:58.910Z"),
    }),
    true
  );
  assert.equal(
    isPushSubscriptionCurrentForActiveSession({
      subscriptionUpdatedAt: new Date("2026-06-06T12:27:02.000Z"),
      activeSessionCreatedAt: null,
    }),
    false
  );
});
