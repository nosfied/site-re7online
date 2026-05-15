import {
  buildQualificationCrmArtifacts,
  handleQualificationTurn,
  type QualificationTurnLog,
} from "../agent/qualification.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import type { TenantConfig } from "../config/tenantConfig.js";
import type { AIQualificationState, FlowContext } from "../conversation/conversation.types.js";

type DryRunAnswers = {
  aiQualification?: AIQualificationState;
  flowContext?: FlowContext;
  aiOrchestrator?: Record<string, unknown>;
};

export type ChannelRuntimeDryRunInitialState = {
  aiQualification?: AIQualificationState;
  flowContext?: FlowContext;
  flowTags?: string[];
};

export type ChannelRuntimeDryRunResult = {
  ok: true;
  dryRun: true;
  tenantKey: string;
  channel: NormalizedInboundEvent["channel"];
  provider: NormalizedInboundEvent["provider"];
  channelAccountId: string;
  externalMessageId?: string;
  externalUserHash?: string;
  qualification: {
    ran: boolean;
    stage?: AIQualificationState["stage"];
    currentSlot?: string | null;
    completedSlots: string[];
    missingSlots: string[];
    capturedSlotKeys: string[];
    readyForHandoff: boolean;
    outcome?: string | null;
    logEvents: string[];
  };
  crm: {
    enriched: boolean;
    flowContextKeys: string[];
    flowTagCount: number;
    summaryLineCount: number;
    nextStep?: string | null;
    leadTemp?: unknown;
    priority?: unknown;
  };
  handoff: {
    wouldPrompt: boolean;
    wouldActivate: false;
    reason?: "qualification_ready" | "handoff_keyword";
  };
  orchestrator: {
    wouldContinue: boolean;
    executed: false;
  };
  persistence: {
    wouldPersist: false;
  };
  outbound: {
    wouldSend: false;
  };
  state: {
    aiQualification?: AIQualificationState;
    flowContext?: FlowContext;
    flowTags: string[];
  };
};

function normalizeOperationalText(input: unknown) {
  return typeof input === "string"
    ? input
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
    : "";
}

function containsTerm(text: string, term: string) {
  const normalizedTerm = normalizeOperationalText(term);
  if (!text || !normalizedTerm) return false;
  return (
    text === normalizedTerm ||
    text.includes(` ${normalizedTerm} `) ||
    text.startsWith(`${normalizedTerm} `) ||
    text.endsWith(` ${normalizedTerm}`)
  );
}

function isHandoffRequest(text: string | undefined, tenant: TenantConfig) {
  const normalized = normalizeOperationalText(text);
  if (!normalized) return false;
  return (tenant.aiAssistantHandoffKeywords ?? []).some((term) => containsTerm(normalized, term));
}

function getCapturedSlotKeys(state?: AIQualificationState) {
  return Object.keys(state?.slots ?? {}).sort();
}

function buildQualificationSummary(state: AIQualificationState | undefined, logs: QualificationTurnLog[]) {
  return {
    ran: Boolean(state),
    stage: state?.stage,
    currentSlot: state?.currentSlot ?? null,
    completedSlots: [...(state?.completedSlots ?? [])],
    missingSlots: [...(state?.missingSlots ?? [])],
    capturedSlotKeys: getCapturedSlotKeys(state),
    readyForHandoff: state?.readyForHandoff === true,
    outcome: state?.outcome ?? null,
    logEvents: logs.map((entry) => entry.event).filter(Boolean),
  };
}

export function simulateChannelRuntimeDryRun(params: {
  event: NormalizedInboundEvent;
  tenant: TenantConfig;
  externalUserHash?: string | null;
  initialState?: ChannelRuntimeDryRunInitialState;
  nowIso?: string;
}): ChannelRuntimeDryRunResult {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const answers: DryRunAnswers = {
    aiQualification: params.initialState?.aiQualification,
    flowContext: params.initialState?.flowContext ?? {},
    aiOrchestrator: {},
  };
  const flowTags = [...(params.initialState?.flowTags ?? [])];
  let logs: QualificationTurnLog[] = [];
  let crmArtifacts:
    | ReturnType<typeof buildQualificationCrmArtifacts>
    | {
        flowContextPatch?: undefined;
        flowTagsToAdd?: undefined;
        summaryLines?: undefined;
        nextStep?: undefined;
      } = {};

  if (params.tenant.aiQualification?.enabled) {
    const qualification = handleQualificationTurn({
      schema: params.tenant.aiQualification,
      state: params.initialState?.aiQualification,
      text: params.event.text ?? "",
      handoffKeywords: params.tenant.aiAssistantHandoffKeywords,
      nowIso,
    });
    logs = qualification.logs;
    if (qualification.state) {
      answers.aiQualification = qualification.state;
      crmArtifacts = buildQualificationCrmArtifacts({
        state: qualification.state,
        schema: params.tenant.aiQualification,
        answers,
        nowIso,
      });
      if (crmArtifacts.flowContextPatch) {
        answers.flowContext = {
          ...(answers.flowContext ?? {}),
          ...crmArtifacts.flowContextPatch,
        };
      }
      for (const tag of crmArtifacts.flowTagsToAdd ?? []) {
        if (!flowTags.includes(tag)) flowTags.push(tag);
      }
    }
  }

  const handoffByQualification = answers.aiQualification?.readyForHandoff === true;
  const handoffByKeyword = isHandoffRequest(params.event.text, params.tenant);
  const wouldPromptHandoff = handoffByQualification || handoffByKeyword;
  const flowContextKeys = Object.keys(crmArtifacts.flowContextPatch ?? {}).sort();

  return {
    ok: true,
    dryRun: true,
    tenantKey: params.event.tenantKey,
    channel: params.event.channel,
    provider: params.event.provider,
    channelAccountId: params.event.channelAccountId,
    externalMessageId: params.event.externalMessageId,
    externalUserHash: params.externalUserHash ?? undefined,
    qualification: buildQualificationSummary(answers.aiQualification, logs),
    crm: {
      enriched: flowContextKeys.length > 0 || Boolean(crmArtifacts.summaryLines?.length),
      flowContextKeys,
      flowTagCount: crmArtifacts.flowTagsToAdd?.length ?? 0,
      summaryLineCount: crmArtifacts.summaryLines?.length ?? 0,
      nextStep: crmArtifacts.nextStep ?? null,
      leadTemp: crmArtifacts.flowContextPatch?.lead_temp,
      priority: crmArtifacts.flowContextPatch?.priority,
    },
    handoff: {
      wouldPrompt: wouldPromptHandoff,
      wouldActivate: false,
      reason: handoffByKeyword
        ? "handoff_keyword"
        : handoffByQualification
          ? "qualification_ready"
          : undefined,
    },
    orchestrator: {
      wouldContinue: !wouldPromptHandoff,
      executed: false,
    },
    persistence: {
      wouldPersist: false,
    },
    outbound: {
      wouldSend: false,
    },
    state: {
      aiQualification: answers.aiQualification,
      flowContext: answers.flowContext,
      flowTags,
    },
  };
}
