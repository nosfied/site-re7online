import crypto from "node:crypto";
import type { Channel, Provider } from "./channel.types.js";
import type { ChannelRuntimeGateDecision } from "./tenantChannelAccount.js";

export type ChannelRuntimeShadowPlanStepKey =
  | "resolve_conversation_identity"
  | "load_or_create_runtime_state"
  | "persist_inbound_message"
  | "run_qualification"
  | "enrich_crm"
  | "evaluate_handoff"
  | "prepare_outbound"
  | "send_outbound";

export type ChannelRuntimeShadowPlan = {
  id: string;
  createdAt: string;
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserHash?: string;
  resolution: string;
  gate: {
    allowed: boolean;
    reason: string;
    outboundAllowed: boolean;
    aiAllowed: boolean;
    handoffAllowed: boolean;
  };
  steps: Array<{
    key: ChannelRuntimeShadowPlanStepKey;
    wouldRun: boolean;
    blockedBy?: string[];
    notes?: string;
  }>;
  summary: {
    wouldEnterRuntime: boolean;
    wouldPersist: boolean;
    wouldRunQualification: boolean;
    wouldRunAi: boolean;
    wouldEvaluateHandoff: boolean;
    wouldSendOutbound: boolean;
  };
  passive: true;
};

type BuildChannelRuntimeShadowPlanInput = {
  tenantKey?: string | null;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserHash?: string | null;
  resolution: string;
  gate: ChannelRuntimeGateDecision;
  qualificationEnabled?: boolean;
  nowIso?: string;
};

function sanitizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function createPlanId() {
  return `shadow_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function step(
  key: ChannelRuntimeShadowPlanStepKey,
  wouldRun: boolean,
  blockedBy?: string[],
  notes?: string
): ChannelRuntimeShadowPlan["steps"][number] {
  return {
    key,
    wouldRun,
    ...(blockedBy && blockedBy.length > 0 ? { blockedBy } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function buildChannelRuntimeShadowPlan(
  input: BuildChannelRuntimeShadowPlanInput
): ChannelRuntimeShadowPlan {
  const tenantKey = sanitizeText(input.tenantKey, 120) || "unknown";
  const channelAccountId = sanitizeText(input.channelAccountId, 160) || "unknown";
  const externalUserHash = sanitizeText(input.externalUserHash, 120);
  const resolution = sanitizeText(input.resolution, 80) || "unknown";
  const gateBlockedBy = input.gate.allowed ? undefined : [input.gate.reason];
  const qualificationEnabled = input.qualificationEnabled === true;

  const wouldPersist = input.gate.allowed;
  const wouldRunQualification = input.gate.allowed && qualificationEnabled;
  const wouldRunAi = input.gate.allowed && input.gate.aiAllowed;
  const wouldEvaluateHandoff = input.gate.allowed && input.gate.handoffAllowed;
  const wouldSendOutbound = input.gate.allowed && input.gate.outboundAllowed;

  const steps = input.gate.allowed
    ? [
        step("resolve_conversation_identity", true, undefined, "Resolver identidade normalizada do canal."),
        step("load_or_create_runtime_state", true, undefined, "Carregar ou criar estado operacional."),
        step("persist_inbound_message", true, undefined, "Persistir inbound no runtime real futuro."),
        step(
          "run_qualification",
          wouldRunQualification,
          wouldRunQualification ? undefined : ["qualification_disabled"],
          "Executar qualification apenas quando o tenant permitir."
        ),
        step("enrich_crm", true, undefined, "Preparar enriquecimento operacional seguro."),
        step(
          "evaluate_handoff",
          wouldEvaluateHandoff,
          wouldEvaluateHandoff ? undefined : ["handoff_disabled"],
          "Avaliar handoff somente se liberado no canal."
        ),
        step(
          "prepare_outbound",
          wouldSendOutbound,
          wouldSendOutbound ? undefined : ["outbound_disabled"],
          "Preparar resposta apenas se outbound estiver liberado."
        ),
        step(
          "send_outbound",
          wouldSendOutbound,
          wouldSendOutbound ? undefined : ["outbound_disabled"],
          "Plano indica possibilidade futura; esta sprint nao envia."
        ),
      ]
    : [
        step("resolve_conversation_identity", false, gateBlockedBy),
        step("load_or_create_runtime_state", false, gateBlockedBy),
        step("persist_inbound_message", false, gateBlockedBy),
        step("run_qualification", false, gateBlockedBy),
        step("enrich_crm", false, gateBlockedBy),
        step("evaluate_handoff", false, gateBlockedBy),
        step("prepare_outbound", false, gateBlockedBy),
        step("send_outbound", false, gateBlockedBy),
      ];

  return {
    id: createPlanId(),
    createdAt: input.nowIso ?? new Date().toISOString(),
    tenantKey,
    channel: input.channel,
    provider: input.provider,
    channelAccountId,
    ...(externalUserHash ? { externalUserHash } : {}),
    resolution,
    gate: {
      allowed: input.gate.allowed,
      reason: input.gate.reason,
      outboundAllowed: input.gate.outboundAllowed,
      aiAllowed: input.gate.aiAllowed,
      handoffAllowed: input.gate.handoffAllowed,
    },
    steps,
    summary: {
      wouldEnterRuntime: input.gate.allowed,
      wouldPersist,
      wouldRunQualification,
      wouldRunAi,
      wouldEvaluateHandoff,
      wouldSendOutbound,
    },
    passive: true,
  };
}

export function buildChannelRuntimeShadowPlanLog(plan: ChannelRuntimeShadowPlan) {
  return {
    event: "channel.runtime_shadow_plan.created",
    tenantKey: plan.tenantKey,
    channel: plan.channel,
    provider: plan.provider,
    channelAccountId: plan.channelAccountId,
    externalUserHash: plan.externalUserHash ?? null,
    resolution: plan.resolution,
    gateReason: plan.gate.reason,
    wouldEnterRuntime: plan.summary.wouldEnterRuntime,
    wouldPersist: plan.summary.wouldPersist,
    wouldRunQualification: plan.summary.wouldRunQualification,
    wouldRunAi: plan.summary.wouldRunAi,
    wouldEvaluateHandoff: plan.summary.wouldEvaluateHandoff,
    wouldSendOutbound: plan.summary.wouldSendOutbound,
    passive: true,
  };
}
