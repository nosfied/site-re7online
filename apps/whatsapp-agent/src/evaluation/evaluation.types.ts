import type { AIQualificationState, FlowContext } from "../conversation/conversation.types.js";
import type { TenantConfig } from "../config/tenantConfig.js";
import type { QualificationTurnLog } from "../agent/qualification.js";

export type ConversationEvaluationExpected = {
  qualificationSlots?: Record<string, unknown>;
  expectedIntent?: string;
  expectedHandoff?: boolean;
  expectedPendingConfirmation?: boolean;
  expectedMode?: string;
  expectedStatus?: string;
  shouldAvoidFallback?: boolean;
  shouldAvoidTopic?: string[];
  expectedOutputContains?: string[];
  expectedSemanticIntent?: string;
};

export type ConversationEvaluationCase = {
  id: string;
  tenantKey: string;
  description?: string;
  initialState?: {
    aiQualification?: unknown;
    flowContext?: unknown;
    mode?: string;
  };
  turns: Array<{
    inbound: string;
    expected?: ConversationEvaluationExpected;
  }>;
};

export type ConversationEvaluationDataset = {
  id: string;
  description?: string;
  tenantFixtures?: Record<string, TenantConfig>;
  cases: ConversationEvaluationCase[];
};

export type ReplayTurnResult = {
  inbound: string;
  output?: string | null;
  logs: QualificationTurnLog[];
  state: ReplayConversationState;
  expected?: ConversationEvaluationExpected;
  score: EvaluationScore;
  failures: string[];
};

export type ReplayConversationState = {
  tenantKey: string;
  mode: "BOT" | "HUMAN";
  status: "WAITING" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED" | null;
  handoff: {
    status: "none" | "pending" | "active";
  };
  answers: {
    aiQualification?: AIQualificationState;
    flowContext?: FlowContext;
    aiOrchestrator?: {
      activePrompt?: {
        type: "handoff_confirmation";
        expected: "yes_no";
        createdAt: string;
        messageId: string;
        retryCount?: number;
      };
    };
  };
};

export type EvaluationScore = "PASS" | "PARTIAL" | "FAIL";

export type ReplayCaseResult = {
  id: string;
  tenantKey: string;
  description?: string;
  score: EvaluationScore;
  turns: ReplayTurnResult[];
  failures: string[];
};

export type ReplayDatasetResult = {
  generatedAt: string;
  datasetId: string;
  score: EvaluationScore;
  cases: ReplayCaseResult[];
  totals: {
    pass: number;
    partial: number;
    fail: number;
  };
};
