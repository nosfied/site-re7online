import {
  buildQualificationCrmArtifacts,
  handleQualificationTurn,
} from "../agent/qualification.js";
import type { TenantConfig } from "../config/tenantConfig.js";
import { getTenant } from "../config/tenantConfig.js";
import { combineScores, scoreReplayTurn } from "./evaluationScoring.js";
import type {
  ConversationEvaluationCase,
  ConversationEvaluationDataset,
  ReplayCaseResult,
  ReplayConversationState,
  ReplayDatasetResult,
} from "./evaluation.types.js";

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

function isPositiveConfirmation(text: string) {
  const normalized = normalizeOperationalText(text);
  return ["sim", "ok", "pode", "claro", "isso", "correto", "exatamente"].some(
    (term) => normalized === term
  );
}

function isNegativeConfirmation(text: string) {
  const normalized = normalizeOperationalText(text);
  return ["nao", "não", "nao quero", "não quero", "agora nao", "agora não"].some(
    (term) => normalized === normalizeOperationalText(term)
  );
}

function isHandoffRequest(text: string, tenant: TenantConfig) {
  const normalized = normalizeOperationalText(text);
  return (tenant.aiAssistantHandoffKeywords ?? []).some((term) => containsTerm(normalized, term));
}

function buildInitialState(testCase: ConversationEvaluationCase): ReplayConversationState {
  return {
    tenantKey: testCase.tenantKey,
    mode: testCase.initialState?.mode === "HUMAN" ? "HUMAN" : "BOT",
    status: null,
    handoff: { status: "none" },
    answers: {
      aiQualification: testCase.initialState?.aiQualification as ReplayConversationState["answers"]["aiQualification"],
      flowContext: testCase.initialState?.flowContext as ReplayConversationState["answers"]["flowContext"],
      aiOrchestrator: {},
    },
  };
}

async function resolveTenantConfig(
  tenantKey: string,
  dataset: ConversationEvaluationDataset,
  preferLiveTenants: boolean
) {
  if (preferLiveTenants) {
    const liveTenant = await getTenant(tenantKey);
    if (liveTenant) return liveTenant;
  }
  const fixtureTenant = dataset.tenantFixtures?.[tenantKey];
  if (fixtureTenant) return fixtureTenant;
  return getTenant(tenantKey);
}

function createHandoffPrompt(state: ReplayConversationState, nowIso: string) {
  return {
    ...state,
    answers: {
      ...state.answers,
      aiOrchestrator: {
        ...(state.answers.aiOrchestrator ?? {}),
        activePrompt: {
          type: "handoff_confirmation" as const,
          expected: "yes_no" as const,
          createdAt: nowIso,
          messageId: `evaluation-${Date.parse(nowIso) || 0}`,
          retryCount: 0,
        },
      },
    },
  };
}

function applyCrmArtifacts(state: ReplayConversationState, tenant: TenantConfig, nowIso: string) {
  if (!state.answers.aiQualification || !tenant.aiQualification) return state;
  const artifacts = buildQualificationCrmArtifacts({
    state: state.answers.aiQualification,
    schema: tenant.aiQualification,
    answers: state.answers,
    nowIso,
  });
  if (!artifacts.flowContextPatch) return state;
  return {
    ...state,
    answers: {
      ...state.answers,
      flowContext: {
        ...(state.answers.flowContext ?? {}),
        ...artifacts.flowContextPatch,
      },
    },
  };
}

