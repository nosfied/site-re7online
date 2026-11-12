export const INBOX_CONVERSATION_SEARCH_DEBOUNCE_MS = 250;

/**
 * Keeps list refreshes isolated by their complete query key. Requests for the
 * same query are coalesced, while a newer query always starts independently.
 */
export class InboxConversationQueryRegistry {
  private currentKey = "";
  private readonly inFlight = new Map<string, Promise<void>>();

  setCurrentKey(key: string) {
    this.currentKey = key;
  }

  isCurrent(key: string) {
    return this.currentKey === key;
  }

  run(key: string, operation: () => Promise<void>) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const request = operation().finally(() => {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }
}

