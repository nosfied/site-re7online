import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireDedicatedPgAdvisoryLock,
  buildWebSessionAdvisoryLockKey,
  buildWebSessionLockHash,
  withDedicatedPgAdvisoryLock,
} from "./dedicatedPgAdvisoryLock.js";

function makeClient(options: { acquire?: boolean } = {}) {
  const state = {
    connected: false,
    ended: false,
    queries: [] as Array<{ query: string; values?: unknown[] }>,
  };
  const client = {
    state,
    async connect() {
      state.connected = true;
    },
    async query(query: string, values?: unknown[]) {
      state.queries.push({ query, values });
      if (query.includes("pg_backend_pid")) return { rows: [{ pid: 12345 }] };
      if (query.includes("pg_try_advisory_lock")) return { rows: [{ acquired: options.acquire ?? true }] };
      if (query.includes("pg_advisory_unlock")) return { rows: [{ released: true }] };
      return { rows: [] };
    },
    async end() {
      state.ended = true;
    },
  };
  return client;
}

test("dedicated pg advisory lock uses stable hashed key", () => {
  assert.equal(buildWebSessionAdvisoryLockKey("account:a"), buildWebSessionAdvisoryLockKey("account:a"));
  assert.notEqual(buildWebSessionAdvisoryLockKey("account:a"), buildWebSessionAdvisoryLockKey("account:b"));
  assert.match(buildWebSessionLockHash("identity:normalized-a"), /^[a-f0-9]{64}$/);
});

test("dedicated pg advisory lock releases on the same client connection", async () => {
  const client = makeClient({ acquire: true });
  const lock = await acquireDedicatedPgAdvisoryLock({
    scope: "web-session-account:account-a",
    clientFactory: () => client,
  });

  assert.equal(lock.acquired, true);
  assert.equal(lock.backendPid, 12345);
  assert.equal(client.state.connected, true);
  assert.equal(client.state.ended, false);
  assert.equal(client.state.queries.some((item) => item.query.includes("pg_try_advisory_lock")), true);

  assert.equal(await lock.release(), true);
  assert.equal(client.state.ended, true);
  assert.equal(client.state.queries.some((item) => item.query.includes("pg_advisory_unlock")), true);
});

test("dedicated pg advisory lock closes blocked client without release query", async () => {
  const client = makeClient({ acquire: false });
  const lock = await acquireDedicatedPgAdvisoryLock({
    scope: "web-session-account:account-a",
    clientFactory: () => client,
  });

  assert.equal(lock.acquired, false);
  assert.equal(client.state.ended, true);
  assert.equal(await lock.release(), false);
  assert.equal(client.state.queries.some((item) => item.query.includes("pg_advisory_unlock")), false);
});

test("dedicated pg advisory lock helper releases after callback", async () => {
  const client = makeClient({ acquire: true });
  const result = await withDedicatedPgAdvisoryLock({
    scope: "web-session-identity:hashed",
    clientFactory: () => client,
    run: async () => "ok",
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "ok");
  assert.equal(client.state.ended, true);
  assert.equal(client.state.queries.some((item) => item.query.includes("pg_advisory_unlock")), true);
});
