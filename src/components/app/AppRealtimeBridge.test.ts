import { strict as assert } from "node:assert";
import test from "node:test";

import {
  buildAppPushPresenceSnapshot,
  shouldPlayLocalInboxSound,
  shouldSendAppPushPresenceHeartbeat,
} from "./AppRealtimeBridge";

test("visible app presence sends foreground signal", () => {
  const presence = buildAppPushPresenceSnapshot({
    visibilityState: "visible",
    focused: true,
  });

  assert.equal(presence.visible, true);
  assert.equal(presence.focused, true);
  assert.equal(presence.active, true);
  assert.equal(presence.serviceWorkerMessageType, "converta.app_foreground");
});

test("visible desktop app without window focus sends background signal", () => {
  const presence = buildAppPushPresenceSnapshot({
    visibilityState: "visible",
    focused: false,
    mobileLike: false,
  });

  assert.equal(presence.visible, true);
  assert.equal(presence.focused, false);
  assert.equal(presence.active, false);
  assert.equal(presence.serviceWorkerMessageType, "converta.app_background");
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

test("visible mobile/PWA presence preserves foreground semantics", () => {
  const presence = buildAppPushPresenceSnapshot({
    visibilityState: "visible",
    focused: false,
    mobileLike: true,
  });

  assert.equal(presence.visible, true);
  assert.equal(presence.focused, false);
  assert.equal(presence.active, true);
  assert.equal(presence.serviceWorkerMessageType, "converta.app_foreground");
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

test("local inbox sound plays for visible desktop when enabled", () => {
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "visible",
      mobileLike: false,
      soundEnabled: true,
    }),
    true
  );
});

test("local inbox sound plays for visible blurred desktop window when enabled", () => {
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "visible",
      mobileLike: false,
      soundEnabled: true,
    }),
    true
  );
});

test("local inbox sound plays for hidden desktop when enabled", () => {
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "hidden",
      mobileLike: false,
      soundEnabled: true,
    }),
    true
  );
});

test("local inbox sound does not play when disabled", () => {
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "hidden",
      mobileLike: false,
      soundEnabled: false,
    }),
    false
  );
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "visible",
      mobileLike: false,
      soundEnabled: false,
    }),
    false
  );
});

test("local inbox sound remains disabled for hidden mobile/PWA pages", () => {
  assert.equal(
    shouldPlayLocalInboxSound({
      visibilityState: "hidden",
      mobileLike: true,
      soundEnabled: true,
    }),
    false
  );
});

test("local inbox sound is independent from browser push feature state", () => {
  const baseInput = {
    visibilityState: "hidden" as const,
    mobileLike: false,
    soundEnabled: true,
  };

  assert.equal(shouldPlayLocalInboxSound({ ...baseInput, browserPushEnabled: false }), true);
  assert.equal(shouldPlayLocalInboxSound({ ...baseInput, browserPushEnabled: true }), true);
});
