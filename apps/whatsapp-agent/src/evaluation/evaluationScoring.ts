import type {
  ConversationEvaluationExpected,
  EvaluationScore,
  ReplayConversationState,
} from "./evaluation.types.js";
import type { QualificationTurnLog } from "../agent/qualification.js";

const FALLBACK_PATTERNS = [
  "não consegui identificar",
  "nao consegui identificar",
  "fugir do atendimento automático",
  "fugir do atendimento automatico",
];

function normalizeText(input: unknown) {
  return typeof input === "string"
    ? input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function getLastSemanticIntent(logs: QualificationTurnLog[]) {
  for (const entry of [...logs].reverse()) {
    if (entry.event !== "ai.semantic.resolve.result") continue;
    const intent = entry.payload.intent;
    return typeof intent === "string" ? intent : null;
  }
  return null;
}

function stateContainsTopic(state: ReplayConversationState, output: string | null | undefined, topic: string) {
  const normalizedTopic = normalizeText(topic);
  if (!normalizedTopic) return false;
  const values = [
    output ?? "",
    JSON.stringify(state.answers.aiQualification?.slots ?? {}),
    JSON.stringify(state.answers.flowContext ?? {}),
  ].map(normalizeText);
  return values.some((value) => value.includes(normalizedTopic));
}

export function scoreReplayTurn(params: {
  expected?: ConversationEvaluationExpected;
  state: ReplayConversationState;
  output?: string | null;
  logs: QualificationTurnLog[];
}): { score: EvaluationScore; failures: string[] } {
  const expected = params.expected;
  if (!expected) return { score: "PASS", failures: [] };

  const failures: string[] = [];
  const slots = params.state.answers.aiQualification?.slots ?? {};

  for (const [key, expectedValue] of Object.entries(expected.qualificationSlots ?? {})) {
    if (slots[key] !== expectedValue) {
      failures.push(`slot ${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(slots[key])}`);
    }
  }

  if (typeof expected.expectedPendingConfirmation === "boolean") {
    const actual = Boolean(params.state.answers.aiQualification?.pendingSemanticConfirmation);
    if (actual !== expected.expectedPendingConfirmation) {
      failures.push(`pendingSemanticConfirmation: expected ${expected.expectedPendingConfirmation}, got ${actual}`);
    }
  }

  if (typeof expected.expectedHandoff === "boolean") {
    const actual =
      params.state.handoff.status === "active" ||
      params.state.answers.aiOrchestrator?.activePrompt?.type === "handoff_confirmation" ||
      params.state.answers.aiQualification?.readyForHandoff === true;
    if (actual !== expected.expectedHandoff) {
      failures.push(`handoff: expected ${expected.expectedHandoff}, got ${actual}`);
    }
  }

  if (expected.expectedMode && params.state.mode !== expected.expectedMode) {
    failures.push(`mode: expected ${expected.expectedMode}, got ${params.state.mode}`);
  }

  if (expected.expectedStatus && params.state.status !== expected.expectedStatus) {
    failures.push(`status: expected ${expected.expectedStatus}, got ${params.state.status}`);
  }

  if (expected.expectedSemanticIntent) {
    const actualIntent = getLastSemanticIntent(params.logs);
    if (actualIntent !== expected.expectedSemanticIntent) {
      failures.push(`semanticIntent: expected ${expected.expectedSemanticIntent}, got ${actualIntent}`);
    }
  }

  if (expected.shouldAvoidFallback) {
    const output = normalizeText(params.output);
    const fallbackDetected =
      FALLBACK_PATTERNS.some((pattern) => output.includes(normalizeText(pattern))) ||
      params.logs.some((entry) => entry.event.includes("fallback"));
    if (fallbackDetected) failures.push("unexpected fallback detected");
  }

  for (const topic of expected.shouldAvoidTopic ?? []) {
    if (stateContainsTopic(params.state, params.output, topic)) {
      failures.push(`unexpected topic/value detected: ${topic}`);
    }
  }

  for (const fragment of expected.expectedOutputContains ?? []) {
    const normalizedFragment = normalizeText(fragment);
    if (!normalizedFragment) continue;
    if (!normalizeText(params.output).includes(normalizedFragment)) {
      failures.push(`output missing expected fragment: ${fragment}`);
    }
  }

  if (!failures.length) return { score: "PASS", failures };
  const checkedCount = Object.keys(expected).length;
  return { score: failures.length < checkedCount ? "PARTIAL" : "FAIL", failures };
}

export function combineScores(scores: EvaluationScore[]): EvaluationScore {
  if (scores.every((score) => score === "PASS")) return "PASS";
  if (scores.some((score) => score === "PASS" || score === "PARTIAL")) return "PARTIAL";
  return "FAIL";
}
