import assert from "node:assert/strict";
import test from "node:test";
import { InboxConversationQueryRegistry } from "./inboxConversationSearch";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("A -> AB -> empty starts every distinct query and only publishes the current one", async () => {
  const registry = new InboxConversationQueryRegistry();
  const requests = new Map(["A", "AB", ""].map((key) => [key, deferred()]));
  const started: string[] = [];
  const published: string[] = [];
  const run = (key: string) => {
    registry.setCurrentKey(key);
    return registry.run(key, async () => {
      started.push(key);
      await requests.get(key)!.promise;
      if (registry.isCurrent(key)) published.push(key);
    });
  };

  const a = run("A");
  const ab = run("AB");
  const empty = run("");
  assert.deepEqual(started, ["A", "AB", ""]);

  requests.get("AB")!.resolve();
  requests.get("A")!.resolve();
  await Promise.all([a, ab]);
  assert.deepEqual(published, []);

  requests.get("")!.resolve();
  await empty;
  assert.deepEqual(published, [""]);
});

test("concurrent refreshes coalesce only when the complete query key matches", async () => {
  const registry = new InboxConversationQueryRegistry();
  const pending = deferred();
  let calls = 0;
  registry.setCurrentKey("same");
  const first = registry.run("same", async () => { calls += 1; await pending.promise; });
  const second = registry.run("same", async () => { calls += 1; });
  assert.equal(first, second);
  assert.equal(calls, 1);
  pending.resolve();
  await first;
});

test("a failed query is released and can recover without blocking a newer filter or cursor", async () => {
  const registry = new InboxConversationQueryRegistry();
  registry.setCurrentKey("search=ana&cursor=first");
  await assert.rejects(
    registry.run("search=ana&cursor=first", async () => { throw new Error("network"); }),
    /network/
  );
  registry.setCurrentKey("search=ana&cursor=second");
  let recovered = false;
  await registry.run("search=ana&cursor=second", async () => { recovered = true; });
  assert.equal(recovered, true);
});

test("a realtime refresh can run again after the current query settles", async () => {
  const registry = new InboxConversationQueryRegistry();
  registry.setCurrentKey("search=&status=WAITING");
  let calls = 0;
  await registry.run("search=&status=WAITING", async () => { calls += 1; });
  await registry.run("search=&status=WAITING", async () => { calls += 1; });
  assert.equal(calls, 2);
});

test("identical filters from different authenticated sessions never coalesce or cross-publish", async () => {
  const registry = new InboxConversationQueryRegistry();
  const first = deferred();
  const second = deferred();
  const published: string[] = [];
  const firstKey = "tenant-a:user-a:token-a:search=ana";
  const secondKey = "tenant-b:user-b:token-b:search=ana";

  registry.setCurrentKey(firstKey);
  const firstRun = registry.run(firstKey, async () => {
    await first.promise;
    if (registry.isCurrent(firstKey)) published.push("first");
  });
  registry.setCurrentKey(secondKey);
  const secondRun = registry.run(secondKey, async () => {
    await second.promise;
    if (registry.isCurrent(secondKey)) published.push("second");
  });

  first.resolve();
  await firstRun;
  assert.deepEqual(published, []);
  second.resolve();
  await secondRun;
  assert.deepEqual(published, ["second"]);
});

test("clearing after positive and empty results restores the active-filter base list", async () => {
  const registry = new InboxConversationQueryRegistry();
  let rows = ["base-a", "base-b"];
  const publish = async (key: string, next: string[]) => {
    registry.setCurrentKey(key);
    await registry.run(key, async () => {
      if (registry.isCurrent(key)) rows = next;
    });
  };
  await publish("search=ana&status=WAITING", ["ana"]);
  assert.deepEqual(rows, ["ana"]);
  await publish("search=&status=WAITING", ["base-a", "base-b"]);
  assert.deepEqual(rows, ["base-a", "base-b"]);
  await publish("search=missing&status=WAITING", []);
  assert.deepEqual(rows, []);
  await publish("search=&status=WAITING", ["base-a", "base-b"]);
  assert.deepEqual(rows, ["base-a", "base-b"]);
});

