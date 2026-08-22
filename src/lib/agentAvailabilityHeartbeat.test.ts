import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENT_ONLINE_TTL_MS,
  isAgentAvailabilityHeartbeatStale,
  normalizeAgentHeartbeatIntervalMs,
  normalizeAgentOnlineTtlMs,
  shouldRunImmediateAgentHeartbeat,
} from "./agentAvailabilityHeartbeat";

const nowMs = Date.parse("2026-08-22T12:00:00.000Z");

test("available intent without recent heartbeat requires immediate heartbeat", () => {
  assert.equal(
    shouldRunImmediateAgentHeartbeat({
      availability: {
        available: true,
        effectiveAvailable: false,
        lastHeartbeatAt: null,
        availabilityChangedAt: "2026-08-22T11:59:00.000Z",
      },
      nowMs,
      onlineTtlMs: DEFAULT_AGENT_ONLINE_TTL_MS,
      lastImmediateHeartbeatAtMs: 0,
    }),
    true
  );
});

test("recent heartbeat makes the agent effectively available without extra immediate heartbeat", () => {
  const availability = {
    available: true,
    effectiveAvailable: true,
    lastHeartbeatAt: "2026-08-22T11:59:45.000Z",
    availabilityChangedAt: "2026-08-22T11:59:00.000Z",
  };

  assert.equal(isAgentAvailabilityHeartbeatStale(availability, nowMs, DEFAULT_AGENT_ONLINE_TTL_MS), false);
  assert.equal(
    shouldRunImmediateAgentHeartbeat({
      availability,
      nowMs,
      onlineTtlMs: DEFAULT_AGENT_ONLINE_TTL_MS,
      lastImmediateHeartbeatAtMs: 0,
    }),
    false
  );
});

test("visibility or focus return triggers heartbeat when the previous heartbeat is stale", () => {
  assert.equal(
    shouldRunImmediateAgentHeartbeat({
      availability: {
        available: true,
        effectiveAvailable: true,
        lastHeartbeatAt: "2026-08-22T11:59:20.000Z",
        availabilityChangedAt: "2026-08-22T11:50:00.000Z",
      },
      nowMs,
      onlineTtlMs: DEFAULT_AGENT_ONLINE_TTL_MS,
      lastImmediateHeartbeatAtMs: 0,
    }),
    true
  );
});

test("immediate heartbeat throttle prevents duplicate calls from focus and visibility events", () => {
  const availability = {
    available: true,
    effectiveAvailable: false,
    lastHeartbeatAt: null,
    availabilityChangedAt: "2026-08-22T11:59:00.000Z",
  };

  assert.equal(
    shouldRunImmediateAgentHeartbeat({
      availability,
      nowMs,
      onlineTtlMs: DEFAULT_AGENT_ONLINE_TTL_MS,
      lastImmediateHeartbeatAtMs: nowMs - 250,
    }),
    false
  );
  assert.equal(
    shouldRunImmediateAgentHeartbeat({
      availability,
      nowMs,
      onlineTtlMs: DEFAULT_AGENT_ONLINE_TTL_MS,
      lastImmediateHeartbeatAtMs: nowMs - 1_250,
    }),
    true
  );
});

test("unavailable intent never sends heartbeat for effective availability", () => {
  assert.equal(
    isAgentAvailabilityHeartbeatStale(
      {
        available: false,
        effectiveAvailable: false,
        lastHeartbeatAt: "2026-08-22T11:59:20.000Z",
        availabilityChangedAt: "2026-08-22T11:59:00.000Z",
      },
      nowMs,
      DEFAULT_AGENT_ONLINE_TTL_MS
    ),
    false
  );
});

test("invalid heartbeat timing values fall back to canonical defaults", () => {
  assert.equal(normalizeAgentHeartbeatIntervalMs(null), 10_000);
  assert.equal(normalizeAgentHeartbeatIntervalMs(500), 10_000);
  assert.equal(normalizeAgentHeartbeatIntervalMs(15_000), 15_000);
  assert.equal(normalizeAgentOnlineTtlMs(undefined), 30_000);
  assert.equal(normalizeAgentOnlineTtlMs(Number.NaN), 30_000);
  assert.equal(normalizeAgentOnlineTtlMs(45_000), 45_000);
});
