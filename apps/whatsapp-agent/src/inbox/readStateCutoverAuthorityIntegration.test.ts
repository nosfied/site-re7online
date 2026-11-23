import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { materializeInboxReadStateFinalSnapshot } from "./readStateReconciliationBatch.js";

function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
const canonical = (value: unknown) => `${JSON.stringify(sortValue(value))}\n`;
const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const producer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/read-state-cutover-authority.py");
const inventorySha = "620833264d94ed9ce2433f4bada99ae4fd9c74702707665fe35c3e5ff269bacc";
const journalSha = "b461e4fa3d03cf066abfbab396262f183845228bfa955b8cbc19c6a0e137e572";
const custodySha = "8d54f3e7e70810f5629e30b1bd2f55e16ab270c0cca482887167f8cb6eb83980";

async function put(file: string, value: unknown) { await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await fs.chmod(path.dirname(file), 0o700); const raw = canonical(value); await fs.writeFile(file, raw, { mode: 0o600 }); await fs.chmod(file, 0o600); return hash(raw); }
function invokePython(action: "prepare-provision" | "provision" | "prepare" | "materialize", root: string, file: string, sha: string, owner?: string, ownerSha?: string) {
  const code = `import importlib.util,pathlib,sys\ns=importlib.util.spec_from_file_location('authority',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.ROOT=sys.argv[2]\na=sys.argv[5]\nr=m.prepare_provision(pathlib.Path(sys.argv[3]),sys.argv[4]) if a=='prepare-provision' else (m.prepare(pathlib.Path(sys.argv[3]),sys.argv[4]) if a=='prepare' else (m.provision(pathlib.Path(sys.argv[3]),sys.argv[4],pathlib.Path(sys.argv[6]),sys.argv[7]) if a=='provision' else m.materialize(pathlib.Path(sys.argv[3]),sys.argv[4],pathlib.Path(sys.argv[6]),sys.argv[7])))\nprint(m.canonical(r).decode(),end='')`;
  const args = ["-c", code, producer, root, file, sha, action]; if (owner && ownerSha) args.push(owner, ownerSha);
  return JSON.parse(execFileSync("python3", args, { encoding: "utf8" }));
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cutover-authority-integration-"));
  const persistent = path.join(root, "runtime-data/inbox-read-state"), custody = path.join(root, "custody"), sourceRoot = path.join(root, "legacy-cb");
  await fs.mkdir(custody, { mode: 0o700 }); await fs.mkdir(path.join(sourceRoot, "tenant-a"), { recursive: true, mode: 0o755 }); await fs.chmod(sourceRoot, 0o755); await fs.chmod(path.join(sourceRoot, "tenant-a"), 0o755);
  const source = path.join(sourceRoot, "tenant-a/shared.json"); await fs.writeFile(source, '{"lastReadAtByConversationKey":{"alias":"2026-11-23T10:00:00.000Z"},"manuallyUnreadByConversationKey":{}}\n', { mode: 0o644 }); await fs.chmod(source, 0o644);
  const privacy = path.join(custody, "privacy/tenant-a.json"), privacySha = await put(privacy, { schemaVersion: 1, kind: "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS", tenantId: "tenant-a", conversationKeys: [] });
  const batch = path.join(custody, "privacy/batch.json"), batchSha = await put(batch, { inventorySha256: inventorySha, journalSha256: journalSha, custodyManifestSha256: custodySha, verifiedCount: 34 });
  const ancestorInfo = await fs.stat(root), custodyInfo = await fs.stat(custody), executor = "/usr/bin/install", executorInfo = await fs.stat(executor);
  const authority = (file: string, info: Stats) => ({ path: file, device: info.dev, inode: info.ino, ownerUid: info.uid, groupGid: info.gid, mode: `0${(info.mode & 0o777).toString(8).padStart(3, "0")}` });
  const createdDirectories = [path.dirname(persistent), persistent].map((file) => ({ path: file, ownerUid: ancestorInfo.uid, groupGid: ancestorInfo.gid, mode: "0700" }));
  const commands = createdDirectories.map((item) => [executor, "-d", "-o", String(item.ownerUid), "-g", String(item.groupGid), "-m", "0700", item.path]);
  const provisionPlan = { schemaVersion: 1, kind: "CONVERTA_DURABLE_READ_STATE_PROVISION_PLAN_V1", operationId: "provision-integrated",
    root: { path: persistent, ownerUid: ancestorInfo.uid, groupGid: ancestorInfo.gid, mode: "0700" }, custodyRoot: authority(custody, custodyInfo), ancestors: [authority(root, ancestorInfo)], createdDirectories,
    executor: { ...authority(executor, executorInfo), sha256: hash(await fs.readFile(executor)) }, commands, initialState: "ABSENT", automaticExecution: false,
    outputs: { intentPath: path.join(custody, "provision-intent.json"), journalPath: path.join(custody, "provision-journal.json"), receiptPath: path.join(custody, "provision-receipt.json"), lockPath: path.join(custody, "provision.lock") } };
  const provisionPlanPath = path.join(custody, "provision-plan.json"), provisionPlanSha = await put(provisionPlanPath, provisionPlan);
  const provisionPrepared = invokePython("prepare-provision", persistent, provisionPlanPath, provisionPlanSha);
  const provisionOwner = path.join(custody, "provision-owner.json"), provisionOwnerSha = await put(provisionOwner, { schemaVersion: 1, kind: "CONVERTA_DURABLE_READ_STATE_PROVISION_AUTHORIZE_ONCE_V1", decision: "AUTHORIZE_ONCE", operationId: provisionPlan.operationId, planSha256: provisionPlanSha, provisionIntentSha256: provisionPrepared.provisionIntentSha256, approvedRoot: persistent, approvedCommands: commands, owner: "fixture-owner" });
  const provisioned = invokePython("provision", persistent, provisionPlan.outputs.intentPath, provisionPrepared.provisionIntentSha256, provisionOwner, provisionOwnerSha);
  const plan = { schemaVersion: 2, kind: "CONVERTA_READ_STATE_CUTOVER_ADMIN_PLAN_V2", operationId: "cutover-integrated",
    persistentRoot: { path: persistent, ownerUid: ancestorInfo.uid, groupGid: ancestorInfo.gid, mode: "0700" }, custodyRoot: { path: custody, ownerUid: custodyInfo.uid, groupGid: custodyInfo.gid, mode: "0700" }, authorizedSourceReleases: ["immutable-cb"],
    entries: [{ operationId: "tenant-a-shared", tenantId: "tenant-a", scope: { type: "shared" }, destinationPath: path.join(persistent, "tenant-a/shared.json"), sources: [{ releaseId: "immutable-cb", path: source, rootPath: sourceRoot, privateCopyPath: path.join(custody, "copies/tenant-a/shared.json") }], anonymizationAuthority: { path: privacy, sha256: privacySha }, requestPath: path.join(custody, "reconcile/request.json"), journalPath: path.join(custody, "reconcile/journal.jsonl"), receiptPath: path.join(custody, "reconcile/receipt.json") }],
    privacyBatchAuthority: { path: batch, sha256: batchSha, inventorySha256: inventorySha, journalSha256: journalSha, custodyManifestSha256: custodySha, verifiedCount: 34 },
    provisionReceiptAuthority: { path: provisionPlan.outputs.receiptPath, sha256: provisioned.provisionReceiptSha256, provisionIntentSha256: provisionPrepared.provisionIntentSha256 },
    outputs: { materializationRequestPath: path.join(custody, "materialize.json"), authorizationPath: path.join(custody, "authorization.json") } };
  const planPath = path.join(custody, "plan.json"), planSha = await put(planPath, plan);
  const prepared = invokePython("prepare", persistent, planPath, planSha);
  const owner = path.join(custody, "owner-authorization.json"), ownerValue = { schemaVersion: 1, kind: "CONVERTA_READ_STATE_CUTOVER_AUTHORIZE_ONCE_V1", decision: "AUTHORIZE_ONCE", planSha256: planSha, provisionIntentSha256: provisionPrepared.provisionIntentSha256, approvedPersistentRoot: persistent, approvedTenants: ["tenant-a"], owner: "fixture-owner" };
  const ownerSha = await put(owner, ownerValue); const request = path.join(custody, "materialize.json"), requestSha = hash(await fs.readFile(request));
  invokePython("materialize", persistent, request, requestSha, owner, ownerSha);
  const authorization = path.join(custody, "authorization.json");
  return { root, persistent, custody, owner, ownerValue, ownerSha, authorization, authorizationSha: hash(await fs.readFile(authorization)) };
}

