export type WebSessionQrEntry = {
  accountId: string;
  qr: string;
  expiresAt: number;
  createdAt: number;
};

export function createWebSessionQrMemoryStore(params: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = params.ttlMs ?? 60_000;
  const now = params.now ?? (() => Date.now());
  const entries = new Map<string, WebSessionQrEntry>();

  function prune() {
    const current = now();
    for (const [key, entry] of entries.entries()) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
  }

  return {
    set(accountId: string, qr: string) {
      prune();
      const createdAt = now();
      entries.set(accountId, {
        accountId,
        qr,
        createdAt,
        expiresAt: createdAt + ttlMs,
      });
    },
    get(accountId: string) {
      prune();
      return entries.get(accountId)?.qr ?? null;
    },
    clear(accountId: string) {
      entries.delete(accountId);
    },
    size() {
      prune();
      return entries.size;
    },
  };
}
