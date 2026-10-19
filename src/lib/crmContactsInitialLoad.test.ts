import assert from "node:assert/strict";
import test from "node:test";
import { createLatestResponseGuard, startIndependentCrmLoad } from "./crmContactsInitialLoad";
import { fetchAppCrmContacts, type AppSession } from "./appClientApi";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("slow or failed statuses never block the contacts result", async () => {
  const statuses = deferred<string[]>();
  const events: string[] = [];
  startIndependentCrmLoad({
    loadStatuses: () => statuses.promise,
    loadContacts: async () => ({ items: Array.from({ length: 50 }), total: 650 }),
    onStatuses: () => events.push("statuses"),
    onContacts: (value) => events.push(`contacts:${value.total}:${value.items.length}`),
    onStatusesError: () => events.push("statuses-error"),
    onContactsError: () => events.push("contacts-error"),
    onContactsSettled: () => events.push("contacts-settled"),
  });
  await settle();
  assert.deepEqual(events, ["contacts:650:50", "contacts-settled"]);
  statuses.reject(new Error("synthetic statuses failure"));
  await settle();
  assert.deepEqual(events, ["contacts:650:50", "contacts-settled", "statuses-error"]);
});

test("timeout or missing contacts always reaches a recoverable error and settles", async () => {
  for (const loadContacts of [
    async () => { throw Object.assign(new Error("timeout"), { errorCode: "network_timeout" }); },
    async () => undefined,
  ]) {
    const events: string[] = [];
    startIndependentCrmLoad({
      loadStatuses: async () => [],
      loadContacts,
      onStatuses: () => undefined,
      onContacts: () => events.push("contacts"),
      onStatusesError: () => undefined,
      onContactsError: () => events.push("contacts-error"),
      onContactsSettled: () => events.push("contacts-settled"),
    });
    await settle();
    assert.deepEqual(events, ["contacts-error", "contacts-settled"]);
  }
});

test("latest response guard rejects an obsolete contacts response", () => {
  const guard = createLatestResponseGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

test("contacts GET uses an explicit timeout above the backend transaction and never POSTs", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const methods: string[] = [];
  const timeouts: number[] = [];
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    timeouts.push(timeout ?? 0);
    return originalSetTimeout(handler, timeout, ...args);
  }) as typeof setTimeout;
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return new Response(JSON.stringify({ ok: true, items: [], pagination: { page: 1, limit: 50, total: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const session = { baseUrl: "https://synthetic.invalid", token: "synthetic", user: { id: "user", clientId: "tenant", role: "ADMIN" } } as AppSession;
  try {
    await fetchAppCrmContacts(session, { page: 1, limit: 50 });
    assert.deepEqual(methods, ["GET"]);
    assert.ok(timeouts.includes(20_000));
    assert.ok(20_000 > 15_000);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
