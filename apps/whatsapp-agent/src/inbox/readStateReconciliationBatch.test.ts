import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reconcileInboxReadStateManifest } from "./readStateReconciliationBatch.js";

function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)])); return value; }
const canonical = (value: unknown) => `${JSON.stringify(sortValue(value))}\n`;
const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
async function authority(root: string) { const info = await fs.lstat(root); return { path: root, device: info.dev, inode: info.ino, ownerUid: info.uid, groupGid: info.gid, mode: "0700" as const }; }

type FixtureScope = { type: "shared" } | { type: "assigned"; assignedUserId: string };
type FixtureEntry = { requestPath: string; requestSha256: string; tenantId: string; scope: FixtureScope; destinationPath: string; receiptPath: string; sourceAuthorities: Array<{ releaseId: string; sha256: string }>; anonymizationAuthoritySha256: string };

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-batch-")); const persistent = path.join(root, "persistent"), custody = path.join(root, "custody"), sources = path.join(root, "sources");
  await Promise.all([persistent, custody, sources].map((item) => fs.mkdir(item, { recursive: true, mode: 0o700 })));
  const custodyAuthority = await authority(custody), persistentAuthority = await authority(persistent), sourceAuthority = await authority(sources);
  const entries: FixtureEntry[] = [];
  for (const [tenantId, scope] of [["tenant-a", { type: "shared" }], ["tenant-b", { type: "assigned", assignedUserId: "user-b" }]] as const) {
    const source = path.join(sources, `${tenantId}.json`), sourceRaw = JSON.stringify({ lastReadAtByConversationKey: { alias: "2026-11-20T10:00:00.000Z", erased: "2026-11-18T10:00:00.000Z" }, manuallyUnreadByConversationKey: {} }); await fs.writeFile(source, sourceRaw, { mode: 0o600 });
    const privacy = path.join(custody, `${tenantId}-privacy.json`), privacyRaw = JSON.stringify({ schemaVersion: 1, kind: "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", tenantId, conversationKeys: ["erased"] }); await fs.writeFile(privacy, privacyRaw, { mode: 0o600 });
    const operation = path.join(custody, tenantId); await fs.mkdir(operation, { mode: 0o700 });
    const destination = scope.type === "shared" ? path.join(persistent, tenantId, "shared.json") : path.join(persistent, tenantId, "assigned", `${scope.assignedUserId}.json`);
    const request = { schemaVersion: 2, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V2", operationId: `${tenantId}-operation`, tenantId, scope, persistentRoot: persistentAuthority, custodyRoot: custodyAuthority, sourceRoots: [sourceAuthority], sources: [{ path: source, sha256: hash(sourceRaw) }], destination: { path: destination, expectedExistingSha256: null }, anonymizationAuthority: { path: privacy, sha256: hash(privacyRaw) }, journalPath: path.join(operation, "journal.jsonl"), receiptPath: path.join(operation, "receipt.json") };
    const requestRaw = JSON.stringify(request), requestPath = path.join(operation, "request.json"); await fs.writeFile(requestPath, requestRaw, { mode: 0o600 });
    entries.push({ requestPath, requestSha256: hash(requestRaw), tenantId, scope, destinationPath: destination, receiptPath: request.receiptPath, sourceAuthorities: [{ releaseId: tenantId === "tenant-a" ? "immutable-41d" : "immutable-cb", sha256: hash(sourceRaw) }], anonymizationAuthoritySha256: hash(privacyRaw) });
  }
  const destinations = entries.map(({ tenantId, scope, destinationPath, sourceAuthorities, anonymizationAuthoritySha256 }) => ({ tenantId, scope, destinationPath, sourceAuthorities, anonymizationAuthoritySha256 }));
  const inventory = { schemaVersion: 1, kind: "CONVERTA_INBOX_READ_STATE_AUTHORIZED_DESTINATION_INVENTORY_V1", inventoryId: "41d-cb-authorized", authorizedSourceReleases: ["immutable-41d", "immutable-cb"], destinations };
  const inventoryRaw = canonical(inventory), inventoryPath = path.join(custody, "inventory.json");await fs.writeFile(inventoryPath, inventoryRaw, { mode: 0o600 });
  const manifest = { schemaVersion: 1, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_MANIFEST_V1", operationId: "aggregate-operation", custodyRoot: custodyAuthority, inventoryAuthority: { path: inventoryPath, sha256: hash(inventoryRaw) }, entries, aggregateReceiptPath: path.join(custody, "aggregate", "receipt.json") };
  const manifestRaw = canonical(manifest), manifestPath = path.join(custody, "manifest.json"); await fs.writeFile(manifestPath, manifestRaw, { mode: 0o600 });
  return { root, manifest, manifestPath, manifestRaw, inventory, inventoryPath };
}

test("aggregate manifest proves every tenant/scope receipt and resumes after interruption", async () => {
  const f = await fixture();let interrupted = false;
  await assert.rejects(reconcileInboxReadStateManifest(f.manifestPath, hash(f.manifestRaw), (index) => { if (index === 0 && !interrupted) { interrupted = true; throw new Error("synthetic_interruption"); } }), /synthetic_interruption/);
  const result = await reconcileInboxReadStateManifest(f.manifestPath, hash(f.manifestRaw));assert.equal(result.state, "VERIFIED");assert.equal(result.entryCount, 2);
  assert.equal((await reconcileInboxReadStateManifest(f.manifestPath, hash(f.manifestRaw))).state, "REPLAY_VERIFIED");
  const receipt = JSON.parse(await fs.readFile(f.manifest.aggregateReceiptPath, "utf8"));assert.equal(receipt.entries.length, 2);assert(receipt.entries.every((entry: unknown) => Boolean(entry && typeof entry === "object" && "receiptSha256" in entry && (entry as { receiptSha256?: unknown }).receiptSha256)));
  await fs.rm(f.root, { recursive: true, force: true });
});

test("aggregate manifest denies duplicate tenant/scope and destination authority", async () => {
  const f = await fixture();const duplicate = { ...f.manifest, entries: [f.manifest.entries[0], { ...f.manifest.entries[0], requestPath: f.manifest.entries[1].requestPath, requestSha256: f.manifest.entries[1].requestSha256, receiptPath: f.manifest.entries[1].receiptPath }] };
  const raw = canonical(duplicate);await fs.writeFile(f.manifestPath, raw, { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(f.manifestPath, hash(raw)), /duplicate_authority/);await fs.rm(f.root, { recursive: true, force: true });
});

test("aggregate publication denies preexisting divergent content and authenticates replay readback", async () => {
  const f = await fixture();let published = false;
  await assert.rejects(reconcileInboxReadStateManifest(f.manifestPath, hash(f.manifestRaw), async (index) => { if (index === f.manifest.entries.length - 1 && !published) { published = true;await fs.mkdir(path.dirname(f.manifest.aggregateReceiptPath), { recursive: true, mode: 0o700 });await fs.writeFile(f.manifest.aggregateReceiptPath, canonical({ state: "VERIFIED", forged: true }), { mode: 0o600, flag: "wx" }); } }), /receipt_conflict/);
  await fs.rm(f.root, { recursive: true, force: true });
});

test("aggregate replay denies tampered aggregate and individual receipts", async () => {
  const aggregate = await fixture();await reconcileInboxReadStateManifest(aggregate.manifestPath, hash(aggregate.manifestRaw));
  await fs.writeFile(aggregate.manifest.aggregateReceiptPath, canonical({ state: "VERIFIED", forged: true }), { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(aggregate.manifestPath, hash(aggregate.manifestRaw)), /receipt_conflict/);await fs.rm(aggregate.root, { recursive: true, force: true });
  const individual = await fixture();await reconcileInboxReadStateManifest(individual.manifestPath, hash(individual.manifestRaw));
  await fs.writeFile(individual.manifest.entries[0].receiptPath, canonical({ state: "VERIFIED", forged: true }), { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(individual.manifestPath, hash(individual.manifestRaw)), /(receipt_conflict|individual_receipt_drift)/);await fs.rm(individual.root, { recursive: true, force: true });
});

test("aggregate publication and replay deny destination drift after individual receipts", async () => {
  const beforePublication = await fixture();
  await assert.rejects(reconcileInboxReadStateManifest(beforePublication.manifestPath, hash(beforePublication.manifestRaw), async (index) => {
    if (index === beforePublication.manifest.entries.length - 1) await fs.writeFile(beforePublication.manifest.entries[0].destinationPath, "{}\n", { mode: 0o600 });
  }), /receipt_destination_drift/);
  await assert.rejects(fs.lstat(beforePublication.manifest.aggregateReceiptPath), { code: "ENOENT" });await fs.rm(beforePublication.root, { recursive: true, force: true });

  const replay = await fixture();await reconcileInboxReadStateManifest(replay.manifestPath, hash(replay.manifestRaw));
  await fs.writeFile(replay.manifest.entries[0].destinationPath, "{}\n", { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(replay.manifestPath, hash(replay.manifestRaw)), /receipt_destination_drift/);await fs.rm(replay.root, { recursive: true, force: true });
});

test("approved manifest hash rejects a self-published inventory expansion", async () => {
  const f = await fixture();const approvedManifestSha256 = hash(f.manifestRaw);
  const expanded = { ...f.inventory, destinations: [...f.inventory.destinations, { ...f.inventory.destinations[0], tenantId: "tenant-injected", destinationPath: path.join(f.root, "persistent", "tenant-injected", "shared.json") }] };
  const inventoryRaw = canonical(expanded);await fs.writeFile(f.inventoryPath, inventoryRaw, { mode: 0o600 });
  const manifestRaw = canonical({ ...f.manifest, inventoryAuthority: { path: f.inventoryPath, sha256: hash(inventoryRaw) } });await fs.writeFile(f.manifestPath, manifestRaw, { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(f.manifestPath, approvedManifestSha256), /manifest_sha256/);await fs.rm(f.root, { recursive: true, force: true });
});

test("authorized inventory omission denies the batch before reconciliation", async () => {
  const f = await fixture();const omitted = { ...f.inventory, destinations: f.inventory.destinations.slice(0, 1) };const inventoryRaw = canonical(omitted);await fs.writeFile(f.inventoryPath, inventoryRaw, { mode: 0o600 });
  const manifest = { ...f.manifest, inventoryAuthority: { path: f.inventoryPath, sha256: hash(inventoryRaw) } };const manifestRaw = canonical(manifest);await fs.writeFile(f.manifestPath, manifestRaw, { mode: 0o600 });
  await assert.rejects(reconcileInboxReadStateManifest(f.manifestPath, hash(manifestRaw)), /inventory_incomplete/);await fs.rm(f.root, { recursive: true, force: true });
});
