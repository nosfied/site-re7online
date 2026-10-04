import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { hybridConversationIdentityLockKey, withHybridConversationIdentityLock } from "./hybridConversationIdentityLock.js";

const modern = "5541923456799";
const legacy = "554123456799";
const clientId = "synthetic-lock-tenant";
const node = process.env.RE7_NODE20_BIN ?? process.execPath;
const apiChild = new URL("./hybridConversationIdentityConcurrent.child.js", import.meta.url).pathname;
const workerChild = process.env.RE7_WORKER_MIN_CHILD ?? apiChild;
const dbUrl = process.env.DATABASE_URL ?? "";
const oneConnectionUrl = `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}connection_limit=1`;

function startChild(script: string, waId: string, mode: "lock_hold" | "lock_probe") {
  const child = spawn(node, [script, JSON.stringify({
    clientId, clientKey: clientId, waId, provider: "meta", channelAccountId: "synthetic", messageId: "synthetic", mode,
  })], { env: { ...process.env, DATABASE_URL: oneConnectionUrl }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const until = (value: string, timeoutMs = 5000) => new Promise<void>((resolve, reject) => {
    if (stdout.includes(value)) return resolve();
    const timeout = setTimeout(() => { child.stdout.off("data", observe); reject(new Error(`missing_${value}:${stderr}`)); }, timeoutMs);
    const observe = () => {
      if (!stdout.includes(value)) return;
      clearTimeout(timeout);
      child.stdout.off("data", observe);
      resolve();
    };
    child.stdout.on("data", observe);
  });
  const done = new Promise<void>((resolve, reject) => child.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`child_exit_${code}:${stderr}`))));
  return { child, until, done, output: () => stdout };
}

test("approved 12/13 aliases share a transaction lock across API and worker processes in both directions", async (t) => {
  assert.equal(hybridConversationIdentityLockKey({ clientId, waId: modern }),
    hybridConversationIdentityLockKey({ clientId, waId: legacy }));
  assert.notEqual(hybridConversationIdentityLockKey({ clientId: "other", waId: modern }),
    hybridConversationIdentityLockKey({ clientId, waId: legacy }));
  for (const [holderScript, contenderScript] of [[apiChild, workerChild], [workerChild, apiChild]]) {
    for (const [held, waiting] of [[modern, legacy], [legacy, modern]]) {
      const holder = startChild(holderScript, held, "lock_hold");
      t.after(() => { if (holder.child.exitCode === null) holder.child.kill(); });
      await holder.until("ready\n");
      holder.child.stdin.write("go\n");
      await holder.until("acquired\n");
      const contender = startChild(contenderScript, waiting, "lock_probe");
      t.after(() => { if (contender.child.exitCode === null) contender.child.kill(); });
      await contender.until("ready\n");
      contender.child.stdin.write("go\n");
      // The PostgreSQL blocker is observable, not inferred from a fixed wait.
      const observer = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
          const rows = await observer.$queryRawUnsafe<Array<{ blocked: boolean }>>(`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity a
              WHERE a.wait_event_type = 'Lock' AND a.query LIKE '%pg_advisory_xact_lock%'
            ) AS blocked`);
          blocked = rows[0]?.blocked === true;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(blocked, true, "contender must wait on the advisory lock");
        assert.equal(contender.output().includes("acquired\n"), false);
      } finally {
        await observer.$disconnect();
      }
      holder.child.stdin.write("release\n");
      await Promise.all([holder.done, contender.done]);
      assert.ok(contender.output().includes("acquired\n"));
    }
  }
});

test("single-connection pool does not self-deadlock; contention and callback timeout fail without late writes", async () => {
  const db = new PrismaClient({ datasources: { db: { url: oneConnectionUrl } } });
  const other = new PrismaClient({ datasources: { db: { url: oneConnectionUrl } } });
  const timedDb = new PrismaClient({ datasources: { db: { url: oneConnectionUrl } } });
  const marker = `probe-${Date.now()}-${process.pid}`;
  await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS _re7_hybrid_lock_probe (marker text PRIMARY KEY)");
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: () => void;
  const entered = new Promise<void>((resolve) => { acquired = resolve; });
  try {
    const owner = withHybridConversationIdentityLock(db, { clientId, waId: modern }, async (tx) => {
      acquired();
      await held;
      await tx.$queryRawUnsafe("SELECT 1");
    }, { timeoutMs: 10000 });
    await entered;
    let lateEntered = false;
    await assert.rejects(withHybridConversationIdentityLock(other, { clientId, waId: legacy }, async (tx) => {
      lateEntered = true;
      await tx.$executeRawUnsafe("INSERT INTO _re7_hybrid_lock_probe(marker) VALUES ($1)", marker);
    }, { maxWaitMs: 250, timeoutMs: 1000 }));
    assert.equal(lateEntered, false);
    const excess = await Promise.allSettled([1, 2, 3].map(() =>
      withHybridConversationIdentityLock(db, { clientId, waId: legacy }, async () => {
        lateEntered = true;
      }, { maxWaitMs: 250, timeoutMs: 1000 })));
    assert.ok(excess.every((result) => result.status === "rejected"));
    assert.equal(lateEntered, false);
    release();
    await owner;
    await withHybridConversationIdentityLock(other, { clientId, waId: legacy }, async (tx) => {
      await tx.$queryRawUnsafe("SELECT 1");
    }, { maxWaitMs: 1000 });
    let unblock!: () => void;
    const pending = new Promise<void>((resolve) => { unblock = resolve; });
    let callbackEntered!: () => void;
    const callbackReady = new Promise<void>((resolve) => { callbackEntered = resolve; });
    let callbackAttempted!: () => void;
    const attempted = new Promise<void>((resolve) => { callbackAttempted = resolve; });
    const timed = withHybridConversationIdentityLock(timedDb, { clientId, waId: modern }, async (tx) => {
      callbackEntered();
      await pending;
      try {
        await tx.$executeRawUnsafe("INSERT INTO _re7_hybrid_lock_probe(marker) VALUES ($1)", marker);
      } finally {
        callbackAttempted();
      }
    }, { timeoutMs: 250 });
    await callbackReady;
    const releaseAfterExpiry = setTimeout(unblock, 350);
    await assert.rejects(timed);
    clearTimeout(releaseAfterExpiry);
    unblock();
    await attempted;
    const rows = await other.$queryRawUnsafe<Array<{ count: bigint }>>(
      "SELECT count(*) AS count FROM _re7_hybrid_lock_probe WHERE marker = $1", marker);
    assert.equal(rows[0]?.count, 0n);
  } finally {
    release?.();
    await db.$disconnect();
    await other.$disconnect();
    await timedDb.$disconnect();
  }
});
