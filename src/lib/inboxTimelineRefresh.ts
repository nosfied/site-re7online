export type TimelineRefreshReadIntent = {
  skipMarkRead?: boolean;
};

export function shouldMarkReadAfterTimelineRefresh(input: {
  canMutateReadState: boolean;
  isForegroundFocused: boolean;
  intent?: TimelineRefreshReadIntent;
}) {
  if (input.intent?.skipMarkRead) return false;
  return input.isForegroundFocused && input.canMutateReadState;
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
