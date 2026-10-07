import test from "node:test";
import assert from "node:assert/strict";
import { createCampaignRelationReads } from "./campaignRelationReads";
import type { CampaignItem } from "./whatsappAdminApi";
const row = (id: string, updatedAt = "1") => ({ id, clientId: "tenant", updatedAt, status: "completed", selectionMode: "DYNAMIC_CRM_FILTER" } as CampaignItem);
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const pending: Array<{ id: string; signal: AbortSignal; resolve: (item: CampaignItem) => void; reject: (error: unknown) => void }> = [];
  let changes = 0, clock = 0;
  const reader = createCampaignRelationReads({ tenantId: "tenant", now: () => clock, changed: () => changes++, unauthorized: () => {}, read: (id, signal) => new Promise((resolve, reject) => pending.push({ id, signal, resolve, reject })) });
  return { reader, pending, changes: () => changes, advance: () => clock += 30000 };
}
test("bounded queue returns list immediately, reuses completed observations", async () => {
  const h = harness(); const rows = Array.from({ length: 20 }, (_, i) => row(String(i)));
  assert.equal(h.reader.update(rows).length, 20); assert.equal(h.pending.length, 2);
  for (let i = 0; i < 20; i++) { h.pending[i].resolve(row(String(i))); await settle(); }
  h.reader.update(rows); assert.equal(h.pending.length, 20);
});
test("loaded detail seeds relation and changes invalidate without discarding links", async () => {
  const h = harness(); const batch = { id: "b", chunks: [{ campaignId: "child" }] } as NonNullable<CampaignItem["executionBatch"]>;
  h.reader.remember({ ...row("a"), executionBatch: batch });
  h.reader.update([row("a")]); assert.equal(h.pending.length, 0);
  assert.equal(h.reader.update([row("a", "2")])[0].executionBatch, batch);
  assert.equal(h.pending.length, 1);
  h.pending[0].resolve({ ...row("a", "2"), executionBatch: { ...batch, chunks: [] } }); await settle();
  assert.equal(h.reader.merge([row("a", "2")])[0].executionBatch?.chunks.length, 0);
});
test("partial failure is throttled and preserves proven relation", async () => {
  const h = harness(); h.reader.remember({ ...row("a"), executionBatch: { id: "b", chunks: [] } as unknown as CampaignItem["executionBatch"] });
  h.reader.update([row("a", "2")]); h.pending[0].reject(new Error("slow server")); await settle();
  h.reader.update([row("a", "2")]); assert.equal(h.pending.length, 1);
  assert.equal(h.reader.merge([row("a", "2")])[0].executionBatch?.id, "b");
  h.advance(); h.reader.update([row("a", "2")]); assert.equal(h.pending.length, 2);
});
test("session disposal aborts and rejects stale replies; mismatched tenant cannot enrich", async () => {
  const h = harness(); h.reader.update([row("a")]); h.reader.dispose(); assert(h.pending[0].signal.aborted);
  h.pending[0].resolve({ ...row("a"), executionBatch: { id: "b", chunks: [] } as unknown as CampaignItem["executionBatch"] }); await settle(); assert.equal(h.changes(), 0);
  const n = harness(); n.reader.update([row("a")]); n.pending[0].resolve({ ...row("a"), clientId: "other" }); await settle(); assert.equal(n.changes(), 0); assert.equal(n.pending.length, 1);
});
test("older list response cannot replace newer detail or version", async () => {
  const h = harness(); h.reader.update([row("a")]); const batch = { id: "new", chunks: [] } as unknown as CampaignItem["executionBatch"];
  h.reader.remember({ ...row("a"), executionBatch: batch }); h.pending[0].resolve(row("a")); await settle();
  assert.equal(h.reader.merge([row("a")])[0].executionBatch, batch);
});
