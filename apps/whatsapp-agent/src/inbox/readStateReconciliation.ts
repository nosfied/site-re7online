import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReadStateFileForScope, reconcileInboxReadStateSources, type ConversationReadScope, type InboxReadState } from "./readStateStore.js";
import { withInboxReadStateWriteLock } from "./readStateFileLock.js";

const REQUEST_KIND = "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V2";
const RECEIPT_KIND = "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT_V2";
type FileAuthority = { path: string; sha256: string };
type RootAuthority = { path: string; device: number; inode: number; ownerUid: number; groupGid: number; mode: "0700" };
type Request = { schemaVersion: 2; kind: typeof REQUEST_KIND; operationId: string; tenantId: string; scope: ConversationReadScope; persistentRoot: RootAuthority; custodyRoot: RootAuthority; sourceRoots: RootAuthority[]; sources: FileAuthority[]; destination: { path: string; expectedExistingSha256: string | null }; anonymizationAuthority: FileAuthority; journalPath: string; receiptPath: string };
type Hook = (point: "after_attempt" | "after_destination" | "after_verified") => void | Promise<void>;

function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)])); return value; }
const canonical = (value: unknown) => `${JSON.stringify(sortValue(value))}\n`;
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const inside = (child: string, root: string) => child !== root && path.resolve(child).startsWith(`${path.resolve(root)}${path.sep}`);

