import type { RuntimeWriteToken } from "../conversation/runtimeWriteFence.js";
import { NormalizedMessage } from "../domain/whatsapp/types.js";
import { ConversationState } from "../conversation/conversation.types.js";

export type MessageStatus = "received" | "ignored" | "replied" | "sent" | "failed";

export type StoredRecord = NormalizedMessage & {
  status: MessageStatus;
  allowlist: {
    enabled: boolean;
    hit: boolean;
  };
  direction?: "inbound" | "outbound";
  to?: string;
  templateName?: string;
  language?: string;
  intent?: string;
  clientKey?: string;
  metaMessageId?: string;
  repliedAt?: string;
  replyType?: "echo" | "default" | "text" | "template";
  meta?: Record<string, unknown>;
};

export interface Storage {
  saveIncomingMessage(record: StoredRecord): Promise<void>;
  appendOutboundEvent(record: StoredRecord): Promise<void>;
  findByMessageId(messageId: string): Promise<StoredRecord | null>;
  updateStatus(
    messageId: string,
    status: MessageStatus,
    extra?: Record<string, unknown>
  ): Promise<void>;
  updateMessage(messageId: string, patch: Partial<StoredRecord>): Promise<void>;
  getConversation(waId: string, clientKey?: string): Promise<ConversationState | null>;
  upsertConversation(state: ConversationState, expected?: RuntimeWriteToken): Promise<void | RuntimeWriteToken | null>;
  updateConversationWindow(
    waId: string,
    lastInboundAt: string,
    clientKey?: string
  ): Promise<ConversationState>;
  deleteConversation(waId: string, clientKey?: string): Promise<void>;
}
