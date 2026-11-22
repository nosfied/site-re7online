import fs from "node:fs/promises";
import path from "node:path";

export type InboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

export type ConversationReadScope =
  | { type: "shared" }
  | { type: "assigned"; assignedUserId: string };

export type ConversationReadStateProjection = {
  conversationKeys: Array<string | null | undefined>;
  assignedUserId?: string | null;
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

export async function getInboxReadStateForConversations(params: {
  clientId: string;
  userId: string;
  conversations: ConversationReadStateProjection[];
}): Promise<InboxReadState> {
  const userId = String(params.userId ?? "").trim();
  const shared = await readInboxReadStateScope(params.clientId, { type: "shared" });
  if (!userId) return projectReadStateForConversations(shared, EMPTY_READ_STATE, "", params.conversations);
  const assigned = await readInboxReadStateScope(params.clientId, { type: "assigned", assignedUserId: userId });
  return projectReadStateForConversations(shared, assigned, userId, params.conversations);
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

export async function getInboxReadStateForScope(clientId: string, scope: ConversationReadScope) {
  return readInboxReadStateScope(clientId, scope);
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

function normalizeConversationKeys(conversationKeys: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      conversationKeys
        .map((key) => String(key ?? "").trim())
        .filter(Boolean)
    )
  );
}

function getLatestReadAtForKeys(state: InboxReadState, conversationKeys: string[]) {
  let latestReadAt: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const key of conversationKeys) {
    const readAt = state.lastReadAtByConversationKey[key];
    const timestamp = Date.parse(readAt ?? "");
    if (!Number.isFinite(timestamp) || timestamp < latestTimestamp) continue;
    latestReadAt = readAt;
    latestTimestamp = timestamp;
  }
  return latestReadAt;
}

export function isInboxReadStateMutationNoop(params: {
  current: InboxReadState;
  conversationKeys: string[];
  unread: boolean;
  activityAt?: string | null;
}) {
  const conversationKeys = normalizeConversationKeys(params.conversationKeys);
  if (conversationKeys.length === 0) return true;
  if (params.unread) {
    return conversationKeys.every((key) => params.current.manuallyUnreadByConversationKey[key] === true);
  }
  if (conversationKeys.some((key) => params.current.manuallyUnreadByConversationKey[key])) return false;
  const activityTimestamp = Date.parse(params.activityAt ?? "");
  if (!Number.isFinite(activityTimestamp)) return false;
  return conversationKeys.every((key) => {
    const readTimestamp = Date.parse(params.current.lastReadAtByConversationKey[key] ?? "");
    return Number.isFinite(readTimestamp) && readTimestamp >= activityTimestamp;
  });
}

function projectConversationReadState(
  target: InboxReadState,
  source: InboxReadState,
  conversationKeys: string[]
) {
  if (conversationKeys.length === 0) return;
  const latestReadAt = getLatestReadAtForKeys(source, conversationKeys);
  if (latestReadAt) {
    for (const key of conversationKeys) {
      target.lastReadAtByConversationKey[key] = latestReadAt;
    }
  }

  const latestReadTimestamp = Date.parse(latestReadAt ?? "");
  const hasLatestReadTimestamp = Number.isFinite(latestReadTimestamp);
  const hasEffectiveManualUnread = conversationKeys.some((key) => {
    if (!source.manuallyUnreadByConversationKey[key]) return false;
    const keyReadTimestamp = Date.parse(source.lastReadAtByConversationKey[key] ?? "");
    if (!hasLatestReadTimestamp) return true;
    if (!Number.isFinite(keyReadTimestamp)) return false;
    return keyReadTimestamp >= latestReadTimestamp;
  });
  if (!hasEffectiveManualUnread) return;
  for (const key of conversationKeys) {
    target.manuallyUnreadByConversationKey[key] = true;
  }
}

function projectReadStateForConversations(
  shared: InboxReadState,
  assigned: InboxReadState,
  userId: string,
  conversations: ConversationReadStateProjection[]
): InboxReadState {
  const next: InboxReadState = {
    lastReadAtByConversationKey: {},
    manuallyUnreadByConversationKey: {},
  };
  for (const conversation of conversations) {
    const conversationKeys = normalizeConversationKeys(conversation.conversationKeys);
    const scope = resolveConversationReadScope(conversation);
    const source = scope.type === "assigned" && scope.assignedUserId === userId ? assigned : shared;
    projectConversationReadState(next, source, conversationKeys);
  }
  return next;
}

async function writeInboxReadState(clientId: string, _userId: string, state: InboxReadState, scope: ConversationReadScope) {
  const targetFile = getReadStateFileForScope(clientId, scope);
  return enqueueWrite(targetFile, () => writeAtomic(targetFile, JSON.stringify(state, null, 2)));
}

export async function markInboxConversationRead(params: {
  clientId: string;
  userId: string;
  conversationKey: string;
  conversationKeys?: string[];
  activityAt: string;
  scope?: ConversationReadScope;
}) {
  const scope = params.scope ?? { type: "shared" };
  const current = await readInboxReadStateScope(params.clientId, scope);
  const conversationKeys = normalizeConversationKeys([params.conversationKey, ...(params.conversationKeys ?? [])]);
  const nextUnread = { ...current.manuallyUnreadByConversationKey };
  for (const key of conversationKeys) {
    delete nextUnread[key];
  }
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: {
      ...current.lastReadAtByConversationKey,
      ...Object.fromEntries(conversationKeys.map((key) => [key, params.activityAt])),
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
  conversationKeys?: string[];
  scope?: ConversationReadScope;
}) {
  const scope = params.scope ?? { type: "shared" };
  const current = await readInboxReadStateScope(params.clientId, scope);
  const conversationKeys = normalizeConversationKeys([params.conversationKey, ...(params.conversationKeys ?? [])]);
  const nextState: InboxReadState = {
    lastReadAtByConversationKey: current.lastReadAtByConversationKey,
    manuallyUnreadByConversationKey: {
      ...current.manuallyUnreadByConversationKey,
      ...Object.fromEntries(conversationKeys.map((key) => [key, true])),
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
