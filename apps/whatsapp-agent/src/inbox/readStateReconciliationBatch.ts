import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeDurableExclusive } from "./readStateDurability.js";
import { reconcileInboxReadStateRequest } from "./readStateReconciliation.js";

const MANIFEST_KIND = "CONVERTA_INBOX_READ_STATE_RECONCILIATION_MANIFEST_V1";
const RECEIPT_KIND = "CONVERTA_INBOX_READ_STATE_RECONCILIATION_AGGREGATE_RECEIPT_V1";
const INVENTORY_KIND = "CONVERTA_INBOX_READ_STATE_AUTHORIZED_DESTINATION_INVENTORY_V1";
const SNAPSHOT_AUTHORIZATION_KIND = "CONVERTA_INBOX_READ_STATE_CUTOVER_AUTHORIZATION_V1";
const SNAPSHOT_SEAL_KIND = "CONVERTA_INBOX_READ_STATE_FINAL_SNAPSHOT_SEAL_V1";
type RootAuthority = { path: string; device: number; inode: number; ownerUid: number; groupGid: number; mode: "0700" };
type FileAuthority = { path: string; sha256: string };
type SourceAuthority = { releaseId: string; sha256: string };
type Scope = { type: "shared" } | { type: "assigned"; assignedUserId: string };
type Entry = { requestPath: string; requestSha256: string; tenantId: string; scope: Scope; destinationPath: string; receiptPath: string; sourceAuthorities: SourceAuthority[]; anonymizationAuthoritySha256: string };
type Manifest = { schemaVersion: 1; kind: typeof MANIFEST_KIND; operationId: string; custodyRoot: RootAuthority; inventoryAuthority: FileAuthority; entries: Entry[]; aggregateReceiptPath: string };
type SnapshotSource = { releaseId: string; path: string; root: RootAuthority };
type SnapshotEntry = { operationId: string; tenantId: string; scope: Scope; destinationPath: string; sources: SnapshotSource[]; anonymizationAuthority: FileAuthority; requestPath: string; journalPath: string; receiptPath: string };
type SnapshotAuthorization = { schemaVersion: 1; kind: typeof SNAPSHOT_AUTHORIZATION_KIND; operationId: string; custodyRoot: RootAuthority; persistentRoot: RootAuthority; authorizedSourceReleases: string[]; entries: SnapshotEntry[]; inventoryPath: string; manifestPath: string; aggregateReceiptPath: string; sealReceiptPath: string };

function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)])); return value; }
const canonical = (value: unknown) => `${JSON.stringify(sortValue(value))}\n`;
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const inside = (child: string, root: string) => child !== root && path.resolve(child).startsWith(`${path.resolve(root)}${path.sep}`);

async function readPrivate(file: string) { const info = await fs.lstat(file); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("reconciliation_batch_file_identity"); return fs.readFile(file); }
async function authenticateRoot(root: RootAuthority) { const info = await fs.lstat(root.path); if (!path.isAbsolute(root.path) || root.mode !== "0700" || !info.isDirectory() || info.isSymbolicLink() || info.dev !== root.device || info.ino !== root.inode || info.uid !== root.ownerUid || info.gid !== root.groupGid || (info.mode & 0o777) !== 0o700) throw new Error("reconciliation_batch_custody_identity"); }
async function publishExact(file: string, payload: string) { try { await writeDurableExclusive(file, payload); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; } const observed = await readPrivate(file); if (!observed.equals(Buffer.from(payload))) throw new Error("reconciliation_snapshot_publication_conflict"); }