async function readRegularFile(file: string) { const info = await fs.lstat(file); if (!info.isFile() || info.isSymbolicLink()) throw new Error("reconciliation_file_identity"); return fs.readFile(file); }
async function authenticateRoot(root: RootAuthority) { if (!path.isAbsolute(root.path) || root.mode !== "0700") throw new Error("reconciliation_root_schema"); const info = await fs.lstat(root.path); if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== root.device || info.ino !== root.inode || info.uid !== root.ownerUid || info.gid !== root.groupGid || (info.mode & 0o777) !== 0o700) throw new Error("reconciliation_root_identity"); }
async function writePrivateExclusive(file: string, payload: string) { await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await fs.writeFile(file, payload, { mode: 0o600, flag: "wx" }); }
async function appendPrivate(file: string, payload: string) { const handle = await fs.open(file, "a", 0o600); try { await handle.write(payload); await handle.sync(); } finally { await handle.close(); } }
function parseRequest(raw: Buffer): Request {
  const value = JSON.parse(raw.toString("utf8")) as Request;
  const keys = ["schemaVersion","kind","operationId","tenantId","scope","persistentRoot","custodyRoot","sourceRoots","sources","destination","anonymizationAuthority","journalPath","receiptPath"];
  if (value.schemaVersion !== 2 || value.kind !== REQUEST_KIND || Object.keys(value).sort().join() !== keys.sort().join() || !value.operationId || !value.tenantId) throw new Error("reconciliation_request_schema");
  if (value.scope?.type !== "shared" && value.scope?.type !== "assigned") throw new Error("reconciliation_scope");
  if (value.scope.type === "assigned" && !value.scope.assignedUserId) throw new Error("reconciliation_scope");
  if (!Array.isArray(value.sources) || !value.sources.length || !Array.isArray(value.sourceRoots) || !value.sourceRoots.length) throw new Error("reconciliation_request_schema");
  if (path.resolve(value.destination?.path ?? "") !== path.resolve(getReadStateFileForScope(value.persistentRoot.path, value.tenantId, value.scope))) throw new Error("reconciliation_destination_boundary");
  if (!inside(value.journalPath, value.custodyRoot.path) || !inside(value.receiptPath, value.custodyRoot.path) || path.dirname(value.journalPath) !== path.dirname(value.receiptPath)) throw new Error("reconciliation_custody_boundary");
  if (!inside(value.anonymizationAuthority.path, value.custodyRoot.path)) throw new Error("reconciliation_anonymization_boundary");
  for (const source of value.sources) if (!value.sourceRoots.some((root) => inside(source.path, root.path))) throw new Error("reconciliation_source_boundary");
  return value;
}
async function readState(source: FileAuthority): Promise<InboxReadState> { const raw = await readRegularFile(source.path); if (sha256(raw) !== source.sha256) throw new Error("reconciliation_source_sha256"); return JSON.parse(raw.toString("utf8")) as InboxReadState; }
async function readEvents(file: string) { try { return (await readRegularFile(file)).toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }

export async function reconcileInboxReadStateRequest(requestPath: string, expectedRequestSha256: string, hook?: Hook) {
  const requestRaw = await readRegularFile(requestPath); const requestInfo = await fs.lstat(requestPath);
  if ((requestInfo.mode & 0o077) !== 0) throw new Error("reconciliation_request_mode");
  const requestSha256 = sha256(requestRaw); if (requestSha256 !== expectedRequestSha256) throw new Error("reconciliation_request_sha256");
  const request = parseRequest(requestRaw);
  await Promise.all([authenticateRoot(request.persistentRoot), authenticateRoot(request.custodyRoot), ...request.sourceRoots.map(authenticateRoot)]);
  const anonymizationRaw = await readRegularFile(request.anonymizationAuthority.path);
  if (sha256(anonymizationRaw) !== request.anonymizationAuthority.sha256) throw new Error("reconciliation_anonymization_sha256");
  const anonymization = JSON.parse(anonymizationRaw.toString("utf8"));
  if (anonymization.schemaVersion !== 1 || anonymization.kind !== "CONVERTA_PRIVACY_ANONYMIZED_CONVERSATION_KEYS" || anonymization.tenantId !== request.tenantId || !Array.isArray(anonymization.conversationKeys)) throw new Error("reconciliation_anonymization_authority");
  try {
    const receiptRaw = await readRegularFile(request.receiptPath); const receipt = JSON.parse(receiptRaw.toString("utf8"));
    if (receipt.schemaVersion !== 2 || receipt.kind !== RECEIPT_KIND || receipt.operationId !== request.operationId || receipt.requestSha256 !== requestSha256 || receipt.tenantId !== request.tenantId || canonical(receipt.scope) !== canonical(request.scope) || receipt.destinationPath !== request.destination.path || receipt.state !== "VERIFIED") throw new Error("reconciliation_receipt_conflict");
    if (sha256(await readRegularFile(request.destination.path)) !== receipt.destinationSha256) throw new Error("reconciliation_receipt_destination_drift");
    return { state: "REPLAY_VERIFIED", receiptSha256: sha256(receiptRaw) } as const;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return withInboxReadStateWriteLock(request.destination.path, async () => {
    const states = await Promise.all(request.sources.map(readState)); const merged = reconcileInboxReadStateSources(states);
    if (!merged.ok) throw new Error(`reconciliation_${merged.code}:${merged.conversationKey}`);
    for (const key of anonymization.conversationKeys) { delete merged.state.lastReadAtByConversationKey[key]; delete merged.state.manuallyUnreadByConversationKey[key]; }
    const destinationPayload = `${JSON.stringify(merged.state, null, 2)}\n`; const destinationSha256 = sha256(destinationPayload);
    let existingSha256: string | null = null; try { existingSha256 = sha256(await readRegularFile(request.destination.path)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (existingSha256 !== request.destination.expectedExistingSha256 && existingSha256 !== destinationSha256) throw new Error("reconciliation_destination_changed");
    const base = { schemaVersion: 2, kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_JOURNAL_V2", operationId: request.operationId, requestSha256, tenantId: request.tenantId, scope: request.scope, destinationPath: request.destination.path, destinationSha256 };
    const events = await readEvents(request.journalPath); if (events.some((event) => event.operationId !== request.operationId || event.requestSha256 !== requestSha256 || event.destinationSha256 !== destinationSha256)) throw new Error("reconciliation_journal_conflict");
    if (!events.some((event) => event.state === "ATTEMPT")) { await appendPrivate(request.journalPath, canonical({ ...base, state: "ATTEMPT" })); await hook?.("after_attempt"); }
    if (existingSha256 !== destinationSha256) { await fs.mkdir(path.dirname(request.destination.path), { recursive: true, mode: 0o700 }); const temporary = `${request.destination.path}.${request.operationId}.tmp`; await fs.writeFile(temporary, destinationPayload, { mode: 0o600, flag: "wx" }); await fs.rename(temporary, request.destination.path); await hook?.("after_destination"); }
    const currentEvents = await readEvents(request.journalPath); if (!currentEvents.some((event) => event.state === "VERIFIED")) { await appendPrivate(request.journalPath, canonical({ ...base, state: "VERIFIED" })); await hook?.("after_verified"); }
    const receipt = { schemaVersion: 2, kind: RECEIPT_KIND, operationId: request.operationId, requestSha256, tenantId: request.tenantId, scope: request.scope, state: "VERIFIED", destinationPath: request.destination.path, destinationSha256, sourceSha256: request.sources.map((source) => source.sha256), anonymizationAuthoritySha256: request.anonymizationAuthority.sha256 };
    try { await writePrivateExclusive(request.receiptPath, canonical(receipt)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return { state: "VERIFIED", receiptSha256: sha256(canonical(receipt)), destinationSha256 } as const;
  }).catch((error) => { if ((error as Error).message === "inbox_read_state_write_conflict") throw new Error("reconciliation_concurrent_operation"); throw error; });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { const [requestPath, requestSha256] = process.argv.slice(2); if (!requestPath || !requestSha256) throw new Error("usage: request-path request-sha256"); reconcileInboxReadStateRequest(requestPath, requestSha256).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)); }
