import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWebSessionReconnectBackoff,
  classifyWebSessionDisconnect,
  extractWebSessionDisconnectInfo,
  isWebSessionConnectRequested,
  readWebSessionLifecycle,
  writeWebSessionLifecycleMetadata,
} from "./webSessionLifecycle.js";
import { webSessionMetadataPatch } from "./webSessionConnectionRuntime.js";
import { createWebSessionQrMemoryStore } from "./qrMemoryStore.js";

test("web session lifecycle reads defaults and explicit desired state", () => {
  assert.equal(readWebSessionLifecycle(null).desiredState, "DISCONNECTED");
  assert.equal(isWebSessionConnectRequested(null), false);
  assert.equal(
    isWebSessionConnectRequested({ webSession: { desiredState: "CONNECTED" } }),
    true
  );
});

test("web session lifecycle writes durable state without QR", () => {
  const metadata = writeWebSessionLifecycleMetadata(
    { preserved: "yes", webSession: { desiredState: "CONNECTED", qr: "forbidden" } },
    {
      observedState: "QR_REQUIRED",
      lastErrorCode: "qr_required",
      reconnectCount: 2,
    }
  );
  assert.equal(metadata.preserved, "yes");
  assert.equal((metadata.webSession as Record<string, unknown>).desiredState, "CONNECTED");
  assert.equal((metadata.webSession as Record<string, unknown>).observedState, "QR_REQUIRED");
  assert.equal(JSON.stringify(metadata).includes("forbidden"), false);
});

test("web session disconnect classification and backoff are conservative", () => {
  assert.equal(classifyWebSessionDisconnect("logged_out"), "qr_required");
  assert.equal(classifyWebSessionDisconnect("manual_disabled"), "terminal_manual");
  assert.equal(classifyWebSessionDisconnect(new Error("web_session_admin_disconnect")), "terminal_manual");
  assert.equal(
    classifyWebSessionDisconnect({ error: new Error("web_session_admin_disconnect") }),
    "terminal_manual"
  );
  assert.equal(classifyWebSessionDisconnect("network_close"), "reconnectable");
  assert.equal(calculateWebSessionReconnectBackoff({ attempt: 2, random: () => 0.5 }), 4000);
});

test("web session disconnect classification uses Baileys 7 status codes explicitly", () => {
  assert.deepEqual(
    extractWebSessionDisconnectInfo({ lastDisconnect: { error: { output: { statusCode: 428 } } } }),
    { statusCode: 428, reasonCode: "baileys_428", classification: "reconnectable" }
  );
  assert.equal(classifyWebSessionDisconnect({ error: { output: { statusCode: 408 } } }), "reconnectable");
  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 503 } }), "reconnectable");
  assert.equal(classifyWebSessionDisconnect({ statusCode: 515 }), "reconnectable");

  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 401 } }), "qr_required");
  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 403 } }), "qr_required");
  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 411 } }), "qr_required");
  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 440 } }), "qr_required");
  assert.equal(classifyWebSessionDisconnect({ output: { statusCode: 500 } }), "qr_required");
});

test("web session QR memory store expires without persistence", () => {
  let now = 1000;
  const store = createWebSessionQrMemoryStore({ ttlMs: 50, now: () => now });
  store.set("account-a", "qr-secret");
  assert.equal(store.get("account-a"), "qr-secret");
  now = 1100;
  assert.equal(store.get("account-a"), null);
  assert.equal(store.size(), 0);
});

test("web session runtime telemetry records terminal and reconnecting disconnect times", () => {
  const reconnecting = webSessionMetadataPatch(
    { webSession: { desiredState: "CONNECTED", lastDisconnectedAt: "2026-08-11T00:00:00.000Z" } },
    { observedState: "RECONNECTING", lastErrorCode: "reconnectable", reconnectCount: 1 }
  );
  assert.equal((reconnecting.webSession as Record<string, unknown>).observedState, "RECONNECTING");
  assert.equal((reconnecting.webSession as Record<string, unknown>).reconnectCount, 1);
  assert.notEqual(
    (reconnecting.webSession as Record<string, unknown>).lastDisconnectedAt,
    "2026-08-11T00:00:00.000Z"
  );

  const qrRequired = webSessionMetadataPatch(
    { webSession: { desiredState: "CONNECTED", lastDisconnectedAt: "2026-08-11T00:00:00.000Z" } },
    { observedState: "QR_REQUIRED", lastErrorCode: "qr_required" }
  );
  assert.equal((qrRequired.webSession as Record<string, unknown>).observedState, "QR_REQUIRED");
  assert.notEqual(
    (qrRequired.webSession as Record<string, unknown>).lastDisconnectedAt,
    "2026-08-11T00:00:00.000Z"
  );
});