test("AUTHORIZE_ONCE -> Python materialize -> TypeScript parse -> FINAL_SNAPSHOT_SEAL", async () => {
  const f = await fixture();
  try {
    const result = await materializeInboxReadStateFinalSnapshot(f.authorization, f.authorizationSha); assert.equal(result.state, "SEALED");
    const seal = JSON.parse(await fs.readFile(path.join(f.custody, "snapshot-seal.private.json"), "utf8")); assert.equal(seal.administrativeAuthoritySha256, f.ownerSha);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("V3 denies absent, adulterated, and divergent administrative authority", async () => {
  for (const mode of ["absent", "adulterated", "divergent"] as const) {
    const f = await fixture();
    try {
      const authorization = JSON.parse(await fs.readFile(f.authorization, "utf8"));
      if (mode === "absent") delete authorization.administrativeAuthority;
      if (mode === "adulterated") await fs.writeFile(f.owner, canonical({ ...f.ownerValue, owner: "tampered" }), { mode: 0o600 });
      if (mode === "divergent") { const divergentSha = await put(f.owner, { ...f.ownerValue, approvedTenants: ["tenant-b"] }); authorization.administrativeAuthority.sha256 = divergentSha; }
      if (mode !== "adulterated") await fs.writeFile(f.authorization, canonical(authorization), { mode: 0o600 });
      const authorizationSha = hash(await fs.readFile(f.authorization));
      await assert.rejects(materializeInboxReadStateFinalSnapshot(f.authorization, authorizationSha), /administrative_authority|authorization_schema/);
    } finally { await fs.rm(f.root, { recursive: true, force: true }); }
  }
});
