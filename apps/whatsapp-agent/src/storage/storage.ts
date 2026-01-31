import { NormalizedMessage } from "../domain/whatsapp/types.js";

export type MessageStatus = "received" | "ignored" | "replied";

export type StoredRecord = NormalizedMessage & {
  status: MessageStatus;
  allowlist: {
    enabled: boolean;
    hit: boolean;
  };
  repliedAt?: string;
  replyType?: "echo" | "default" | "text" | "template";
  meta?: Record<string, unknown>;
};

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

export interface Storage {
  saveIncomingMessage(record: StoredRecord): Promise<void>;
  findByMessageId(messageId: string): Promise<StoredRecord | null>;
  updateStatus(
    messageId: string,
    status: MessageStatus,
    extra?: Record<string, unknown>
  ): Promise<void>;
  updateMessage(messageId: string, patch: Partial<StoredRecord>): Promise<void>;
  getConversation(waId: string): Promise<ConversationState | null>;
  upsertConversation(state: ConversationState): Promise<void>;
  updateConversationWindow(waId: string, lastInboundAt: string): Promise<ConversationState>;
}
