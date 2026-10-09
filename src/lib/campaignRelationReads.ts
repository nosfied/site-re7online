import type { CampaignItem } from "./whatsappAdminApi";

const version = (item: CampaignItem) => `${item.updatedAt}|${item.status}`;

// Ephemeral, session-owned details and relations; never persisted or shared across sessions.
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
  // The same two slots serve supplementary relations, selected detail and open lots.
  // Aborting a read does not release its slot until the HTTP promise settles.
  type DetailRead = { id: string; controller: AbortController; started: boolean; resolve: (item: CampaignItem) => void; reject: (error: unknown) => void; cleanup: () => void };
  const queue: DetailRead[] = [];
  const active = new Set<DetailRead>();
  const loaded = new Map<string, CampaignItem>();
  const aborted = () => new DOMException("Leitura cancelada", "AbortError");
  const runQueue = () => {
    while (!disposed && active.size < 2 && queue.length) {
      const task = queue.shift()!;
      if (task.controller.signal.aborted) continue;
      task.started = true;
      active.add(task);
      let response: Promise<CampaignItem>;
      try { response = options.read(task.id, task.controller.signal); }
      catch (error) { response = Promise.reject(error); }
      void response.then(item => {
        if (disposed || task.controller.signal.aborted) throw aborted();
        if (item.id !== task.id || item.clientId !== options.tenantId) throw new Error("Identidade do detalhe não corresponde à campanha.");
        task.resolve(item);
      }).catch(task.reject).finally(() => {
        task.cleanup();
        active.delete(task);
        runQueue();
      });
    }
  };
  const readDetail = (id: string, signal?: AbortSignal) => new Promise<CampaignItem>((resolve, reject) => {
    if (disposed || signal?.aborted) { reject(aborted()); return; }
    const controller = new AbortController();
    const task: DetailRead = { id, controller, started: false, resolve, reject, cleanup: () => {} };
    const cancel = () => {
      controller.abort();
      reject(aborted());
      if (!task.started) {
        const index = queue.indexOf(task);
        if (index >= 0) queue.splice(index, 1);
        task.cleanup();
      }
    };
    task.cleanup = () => signal?.removeEventListener("abort", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    queue.push(task);
    runQueue();
  });
  let rows: CampaignItem[] = [];
  let disposed = false;

  const merge = (items: CampaignItem[]) => items.map(item => {
    const relation = relations.get(item.id);
    return item.clientId === options.tenantId && relation ? { ...item, executionBatch: relation.batch } : item;
  });
  const remember = (item: CampaignItem) => {
    if (disposed || item.clientId !== options.tenantId || item.executionBatch === undefined) return;
    loaded.set(item.id, item);
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
      void readDetail(item.id, controller.signal).then(detail => {
        if (disposed || controller.signal.aborted) return;
        if (detail.id !== item.id || detail.clientId !== options.tenantId) {
          failures.set(item.id, { version: stamp, retryAt: now() + 30000 });
          return;
        }
        if (relations.get(item.id) !== previousRelation) return;
        if (!rows.some(current => current.id === item.id && version(current) === stamp)) return;
        // An absent batch is also a successful observation until the row changes.
        loaded.set(item.id, detail);
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
    readDetail,
    detailVersion(id: string) {
      const item = rows.find(row => row.id === id && row.clientId === options.tenantId);
      return item ? version(item) : null;
    },
    peekDetail(id: string) {
      const detail = loaded.get(id);
      const current = rows.find(item => item.id === id);
      return detail && (!current || version(current) === version(detail)) ? detail : null;
    },
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
      loaded.clear();
      for (const task of queue.splice(0)) { task.controller.abort(); task.cleanup(); task.reject(aborted()); }
      for (const task of active) { task.controller.abort(); task.reject(aborted()); }
      failures.clear();
      for (const controller of pending.values()) controller.abort();
    },
  };
}
