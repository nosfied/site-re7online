import { NormalizedMessage } from "../domain/whatsapp/types.js";

export type MessageStatus = "received" | "ignored" | "replied";

export type StoredRecord = NormalizedMessage & {
  status: MessageStatus;
  allowlist: {
    enabled: boolean;
    hit: boolean;
  };
  repliedAt?: string;
  replyType?: "echo" | "default";
  meta?: Record<string, unknown>;
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
}
