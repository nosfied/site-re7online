import type { AppAgentAvailability } from "./appClientApi";

export const DEFAULT_AGENT_HEARTBEAT_INTERVAL_MS = 10_000;
export const DEFAULT_AGENT_ONLINE_TTL_MS = 30_000;
export const MIN_IMMEDIATE_AGENT_HEARTBEAT_GAP_MS = 1_000;

export function normalizeAgentHeartbeatIntervalMs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1_000
    ? value
    : DEFAULT_AGENT_HEARTBEAT_INTERVAL_MS;
}

export function normalizeAgentOnlineTtlMs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1_000
    ? value
    : DEFAULT_AGENT_ONLINE_TTL_MS;
}

export function isAgentAvailabilityHeartbeatStale(
  availability: AppAgentAvailability | null,
  nowMs: number,
  onlineTtlMs: number
) {
  if (availability?.available !== true) return false;
  if (!availability.lastHeartbeatAt) return true;
  const heartbeatMs = Date.parse(availability.lastHeartbeatAt);
  if (!Number.isFinite(heartbeatMs)) return true;
  return availability.effectiveAvailable !== true || heartbeatMs < nowMs - onlineTtlMs;
}

export function shouldRunImmediateAgentHeartbeat(params: {
  availability: AppAgentAvailability | null;
  nowMs: number;
  onlineTtlMs: number;
  lastImmediateHeartbeatAtMs: number;
  minGapMs?: number;
}) {
  if (!isAgentAvailabilityHeartbeatStale(params.availability, params.nowMs, params.onlineTtlMs)) {
    return false;
  }
  const minGapMs = params.minGapMs ?? MIN_IMMEDIATE_AGENT_HEARTBEAT_GAP_MS;
  return params.nowMs - params.lastImmediateHeartbeatAtMs >= minGapMs;
}
