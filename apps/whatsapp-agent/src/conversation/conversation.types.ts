export type ConversationIntent = "pricing" | "support" | "handoff" | "unknown";
export type ConversationFlow = "quote_site" | `chatbot:${string}`;
export type ConversationOperationalStatus =
  | "WAITING"
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "CLOSED";

export type HandoffState = {
  status: "none" | "pending" | "active";
  requestedAt?: string;
  activatedAt?: string;
  releasedAt?: string;
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
