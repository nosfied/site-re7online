import fs from "node:fs/promises";
import path from "node:path";

export type InboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

export type ConversationReadScope =
  | { type: "shared" }
  | { type: "assigned"; assignedUserId: string };

const EMPTY_READ_STATE: InboxReadState = {
  lastReadAtByConversationKey: {},
  manuallyUnreadByConversationKey: {},
};

const dataDir = path.resolve(process.cwd(), ".data", "app-read-state");
const writeQueues = new Map<string, Promise<void>>();

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getReadStateFile(clientId: string) {
  return path.join(dataDir, sanitizePathPart(clientId), "shared.json");
}

function getAssignedReadStateFile(clientId: string, assignedUserId: string) {
  return path.join(dataDir, sanitizePathPart(clientId), "assigned", `${sanitizePathPart(assignedUserId)}.json`);
}

export function resolveConversationReadScope(conversation: {
  assignedUserId?: string | null;
} | null | undefined): ConversationReadScope {
  const assignedUserId = String(conversation?.assignedUserId ?? "").trim();
  return assignedUserId ? { type: "assigned", assignedUserId } : { type: "shared" };
}

function getReadStateFileForScope(clientId: string, scope: ConversationReadScope = { type: "shared" }) {
  return scope.type === "assigned"
    ? getAssignedReadStateFile(clientId, scope.assignedUserId)
    : getReadStateFile(clientId);
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

export async function getInboxReadState(clientId: string, _userId: string): Promise<InboxReadState> {
  const shared = await readInboxReadStateScope(clientId, { type: "shared" });
  const userId = String(_userId ?? "").trim();
  if (!userId) return shared;
  const assigned = await readInboxReadStateScope(clientId, { type: "assigned", assignedUserId: userId });
  return mergeReadStates(shared, assigned);
}

async function readInboxReadStateScope(clientId: string, scope: ConversationReadScope) {
  const targetFile = getReadStateFileForScope(clientId, scope);
  try {
    const raw = await fs.readFile(targetFile, "utf-8");
    return normalizeReadState(JSON.parse(raw));
  } catch {
    return EMPTY_READ_STATE;
  }
}

function mergeReadStates(shared: InboxReadState, assigned: InboxReadState): InboxReadState {
  return {
    lastReadAtByConversationKey: {
      ...shared.lastReadAtByConversationKey,
      ...assigned.lastReadAtByConversationKey,
    },
    manuallyUnreadByConversationKey: {
      ...shared.manuallyUnreadByConversationKey,
      ...assigned.manuallyUnreadByConversationKey,
    },
  };
}

async function writeInboxReadState(clientId: string, _userId: string, state: InboxReadState, scope: ConversationReadScope) {
  const targetFile = getReadStateFileForScope(clientId, scope);
  return enqueueWrite(targetFile, () => writeAtomic(targetFile, JSON.stringify(state, null, 2)));
}

export async function markInboxConversationRead(params: {
  clientId: string;
  userId: string;
  conversationKey: string;
  activityAt: string;
  scope?: ConversationReadScope;
}) {
  const scope = params.scope ?? { type: "shared" };
  const current = await readInboxReadStateScope(params.clientId, scope);
  const nextUnread = { ...current.manuallyUnreadByConversationKey };
  delete nextUnread[params.conversationKey];
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: {
      ...current.lastReadAtByConversationKey,
      [params.conversationKey]: params.activityAt,
    },
    manuallyUnreadByConversationKey: nextUnread,
  };
  await writeInboxReadState(params.clientId, params.userId, nextState, scope);
  return nextState;
}

export async function markInboxConversationUnread(params: {
  clientId: string;
  userId: string;
  conversationKey: string;
  scope?: ConversationReadScope;
}) {
  const scope = params.scope ?? { type: "shared" };
  const current = await readInboxReadStateScope(params.clientId, scope);
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: current.lastReadAtByConversationKey,
    manuallyUnreadByConversationKey: {
      ...current.manuallyUnreadByConversationKey,
      [params.conversationKey]: true,
    },
  };
  await writeInboxReadState(params.clientId, params.userId, nextState, scope);
  return nextState;
}

export async function markInboxConversationUnreadFromActivity(params: {
  clientId: string;
  userId: string;
  conversationKeys: string[];
  activityAt: string;
  scope?: ConversationReadScope;
}) {
  const conversationKeys = Array.from(
    new Set(params.conversationKeys.map((key) => key.trim()).filter(Boolean))
  );
  const scope = params.scope ?? { type: "shared" };
  const current = await readInboxReadStateScope(params.clientId, scope);
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
  await writeInboxReadState(params.clientId, params.userId, nextState, scope);
  return nextState;
}
