import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebSessionPrePairingOutboundIntent } from "./webSessionConnectionAdmin.js";

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