function runReplayTurn(params: {
  state: ReplayConversationState;
  tenant: TenantConfig;
  inbound: string;
  turnIndex: number;
}) {
  const nowIso = new Date(Date.UTC(2026, 0, 1, 12, 0, params.turnIndex)).toISOString();
  let state = params.state;
  let output: string | null = null;

  if (state.mode === "HUMAN") {
    return { state, output, logs: [] };
  }

  if (state.answers.aiOrchestrator?.activePrompt?.type === "handoff_confirmation") {
    if (isPositiveConfirmation(params.inbound)) {
      state = {
        ...state,
        mode: "HUMAN",
        status: "WAITING",
        handoff: { status: "active" },
        answers: {
          ...state.answers,
          aiOrchestrator: {},
        },
      };
      output = "Perfeito. Vou encaminhar seu atendimento para uma pessoa da equipe.";
      return { state, output, logs: [] };
    }
    if (isNegativeConfirmation(params.inbound)) {
      state = {
        ...state,
        answers: { ...state.answers, aiOrchestrator: {} },
      };
      output = "Tudo bem. Vou continuar por aqui.";
      return { state, output, logs: [] };
    }
    output = "Só para confirmar: você deseja falar com uma pessoa da equipe?";
    return { state, output, logs: [] };
  }

  if (!params.tenant.aiQualification?.enabled) {
    if (isHandoffRequest(params.inbound, params.tenant)) {
      state = createHandoffPrompt(state, nowIso);
      output = "Posso direcionar você para uma pessoa da equipe?";
    }
    return { state, output, logs: [] };
  }

  const result = handleQualificationTurn({
    schema: params.tenant.aiQualification,
    state: state.answers.aiQualification,
    text: params.inbound,
    handoffKeywords: params.tenant.aiAssistantHandoffKeywords,
    nowIso,
  });
  if (result.state) {
    state = {
      ...state,
      answers: {
        ...state.answers,
        aiQualification: result.state,
      },
    };
    state = applyCrmArtifacts(state, params.tenant, nowIso);
  }
  if (result.replyText) {
    output = result.replyText;
  } else if (result.state?.readyForHandoff) {
    state = createHandoffPrompt(state, nowIso);
    output = params.tenant.aiAssistantHandoffPrompt || "Posso direcionar você para uma pessoa da equipe?";
  } else if (isHandoffRequest(params.inbound, params.tenant)) {
    state = createHandoffPrompt(state, nowIso);
    output = params.tenant.aiAssistantHandoffPrompt || "Posso direcionar você para uma pessoa da equipe?";
  }
  return { state, output, logs: result.logs };
}

export async function replayEvaluationCase(
  testCase: ConversationEvaluationCase,
  dataset: ConversationEvaluationDataset,
  options: { preferLiveTenants?: boolean } = {}
): Promise<ReplayCaseResult> {
  const tenant = await resolveTenantConfig(testCase.tenantKey, dataset, options.preferLiveTenants === true);
  if (!tenant) {
    return {
      id: testCase.id,
      tenantKey: testCase.tenantKey,
      description: testCase.description,
      score: "FAIL",
      turns: [],
      failures: [`tenant not found: ${testCase.tenantKey}`],
    };
  }

  let state = buildInitialState(testCase);
  const turns = [];
  for (let index = 0; index < testCase.turns.length; index += 1) {
    const turn = testCase.turns[index]!;
    const result = runReplayTurn({ state, tenant, inbound: turn.inbound, turnIndex: index });
    state = result.state;
    const scored = scoreReplayTurn({
      expected: turn.expected,
      state,
      output: result.output,
      logs: result.logs,
    });
    turns.push({
      inbound: turn.inbound,
      output: result.output,
      logs: result.logs,
      state,
      expected: turn.expected,
      score: scored.score,
      failures: scored.failures,
    });
  }

  const score = combineScores(turns.map((turn) => turn.score));
  return {
    id: testCase.id,
    tenantKey: testCase.tenantKey,
    description: testCase.description,
    score,
    turns,
    failures: turns.flatMap((turn, index) =>
      turn.failures.map((failure) => `turn ${index + 1} (${turn.inbound}): ${failure}`)
    ),
  };
}

export async function replayEvaluationDataset(
  dataset: ConversationEvaluationDataset,
  options: { preferLiveTenants?: boolean } = {}
): Promise<ReplayDatasetResult> {
  const cases = [];
  for (const testCase of dataset.cases) {
    cases.push(await replayEvaluationCase(testCase, dataset, options));
  }
  const totals = {
    pass: cases.filter((item) => item.score === "PASS").length,
    partial: cases.filter((item) => item.score === "PARTIAL").length,
    fail: cases.filter((item) => item.score === "FAIL").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    datasetId: dataset.id,
    score: combineScores(cases.map((item) => item.score)),
    cases,
    totals,
  };
}
