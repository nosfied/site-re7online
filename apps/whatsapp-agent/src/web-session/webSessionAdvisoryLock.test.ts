import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireWebSessionAdvisoryLock,
  releaseWebSessionAdvisoryLock,
  webSessionAdvisoryLockKey,
} from "./webSessionAdvisoryLock.js";

function makePrisma(results: boolean[]) {
  const calls: unknown[] = [];
  return {
    calls,
    $queryRaw: async (query: unknown) => {
      calls.push(query);
      const result = results.shift() ?? false;
      return calls.length % 2 === 1 ? [{ acquired: result }] : [{ released: result }];
    },
  };
}

test("web session advisory lock derives stable independent keys", () => {
  assert.equal(webSessionAdvisoryLockKey("account-a"), webSessionAdvisoryLockKey("account-a"));
  assert.notEqual(webSessionAdvisoryLockKey("account-a"), webSessionAdvisoryLockKey("account-b"));
});

test("web session advisory lock acquire and release", async () => {
  const prisma = makePrisma([true, true]);
  const lock = await acquireWebSessionAdvisoryLock({ prisma: prisma as never, accountId: "account-a" });
  assert.equal(lock.acquired, true);
  assert.equal(await lock.release(), true);
  assert.equal(prisma.calls.length, 2);
});

test("web session advisory lock reports double acquire as blocked", async () => {
  const prisma = makePrisma([true, false]);
  const first = await acquireWebSessionAdvisoryLock({ prisma: prisma as never, accountId: "account-a" });
  const second = await acquireWebSessionAdvisoryLock({ prisma: prisma as never, accountId: "account-a" });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(await second.release(), false);
});

test("web session advisory lock direct release uses same key path", async () => {
  const prisma = makePrisma([true]);
  assert.equal(await releaseWebSessionAdvisoryLock({ prisma: prisma as never, accountId: "account-a" }), true);
});
