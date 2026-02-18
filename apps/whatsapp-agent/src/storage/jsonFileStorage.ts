import fs from "node:fs/promises";
import path from "node:path";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState, HandoffState } from "../conversation/conversation.types.js";

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

type LegacyConversationState = ConversationState & {
  botPaused?: boolean;
  pausedReason?: "handoff" | "admin";
  pausedAt?: string;
  handoffPending?: boolean;
};

function normalizeHandoff(
  raw: LegacyConversationState
): HandoffState {
  if (raw.handoff) {
    return raw.handoff;
  }
  if (raw.botPaused && raw.pausedReason === "handoff") {
    return { status: "active", activatedAt: raw.pausedAt };
  }
  if (raw.handoffPending) {
    return { status: "pending" };
  }
  return { status: "none" };
}

function normalizeConversation(raw: LegacyConversationState): ConversationState {
  const handoff = normalizeHandoff(raw);
  return {
    waId: raw.waId,
    firstSeenAt: raw.firstSeenAt,
    lastInboundAt: raw.lastInboundAt,
    lastOutboundAt: raw.lastOutboundAt,
    lastInboundMessageId: raw.lastInboundMessageId,
    lastOutboundMessageId: raw.lastOutboundMessageId,
    intent: raw.intent,
    templateNeeded: raw.templateNeeded,
    templateSuggested: raw.templateSuggested,
    lastNeedAt: raw.lastNeedAt,
    lastIntent: raw.lastIntent,
    leadRequestedAt: raw.leadRequestedAt,
    leadCapturedAt: raw.leadCapturedAt,
    flow: raw.flow,
    flowStep: raw.flowStep,
    answers: raw.answers ?? {},
    window: raw.window,
    handoff,
  };
}

async function readAllConversations(): Promise<ConversationState[]> {
  try {
    const content = await fs.readFile(conversationFile, "utf-8");
    const raw = JSON.parse(content) as LegacyConversationState[];
    return raw.map(normalizeConversation);
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
      templateNeeded: existing?.templateNeeded,
      templateSuggested: existing?.templateSuggested,
      lastNeedAt: existing?.lastNeedAt,
      lastIntent: existing?.lastIntent,
      leadRequestedAt: existing?.leadRequestedAt,
      leadCapturedAt: existing?.leadCapturedAt,
      flow: existing?.flow,
      flowStep: existing?.flowStep,
      answers: existing?.answers ?? {},
      handoff: existing?.handoff ?? { status: "none" },
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
