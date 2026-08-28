import assert from "node:assert/strict";
import test from "node:test";
import {
  preserveWebSessionPrePairingOutboundIntent,
  resolveWebSessionPrePairingOutboundIntent,
} from "./webSessionConnectionAdmin.js";
import {
  readWebSessionPrePairingOutboundState,
  writeWebSessionPrePairingOutboundMetadata,
} from "./webSessionLifecycle.js";

test("new Web Session first pairing resolves outbound intent to enabled", () => {
  assert.equal(
    resolveWebSessionPrePairingOutboundIntent({
      outboundEnabled: false,
      metadata: { webSession: { desiredState: "DISCONNECTED", observedState: "DISCONNECTED" } },
    }),
    true
  );
});

test("existing Web Session reconnect preserves enabled outbound intent", () => {
  assert.equal(
    resolveWebSessionPrePairingOutboundIntent({
      outboundEnabled: true,
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "DISCONNECTED",
          lastConnectedAt: "2026-08-27T12:00:00.000Z",
        },
      },
    }),
    true
  );
});

test("existing Web Session reconnect preserves explicit disabled outbound intent", () => {
  assert.equal(
    resolveWebSessionPrePairingOutboundIntent({
      outboundEnabled: false,
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "DISCONNECTED",
          lastConnectedAt: "2026-08-27T12:00:00.000Z",
        },
      },
    }),
    false
  );
});

test("controlled Web Session number switch preserves previous enabled outbound intent", () => {
  const metadata = preserveWebSessionPrePairingOutboundIntent({
    outboundEnabled: true,
    metadata: {
      webSession: {
        desiredState: "CONNECTED",
        observedState: "CONNECTED",
        lastConnectedAt: "2026-08-27T12:00:00.000Z",
      },
    },
  });

  assert.equal(readWebSessionPrePairingOutboundState(metadata)?.enabled, true);
});

test("controlled Web Session number switch preserves previous explicit disabled outbound intent", () => {
  const metadata = preserveWebSessionPrePairingOutboundIntent({
    outboundEnabled: false,
    metadata: {
      webSession: {
        desiredState: "CONNECTED",
        observedState: "CONNECTED",
        lastConnectedAt: "2026-08-27T12:00:00.000Z",
      },
    },
  });

  assert.equal(readWebSessionPrePairingOutboundState(metadata)?.enabled, false);
});

test("controlled Web Session number switch does not overwrite an existing outbound snapshot", () => {
  const metadata = preserveWebSessionPrePairingOutboundIntent({
    outboundEnabled: true,
    metadata: writeWebSessionPrePairingOutboundMetadata(
      {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "DISCONNECTED",
          lastConnectedAt: "2026-08-27T12:00:00.000Z",
        },
      },
      { enabled: false, capturedAt: "2026-08-28T17:47:24.000Z" }
    ),
  });

  assert.deepEqual(readWebSessionPrePairingOutboundState(metadata), {
    enabled: false,
    capturedAt: "2026-08-28T17:47:24.000Z",
  });
});
