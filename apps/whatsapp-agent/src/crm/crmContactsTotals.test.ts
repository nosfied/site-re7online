import assert from "node:assert/strict";
import test from "node:test";
import { resolveCrmContactsTotals, type CrmContactsPayload } from "./crmContactsReadModel.js";

function payload(total: number, pageCount = Math.min(50, total)): CrmContactsPayload {
  return {
    ok: true,
    filters: { q: null, status: null, channel: null, hasConversation: null, optOut: null, operationalStatus: "active", updatedFrom: null, updatedTo: null },
    pagination: { page: 1, limit: 50, total, totalPages: Math.ceil(total / 50), hasNextPage: total > 50, hasPreviousPage: false },
    pageInfo: { nextCursor: total > 50 ? "opaque" : null, hasNextPage: total > 50, hasPreviousPage: false, limit: 50 },
    items: Array.from({ length: pageCount }, (_, index) => ({ leadId: `lead-${index}` })) as CrmContactsPayload["items"],
    generatedAt: "2026-10-19T00:00:00.000Z",
  };
}

test("more than 500 active contacts reuse filtered scope and skip excluded full scan when none exist", async () => {
  const scopes: string[] = [];
  let exclusionProbes = 0;
  const totals = await resolveCrmContactsTotals({
    filtered: payload(650),
    effectiveQuery: { page: 1, limit: 50, operationalStatus: "active" },
    isAdmin: true,
    hasExcluded: async () => { exclusionProbes += 1; return false; },
    countScope: async (scope) => { scopes.push(scope); return 999; },
  });
  assert.deepEqual(totals, { tenantVisible: 650, filtered: 650, pageCount: 50 });
  assert.equal(exclusionProbes, 1);
  assert.deepEqual(scopes, []);
});

test("excluded contacts remain part of permitted total without changing filtered or page totals", async () => {
  const scopes: string[] = [];
  const totals = await resolveCrmContactsTotals({
    filtered: payload(650),
    effectiveQuery: { operationalStatus: "active" },
    isAdmin: true,
    hasExcluded: async () => true,
    countScope: async (scope) => { scopes.push(scope); return scope === "excluded" ? 3 : 650; },
  });
  assert.deepEqual(totals, { tenantVisible: 653, filtered: 650, pageCount: 50 });
  assert.deepEqual(scopes, ["excluded"]);
});

test("a narrowed filter rebuilds active scope while preserving its own filtered total", async () => {
  const scopes: string[] = [];
  const totals = await resolveCrmContactsTotals({
    filtered: payload(7, 7),
    effectiveQuery: { q: "Ana", operationalStatus: "active" },
    isAdmin: false,
    hasExcluded: async () => { throw new Error("non-admin must not probe exclusions"); },
    countScope: async (scope) => { scopes.push(scope); return 650; },
  });
  assert.deepEqual(totals, { tenantVisible: 650, filtered: 7, pageCount: 7 });
  assert.deepEqual(scopes, ["active"]);
});
