import fs from "node:fs/promises";
import path from "node:path";

export type InboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

const EMPTY_READ_STATE: InboxReadState = {
  lastReadAtByConversationKey: {},
  manuallyUnreadByConversationKey: {},
};

const dataDir = path.resolve(process.cwd(), ".data", "app-read-state");
const writeQueues = new Map<string, Promise<void>>();

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getReadStateFile(clientId: string, userId: string) {
  return path.join(dataDir, sanitizePathPart(clientId), `${sanitizePathPart(userId)}.json`);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function enqueueWrite(targetFile: string, fn: () => Promise<void>) {
  const prev = writeQueues.get(targetFile) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  writeQueues.set(targetFile, next);
  void next.finally(() => {
    if (writeQueues.get(targetFile) === next) {
      writeQueues.delete(targetFile);
    }
  });
  return next;
}

async function writeAtomic(targetFile: string, payload: string) {
  await ensureDir(path.dirname(targetFile));
  const tmp = `${targetFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, targetFile);
}

function normalizeReadState(input: unknown): InboxReadState {
  if (!input || typeof input !== "object") return EMPTY_READ_STATE;
  const typed = input as Record<string, unknown>;
  const lastReadAtByConversationKey =
    typed.lastReadAtByConversationKey && typeof typed.lastReadAtByConversationKey === "object"
      ? Object.fromEntries(
          Object.entries(typed.lastReadAtByConversationKey).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};
  const manuallyUnreadByConversationKey =
    typed.manuallyUnreadByConversationKey && typeof typed.manuallyUnreadByConversationKey === "object"
      ? Object.fromEntries(
          Object.entries(typed.manuallyUnreadByConversationKey).filter(
            (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
          )
        )
      : {};
  return {
    lastReadAtByConversationKey,
    manuallyUnreadByConversationKey,
  };
}

export async function getInboxReadState(clientId: string, userId: string): Promise<InboxReadState> {
  const targetFile = getReadStateFile(clientId, userId);
  try {
    const raw = await fs.readFile(targetFile, "utf-8");
    return normalizeReadState(JSON.parse(raw));
  } catch {
    return EMPTY_READ_STATE;
  }
}

async function writeInboxReadState(clientId: string, userId: string, state: InboxReadState) {
  const targetFile = getReadStateFile(clientId, userId);
  return enqueueWrite(targetFile, () => writeAtomic(targetFile, JSON.stringify(state, null, 2)));
}

export async function markInboxConversationRead(params: {
  clientId: string;
  userId: string;
  conversationKey: string;
  activityAt: string;
}) {
  const current = await getInboxReadState(params.clientId, params.userId);
  const nextUnread = { ...current.manuallyUnreadByConversationKey };
  delete nextUnread[params.conversationKey];
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: {
      ...current.lastReadAtByConversationKey,
      [params.conversationKey]: params.activityAt,
    },
    manuallyUnreadByConversationKey: nextUnread,
  };
  await writeInboxReadState(params.clientId, params.userId, nextState);
  return nextState;
}

export async function markInboxConversationUnread(params: {
  clientId: string;
  userId: string;
  conversationKey: string;
}) {
  const current = await getInboxReadState(params.clientId, params.userId);
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: current.lastReadAtByConversationKey,
    manuallyUnreadByConversationKey: {
      ...current.manuallyUnreadByConversationKey,
      [params.conversationKey]: true,
    },
  };
  await writeInboxReadState(params.clientId, params.userId, nextState);
  return nextState;
}

export async function markInboxConversationUnreadFromActivity(params: {
  clientId: string;
  userId: string;
  conversationKeys: string[];
  activityAt: string;
}) {
  const conversationKeys = Array.from(
    new Set(params.conversationKeys.map((key) => key.trim()).filter(Boolean))
  );
  const current = await getInboxReadState(params.clientId, params.userId);
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: {
      ...current.lastReadAtByConversationKey,
      ...Object.fromEntries(conversationKeys.map((key) => [key, params.activityAt])),
    },
    manuallyUnreadByConversationKey: {
      ...current.manuallyUnreadByConversationKey,
      ...Object.fromEntries(conversationKeys.map((key) => [key, true])),
    },
  };
  await writeInboxReadState(params.clientId, params.userId, nextState);
  return nextState;
}
