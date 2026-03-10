const conversationQueues = new Map<string, Promise<void>>();

function makeConversationLockKey(clientKey: string, waId: string) {
  return `${clientKey}:${waId}`;
}

export async function acquireConversationMutex(clientKey: string, waId: string) {
  const key = makeConversationLockKey(clientKey, waId);
  const previous = conversationQueues.get(key) ?? Promise.resolve();

  let releaseQueue: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  conversationQueues.set(
    key,
    previous
      .catch(() => undefined)
      .then(() => current)
  );

  await previous.catch(() => undefined);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseQueue?.();
    if (conversationQueues.get(key) === current) {
      conversationQueues.delete(key);
    }
  };
}
