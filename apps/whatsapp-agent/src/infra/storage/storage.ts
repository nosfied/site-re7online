import { NormalizedMessage } from "../../domain/whatsapp/types.js";

export type MessageStatus = "received" | "ignored" | "replied";

export type StoredRecord = NormalizedMessage & {
  status: MessageStatus;
  allowlist: {
    enabled: boolean;
    hit: boolean;
  };
  meta?: Record<string, unknown>;
};

export interface Storage {
  saveIncomingMessage(record: StoredRecord): Promise<void>;
  updateStatus(
    messageId: string,
    status: MessageStatus,
    extra?: Record<string, unknown>
  ): Promise<void>;
}
