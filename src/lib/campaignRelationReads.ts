import type { CampaignItem } from "./whatsappAdminApi";

const version = (item: CampaignItem) => `${item.updatedAt}|${item.status}`;

// Ephemeral, session-owned relation reads; never stores campaign content or auth.
export function createCampaignRelationReads(options: {
  tenantId: string;
  read: (id: string, signal: AbortSignal) => Promise<CampaignItem>;
  changed: () => void;
  unauthorized: () => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const relations = new Map<string, { batch: CampaignItem["executionBatch"]; checked: string }>();
  const failures = new Map<string, { version: string; retryAt: number }>();
  const pending = new Map<string, AbortController>();
  let rows: CampaignItem[] = [];
  let disposed = false;

  const merge = (items: CampaignItem[]) => items.map(item => {
    const relation = relations.get(item.id);
    return item.clientId === options.tenantId && relation ? { ...item, executionBatch: relation.batch } : item;
  });
  const remember = (item: CampaignItem) => {
    if (disposed || item.clientId !== options.tenantId || item.executionBatch === undefined) return;
    relations.set(item.id, { batch: item.executionBatch, checked: version(item) });
    failures.delete(item.id);
  };
  const pump = () => {
    if (disposed) return;
    for (const item of rows) {
      if (pending.size >= 2) break;
      if (item.clientId !== options.tenantId || item.selectionMode !== "DYNAMIC_CRM_FILTER" || pending.has(item.id)) continue;
      const stamp = version(item);
      if (relations.get(item.id)?.checked === stamp) continue;
      const failure = failures.get(item.id);
      if (failure?.version === stamp && failure.retryAt > now()) continue;
      const controller = new AbortController();
      pending.set(item.id, controller);
      const previousRelation = relations.get(item.id);
      void options.read(item.id, controller.signal).then(detail => {
        if (disposed || controller.signal.aborted) return;
        if (detail.id !== item.id || detail.clientId !== options.tenantId) {
          failures.set(item.id, { version: stamp, retryAt: now() + 30000 });
          return;
        }
        if (relations.get(item.id) !== previousRelation) return;
        if (!rows.some(current => current.id === item.id && version(current) === stamp)) return;
        // An absent batch is also a successful observation until the row changes.
        relations.set(item.id, { batch: detail.executionBatch ?? null, checked: stamp });
        failures.delete(item.id);
        options.changed();
      }).catch(error => {
        if (disposed || controller.signal.aborted) return;
        if ((error as { status?: number }).status === 401) options.unauthorized();
        failures.set(item.id, { version: stamp, retryAt: now() + 30000 });
      }).finally(() => {
        pending.delete(item.id);
        pump();
      });
    }
  };
  return {
    merge,
    remember,
    update(items: CampaignItem[]) {
      rows = items;
      for (const item of items) remember(item);
      pump();
      return merge(items);
    },
    dispose() {
      disposed = true;
      rows = [];
      relations.clear();
      failures.clear();
      for (const controller of pending.values()) controller.abort();
    },
  };
}