function parseSnapshotAuthorization(raw: Buffer): SnapshotAuthorization {
  const value = JSON.parse(raw.toString("utf8")) as SnapshotAuthorization;
  const keys = ["schemaVersion", "kind", "operationId", "custodyRoot", "persistentRoot", "authorizedSourceReleases", "entries", "inventoryPath", "manifestPath", "aggregateReceiptPath", "sealReceiptPath"];
  if (raw.toString("utf8") !== canonical(value) || Object.keys(value).sort().join() !== keys.sort().join() || value.schemaVersion !== 1 || value.kind !== SNAPSHOT_AUTHORIZATION_KIND || !value.operationId || !Array.isArray(value.authorizedSourceReleases) || !Array.isArray(value.entries) || value.entries.length === 0) throw new Error("reconciliation_snapshot_authorization_schema");
  const authorized = new Set(value.authorizedSourceReleases); if (authorized.size !== value.authorizedSourceReleases.length || [...authorized].some((release) => typeof release !== "string" || !release)) throw new Error("reconciliation_snapshot_authorization_schema");
  for (const output of [value.inventoryPath, value.manifestPath, value.aggregateReceiptPath, value.sealReceiptPath]) if (!inside(output, value.custodyRoot.path)) throw new Error("reconciliation_snapshot_custody_boundary");
  const scopeKeys = new Set<string>(); const destinations = new Set<string>(); const requestPaths = new Set<string>();
  for (const entry of value.entries) {
    const entryKeys = ["operationId", "tenantId", "scope", "destinationPath", "sources", "anonymizationAuthority", "requestPath", "journalPath", "receiptPath"];
    if (Object.keys(entry).sort().join() !== entryKeys.sort().join() || !entry.operationId || !entry.tenantId || !Array.isArray(entry.sources) || entry.sources.length === 0 || !/^[a-f0-9]{64}$/.test(entry.anonymizationAuthority?.sha256 ?? "")) throw new Error("reconciliation_snapshot_entry_schema");
    if (entry.scope.type !== "shared" && (entry.scope.type !== "assigned" || !entry.scope.assignedUserId)) throw new Error("reconciliation_snapshot_scope");
    const scopeKey = `${entry.tenantId}:${entry.scope.type}:${entry.scope.type === "assigned" ? entry.scope.assignedUserId : ""}`;
    if (scopeKeys.has(scopeKey) || destinations.has(path.resolve(entry.destinationPath)) || requestPaths.has(path.resolve(entry.requestPath))) throw new Error("reconciliation_snapshot_duplicate_authority");
    scopeKeys.add(scopeKey); destinations.add(path.resolve(entry.destinationPath)); requestPaths.add(path.resolve(entry.requestPath));
    if (!inside(entry.destinationPath, value.persistentRoot.path) || !inside(entry.requestPath, value.custodyRoot.path) || !inside(entry.journalPath, value.custodyRoot.path) || !inside(entry.receiptPath, value.custodyRoot.path) || !inside(entry.anonymizationAuthority.path, value.custodyRoot.path)) throw new Error("reconciliation_snapshot_boundary");
    for (const source of entry.sources) if (Object.keys(source).sort().join() !== ["path", "releaseId", "root"].sort().join() || !authorized.has(source.releaseId) || !inside(source.path, source.root.path)) throw new Error("reconciliation_snapshot_source_authority");
  }
  return value;
}

