import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inboxReadStateLockPath, withInboxReadStateWriteLock } from "./readStateFileLock.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-lock-"));
  return { root, target: path.join(root, "tenant", "shared.json") };
}

test("an authenticated active writer excludes a concurrent writer", async () => {
  const f = await fixture();
  let release!: () => void;
  const held = withInboxReadStateWriteLock(f.target, async () => new Promise<void>((resolve) => { release = resolve; }));
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(withInboxReadStateWriteLock(f.target, async () => undefined), /inbox_read_state_write_conflict/);
  release();
  await held;
  await assert.rejects(fs.lstat(inboxReadStateLockPath(f.target)), { code: "ENOENT" });
  await fs.rm(f.root, { recursive: true, force: true });
});

test("a SIGKILL orphan is authenticated and recovered before the next writer", async () => {
  const f = await fixture();
  const moduleUrl = new URL("./readStateFileLock.ts", import.meta.url).href;
  const childScript = `import { withInboxReadStateWriteLock } from ${JSON.stringify(moduleUrl)}; await withInboxReadStateWriteLock(${JSON.stringify(f.target)}, async () => { process.stdout.write("LOCKED\\n"); await new Promise(() => {}); });`;
  const child = spawn(process.execPath, [...process.execArgv, "--input-type=module", "-e", childScript], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("LOCKED\n")) resolve(); });
    child.stderr.on("data", (chunk) => { errors += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => { if (!output.includes("LOCKED\n")) reject(new Error(`lock child exited before acquisition: ${code}: ${errors}`)); });
  });
  assert.equal(child.kill("SIGKILL"), true);
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  assert.equal(await withInboxReadStateWriteLock(f.target, async () => "recovered"), "recovered");
  await assert.rejects(fs.lstat(inboxReadStateLockPath(f.target)), { code: "ENOENT" });
  await fs.rm(f.root, { recursive: true, force: true });
});

test("unknown preexisting lock authority is denied and never removed", async () => {
  const f = await fixture();
  const lockPath = inboxReadStateLockPath(f.target);
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(lockPath, "{}\n", { mode: 0o600 });
  const before = await fs.lstat(lockPath);
  await assert.rejects(withInboxReadStateWriteLock(f.target, async () => undefined), /inbox_read_state_write_conflict/);
  const after = await fs.lstat(lockPath);
  assert.equal(after.ino, before.ino);
  assert.equal(await fs.readFile(lockPath, "utf8"), "{}\n");
  await fs.rm(f.root, { recursive: true, force: true });
});
