import fs from "node:fs/promises";
import path from "node:path";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState } from "../conversation/conversation.types.js";

const dataDir = path.resolve(process.cwd(), ".data");
const dataFile = path.join(dataDir, "whatsapp-events.json");
const conversationFile = path.join(dataDir, "conversations.json");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readAll(): Promise<StoredRecord[]> {
  try {
    const content = await fs.readFile(dataFile, "utf-8");
    return JSON.parse(content) as StoredRecord[];
  } catch {
    return [];
  }
}

async function writeAll(records: StoredRecord[]) {
  await ensureDataDir();
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(records, null, 2), "utf-8");
  await fs.rename(tempFile, dataFile);
}

async function readAllConversations(): Promise<ConversationState[]> {
  try {
    const content = await fs.readFile(conversationFile, "utf-8");
    return JSON.parse(content) as ConversationState[];
  } catch {
    return [];
  }
}

async function writeAllConversations(conversations: ConversationState[]) {
  await ensureDataDir();
  const tempFile = `${conversationFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(conversations, null, 2), "utf-8");
  await fs.rename(tempFile, conversationFile);
}

export const jsonFileStorage: Storage = {
  async saveIncomingMessage(record: StoredRecord) {
    const records = await readAll();
    records.push(record);
    await writeAll(records);
  },
  async findByMessageId(messageId: string) {
    const records = await readAll();
    return records.find((item) => item.messageId === messageId) ?? null;
  },
  async updateStatus(messageId: string, status: MessageStatus, extra?: Record<string, unknown>) {
    const records = await readAll();
    const index = records.findIndex((item) => item.messageId === messageId);
    if (index >= 0) {
      records[index] = {
        ...records[index],
        status,
        meta: { ...(records[index].meta ?? {}), ...(extra ?? {}) },
      };
      await writeAll(records);
    }
  },
  async updateMessage(messageId: string, patch: Partial<StoredRecord>) {
    const records = await readAll();
    const index = records.findIndex((item) => item.messageId === messageId);
    if (index >= 0) {
      records[index] = {
        ...records[index],
        ...patch,
        meta: { ...(records[index].meta ?? {}), ...(patch.meta ?? {}) },
      };
      await writeAll(records);
    }
  },
  async getConversation(waId: string) {
    const conversations = await readAllConversations();
    return conversations.find((item) => item.waId === waId) ?? null;
  },
  async upsertConversation(state: ConversationState) {
    const conversations = await readAllConversations();
    const index = conversations.findIndex((item) => item.waId === state.waId);
    if (index >= 0) {
      conversations[index] = { ...conversations[index], ...state };
    } else {
      conversations.push(state);
    }
    await writeAllConversations(conversations);
  },
  async updateConversationWindow(waId: string, lastInboundAt: string) {
    const conversations = await readAllConversations();
    const index = conversations.findIndex((item) => item.waId === waId);
    const inboundTime = Number.isNaN(Date.parse(lastInboundAt))
      ? Date.now()
      : Date.parse(lastInboundAt);
    const expiresAt = new Date(inboundTime + 24 * 60 * 60 * 1000).toISOString();
    const existing = index >= 0 ? conversations[index] : null;
    const updated: ConversationState = {
      waId,
      firstSeenAt: existing?.firstSeenAt ?? lastInboundAt,
      lastInboundAt,
      lastInboundMessageId: existing?.lastInboundMessageId,
      lastOutboundAt: existing?.lastOutboundAt,
      lastOutboundMessageId: existing?.lastOutboundMessageId,
      intent: existing?.intent,
      botPaused: existing?.botPaused ?? false,
      pausedReason: existing?.pausedReason,
      pausedAt: existing?.pausedAt,
      window: { isOpen: true, expiresAt },
    };

    if (index >= 0) {
      conversations[index] = updated;
    } else {
      conversations.push(updated);
    }

    await writeAllConversations(conversations);
    return updated;
  },
};
