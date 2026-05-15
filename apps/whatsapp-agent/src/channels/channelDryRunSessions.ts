import crypto from "node:crypto";
import type { AIQualificationState, FlowContext } from "../conversation/conversation.types.js";
import type { Channel, Provider } from "./channel.types.js";
import type { ChannelRuntimeDryRunResult } from "./channelRuntimeDryRun.js";
import type { ChannelRuntimeShadowPlan } from "./channelRuntimeShadowPlan.js";

const MAX_DRY_RUN_SESSIONS = 500;
const DEFAULT_DRY_RUN_SESSION_TTL_MS = 30 * 60 * 1000;

export type DryRunSessionIdentity = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserHash: string;
};

export type DryRunSessionState = {
  id: string;
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserHash: string;
  startedAt: string;
  updatedAt: string;
  turnCount: number;
  aiQualification?: AIQualificationState;
  flowContext?: FlowContext;
  flowTags?: string[];
  lastDryRunResult?: {
    qualificationRan?: boolean;
    capturedSlots?: string[];
    readyForHandoff?: boolean;
    wouldAskHandoff?: boolean;
    wouldPersist: false;
    wouldSendOutbound: false;
  };
  lastShadowPlan?: ChannelRuntimeShadowPlan;
};

function normalizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function sessionKey(identity: DryRunSessionIdentity) {
  return [
    identity.tenantKey,
    identity.channel,
    identity.provider,
    identity.channelAccountId,
    identity.externalUserHash,
  ].join(":");
}

function createSessionId() {
  return `dry_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

const sessions = new Map<string, DryRunSessionState>();

function pruneExpired(nowMs = Date.now(), ttlMs = DEFAULT_DRY_RUN_SESSION_TTL_MS) {
  for (const [key, session] of sessions.entries()) {
    const updatedAt = Date.parse(session.updatedAt);
    if (!Number.isFinite(updatedAt) || nowMs - updatedAt > ttlMs) {
      sessions.delete(key);
    }
  }
}

function enforceLimit() {
  while (sessions.size > MAX_DRY_RUN_SESSIONS) {
    const oldest = sessions.keys().next().value as string | undefined;
    if (!oldest) return;
    sessions.delete(oldest);
  }
}

function normalizeIdentity(input: DryRunSessionIdentity): DryRunSessionIdentity {
  const tenantKey = normalizeText(input.tenantKey, 120);
  const channelAccountId = normalizeText(input.channelAccountId, 160);
  const externalUserHash = normalizeText(input.externalUserHash, 120);
  if (!tenantKey || !channelAccountId || !externalUserHash) {
    throw new Error("invalid dry-run session identity");
  }
  return {
    tenantKey,
    channel: input.channel,
    provider: input.provider,
    channelAccountId,
    externalUserHash,
  };
}

export function getOrCreateDryRunSession(
  identityInput: DryRunSessionIdentity,
  options: { nowIso?: string; ttlMs?: number } = {}
) {
  const nowIso = options.nowIso ?? new Date().toISOString();
  pruneExpired(Date.parse(nowIso) || Date.now(), options.ttlMs);
  const identity = normalizeIdentity(identityInput);
  const key = sessionKey(identity);
  const current = sessions.get(key);
  if (current) return current;

  const session: DryRunSessionState = {
    id: createSessionId(),
    ...identity,
    startedAt: nowIso,
    updatedAt: nowIso,
    turnCount: 0,
    flowTags: [],
  };
  sessions.set(key, session);
  enforceLimit();
  return session;
}

export function updateDryRunSession(
  identityInput: DryRunSessionIdentity,
  result: ChannelRuntimeDryRunResult,
  options: { nowIso?: string; ttlMs?: number; shadowPlan?: ChannelRuntimeShadowPlan } = {}
) {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const session = getOrCreateDryRunSession(identityInput, { nowIso, ttlMs: options.ttlMs });
  const next: DryRunSessionState = {
    ...session,
    updatedAt: nowIso,
    turnCount: session.turnCount + 1,
    aiQualification: result.state.aiQualification,
    flowContext: result.state.flowContext,
    flowTags: result.state.flowTags,
    lastDryRunResult: {
      qualificationRan: result.qualification.ran,
      capturedSlots: result.qualification.capturedSlotKeys,
      readyForHandoff: result.qualification.readyForHandoff,
      wouldAskHandoff: result.handoff.wouldPrompt,
      wouldPersist: false,
      wouldSendOutbound: false,
    },
    lastShadowPlan: options.shadowPlan ?? session.lastShadowPlan,
  };
  sessions.set(sessionKey(normalizeIdentity(identityInput)), next);
  enforceLimit();
  return next;
}

export function listDryRunSessions(filter?: {
  tenantKey?: string;
  channel?: Channel;
  provider?: Provider;
  limit?: number;
}) {
  pruneExpired();
  let items = [...sessions.values()];
  if (filter?.tenantKey) items = items.filter((session) => session.tenantKey === filter.tenantKey);
  if (filter?.channel) items = items.filter((session) => session.channel === filter.channel);
  if (filter?.provider) items = items.filter((session) => session.provider === filter.provider);
  const limit = typeof filter?.limit === "number" && Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(MAX_DRY_RUN_SESSIONS, Math.trunc(filter.limit)))
    : 100;
  return items
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export function clearDryRunSessions() {
  const count = sessions.size;
  sessions.clear();
  return count;
}

export function getDryRunSessionStats() {
  pruneExpired();
  const byChannel: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  for (const session of sessions.values()) {
    byChannel[session.channel] = (byChannel[session.channel] ?? 0) + 1;
    byTenant[session.tenantKey] = (byTenant[session.tenantKey] ?? 0) + 1;
  }
  return {
    total: sessions.size,
    max: MAX_DRY_RUN_SESSIONS,
    ttlMinutes: DEFAULT_DRY_RUN_SESSION_TTL_MS / 60_000,
    byChannel,
    byTenant,
  };
}

export function __pruneDryRunSessionsForTest(nowMs: number, ttlMs = DEFAULT_DRY_RUN_SESSION_TTL_MS) {
  pruneExpired(nowMs, ttlMs);
}
