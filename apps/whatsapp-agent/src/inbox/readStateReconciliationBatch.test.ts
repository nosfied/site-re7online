import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeInboxReadStateFinalSnapshot, reconcileInboxReadStateManifest } from "./readStateReconciliationBatch.js";

function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)])); return value; }
const canonical = (value: unknown) => `${JSON.stringify(sortValue(value))}\n`;
const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
async function authority(root: string) { const info = await fs.lstat(root); return { path: root, device: info.dev, inode: info.ino, ownerUid: info.uid, groupGid: info.gid, mode: "0700" as const }; }
async function legacyAuthority(root: string) { const info = await fs.lstat(root); return { path: root, device: info.dev, inode: info.ino, ownerUid: info.uid, groupGid: info.gid, mode: "0755" as const }; }

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

test("final snapshot materialization seals a legitimate source write after administrative authorization", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-final-snapshot-"));
  const persistent = path.join(root, "persistent"), custody = path.join(root, "custody"), sourceRoot = path.join(root, "legacy-cb");
  await Promise.all([persistent, custody, sourceRoot].map((item) => fs.mkdir(item, { recursive: true, mode: 0o700 })));
  const source = path.join(sourceRoot, "tenant-a-shared.json");
  await fs.writeFile(source, '{"lastReadAtByConversationKey":{"alias":"2026-11-22T10:00:00.000Z"},"manuallyUnreadByConversationKey":{}}\n', { mode: 0o600 });
  const privacy = path.join(custody, "privacy.json"), privacyRaw = canonical({ schemaVersion: 1, kind: "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", tenantId: "tenant-a", conversationKeys: [] });
  await fs.writeFile(privacy, privacyRaw, { mode: 0o600 });
  const operation = path.join(custody, "tenant-a-shared"); await fs.mkdir(operation, { mode: 0o700 });
  const authorization = { schemaVersion: 1, kind: "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V1", operationId: "cutover-op", custodyRoot: await authority(custody), persistentRoot: await authority(persistent), authorizedSourceReleases: ["immutable-cb"], entries: [{ operationId: "tenant-a-shared", tenantId: "tenant-a", scope: { type: "shared" as const }, destinationPath: path.join(persistent, "tenant-a", "shared.json"), sources: [{ releaseId: "immutable-cb", path: source, root: await authority(sourceRoot) }], anonymizationAuthority: { path: privacy, sha256: hash(privacyRaw) }, requestPath: path.join(operation, "request.json"), journalPath: path.join(operation, "journal.jsonl"), receiptPath: path.join(operation, "receipt.json") }], inventoryPath: path.join(custody, "inventory.json"), manifestPath: path.join(custody, "manifest.json"), aggregateReceiptPath: path.join(custody, "aggregate", "receipt.json"), sealReceiptPath: path.join(custody, "snapshot-seal.json") };
  const unauthorized = structuredClone(authorization); unauthorized.entries[0].sources[0].releaseId = "unapproved-release"; const unauthorizedRaw = canonical(unauthorized), unauthorizedPath = path.join(custody, "unauthorized.json"); await fs.writeFile(unauthorizedPath, unauthorizedRaw, { mode: 0o600 });
  await assert.rejects(materializeInboxReadStateFinalSnapshot(unauthorizedPath, hash(unauthorizedRaw)), /source_authority/);
  const authorizationRaw = canonical(authorization), authorizationPath = path.join(custody, "snapshot-authorization.json"); await fs.writeFile(authorizationPath, authorizationRaw, { mode: 0o600 });
  const finalSourceRaw = '{\n  "lastReadAtByConversationKey": {"alias": "2026-11-22T11:00:00.000Z"},\n  "manuallyUnreadByConversationKey": {}\n}\n'; await fs.writeFile(source, finalSourceRaw, { mode: 0o600 });
  const sealed = await materializeInboxReadStateFinalSnapshot(authorizationPath, hash(authorizationRaw)); assert.equal(sealed.state, "SEALED");
  const manifest = JSON.parse(await fs.readFile(authorization.manifestPath, "utf8")); assert.equal(manifest.entries[0].sourceAuthorities[0].sha256, hash(finalSourceRaw));
  const request = JSON.parse(await fs.readFile(authorization.entries[0].requestPath, "utf8")); assert.equal(request.sources[0].sha256, hash(finalSourceRaw));
  assert.equal((await materializeInboxReadStateFinalSnapshot(authorizationPath, hash(authorizationRaw))).sealReceiptSha256, sealed.sealReceiptSha256);
  await fs.writeFile(authorization.manifestPath, "{}\n", { mode: 0o600 }); await assert.rejects(materializeInboxReadStateFinalSnapshot(authorizationPath, hash(authorizationRaw)), /publication_conflict/);
  await fs.rm(root, { recursive: true, force: true });
});

