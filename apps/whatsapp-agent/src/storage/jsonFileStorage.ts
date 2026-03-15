import fs from "node:fs/promises";
import path from "node:path";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState, HandoffState } from "../conversation/conversation.types.js";
import { logger } from "../logger/logger.js";
import {
  getClientKeyFromConversationKey,
  makeConversationKey,
} from "./conversationKey.js";

const dataDir = path.resolve(process.cwd(), ".data");
const dataFile = path.join(dataDir, "whatsapp-events.json");
const conversationFile = path.join(dataDir, "conversations.json");
const writeQueues = new Map<string, Promise<void>>();

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function enqueueWrite(targetFile: string, fn: () => Promise<void>) {
  const prev = writeQueues.get(targetFile) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(fn);
  writeQueues.set(targetFile, next);
  void next.finally(() => {
    if (writeQueues.get(targetFile) === next) {
      writeQueues.delete(targetFile);
    }
  });
  return next;
}

async function readAll(): Promise<StoredRecord[]> {
  try {
    const content = await fs.readFile(dataFile, "utf-8");
    return JSON.parse(content) as StoredRecord[];
  } catch {
    return [];
  }
}

async function renameWithRetry(tempFile: string, targetFile: string) {
  const delays = [50, 100, 200];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await fs.rename(tempFile, targetFile);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === "ENOENT" || code === "EBUSY" || code === "EPERM";
      if (!retryable || attempt === delays.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function writeAtomic(targetFile: string, payload: string) {
  await ensureDataDir();
  const dir = path.dirname(targetFile);
  const base = path.basename(targetFile);
  const tmp = path.join(
    dir,
    `${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  await fs.writeFile(tmp, payload, "utf-8");
  await renameWithRetry(tmp, targetFile);
}

async function writeAll(records: StoredRecord[]) {
  return enqueueWrite(dataFile, () =>
    writeAtomic(dataFile, JSON.stringify(records, null, 2))
  );
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
  const derivedClientKey =
    raw.clientKey ?? getClientKeyFromConversationKey(raw.conversationKey) ?? undefined;
  return {
    clientKey: derivedClientKey,
    conversationKey: raw.conversationKey,
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
    demoStatus: raw.demoStatus ?? "none",
    lastDemoRequestedAt: raw.lastDemoRequestedAt,
    lastDemoScheduledAt: raw.lastDemoScheduledAt,
    demoPreferredSchedule: raw.demoPreferredSchedule,
    lastHandoffDemoScheduledKey: raw.lastHandoffDemoScheduledKey,
    lastHandoffDemoScheduledAt: raw.lastHandoffDemoScheduledAt,
    flow: raw.flow,
    flowStep: raw.flowStep,
    answers: raw.answers ?? {},
    mode: raw.mode ?? "BOT",
    assignedUserId: raw.assignedUserId ?? null,
    assignedTo: raw.assignedTo ?? null,
    assignedAt: raw.assignedAt ?? null,
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
  return enqueueWrite(conversationFile, () =>
    writeAtomic(conversationFile, JSON.stringify(conversations, null, 2))
  );
}

function maskWaId(waId: string) {
  return `***${waId.slice(-4)}`;
}

function findConversationIndex(
  conversations: ConversationState[],
  clientKey: string,
  waId: string
) {
  const conversationKey = makeConversationKey(clientKey, waId);
  const scopedIndex = conversations.findIndex(
    (item) =>
      item.conversationKey === conversationKey ||
      (item.clientKey === clientKey && item.waId === waId)
  );
  if (scopedIndex >= 0) {
    return { index: scopedIndex, conversationKey, migrated: false };
  }
  const legacyIndex = conversations.findIndex(
    (item) => !item.conversationKey && item.waId === waId
  );
  if (legacyIndex >= 0) {
    return { index: legacyIndex, conversationKey, migrated: true };
  }
  return { index: -1, conversationKey, migrated: false };
}

export const jsonFileStorage: Storage = {
  async saveIncomingMessage(record: StoredRecord) {
    const records = await readAll();
    records.push(record);
    await writeAll(records);
  },
  async appendOutboundEvent(record: StoredRecord) {
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
  async getConversation(waId: string, clientKey = "default") {
    const conversations = await readAllConversations();
    const found = findConversationIndex(conversations, clientKey, waId);
    if (found.index < 0) {
      logger.info({
        event: "storage.conversation.read",
        clientKey,
        waId: maskWaId(waId),
        found: false,
      });
      return null;
    }
    const current = conversations[found.index];
    const nextState: ConversationState = {
      ...current,
      clientKey,
      conversationKey: found.conversationKey,
    };
    if (found.migrated) {
      conversations[found.index] = nextState;
      await writeAllConversations(conversations);
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(waId),
      });
    }
    logger.info({
      event: "storage.conversation.read",
      clientKey,
      waId: maskWaId(waId),
      found: true,
    });
    return nextState;
  },
  async upsertConversation(state: ConversationState) {
    const clientKey = state.clientKey ?? "default";
    const conversations = await readAllConversations();
    const found = findConversationIndex(conversations, clientKey, state.waId);
    const nextState: ConversationState = {
      ...state,
      clientKey,
      conversationKey: found.conversationKey,
    };
    if (found.index >= 0) {
      conversations[found.index] = { ...conversations[found.index], ...nextState };
    } else {
      conversations.push(nextState);
    }
    await writeAllConversations(conversations);
    if (found.migrated) {
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(state.waId),
      });
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(state.waId),
    });
  },
  async deleteConversation(waId: string, clientKey = "default") {
    const conversations = await readAllConversations();
    const conversationKey = makeConversationKey(clientKey, waId);
    const filtered = conversations.filter(
      (item) =>
        item.conversationKey !== conversationKey &&
        !(item.clientKey === clientKey && item.waId === waId) &&
        !(!item.conversationKey && item.waId === waId)
    );
    if (filtered.length !== conversations.length) {
      await writeAllConversations(filtered);
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(waId),
    });
  },
  async updateConversationWindow(waId: string, lastInboundAt: string, clientKey = "default") {
    const conversations = await readAllConversations();
    const found = findConversationIndex(conversations, clientKey, waId);
    const index = found.index;
    const inboundTime = Number.isNaN(Date.parse(lastInboundAt))
      ? Date.now()
      : Date.parse(lastInboundAt);
    const expiresAt = new Date(inboundTime + 24 * 60 * 60 * 1000).toISOString();
    const existing = index >= 0 ? conversations[index] : null;
    const updated: ConversationState = {
      clientKey,
      conversationKey: found.conversationKey,
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
      demoStatus: existing?.demoStatus ?? "none",
      lastDemoRequestedAt: existing?.lastDemoRequestedAt,
      lastDemoScheduledAt: existing?.lastDemoScheduledAt,
      demoPreferredSchedule: existing?.demoPreferredSchedule,
      lastHandoffDemoScheduledKey: existing?.lastHandoffDemoScheduledKey,
      lastHandoffDemoScheduledAt: existing?.lastHandoffDemoScheduledAt,
      flow: existing?.flow,
      flowStep: existing?.flowStep,
      answers: existing?.answers ?? {},
      mode: existing?.mode ?? "BOT",
      assignedUserId: existing?.assignedUserId ?? null,
      assignedTo: existing?.assignedTo ?? null,
      assignedAt: existing?.assignedAt ?? null,
      handoff: existing?.handoff ?? { status: "none" },
      window: { isOpen: true, expiresAt },
    };

    if (index >= 0) {
      conversations[index] = updated;
    } else {
      conversations.push(updated);
    }

    await writeAllConversations(conversations);
    if (found.migrated) {
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(waId),
      });
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(waId),
    });
    return updated;
  },
};
