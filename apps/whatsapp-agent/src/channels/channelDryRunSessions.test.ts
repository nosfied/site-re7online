import test from "node:test";
import assert from "node:assert/strict";
import {
  __pruneDryRunSessionsForTest,
  clearDryRunSessions,
  getDryRunSessionStats,
  getOrCreateDryRunSession,
  listDryRunSessions,
  updateDryRunSession,
} from "./channelDryRunSessions.js";
import type { ChannelRuntimeDryRunResult } from "./channelRuntimeDryRun.js";
import { buildChannelRuntimeShadowPlan } from "./channelRuntimeShadowPlan.js";

const identity = {
  tenantKey: "tenant-a",
  channel: "messenger" as const,
  provider: "meta" as const,
  channelAccountId: "page-1",
  externalUserHash: "hash-user-1",
};

function dryRunResult(): ChannelRuntimeDryRunResult {
  return {
    ok: true,
    dryRun: true,
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    externalMessageId: "mid-1",
    externalUserHash: "hash-user-1",
    qualification: {
      ran: true,
      stage: "collecting",
      currentSlot: "produto_interesse",
      completedSlots: ["tipo_atendimento"],
      missingSlots: ["produto_interesse"],
      capturedSlotKeys: ["tipo_atendimento"],
      readyForHandoff: false,
      outcome: null,
      logEvents: ["ai.qualification.slot_captured"],
    },
    crm: {
      enriched: true,
      flowContextKeys: ["qualification"],
      flowTagCount: 1,
      summaryLineCount: 1,
      nextStep: "Continuar qualificação.",
    },
    handoff: {
      wouldPrompt: false,
      wouldActivate: false,
    },
    orchestrator: {
      wouldContinue: true,
      executed: false,
    },
    persistence: {
      wouldPersist: false,
    },
    outbound: {
      wouldSend: false,
    },
    state: {
      aiQualification: {
        enabledSnapshot: true,
        schemaVersion: "1",
        stage: "collecting",
        currentSlot: "produto_interesse",
        slots: { tipo_atendimento: "varejo" },
        completedSlots: ["tipo_atendimento"],
        missingSlots: ["produto_interesse"],
        lastQuestion: "Qual produto?",
        readyForHandoff: false,
        outcome: null,
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
      flowContext: {
        qualification: { source: "aiQualification" },
      },
      flowTags: ["qualification:slot:tipo_atendimento"],
    },
  };
}

test.beforeEach(() => {
  clearDryRunSessions();
});

test.afterEach(() => {
  clearDryRunSessions();
});

test("getOrCreateDryRunSession creates and reuses session by redacted identity", () => {
  const first = getOrCreateDryRunSession(identity, { nowIso: "2026-01-01T12:00:00.000Z" });
  const second = getOrCreateDryRunSession(identity, { nowIso: "2026-01-01T12:01:00.000Z" });

  assert.equal(first.id, second.id);
  assert.equal(first.turnCount, 0);
  assert.equal(first.externalUserHash, "hash-user-1");
  assert.equal(Object.prototype.hasOwnProperty.call(first, "externalUserId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(first, "text"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(first, "raw"), false);
});

test("updateDryRunSession stores qualification state and result without outbound or persistence", () => {
  const shadowPlan = buildChannelRuntimeShadowPlan({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    externalUserHash: "hash-user-1",
    resolution: "matched_enabled",
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: false,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: true,
  });
  const updated = updateDryRunSession(identity, dryRunResult(), {
    nowIso: "2026-01-01T12:02:00.000Z",
    shadowPlan,
  });

  assert.equal(updated.turnCount, 1);
  assert.equal(updated.aiQualification?.slots?.tipo_atendimento, "varejo");
  assert.deepEqual(updated.flowTags, ["qualification:slot:tipo_atendimento"]);
  assert.deepEqual(updated.lastDryRunResult?.capturedSlots, ["tipo_atendimento"]);
  assert.equal(updated.lastDryRunResult?.wouldPersist, false);
  assert.equal(updated.lastDryRunResult?.wouldSendOutbound, false);
  assert.equal(updated.lastShadowPlan?.summary.wouldPersist, true);
  assert.equal(updated.lastShadowPlan?.summary.wouldSendOutbound, false);
  assert.equal(JSON.stringify(updated.lastShadowPlan).includes("externalUserId"), false);
});

test("listDryRunSessions filters by tenant/channel and stats summarize sessions", () => {
  updateDryRunSession(identity, dryRunResult());
  updateDryRunSession(
    { ...identity, tenantKey: "tenant-b", externalUserHash: "hash-user-2" },
    { ...dryRunResult(), tenantKey: "tenant-b" }
  );

  assert.equal(listDryRunSessions({ tenantKey: "tenant-a" }).length, 1);
  assert.equal(listDryRunSessions({ channel: "messenger" }).length, 2);
  const stats = getDryRunSessionStats();
  assert.equal(stats.total, 2);
  assert.equal(stats.byChannel.messenger, 2);
  assert.equal(stats.byTenant["tenant-a"], 1);
});

test("TTL pruning removes old sessions", () => {
  getOrCreateDryRunSession(identity, { nowIso: "2026-01-01T12:00:00.000Z", ttlMs: 1_000 });

  __pruneDryRunSessionsForTest(Date.parse("2026-01-01T12:00:02.000Z"), 1_000);

  assert.equal(listDryRunSessions().length, 0);
});

test("session buffer enforces 500 item FIFO limit", () => {
  for (let index = 0; index < 505; index += 1) {
    getOrCreateDryRunSession({
      ...identity,
      externalUserHash: `hash-${String(index).padStart(3, "0")}`,
    });
  }

  const sessions = listDryRunSessions({ limit: 500 });
  assert.equal(sessions.length, 500);
  assert.equal(sessions.some((session) => session.externalUserHash === "hash-000"), false);
  assert.equal(sessions.some((session) => session.externalUserHash === "hash-504"), true);
});
