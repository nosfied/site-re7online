import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWebSessionReconnectBackoff,
  classifyWebSessionDisconnect,
  extractWebSessionDisconnectInfo,
  isWebSessionConnectRequested,
  readWebSessionPrePairingOutboundState,
  readWebSessionLifecycle,
  writeWebSessionPrePairingOutboundMetadata,
  writeWebSessionLifecycleMetadata,
} from "./webSessionLifecycle.js";
import { markWebSessionRuntimeState, webSessionMetadataPatch } from "./webSessionConnectionRuntime.js";
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

test("web session lifecycle stores and clears pre-pairing outbound snapshot", () => {
  const metadata = writeWebSessionPrePairingOutboundMetadata(
    { preserved: "yes", webSession: { desiredState: "CONNECTED", qr: "forbidden" } },
    { enabled: true, capturedAt: "2026-08-21T13:09:30.000Z" }
  );
  assert.deepEqual(readWebSessionPrePairingOutboundState(metadata), {
    enabled: true,
    capturedAt: "2026-08-21T13:09:30.000Z",
  });
  assert.equal(JSON.stringify(metadata).includes("forbidden"), false);

  const cleared = writeWebSessionPrePairingOutboundMetadata(metadata, null);
  assert.equal(readWebSessionPrePairingOutboundState(cleared), null);
  assert.equal((cleared.webSession as Record<string, unknown>).desiredState, "CONNECTED");
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
    {
      statusCode: 428,
      boomStatusCode: 428,
      reasonCode: "baileys_428",
      classification: "reconnectable",
      classificationSource: "status_code",
    }
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

test("web session disconnect info preserves safe raw reason details", () => {
  assert.deepEqual(
    extractWebSessionDisconnectInfo({ error: { output: { statusCode: 401 } }, message: "loggedOut" }),
    {
      statusCode: 401,
      boomStatusCode: 401,
      reasonCode: "loggedOut",
      classification: "qr_required",
      classificationSource: "reason_text",
    }
  );
  assert.deepEqual(
    extractWebSessionDisconnectInfo({ reason: "connectionReplaced", output: { statusCode: 440 } }),
    {
      statusCode: 440,
      boomStatusCode: 440,
      reasonCode: "connectionReplaced",
      classification: "qr_required",
      classificationSource: "status_code",
    }
  );
  assert.deepEqual(
    extractWebSessionDisconnectInfo({ reason: "mystery disconnect" }),
    {
      statusCode: null,
      boomStatusCode: null,
      reasonCode: "mystery_disconnect",
      classification: "reconnectable",
      classificationSource: "default",
    }
  );
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

async function markRuntimeForTest(params: {
  metadata: unknown;
  outboundEnabled: boolean;
  observedState: "DISCONNECTED" | "QR_REQUIRED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";
}) {
  let updateData: Record<string, unknown> | null = null;
  const prisma = {
    channelAccount: {
      findUnique: async () => ({
        id: "account-a",
        metadata: params.metadata,
        outboundEnabled: params.outboundEnabled,
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateData = input.data;
        return { id: "account-a" };
      },
    },
  };
  await markWebSessionRuntimeState({
    prisma: prisma as never,
    accountId: "account-a",
    observedState: params.observedState,
    status: params.observedState === "CONNECTED" ? "connected" : "pending",
  });
  assert.notEqual(updateData, null);
  return updateData as unknown as Record<string, unknown>;
}

test("web session CONNECTED restores previous true outbound and consumes snapshot", async () => {
  const metadata = writeWebSessionPrePairingOutboundMetadata(
    { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
    { enabled: true, capturedAt: "2026-08-21T13:09:30.000Z" }
  );
  const update = await markRuntimeForTest({
    metadata,
    outboundEnabled: false,
    observedState: "CONNECTED",
  });
  assert.equal(update.outboundEnabled, true);
  assert.equal(readWebSessionLifecycle(update.metadata).observedState, "CONNECTED");
  assert.equal(readWebSessionPrePairingOutboundState(update.metadata), null);
});

test("web session CONNECTED preserves previous false outbound and consumes snapshot", async () => {
  const metadata = writeWebSessionPrePairingOutboundMetadata(
    { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
    { enabled: false, capturedAt: "2026-08-21T13:09:30.000Z" }
  );
  const update = await markRuntimeForTest({
    metadata,
    outboundEnabled: false,
    observedState: "CONNECTED",
  });
  assert.equal(update.outboundEnabled, false);
  assert.equal(readWebSessionPrePairingOutboundState(update.metadata), null);
});

test("web session QR_REQUIRED does not restore pre-pairing outbound", async () => {
  const metadata = writeWebSessionPrePairingOutboundMetadata(
    { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
    { enabled: true, capturedAt: "2026-08-21T13:09:30.000Z" }
  );
  const update = await markRuntimeForTest({
    metadata,
    outboundEnabled: false,
    observedState: "QR_REQUIRED",
  });
  assert.equal("outboundEnabled" in update, false);
  assert.deepEqual(readWebSessionPrePairingOutboundState(update.metadata), {
    enabled: true,
    capturedAt: "2026-08-21T13:09:30.000Z",
  });
});

test("web session CONNECTED without snapshot does not change outbound", async () => {
  const update = await markRuntimeForTest({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
    outboundEnabled: false,
    observedState: "CONNECTED",
  });
  assert.equal("outboundEnabled" in update, false);
  assert.equal(readWebSessionPrePairingOutboundState(update.metadata), null);
});

test("web session CONNECTED preserves admin override when pairing snapshot is absent", async () => {
  const update = await markRuntimeForTest({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
    outboundEnabled: false,
    observedState: "CONNECTED",
  });
  assert.equal("outboundEnabled" in update, false);
  assert.equal(readWebSessionPrePairingOutboundState(update.metadata), null);
});
