import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inboxReadStateLockPath } from "./readStateFileLock.js";
import { reconcileInboxReadStateRequest } from "./readStateReconciliation.js";

const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
async function rootAuthority(root: string) { const info = await fs.lstat(root); return { path: root, device: info.dev, inode: info.ino, ownerUid: info.uid, groupGid: info.gid, mode: "0700" as const }; }
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-reconciliation-"));
  const persistent = path.join(root, "persistent"); const custody = path.join(root, "custody"); const sourceRoot = path.join(root, "sources");
  await Promise.all([persistent, custody, sourceRoot].map((item) => fs.mkdir(item, { recursive: true, mode: 0o700 })));
  const source = path.join(sourceRoot, "source.json"); const sourceRaw = JSON.stringify({ lastReadAtByConversationKey: { alias: "2026-11-20T10:00:00.000Z", erased: "2026-11-18T10:00:00.000Z" }, manuallyUnreadByConversationKey: { alias: true } });
  await fs.writeFile(source, sourceRaw, { mode: 0o600 });
  const authorityPath = path.join(custody, "anonymized.json"); const authorityRaw = JSON.stringify({ schemaVersion: 1, kind: "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", tenantId: "tenant-a", conversationKeys: ["erased"] });
  await fs.writeFile(authorityPath, authorityRaw, { mode: 0o600 });
  const operation = path.join(custody, "operation"); await fs.mkdir(operation, { mode: 0o700 });
  const destination = path.join(persistent, "tenant-a", "shared.json");
  const request = { schemaVersion: 2, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V2", operationId: "tenant-a-shared-v2", tenantId: "tenant-a", scope: { type: "shared" }, persistentRoot: await rootAuthority(persistent), custodyRoot: await rootAuthority(custody), sourceRoots: [await rootAuthority(sourceRoot)], sources: [{ path: source, sha256: hash(sourceRaw) }], destination: { path: destination, expectedExistingSha256: null }, anonymizationAuthority: { path: authorityPath, sha256: hash(authorityRaw) }, journalPath: path.join(operation, "journal.jsonl"), receiptPath: path.join(operation, "receipt.json") };
  const requestPath = path.join(custody, "request.json"); const raw = JSON.stringify(request); await fs.writeFile(requestPath, raw, { mode: 0o600 });
  return { root, request, requestPath, raw, destination };
}

test("reconciliation is closed, excludes authenticated anonymized keys and replays by readback", async () => {
  const f = await fixture();
  assert.equal((await reconcileInboxReadStateRequest(f.requestPath, hash(f.raw))).state, "VERIFIED");
  assert.equal((await reconcileInboxReadStateRequest(f.requestPath, hash(f.raw))).state, "REPLAY_VERIFIED");
  const state = JSON.parse(await fs.readFile(f.destination, "utf8")); assert.equal(state.lastReadAtByConversationKey.alias, "2026-11-20T10:00:00.000Z"); assert.equal(state.lastReadAtByConversationKey.erased, undefined);
  const events = (await fs.readFile(f.request.journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line)); assert.deepEqual(events.map((event) => event.state), ["ATTEMPT", "VERIFIED"]);
  await fs.writeFile(f.destination, "{}", { mode: 0o600 }); await assert.rejects(reconcileInboxReadStateRequest(f.requestPath, hash(f.raw)), /receipt_destination_drift/);
  await fs.rm(f.root, { recursive: true, force: true });
});

for (const point of ["after_attempt", "after_destination", "after_verified"] as const) {
  test(`interruption ${point} resumes without a second destination mutation`, async () => {
    const f = await fixture(); let stopped = false;
    await assert.rejects(reconcileInboxReadStateRequest(f.requestPath, hash(f.raw), (current) => { if (current === point && !stopped) { stopped = true; throw new Error(`stop_${point}`); } }), new RegExp(`stop_${point}`));
    const firstIdentity = await fs.lstat(f.destination).catch(() => null);
    assert.equal((await reconcileInboxReadStateRequest(f.requestPath, hash(f.raw))).state, "VERIFIED");
    if (firstIdentity) assert.equal((await fs.lstat(f.destination)).ino, firstIdentity.ino);
    await fs.rm(f.root, { recursive: true, force: true });
  });
}

test("a pre-rename interruption resumes only from the byte-exact operation temporary", async () => {
  const resumed = await fixture();
  const payload = `${JSON.stringify({ lastReadAtByConversationKey: { alias: "2026-11-20T10:00:00.000Z" }, manuallyUnreadByConversationKey: { alias: true } }, null, 2)}\n`;
  const resumedTemporary = `${resumed.destination}.${resumed.request.operationId}.tmp`;
  await fs.mkdir(path.dirname(resumedTemporary), { recursive: true, mode: 0o700 });
  await fs.writeFile(resumedTemporary, payload, { mode: 0o600, flag: "wx" });
  assert.equal((await reconcileInboxReadStateRequest(resumed.requestPath, hash(resumed.raw))).state, "VERIFIED");
  assert.equal(await fs.readFile(resumed.destination, "utf8"), payload);
  await assert.rejects(fs.lstat(resumedTemporary), { code: "ENOENT" });
  await fs.rm(resumed.root, { recursive: true, force: true });

  const divergent = await fixture();
  const divergentTemporary = `${divergent.destination}.${divergent.request.operationId}.tmp`;
  await fs.mkdir(path.dirname(divergentTemporary), { recursive: true, mode: 0o700 });
  await fs.writeFile(divergentTemporary, "divergent\n", { mode: 0o600, flag: "wx" });
  await assert.rejects(reconcileInboxReadStateRequest(divergent.requestPath, hash(divergent.raw)), /read_state_durable_temporary_conflict/);
  assert.equal(await fs.readFile(divergentTemporary, "utf8"), "divergent\n");
  await assert.rejects(fs.lstat(divergent.destination), { code: "ENOENT" });
  await fs.rm(divergent.root, { recursive: true, force: true });
});

test("active writer lock, path substitution and unauthenticated anonymization are denied", async () => {
  const f = await fixture(); await fs.mkdir(path.dirname(f.destination), { recursive: true, mode: 0o700 }); await fs.mkdir(inboxReadStateLockPath(f.destination), { mode: 0o700 });
  await assert.rejects(reconcileInboxReadStateRequest(f.requestPath, hash(f.raw)), /reconciliation_concurrent_operation/); await fs.rmdir(inboxReadStateLockPath(f.destination));
  const outside = { ...f.request, destination: { ...f.request.destination, path: path.join(f.root, "tenant-a", "shared.json") } }; const raw = JSON.stringify(outside); await fs.writeFile(f.requestPath, raw, { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateRequest(f.requestPath, hash(raw)), /destination_boundary/);
  await fs.rm(f.root, { recursive: true, force: true });
});
