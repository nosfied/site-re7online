export type TimelineRefreshReadIntent = {
  skipMarkRead?: boolean;
};

export type TimelineReadStateSnapshot = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

export function shouldMarkReadAfterTimelineRefresh(input: {
  canMutateReadState: boolean;
  isForegroundFocused: boolean;
  intent?: TimelineRefreshReadIntent;
}) {
  if (input.intent?.skipMarkRead) return false;
  return input.isForegroundFocused && input.canMutateReadState;
}

export function shouldReportPostClaimRefreshError(error: unknown) {
  return (error as { errorCode?: string }).errorCode !== "request_aborted";
}

function normalizeConversationKey(key: string | null | undefined) {
  return String(key ?? "").trim();
}

export function addAutoReadSuppressionKeys(
  suppressedKeys: Set<string>,
  conversationKeys: Array<string | null | undefined>
) {
  for (const key of conversationKeys) {
    const normalizedKey = normalizeConversationKey(key);
    if (normalizedKey) suppressedKeys.add(normalizedKey);
  }
}

export function removeAutoReadSuppressionKeys(
  suppressedKeys: Set<string>,
  conversationKeys: Array<string | null | undefined>
) {
  for (const key of conversationKeys) {
    const normalizedKey = normalizeConversationKey(key);
    if (normalizedKey) suppressedKeys.delete(normalizedKey);
  }
}

export function clearAutoReadSuppressionKeys(suppressedKeys: Set<string>) {
  suppressedKeys.clear();
}

export function retainAutoReadSuppressionKeys(
  suppressedKeys: Set<string>,
  activeConversationKeys: Array<string | null | undefined>
) {
  const activeKeys = new Set(
    activeConversationKeys
      .map((key) => normalizeConversationKey(key))
      .filter(Boolean)
  );
  for (const key of suppressedKeys) {
    if (!activeKeys.has(key)) suppressedKeys.delete(key);
  }
}

export function hasAutoReadSuppressionKey(
  suppressedKeys: Set<string>,
  conversationKeys: Array<string | null | undefined>
) {
  return conversationKeys.some((key) => suppressedKeys.has(normalizeConversationKey(key)));
}

export function isConversationEffectivelyRead(input: {
  readState: TimelineReadStateSnapshot;
  conversationKeys: Array<string | null | undefined>;
  activityAt?: string | null;
}) {
  const conversationKeys = input.conversationKeys
    .map((key) => normalizeConversationKey(key))
    .filter(Boolean);
  if (conversationKeys.length === 0) return false;
  if (conversationKeys.some((key) => input.readState.manuallyUnreadByConversationKey[key])) return false;
  const activityTimestamp = Date.parse(input.activityAt ?? "");
  if (!Number.isFinite(activityTimestamp)) return false;
  return conversationKeys.every((key) => {
    const readTimestamp = Date.parse(input.readState.lastReadAtByConversationKey[key] ?? "");
    return Number.isFinite(readTimestamp) && readTimestamp >= activityTimestamp;
  });
}

export function mergeReadStatePreservingUnrelated(
  current: TimelineReadStateSnapshot,
  incoming: TimelineReadStateSnapshot
): TimelineReadStateSnapshot {
  const manuallyUnreadByConversationKey = {
    ...current.manuallyUnreadByConversationKey,
    ...incoming.manuallyUnreadByConversationKey,
  };
  for (const key of Object.keys(incoming.lastReadAtByConversationKey)) {
    if (!incoming.manuallyUnreadByConversationKey[key]) {
      delete manuallyUnreadByConversationKey[key];
    }
  }
  return {
    lastReadAtByConversationKey: {
      ...current.lastReadAtByConversationKey,
      ...incoming.lastReadAtByConversationKey,
    },
    manuallyUnreadByConversationKey,
  };
}