test("first migration admits byte-exact CB legacy sources into private custody without weakening private modes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "read-state-legacy-admission-"));
  const persistent = path.join(root, "persistent"), custody = path.join(root, "custody"), sourceRoot = path.join(root, "legacy-cb", ".data", "app-read-state");
  await Promise.all([persistent, custody].map((item) => fs.mkdir(item, { recursive: true, mode: 0o700 })));
  await fs.mkdir(path.join(sourceRoot, "tenant-a"), { recursive: true, mode: 0o755 }); await fs.chmod(sourceRoot, 0o755);
  const source = path.join(sourceRoot, "tenant-a", "shared.json");
  const sourceRaw = '{"lastReadAtByConversationKey":{"alias":"2026-11-22T11:00:00.000Z"},"manuallyUnreadByConversationKey":{}}\n';
  await fs.writeFile(source, sourceRaw, { mode: 0o644 }); await fs.chmod(source, 0o644);
  const privacy = path.join(custody, "privacy.json"), privacyRaw = canonical({ schemaVersion: 1, kind: "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", tenantId: "tenant-a", conversationKeys: [] });
  await fs.writeFile(privacy, privacyRaw, { mode: 0o600 });
  const operation = path.join(custody, "tenant-a-shared"); await fs.mkdir(operation, { mode: 0o700 });
  const privateCopy = path.join(custody, "legacy-sources", "immutable-cb", "tenant-a", "shared.json");
  const authorization = { schemaVersion: 2, kind: "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V2", operationId: "legacy-cutover-op", custodyRoot: await authority(custody), persistentRoot: await authority(persistent), authorizedSourceReleases: ["immutable-cb"], entries: [{ operationId: "legacy-tenant-a-shared", tenantId: "tenant-a", scope: { type: "shared" as const }, destinationPath: path.join(persistent, "tenant-a", "shared.json"), sources: [{ releaseId: "immutable-cb", path: source, root: await legacyAuthority(sourceRoot), admission: "LEGACY_RELEASE_LOCAL_COPY_V1", privateCopyPath: privateCopy }], anonymizationAuthority: { path: privacy, sha256: hash(privacyRaw) }, requestPath: path.join(operation, "request.json"), journalPath: path.join(operation, "journal.jsonl"), receiptPath: path.join(operation, "receipt.json") }], inventoryPath: path.join(custody, "inventory.json"), manifestPath: path.join(custody, "manifest.json"), aggregateReceiptPath: path.join(custody, "aggregate", "receipt.json"), sealReceiptPath: path.join(custody, "snapshot-seal.json") };
  const authorizationRaw = canonical(authorization), authorizationPath = path.join(custody, "snapshot-authorization.json"); await fs.writeFile(authorizationPath, authorizationRaw, { mode: 0o600 });

  await fs.mkdir(path.dirname(privateCopy), { recursive: true, mode: 0o700 }); await fs.writeFile(privateCopy, "divergent\n", { mode: 0o600 });
  await assert.rejects(materializeInboxReadStateFinalSnapshot(authorizationPath, hash(authorizationRaw)), /publication_conflict/); await fs.unlink(privateCopy);
  const sealed = await materializeInboxReadStateFinalSnapshot(authorizationPath, hash(authorizationRaw)); assert.equal(sealed.state, "SEALED");
  assert.equal(await fs.readFile(privateCopy, "utf8"), sourceRaw); assert.equal((await fs.lstat(privateCopy)).mode & 0o777, 0o600); assert.equal((await fs.lstat(source)).mode & 0o777, 0o644);
  const seal = JSON.parse(await fs.readFile(authorization.sealReceiptPath, "utf8"));
  assert.equal(seal.entries[0].sourceSnapshots[0].origin.sha256, hash(sourceRaw)); assert.equal(seal.entries[0].sourceSnapshots[0].origin.mode, "0644"); assert.equal(seal.entries[0].sourceSnapshots[0].privateCopy.mode, "0600");
  const request = JSON.parse(await fs.readFile(authorization.entries[0].requestPath, "utf8")); assert.equal(request.sources[0].path, privateCopy); assert.equal(request.sourceRoots[0].path, custody);
  const verified = await reconcileInboxReadStateManifest(sealed.manifestPath, sealed.manifestSha256); assert.equal(verified.state, "VERIFIED");
  assert.equal((await reconcileInboxReadStateManifest(sealed.manifestPath, sealed.manifestSha256)).state, "REPLAY_VERIFIED");
  await fs.rm(root, { recursive: true, force: true });
});
