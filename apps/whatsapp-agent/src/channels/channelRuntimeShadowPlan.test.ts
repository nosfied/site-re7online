import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelRuntimeShadowPlan,
  buildChannelRuntimeShadowPlanLog,
} from "./channelRuntimeShadowPlan.js";

const base = {
  tenantKey: "tenant-a",
  channel: "messenger" as const,
  provider: "meta" as const,
  channelAccountId: "page-1",
  externalUserHash: "hash-user-1",
  resolution: "matched_enabled",
  nowIso: "2026-01-01T12:00:00.000Z",
};

test("blocked gate creates fully blocked passive shadow plan", () => {
  const plan = buildChannelRuntimeShadowPlan({
    ...base,
    gate: {
      allowed: false,
      reason: "runtime_disabled",
      outboundAllowed: false,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: true,
  });

  assert.equal(plan.passive, true);
  assert.equal(plan.summary.wouldEnterRuntime, false);
  assert.equal(plan.summary.wouldPersist, false);
  assert.equal(plan.summary.wouldRunQualification, false);
  assert.equal(plan.summary.wouldRunAi, false);
  assert.equal(plan.summary.wouldEvaluateHandoff, false);
  assert.equal(plan.summary.wouldSendOutbound, false);
  assert.equal(plan.steps.length, 8);
  assert.equal(plan.steps.every((item) => item.wouldRun === false), true);
  assert.deepEqual(plan.steps[0]?.blockedBy, ["runtime_disabled"]);
});

test("allowed gate with outbound disabled plans runtime and persistence but no outbound", () => {
  const plan = buildChannelRuntimeShadowPlan({
    ...base,
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: false,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: true,
  });

  assert.equal(plan.summary.wouldEnterRuntime, true);
  assert.equal(plan.summary.wouldPersist, true);
  assert.equal(plan.summary.wouldRunQualification, true);
  assert.equal(plan.summary.wouldRunAi, true);
  assert.equal(plan.summary.wouldEvaluateHandoff, true);
  assert.equal(plan.summary.wouldSendOutbound, false);
  assert.equal(plan.steps.find((item) => item.key === "persist_inbound_message")?.wouldRun, true);
  assert.deepEqual(plan.steps.find((item) => item.key === "send_outbound")?.blockedBy, [
    "outbound_disabled",
  ]);
});

test("ai and handoff flags independently shape shadow plan", () => {
  const plan = buildChannelRuntimeShadowPlan({
    ...base,
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: true,
      aiAllowed: false,
      handoffAllowed: false,
    },
    qualificationEnabled: true,
  });

  assert.equal(plan.summary.wouldRunAi, false);
  assert.equal(plan.summary.wouldEvaluateHandoff, false);
  assert.equal(plan.summary.wouldSendOutbound, true);
  assert.deepEqual(plan.steps.find((item) => item.key === "evaluate_handoff")?.blockedBy, [
    "handoff_disabled",
  ]);
  assert.equal(plan.steps.find((item) => item.key === "send_outbound")?.wouldRun, true);
});

test("qualification disabled prevents only qualification step", () => {
  const plan = buildChannelRuntimeShadowPlan({
    ...base,
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: false,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: false,
  });

  assert.equal(plan.summary.wouldPersist, true);
  assert.equal(plan.summary.wouldRunQualification, false);
  assert.deepEqual(plan.steps.find((item) => item.key === "run_qualification")?.blockedBy, [
    "qualification_disabled",
  ]);
});

test("shadow plan and log are redacted", () => {
  const plan = buildChannelRuntimeShadowPlan({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    externalUserHash: "hash-user-1",
    resolution: "matched_enabled",
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: true,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: true,
  });
  const log = buildChannelRuntimeShadowPlanLog(plan);
  const serialized = JSON.stringify({ plan, log });

  assert.equal(serialized.includes("text"), false);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes("externalUserId"), false);
  assert.equal(serialized.includes("conversationKey"), false);
  assert.equal(serialized.includes("psid"), false);
  assert.equal(log.event, "channel.runtime_shadow_plan.created");
});
