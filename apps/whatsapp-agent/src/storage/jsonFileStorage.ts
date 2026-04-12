import fs from "node:fs/promises";
import path from "node:path";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState, HandoffState } from "../conversation/conversation.types.js";
import { logger } from "../logger/logger.js";
import {
  getClientKeyFromConversationKey,
  makeConversationKey,
} from "./conversationKey.js";
import {
  buildWaIdLookup,
  canonicalizeBrazilWaId,
  compareConversationLookupPriority,
} from "../utils/waid.js";

const dataDir = path.resolve(process.cwd(), ".data");
const legacyEventsFile = path.join(dataDir, "whatsapp-events.json");
const legacyConversationFile = path.join(dataDir, "conversations.json");
const writeQueues = new Map<string, Promise<void>>();

function sanitizeClientKey(clientKey: string) {
  return clientKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTenantDir(clientKey: string) {
  return path.join(dataDir, sanitizeClientKey(clientKey));
}

function getEventsFile(clientKey: string) {
  return path.join(getTenantDir(clientKey), "whatsapp-events.json");
}

function getConversationsFile(clientKey: string) {
  return path.join(getTenantDir(clientKey), "conversations.json");
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir: string, clientKey?: string) {
  const existed = await pathExists(dir);
  await fs.mkdir(dir, { recursive: true });
  if (!existed && clientKey) {
    logger.info({
      event: "storage.dir.created",
      clientKey,
      dir,
    });
  }
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

async function readRecordsFile(targetFile: string): Promise<StoredRecord[]> {
  try {
    const content = await fs.readFile(targetFile, "utf-8");
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
  const dir = path.dirname(targetFile);
  const clientKey = dir === dataDir ? undefined : path.basename(dir);
  await ensureDir(dir, clientKey);
  const base = path.basename(targetFile);
  const tmp = path.join(
    dir,
    `${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  await fs.writeFile(tmp, payload, "utf-8");
  await renameWithRetry(tmp, targetFile);
}

async function writeRecordsFile(targetFile: string, records: StoredRecord[]) {
  return enqueueWrite(targetFile, () =>
    writeAtomic(targetFile, JSON.stringify(records, null, 2))
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
    waIdCanonical: raw.waIdCanonical ?? canonicalizeBrazilWaId(raw.waId),
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
    departmentId: raw.departmentId ?? null,
    queueId: raw.queueId ?? null,
    status: raw.status ?? null,
    closedAt: raw.closedAt ?? null,
    window: raw.window,
    handoff,
  };
}

async function readConversationFile(targetFile: string): Promise<ConversationState[]> {
  try {
    const content = await fs.readFile(targetFile, "utf-8");
    const raw = JSON.parse(content) as LegacyConversationState[];
    return raw.map(normalizeConversation);
  } catch {
    return [];
  }
}

async function writeConversationFile(targetFile: string, conversations: ConversationState[]) {
  return enqueueWrite(targetFile, () =>
    writeAtomic(targetFile, JSON.stringify(conversations, null, 2))
  );
}

function maskWaId(waId: string) {
  return `***${waId.slice(-4)}`;
}

function matchesConversationLookup(
  item: ConversationState,
  clientKey: string,
  waId: string
) {
  const lookup = buildWaIdLookup(waId);
  const itemCanonical = item.waIdCanonical ?? canonicalizeBrazilWaId(item.waId);
  return (
    item.conversationKey === makeConversationKey(clientKey, lookup.raw) ||
    (item.clientKey === clientKey &&
      (item.waId === lookup.raw || itemCanonical === lookup.canonical)) ||
    (!item.conversationKey && (item.waId === lookup.raw || itemCanonical === lookup.canonical))
  );
}

function findConversationIndex(
  conversations: ConversationState[],
  clientKey: string,
  waId: string
) {
  const matches = conversations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesConversationLookup(item, clientKey, waId))
    .sort((left, right) => compareConversationLookupPriority(left.item, right.item));

  if (matches.length === 0) {
    return {
      index: -1,
      conversationKey: makeConversationKey(clientKey, buildWaIdLookup(waId).raw),
      migrated: false,
      collisionCount: 0,
    };
  }

  const winner = matches[0];
  return {
    index: winner.index,
    conversationKey: winner.item.conversationKey ?? makeConversationKey(clientKey, winner.item.waId),
    migrated: !winner.item.conversationKey,
    collisionCount: matches.length,
  };
}

async function readTenantConversations(clientKey: string) {
  const targetFile = getConversationsFile(clientKey);
  const exists = await pathExists(targetFile);
  if (exists) {
    return {
      conversations: await readConversationFile(targetFile),
      targetFile,
    };
  }
  return {
    conversations: [] as ConversationState[],
    targetFile,
  };
}

async function readLegacyConversation(waId: string, clientKey: string) {
  if (!(await pathExists(legacyConversationFile))) {
    return null;
  }
  const conversations = await readConversationFile(legacyConversationFile);
  const found = findConversationIndex(conversations, clientKey, waId);
  if (found.index < 0) {
    return null;
  }
  if (found.collisionCount > 1) {
    logger.warn({
      event: "waid.canonical.collision",
      clientId: null,
      clientKey,
      waId: maskWaId(waId),
      waIdCanonical: canonicalizeBrazilWaId(waId),
      matchCount: found.collisionCount,
      source: "json_storage_legacy",
    });
  }
  logger.info({
    event: "storage.conversation.legacy_fallback",
    clientKey,
    waId: maskWaId(waId),
    conversationKey: found.conversationKey,
    legacyFile: legacyConversationFile,
    targetFile: getConversationsFile(clientKey),
  });
  return {
    state: {
      ...conversations[found.index],
      clientKey,
      conversationKey: found.conversationKey,
    } satisfies ConversationState,
  };
}

async function listEventFiles() {
  const targets: string[] = [];
  if (await pathExists(legacyEventsFile)) {
    targets.push(legacyEventsFile);
  }
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const scopedFile = path.join(dataDir, entry.name, "whatsapp-events.json");
      if (await pathExists(scopedFile)) {
        targets.push(scopedFile);
      }
    }
  } catch {
    // ignore directory scan failures
  }
  return targets;
}

async function findMessageRecord(messageId: string) {
  const files = await listEventFiles();
  for (const targetFile of files) {
    const records = await readRecordsFile(targetFile);
    const index = records.findIndex((item) => item.messageId === messageId);
    if (index >= 0) {
      if (targetFile === legacyEventsFile) {
        logger.info({
          event: "storage.events.legacy_fallback",
          messageId,
          legacyFile: legacyEventsFile,
        });
      }
      return { targetFile, records, index };
    }
  }
  return null;
}

export const jsonFileStorage: Storage = {
  async saveIncomingMessage(record: StoredRecord) {
    const clientKey = record.clientKey ?? "default";
    const targetFile = getEventsFile(clientKey);
    const records = await readRecordsFile(targetFile);
    records.push(record);
    await writeRecordsFile(targetFile, records);
  },
  async appendOutboundEvent(record: StoredRecord) {
    const clientKey = record.clientKey ?? "default";
    const targetFile = getEventsFile(clientKey);
    const records = await readRecordsFile(targetFile);
    records.push(record);
    await writeRecordsFile(targetFile, records);
  },
  async findByMessageId(messageId: string) {
    const found = await findMessageRecord(messageId);
    if (!found) return null;
    return found.records[found.index] ?? null;
  },
  async updateStatus(messageId: string, status: MessageStatus, extra?: Record<string, unknown>) {
    const found = await findMessageRecord(messageId);
    if (found) {
      found.records[found.index] = {
        ...found.records[found.index],
        status,
        meta: { ...(found.records[found.index].meta ?? {}), ...(extra ?? {}) },
      };
      await writeRecordsFile(found.targetFile, found.records);
    }
  },
  async updateMessage(messageId: string, patch: Partial<StoredRecord>) {
    const found = await findMessageRecord(messageId);
    if (found) {
      found.records[found.index] = {
        ...found.records[found.index],
        ...patch,
        meta: { ...(found.records[found.index].meta ?? {}), ...(patch.meta ?? {}) },
      };
      await writeRecordsFile(found.targetFile, found.records);
    }
  },
  async getConversation(waId: string, clientKey = "default") {
    const { conversations, targetFile } = await readTenantConversations(clientKey);
    const found = findConversationIndex(conversations, clientKey, waId);
    if (found.index < 0) {
      const legacy = await readLegacyConversation(waId, clientKey);
      if (legacy) {
        logger.info({
          event: "storage.conversation.read",
          clientKey,
          waId: maskWaId(waId),
          conversationKey: found.conversationKey,
          found: true,
          source: "legacy",
          targetFile,
        });
        return legacy.state;
      }
      logger.info({
        event: "storage.conversation.read",
        clientKey,
        waId: maskWaId(waId),
        conversationKey: found.conversationKey,
        found: false,
        targetFile,
      });
      return null;
    }
    const current = conversations[found.index];
    if (found.collisionCount > 1) {
      logger.warn({
        event: "waid.canonical.collision",
        clientId: null,
        clientKey,
        waId: maskWaId(waId),
        waIdCanonical: canonicalizeBrazilWaId(waId),
        matchCount: found.collisionCount,
        source: "json_storage",
      });
    }
    const nextState: ConversationState = {
      ...current,
      clientKey,
      conversationKey:
        current.conversationKey ?? found.conversationKey ?? makeConversationKey(clientKey, current.waId),
      waIdCanonical: current.waIdCanonical ?? canonicalizeBrazilWaId(current.waId),
    };
    if (found.migrated) {
      conversations[found.index] = nextState;
      await writeConversationFile(targetFile, conversations);
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(waId),
        conversationKey: found.conversationKey,
        targetFile,
      });
    }
    logger.info({
      event: "storage.conversation.read",
      clientKey,
      waId: maskWaId(waId),
      conversationKey: found.conversationKey,
      found: true,
      targetFile,
    });
    return nextState;
  },
  async upsertConversation(state: ConversationState) {
    const clientKey = state.clientKey ?? "default";
    const targetFile = getConversationsFile(clientKey);
    const conversations = await readConversationFile(targetFile);
    const found = findConversationIndex(conversations, clientKey, state.waId);
    const nextState: ConversationState = {
      ...state,
      clientKey,
      conversationKey: found.conversationKey,
      waIdCanonical: state.waIdCanonical ?? canonicalizeBrazilWaId(state.waId),
    };
    if (found.index >= 0) {
      conversations[found.index] = { ...conversations[found.index], ...nextState };
    } else {
      conversations.push(nextState);
    }
    await writeConversationFile(targetFile, conversations);
    if (found.migrated) {
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(state.waId),
        conversationKey: found.conversationKey,
        targetFile,
      });
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(state.waId),
      conversationKey: found.conversationKey,
      targetFile,
    });
  },
  async deleteConversation(waId: string, clientKey = "default") {
    const targetFile = getConversationsFile(clientKey);
    const conversationKey = makeConversationKey(clientKey, buildWaIdLookup(waId).raw);
    const conversations = await readConversationFile(targetFile);
    const filtered = conversations.filter((item) => !matchesConversationLookup(item, clientKey, waId));
    if (filtered.length !== conversations.length) {
      await writeConversationFile(targetFile, filtered);
    } else if (await pathExists(legacyConversationFile)) {
      const legacyConversations = await readConversationFile(legacyConversationFile);
      const legacyFiltered = legacyConversations.filter(
        (item) => !matchesConversationLookup(item, clientKey, waId)
      );
      if (legacyFiltered.length !== legacyConversations.length) {
        logger.info({
          event: "storage.conversation.legacy_fallback",
          clientKey,
          waId: maskWaId(waId),
          conversationKey,
          legacyFile: legacyConversationFile,
          targetFile,
        });
        await writeConversationFile(legacyConversationFile, legacyFiltered);
      }
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(waId),
      conversationKey,
      targetFile,
    });
  },
  async updateConversationWindow(waId: string, lastInboundAt: string, clientKey = "default") {
    const targetFile = getConversationsFile(clientKey);
    const conversations = await readConversationFile(targetFile);
    const found = findConversationIndex(conversations, clientKey, waId);
    const index = found.index;
    const inboundTime = Number.isNaN(Date.parse(lastInboundAt))
      ? Date.now()
      : Date.parse(lastInboundAt);
    const expiresAt = new Date(inboundTime + 24 * 60 * 60 * 1000).toISOString();
    const legacy = index >= 0 ? null : await readLegacyConversation(waId, clientKey);
    const existing = index >= 0 ? conversations[index] : legacy?.state ?? null;
    const updated: ConversationState = {
      clientKey,
      conversationKey: found.conversationKey,
      waId,
      waIdCanonical: existing?.waIdCanonical ?? canonicalizeBrazilWaId(waId),
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
      departmentId: existing?.departmentId ?? null,
      queueId: existing?.queueId ?? null,
      status: existing?.status ?? null,
      closedAt: existing?.closedAt ?? null,
      handoff: existing?.handoff ?? { status: "none" },
      window: { isOpen: true, expiresAt },
    };

    if (index >= 0) {
      conversations[index] = updated;
    } else {
      conversations.push(updated);
    }

    await writeConversationFile(targetFile, conversations);
    if (found.migrated) {
      logger.info({
        event: "storage.conversation.migrated",
        clientKey,
        waId: maskWaId(waId),
        conversationKey: found.conversationKey,
        targetFile,
      });
    }
    logger.info({
      event: "storage.conversation.write",
      clientKey,
      waId: maskWaId(waId),
      conversationKey: found.conversationKey,
      targetFile,
    });
    return updated;
  },
};
