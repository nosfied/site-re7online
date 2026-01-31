export type ConversationIntent = "pricing" | "support" | "handoff" | "unknown";

export type ConversationState = {
  waId: string;
  firstSeenAt: string;
  lastInboundAt: string;
  lastOutboundAt?: string;
  lastInboundMessageId?: string;
  lastOutboundMessageId?: string;
  window: { isOpen: boolean; expiresAt?: string };
  intent?: ConversationIntent;
};
