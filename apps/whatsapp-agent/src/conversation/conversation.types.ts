export type ConversationIntent = "pricing" | "support" | "handoff" | "unknown";
export type ConversationFlow = "quote_site" | `chatbot:${string}`;
export type ConversationOperationalStatus =
  | "WAITING"
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "CLOSED";

export type ConversationStage =
  | "greeting"
  | "triage"
  | "qualification"
  | "clarification"
  | "waiting_user"
  | "handoff_recommended"
  | "handoff_active"
  | "closed";

export type ConversationGoal =
  | "identify_need"
  | "explain_general_topic"
  | "discover_service"
  | "discover_urgency"
  | "collect_safe_context"
  | "recommend_handoff";

export type OrchestratorNextAction =
  | "answer"
  | "ask_question"
  | "contextual_continue"
  | "handoff_recommend"
  | "handoff_force"
  | "fallback_menu"
  | "no_reply";

export type AIOrchestratorState = {
  stage?: ConversationStage;
  goal?: ConversationGoal | string | null;
  missingInformation?: string[];
  lastAction?: OrchestratorNextAction;
  lastConfidence?: number;
  handoffRecommended?: boolean;
  lastMessageId?: string | null;
  lastQuestion?: string | null;
  lastContinuationTopic?: string | null;
  lastNextActionAt?: string | null;
  handoffSignals?: {
    count?: number;
    lastReason?: string | null;
    lastRecommendedAt?: string | null;
    guardrailCount?: number;
    lowConfidenceCount?: number;
  };
  handoffPrompt?: {
    prompted: boolean;
    promptedAt: string;
    messageId: string;
    reason: string;
    score: number;
    awaitingConfirmation: boolean;
    confirmationRetryCount?: number;
  };
  activePrompt?: {
    type: "handoff_confirmation";
    expected: "yes_no";
    createdAt: string;
    messageId: string;
    retryCount?: number;
  };
  pendingOffer?: {
    type: "continue_guidance" | "handoff" | "clarification" | "none";
    promptedAt: string;
    messageId: string;
    text?: string;
    retryCount?: number;
  };
};

export type HandoffState = {
  status: "none" | "pending" | "active";
  requestedAt?: string;
  activatedAt?: string;
  releasedAt?: string;
};

export type FlowContextValue =
  | string
  | number
  | boolean
  | null
  | FlowContextValue[]
  | { [key: string]: FlowContextValue };
export type FlowContext = Record<string, FlowContextValue>;

export type AIMemoryState = {
  summary?: string;
  facts?: Record<string, string | number | boolean | null>;
  lastTopics?: string[];
  preferences?: {
    wantsHuman?: boolean;
  };
  lastUpdatedAt?: string;
};

export type AIQualificationStage =
  | "idle"
  | "collecting"
  | "completed"
  | "handoff_ready"
  | "cancelled";

export type AIQualificationState = {
  enabledSnapshot?: boolean;
  schemaVersion?: string;
  stage?: AIQualificationStage;
  currentSlot?: string | null;
  slots?: Record<string, string | number | boolean | null>;
  completedSlots?: string[];
  missingSlots?: string[];
  lastQuestion?: string | null;
  readyForHandoff?: boolean;
  outcome?: string | null;
  updatedAt?: string;
};

export type QuoteSiteAnswers = {
  companyCity?: string;
  siteType?: string;
  pages?: string;
  items?: string;
  brandAssets?: string;
  deadline?: string;
  segment?: string;
  siteNew?: boolean;
  email?: string;
  flowContext?: FlowContext;
  flowTags?: string[];
  aiAssistant?: {
    count?: number;
    lastRespondedAt?: string | null;
    lastMessageId?: string | null;
    lastFallbackType?: string | null;
    lastFallbackAt?: string | null;
    fallbackCount?: number;
  };
  aiOrchestrator?: AIOrchestratorState;
  aiMemory?: AIMemoryState;
  aiQualification?: AIQualificationState;
};

export type ConversationState = {
  clientKey?: string;
  conversationKey?: string;
  waId: string;
  waIdCanonical?: string;
  firstSeenAt: string;
  lastInboundAt: string;
  lastOutboundAt?: string;
  lastInboundMessageId?: string;
  lastOutboundMessageId?: string;
  window: { isOpen: boolean; expiresAt?: string };
  intent?: ConversationIntent;
  handoff: HandoffState;
  templateNeeded?: boolean;
  templateSuggested?: string;
  lastNeedAt?: string;
  lastIntent?: ConversationIntent;
  leadRequestedAt?: string;
  leadCapturedAt?: string;
  demoStatus?: "none" | "requested" | "scheduled";
  lastDemoRequestedAt?: string;
  lastDemoScheduledAt?: string;
  demoPreferredSchedule?: string;
  lastHandoffDemoScheduledKey?: string;
  lastHandoffDemoScheduledAt?: string;
  flow?: ConversationFlow;
  flowStep?: number;
  chatbotNodeId?: string;
  chatbotActive?: boolean;
  answers?: QuoteSiteAnswers;
  mode?: "BOT" | "HUMAN";
  assignedUserId?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  status?: ConversationOperationalStatus | null;
  closedAt?: string | null;
};
