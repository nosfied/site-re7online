import { strict as assert } from "node:assert";
import test from "node:test";

import {
  buildAppPushPresenceSnapshot,
  shouldSendAppPushPresenceHeartbeat,
} from "./AppRealtimeBridge";

test("visible app presence sends foreground signal", () => {
  const presence = buildAppPushPresenceSnapshot({
    visibilityState: "visible",
    focused: false,
  });

  assert.equal(presence.visible, true);
  assert.equal(presence.focused, false);
  assert.equal(presence.active, true);
  assert.equal(presence.serviceWorkerMessageType, "converta.app_foreground");
});

test("hidden app presence sends background signal", () => {
  const presence = buildAppPushPresenceSnapshot({
    visibilityState: "hidden",
    focused: false,
  });

  assert.equal(presence.visible, false);
  assert.equal(presence.focused, false);
  assert.equal(presence.active, false);
  assert.equal(presence.serviceWorkerMessageType, "converta.app_background");
});

test("push presence heartbeat preserves the existing cadence", () => {
  const key = "endpoint:1:1";

  assert.equal(
    shouldSendAppPushPresenceHeartbeat({
      force: false,
      key,
      lastSentKey: key,
      now: 1_000,
      lastSentAt: 0,
      intervalMs: 4_000,
    }),
    false
  );
  assert.equal(
    shouldSendAppPushPresenceHeartbeat({
      force: false,
      key,
      lastSentKey: key,
      now: 4_000,
      lastSentAt: 0,
      intervalMs: 4_000,
    }),
    true
  );
});

test("push presence heartbeat sends immediately for state changes and forced updates", () => {
  assert.equal(
    shouldSendAppPushPresenceHeartbeat({
      force: false,
      key: "endpoint:0:0",
      lastSentKey: "endpoint:1:1",
      now: 1_000,
      lastSentAt: 900,
      intervalMs: 4_000,
    }),
    true
  );
  assert.equal(
    shouldSendAppPushPresenceHeartbeat({
      force: true,
      key: "endpoint:1:1",
      lastSentKey: "endpoint:1:1",
      now: 1_000,
      lastSentAt: 999,
      intervalMs: 4_000,
    }),
    true
  );
});