export async function materializeInboxReadStateFinalSnapshot(authorizationPath: string, expectedAuthorizationSha256: string) {
  const authorizationRaw = await readPrivate(authorizationPath); if (sha256(authorizationRaw) !== expectedAuthorizationSha256) throw new Error("reconciliation_snapshot_authorization_sha256");
  const authorization = parseSnapshotAuthorization(authorizationRaw); await Promise.all([authenticateRoot(authorization.custodyRoot), authenticateRoot(authorization.persistentRoot), ...authorization.entries.flatMap((entry) => entry.sources.map((source) => authenticateRoot(source.root)))]);
  const manifestEntries: Entry[] = [];
  for (const entry of authorization.entries) {
    const anonymizationRaw = await readPrivate(entry.anonymizationAuthority.path); if (sha256(anonymizationRaw) !== entry.anonymizationAuthority.sha256) throw new Error("reconciliation_snapshot_anonymization_sha256");
    const sources = await Promise.all(entry.sources.map(async (source) => ({ path: source.path, sha256: sha256(await readPrivate(source.path)) })));
    let expectedExistingSha256: string | null = null; try { expectedExistingSha256 = sha256(await readPrivate(entry.destinationPath)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const request = { schemaVersion: 2, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V2", operationId: entry.operationId, tenantId: entry.tenantId, scope: entry.scope, persistentRoot: authorization.persistentRoot, custodyRoot: authorization.custodyRoot, sourceRoots: entry.sources.map((source) => source.root), sources, destination: { path: entry.destinationPath, expectedExistingSha256 }, anonymizationAuthority: entry.anonymizationAuthority, journalPath: entry.journalPath, receiptPath: entry.receiptPath };
    const requestRaw = canonical(request); await publishExact(entry.requestPath, requestRaw);
    manifestEntries.push({ requestPath: entry.requestPath, requestSha256: sha256(requestRaw), tenantId: entry.tenantId, scope: entry.scope, destinationPath: entry.destinationPath, receiptPath: entry.receiptPath, sourceAuthorities: entry.sources.map((source, index) => ({ releaseId: source.releaseId, sha256: sources[index].sha256 })), anonymizationAuthoritySha256: entry.anonymizationAuthority.sha256 });
  }
  const destinations = manifestEntries.map(({ tenantId, scope, destinationPath, sourceAuthorities, anonymizationAuthoritySha256 }) => ({ tenantId, scope, destinationPath, sourceAuthorities, anonymizationAuthoritySha256 }));
  const inventory = { schemaVersion: 1, kind: INVENTORY_KIND, inventoryId: authorization.operationId, authorizedSourceReleases: authorization.authorizedSourceReleases, destinations };
  const inventoryRaw = canonical(inventory); await publishExact(authorization.inventoryPath, inventoryRaw);
  const manifest = { schemaVersion: 1, kind: MANIFEST_KIND, operationId: authorization.operationId, custodyRoot: authorization.custodyRoot, inventoryAuthority: { path: authorization.inventoryPath, sha256: sha256(inventoryRaw) }, entries: manifestEntries, aggregateReceiptPath: authorization.aggregateReceiptPath };
  const manifestRaw = canonical(manifest); await publishExact(authorization.manifestPath, manifestRaw);
  const seal = { schemaVersion: 1, kind: SNAPSHOT_SEAL_KIND, state: "SEALED", operationId: authorization.operationId, authorizationSha256: expectedAuthorizationSha256, inventoryPath: authorization.inventoryPath, inventorySha256: sha256(inventoryRaw), manifestPath: authorization.manifestPath, manifestSha256: sha256(manifestRaw), aggregateReceiptPath: authorization.aggregateReceiptPath, entries: manifestEntries.map((entry) => ({ tenantId: entry.tenantId, scope: entry.scope, destinationPath: entry.destinationPath, requestPath: entry.requestPath, requestSha256: entry.requestSha256, sourceAuthorities: entry.sourceAuthorities, anonymizationAuthoritySha256: entry.anonymizationAuthoritySha256 })) };
  const sealRaw = canonical(seal); await publishExact(authorization.sealReceiptPath, sealRaw);
  return { state: "SEALED", sealReceiptSha256: sha256(sealRaw), manifestPath: authorization.manifestPath, manifestSha256: sha256(manifestRaw), entryCount: manifestEntries.length } as const;
}

function parseManifest(raw: Buffer): Manifest {
  const value = JSON.parse(raw.toString("utf8")) as Manifest;
  if (raw.toString("utf8") !== canonical(value) || value.schemaVersion !== 1 || value.kind !== MANIFEST_KIND || !value.operationId || !Array.isArray(value.entries) || value.entries.length === 0) throw new Error("reconciliation_batch_manifest_schema");
  const keys = ["schemaVersion", "kind", "operationId", "custodyRoot", "inventoryAuthority", "entries", "aggregateReceiptPath"];
  if (Object.keys(value).sort().join() !== keys.sort().join()) throw new Error("reconciliation_batch_manifest_schema");
  if (!inside(value.inventoryAuthority?.path ?? "", value.custodyRoot.path) || !/^[a-f0-9]{64}$/.test(value.inventoryAuthority?.sha256 ?? "")) throw new Error("reconciliation_batch_inventory_boundary");
  const destinationKeys = new Set<string>(); const scopeKeys = new Set<string>(); const requestPaths = new Set<string>();
  for (const entry of value.entries) {
    const entryKeys = ["requestPath", "requestSha256", "tenantId", "scope", "destinationPath", "receiptPath", "sourceAuthorities", "anonymizationAuthoritySha256"];
    if (Object.keys(entry).sort().join() !== entryKeys.sort().join() || !entry.tenantId || !/^[a-f0-9]{64}$/.test(entry.requestSha256) || !/^[a-f0-9]{64}$/.test(entry.anonymizationAuthoritySha256) || !Array.isArray(entry.sourceAuthorities) || entry.sourceAuthorities.length === 0 || entry.sourceAuthorities.some((source) => !source.releaseId || !/^[a-f0-9]{64}$/.test(source.sha256))) throw new Error("reconciliation_batch_entry_schema");
    if (entry.scope.type !== "shared" && (entry.scope.type !== "assigned" || !entry.scope.assignedUserId)) throw new Error("reconciliation_batch_scope");
    const scopeKey = `${entry.tenantId}:${entry.scope.type}:${entry.scope.type === "assigned" ? entry.scope.assignedUserId : ""}`;
    if (scopeKeys.has(scopeKey) || destinationKeys.has(path.resolve(entry.destinationPath)) || requestPaths.has(path.resolve(entry.requestPath))) throw new Error("reconciliation_batch_duplicate_authority");
    scopeKeys.add(scopeKey); destinationKeys.add(path.resolve(entry.destinationPath)); requestPaths.add(path.resolve(entry.requestPath));
    if (!inside(entry.requestPath, value.custodyRoot.path) || !inside(entry.receiptPath, value.custodyRoot.path)) throw new Error("reconciliation_batch_custody_boundary");
  }
  if (!inside(value.aggregateReceiptPath, value.custodyRoot.path)) throw new Error("reconciliation_batch_custody_boundary");
  return value;
}

const entryIdentity = (entry: Pick<Entry, "tenantId" | "scope" | "destinationPath" | "sourceAuthorities" | "anonymizationAuthoritySha256">) => canonical({ tenantId: entry.tenantId, scope: entry.scope, destinationPath: entry.destinationPath, sourceAuthorities: entry.sourceAuthorities, anonymizationAuthoritySha256: entry.anonymizationAuthoritySha256 });

async function authenticateInventory(manifest: Manifest) {
  const raw = await readPrivate(manifest.inventoryAuthority.path); if (sha256(raw) !== manifest.inventoryAuthority.sha256) throw new Error("reconciliation_batch_inventory_sha256");
  const inventory = JSON.parse(raw.toString("utf8"));
  if (raw.toString("utf8") !== canonical(inventory) || inventory.schemaVersion !== 1 || inventory.kind !== INVENTORY_KIND || !inventory.inventoryId || !Array.isArray(inventory.authorizedSourceReleases) || !Array.isArray(inventory.destinations)) throw new Error("reconciliation_batch_inventory_schema");
  const authorized = new Set(inventory.authorizedSourceReleases); if (authorized.size !== inventory.authorizedSourceReleases.length || [...authorized].some((value) => typeof value !== "string" || !value)) throw new Error("reconciliation_batch_inventory_schema");
  const expected = new Set(manifest.entries.map(entryIdentity)); const observed = new Set(inventory.destinations.map(entryIdentity));
  if (expected.size !== manifest.entries.length || observed.size !== inventory.destinations.length || expected.size !== observed.size || [...expected].some((value) => !observed.has(value))) throw new Error("reconciliation_batch_inventory_incomplete");
  for (const entry of manifest.entries) if (entry.sourceAuthorities.some((source) => !authorized.has(source.releaseId))) throw new Error("reconciliation_batch_source_unauthorized");
  return manifest.inventoryAuthority.sha256;
}

async function authenticateEntryRequest(entry: Entry) {
  const raw = await readPrivate(entry.requestPath); if (sha256(raw) !== entry.requestSha256) throw new Error("reconciliation_batch_request_sha256");
  const request = JSON.parse(raw.toString("utf8"));
  const sourceSha256 = Array.isArray(request.sources) ? request.sources.map((source: unknown) => {
    if (!source || typeof source !== "object" || typeof (source as { sha256?: unknown }).sha256 !== "string") throw new Error("reconciliation_batch_request_sources");
    return (source as { sha256: string }).sha256;
  }).sort() : [];
  const expectedSourceSha256 = entry.sourceAuthorities.map((source) => source.sha256).sort();
  if (request.schemaVersion !== 2 || request.kind !== "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V2") throw new Error("reconciliation_batch_request_schema");
  if (request.tenantId !== entry.tenantId || canonical(request.scope) !== canonical(entry.scope) || request.destination?.path !== entry.destinationPath || request.receiptPath !== entry.receiptPath) throw new Error("reconciliation_batch_request_destination");
  if (request.anonymizationAuthority?.sha256 !== entry.anonymizationAuthoritySha256) throw new Error("reconciliation_batch_request_anonymization");
  if (JSON.stringify(sourceSha256) !== JSON.stringify(expectedSourceSha256)) throw new Error("reconciliation_batch_request_sources");
}

export async function reconcileInboxReadStateManifest(manifestPath: string, expectedManifestSha256: string, afterEntry?: (index: number) => void | Promise<void>) {
  const raw = await readPrivate(manifestPath); const manifestSha256 = sha256(raw);
  if (manifestSha256 !== expectedManifestSha256) throw new Error("reconciliation_batch_manifest_sha256");
  const manifest = parseManifest(raw); await authenticateRoot(manifest.custodyRoot); const inventorySha256 = await authenticateInventory(manifest);
  try {
    const receiptRaw = await readPrivate(manifest.aggregateReceiptPath); const receipt = JSON.parse(receiptRaw.toString("utf8"));
    if (receiptRaw.toString("utf8") !== canonical(receipt) || receipt.schemaVersion !== 1 || receipt.kind !== RECEIPT_KIND || receipt.operationId !== manifest.operationId || receipt.manifestSha256 !== manifestSha256 || receipt.inventorySha256 !== inventorySha256 || receipt.state !== "VERIFIED" || !Array.isArray(receipt.entries) || receipt.entries.length !== manifest.entries.length) throw new Error("reconciliation_batch_receipt_conflict");
    for (const entry of manifest.entries) {
      await authenticateEntryRequest(entry);
      const replay = await reconcileInboxReadStateRequest(entry.requestPath, entry.requestSha256);
      if (replay.state !== "REPLAY_VERIFIED") throw new Error("reconciliation_batch_destination_unverified");
      const verified = receipt.entries.find((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const value = item as Record<string, unknown>;
        return value.tenantId === entry.tenantId && JSON.stringify(value.scope) === JSON.stringify(entry.scope) && value.destinationPath === entry.destinationPath && value.requestSha256 === entry.requestSha256 && value.receiptPath === entry.receiptPath && value.anonymizationAuthoritySha256 === entry.anonymizationAuthoritySha256 && JSON.stringify(value.sourceAuthorities) === JSON.stringify(entry.sourceAuthorities);
      }) as Record<string, unknown> | undefined;
      if (!verified || typeof verified.receiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(verified.receiptSha256)) throw new Error("reconciliation_batch_receipt_conflict");
      const individualRaw = await readPrivate(entry.receiptPath); if (sha256(individualRaw) !== verified.receiptSha256) throw new Error("reconciliation_batch_individual_receipt_drift");
    }
    return { state: "REPLAY_VERIFIED", receiptSha256: sha256(receiptRaw) } as const;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const verified = [];
  for (const [index, entry] of manifest.entries.entries()) {
    await authenticateEntryRequest(entry);
    await reconcileInboxReadStateRequest(entry.requestPath, entry.requestSha256);
    const receiptRaw = await readPrivate(entry.receiptPath); const receipt = JSON.parse(receiptRaw.toString("utf8"));
    if (receipt.schemaVersion !== 2 || receipt.kind !== "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2" || receipt.state !== "VERIFIED" || receipt.tenantId !== entry.tenantId || JSON.stringify(receipt.scope) !== JSON.stringify(entry.scope) || receipt.destinationPath !== entry.destinationPath || receipt.requestSha256 !== entry.requestSha256) throw new Error("reconciliation_batch_individual_receipt_semantics");
    verified.push({ tenantId: entry.tenantId, scope: entry.scope, destinationPath: entry.destinationPath, requestSha256: entry.requestSha256, receiptPath: entry.receiptPath, receiptSha256: sha256(receiptRaw), sourceAuthorities: entry.sourceAuthorities, anonymizationAuthoritySha256: entry.anonymizationAuthoritySha256 });
    await afterEntry?.(index);
  }
  for (const entry of manifest.entries) {
    const replay = await reconcileInboxReadStateRequest(entry.requestPath, entry.requestSha256);
    if (replay.state !== "REPLAY_VERIFIED") throw new Error("reconciliation_batch_destination_unverified");
  }
  const receipt = { schemaVersion: 1, kind: RECEIPT_KIND, operationId: manifest.operationId, manifestSha256, inventorySha256, state: "VERIFIED", entries: verified };
  const payload = canonical(receipt);
  try { await writeDurableExclusive(manifest.aggregateReceiptPath, payload); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const published = await readPrivate(manifest.aggregateReceiptPath); if (!published.equals(Buffer.from(payload))) throw new Error("reconciliation_batch_receipt_conflict");
  const publishedReceipt = JSON.parse(published.toString("utf8")); if (published.toString("utf8") !== canonical(publishedReceipt) || publishedReceipt.state !== "VERIFIED" || publishedReceipt.manifestSha256 !== manifestSha256 || publishedReceipt.inventorySha256 !== inventorySha256 || publishedReceipt.entries.length !== verified.length) throw new Error("reconciliation_batch_receipt_conflict");
  return { state: "VERIFIED", receiptSha256: sha256(published), entryCount: verified.length } as const;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, authorityPath, authoritySha256] = process.argv.slice(2);
  const operation = command === "seal"
    ? materializeInboxReadStateFinalSnapshot(authorityPath, authoritySha256)
    : command === "reconcile"
      ? reconcileInboxReadStateManifest(authorityPath, authoritySha256)
      : Promise.reject(new Error("usage: seal|reconcile path sha256"));
  operation.then((result) => process.stdout.write(`${JSON.stringify(result)}\n`));
}
