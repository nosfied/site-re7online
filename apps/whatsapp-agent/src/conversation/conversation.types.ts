export type ConversationIntent = "pricing" | "support" | "handoff" | "unknown";
export type ConversationFlow = "quote_site";

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
  waId: string;
  firstSeenAt: string;
  lastInboundAt: string;
  lastOutboundAt?: string;
  lastInboundMessageId?: string;
  lastOutboundMessageId?: string;
  window: { isOpen: boolean; expiresAt?: string };
  intent?: ConversationIntent;
  botPaused: boolean;
  pausedReason?: "handoff" | "admin";
  pausedAt?: string;
  handoffPending?: boolean;
  flow?: ConversationFlow;
  flowStep?: number;
  answers?: QuoteSiteAnswers;
};
