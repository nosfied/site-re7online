import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reconcileInboxReadStateRequest } from "./readStateReconciliation.js";

const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

test("reconciliation is tenant-bound, deterministic, excludes anonymized keys and is replay safe", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-reconciliation-"));
  const sourceA = path.join(root, "source-a.json");
  const sourceB = path.join(root, "source-b.json");
  const destination = path.join(root, "durable", "tenant-a", "shared.json");
  const journal = path.join(root, "custody", "journal.json");
  const receipt = path.join(root, "custody", "receipt.json");
  const a = JSON.stringify({ lastReadAtByConversationKey: { alias: "2026-11-18T10:00:00.000Z", erased: "2026-11-18T10:00:00.000Z" }, manuallyUnreadByConversationKey: {} });
  const b = JSON.stringify({ lastReadAtByConversationKey: { alias: "2026-11-20T10:00:00.000Z" }, manuallyUnreadByConversationKey: { alias: true } });
  await fs.writeFile(sourceA, a, { mode: 0o600 });
  await fs.writeFile(sourceB, b, { mode: 0o600 });
  const request = {
    schemaVersion: 1,
    kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V1",
    operationId: "tenant-a-shared-v1",
    tenantId: "tenant-a",
    scope: { type: "shared" },
    sources: [{ path: sourceA, sha256: hash(a) }, { path: sourceB, sha256: hash(b) }],
    destination: { path: destination, expectedExistingSha256: null },
    excludedConversationKeys: ["erased"],
    lockPath: path.join(root, "custody", "reconciliation.lock"),
    journalPath: journal,
    receiptPath: receipt,
  };
  const requestPath = path.join(root, "request.json");
  const requestRaw = JSON.stringify(request);
  await fs.writeFile(requestPath, requestRaw, { mode: 0o600 });
  assert.equal((await reconcileInboxReadStateRequest(requestPath, hash(requestRaw))).state, "VERIFIED");
  assert.equal((await reconcileInboxReadStateRequest(requestPath, hash(requestRaw))).state, "REPLAY_VERIFIED");
  const result = JSON.parse(await fs.readFile(destination, "utf8"));
  assert.equal(result.lastReadAtByConversationKey.alias, "2026-11-20T10:00:00.000Z");
  assert.equal(result.manuallyUnreadByConversationKey.alias, true);
  assert.equal(result.lastReadAtByConversationKey.erased, undefined);
  assert.equal(JSON.parse(await fs.readFile(journal, "utf8")).state, "VERIFIED");
  await fs.rm(root, { recursive: true, force: true });
});

test("reconciliation denies ambiguous manual unread and changed destination", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-reconciliation-deny-"));
  const source = path.join(root, "source.json");
  const sourceRaw = JSON.stringify({ lastReadAtByConversationKey: {}, manuallyUnreadByConversationKey: { alias: true } });
  await fs.writeFile(source, sourceRaw, { mode: 0o600 });
  const destination = path.join(root, "tenant-a", "destination.json");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, "changed", { mode: 0o600 });
  const request = {
    schemaVersion: 1, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V1", operationId: "deny-v1", tenantId: "tenant-a",
    scope: { type: "shared" }, sources: [{ path: source, sha256: hash(sourceRaw) }],
    destination: { path: destination, expectedExistingSha256: null }, excludedConversationKeys: [],
    lockPath: path.join(root, "reconciliation.lock"),
    journalPath: path.join(root, "journal.json"), receiptPath: path.join(root, "receipt.json"),
  };
  const requestPath = path.join(root, "request.json");
  const raw = JSON.stringify(request);
  await fs.writeFile(requestPath, raw, { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateRequest(requestPath, hash(raw)), /reconciliation_destination_changed/);
  await fs.rm(root, { recursive: true, force: true });
});
