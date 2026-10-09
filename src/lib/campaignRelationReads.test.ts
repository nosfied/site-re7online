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

test("supplementary and demand reads share two slots, cancelled HTTP retains its slot", async () => {
  const h = harness(); h.reader.update([row("a"), row("b")]);
  const controller = new AbortController();
  const demand = h.reader.readDetail("lot", controller.signal);
  assert.equal(h.pending.length, 2);
  h.pending[0].resolve(row("a")); await settle();
  assert.equal(h.pending[2].id, "lot");
  const refused = assert.rejects(demand, { name: "AbortError" }); controller.abort(); await refused;
  const next = h.reader.readDetail("next");
  assert.equal(h.pending.length, 3, "abort cannot create a third actual HTTP read");
  h.pending[2].resolve(row("lot")); await settle();
  assert.equal(h.pending[3].id, "next");
  h.pending[1].resolve(row("b")); h.pending[3].resolve(row("next"));
  assert.equal((await next).id, "next"); h.reader.dispose();
});
test("cancel queued detail before submission; wrong tenant and ID reject", async () => {
  const h = harness();
  const a = h.reader.readDetail("a"), b = h.reader.readDetail("b");
  const controller = new AbortController();
  const queued = h.reader.readDetail("never", controller.signal);
  const cancelled = assert.rejects(queued, { name: "AbortError" }); controller.abort(); await cancelled;
  const wrongTenant = assert.rejects(a, /Identidade/), wrongId = assert.rejects(b, /Identidade/);
  h.pending[0].resolve({ ...row("a"), clientId: "other" }); h.pending[1].resolve(row("wrong"));
  await Promise.all([wrongTenant, wrongId]); await settle();
  assert.equal(h.pending.length, 2); h.reader.dispose();
});
test("disposal rejects active and queued demand and cannot expose stale cached detail", async () => {
  const h = harness(); const a = h.reader.readDetail("a"), b = h.reader.readDetail("b"), c = h.reader.readDetail("c");
  const refusals = [a, b, c].map(value => assert.rejects(value, { name: "AbortError" }));
  h.reader.remember({ ...row("cached"), executionBatch: null });
  assert.equal(h.reader.peekDetail("cached")?.id, "cached");
  h.reader.dispose(); await Promise.all(refusals); assert.equal(h.reader.peekDetail("cached"), null);
  for (const request of h.pending) request.resolve(row(request.id)); await settle();
  assert.equal(h.pending.length, 2);
});
test("cached demand detail is invalidated by list version without losing explicit relationship", () => {
  const h = harness(); const item = { ...row("cached"), executionBatch: null };
  h.reader.remember(item); assert.equal(h.reader.peekDetail("cached"), item);
  h.reader.update([row("cached", "2")]); assert.equal(h.reader.peekDetail("cached"), null);
  assert.equal(h.reader.detailVersion("cached"), "2|completed");
  assert.equal(h.reader.detailVersion("unknown"), null);
  h.reader.dispose();
});
