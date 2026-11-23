import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getInboxReadState,
  markInboxConversationRead,
  resolveInboxReadStateRoot,
} from "./readStateStore.js";

test("rollback-compatible storage requires an external production root", () => {
  assert.throws(
    () => resolveInboxReadStateRoot({ cwd: "/opt/re7online/releases/cb/api-runtime", nodeEnv: "production" }),
    /inbox_read_state_root_required/
  );
  assert.throws(
    () => resolveInboxReadStateRoot({ cwd: "/opt/re7online/releases/cb/api-runtime", nodeEnv: "production", configuredRoot: ".data/app-read-state" }),
    /inbox_read_state_root_absolute/
  );
  assert.throws(
    () => resolveInboxReadStateRoot({ cwd: "/opt/re7online/releases/cb/api-runtime", nodeEnv: "production", configuredRoot: "/opt/re7online/releases/cb/api-runtime/.data/app-read-state" }),
    /inbox_read_state_root_release_local/
  );
});

test("CB behavior persists through a release restart using the authenticated external root", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "cb-read-state-rollback-"));
  const root = path.join(base, "runtime-data", "inbox-read-state");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.chmod(root, 0o700);
  const oldNodeEnv = process.env.NODE_ENV;
  const oldRoot = process.env.INBOX_READ_STATE_ROOT;
  process.env.NODE_ENV = "production";
  process.env.INBOX_READ_STATE_ROOT = root;
  try {
    await markInboxConversationRead({
      clientId: "tenant-a", userId: "owner", conversationKey: "conversation-a",
      activityAt: "2026-11-23T10:00:00.000Z", scope: { type: "shared" },
    });
    const stored = path.join(root, "tenant-a", "shared.json");
    assert.equal((await fs.stat(path.dirname(stored))).mode & 0o777, 0o700);
    assert.equal((await fs.stat(stored)).mode & 0o777, 0o600);
    assert.equal((await getInboxReadState("tenant-a", "owner")).lastReadAtByConversationKey["conversation-a"], "2026-11-23T10:00:00.000Z");
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldRoot === undefined) delete process.env.INBOX_READ_STATE_ROOT; else process.env.INBOX_READ_STATE_ROOT = oldRoot;
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("production denies a missing root instead of silently creating authority", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "cb-read-state-missing-"));
  const oldNodeEnv = process.env.NODE_ENV;
  const oldRoot = process.env.INBOX_READ_STATE_ROOT;
  process.env.NODE_ENV = "production";
  process.env.INBOX_READ_STATE_ROOT = path.join(base, "not-provisioned");
  try {
    await assert.rejects(() => getInboxReadState("tenant-a", "owner"), /ENOENT/);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldRoot === undefined) delete process.env.INBOX_READ_STATE_ROOT; else process.env.INBOX_READ_STATE_ROOT = oldRoot;
    await fs.rm(base, { recursive: true, force: true });
  }
});
