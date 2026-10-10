import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

// Same persistent .data storage convention as tenant configuration. The explicit
// absolute path MUST be shared by every API process and both release directories.
// mkdir + fsync + rename serialize processes on a single local filesystem. Never
// expire a lock or task: a crashed writer requires operator investigation.
type Task = { parent?: string; reference?: { clientId: string; campaignId: string; messageId: string }; instance: string; build: string; generation: number; kind: string; phase: string; startedAt: string };
type State = { hostId?: string; version: 1; open: boolean; generation: number; tasks: Record<string, Task>; audit: Array<{ action: string; actor: string; reason: string; at: string; generation: number; receiptId?: string; resolvedTask?: { id: string; task: Task } }> };
function executorIdentity(pid: number) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return `${fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}.${start}`;
  } catch { return "unknown"; }
}
const instance = `${process.pid}:${executorIdentity(process.pid)}:${crypto.randomUUID()}`;
const context = new AsyncLocalStorage<string>();
const build = process.env.CAMPAIGN_BUILD_ID || `guard-sha256:${crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex")}`;
export class CampaignOperationsClosed extends Error { constructor() { super("campaign_operations_closed"); } }
class CampaignLedgerUnavailable extends CampaignOperationsClosed {
  constructor(readonly reason: string) { super(); }
}
const volatileFaults = new Map<string, string>();
function pendingFault(file: string) {
  return volatileFaults.get(file) || (fs.existsSync(`${file}.uncertain`) ? "ledger_review_required" : null);
}
function retainLedgerFault(error: unknown) {
  const file = filename();
  const reason = error instanceof CampaignLedgerUnavailable ? error.reason : "ledger_io_or_corrupt";
  volatileFaults.set(file, reason);
  // Independent of the contended writer lock: every cooperating process sees
  // this sticky closed fence. Never expire/remove it, even after SQL succeeds.
  try {
    try { fs.mkdirSync(`${file}.uncertain`, { mode: 0o700 }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
    const dir = fs.openSync(path.dirname(file), "r");
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } catch {
    // With no writable filesystem we can only retain a process-local fence and
    // the already durable intent/task. Do not claim impossible durability.
    console.error("campaign_ledger_fault_fence_not_durable: operational review required");
  }
}
function lockReason(lock: string) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")) as { instance: string };
    const [pidText, identity] = owner.instance.split(":");
    const pid = Number(pidText);
    if (!Number.isInteger(pid) || pid <= 0 || !identity) return "lock_owner_unverifiable";
    try { process.kill(pid, 0); }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? "lock_abandoned" : "lock_owner_unverifiable"; }
    if (executorIdentity(pid) === "unknown") return "lock_owner_unverifiable";
    return executorIdentity(pid) === identity ? "lock_busy_live" : "lock_abandoned";
  } catch { return "lock_owner_unverifiable"; }
}
function filename() {
  const file = process.env.CAMPAIGN_OPERATIONS_FILE;
  if (!file || !path.isAbsolute(file)) throw new CampaignOperationsClosed();
  return file;
}
// An explicit single-host inventory attestation is required; machine identity
// prevents another host from reusing an open ledger. This is not host discovery.
function validatedHostId(): string | null {
  try {
    const host = fs.readFileSync("/etc/machine-id", "utf8").trim();
    return process.env.CAMPAIGN_OPERATIONS_TOPOLOGY === "single-host" && /^[a-f0-9]{32}$/.test(host) &&
      process.env.CAMPAIGN_OPERATIONS_HOST_ID === host ? host : null;
  } catch { return null; }
}
function read(file: string): State {
  if (!fs.existsSync(file)) return { version: 1, open: false, generation: 0, tasks: {}, audit: [] };
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as State;
  if (value.version !== 1 || typeof value.open !== "boolean" || !Number.isInteger(value.generation) ||
      !value.tasks || typeof value.tasks !== "object" || Array.isArray(value.tasks) || !Array.isArray(value.audit)) throw new CampaignOperationsClosed();
  if (!validatedHostId() || value.hostId !== validatedHostId() || pendingFault(file)) value.open = false;
  for (const task of Object.values(value.tasks)) if (!task || typeof task.instance !== "string" || typeof task.phase !== "string") throw new CampaignOperationsClosed();
  for (const task of Object.values(value.tasks)) {
    const pid = Number(task.instance.split(":")[0]);
    let live = Number.isInteger(pid) && pid > 0;
    if (task.instance.split(":")[1] !== executorIdentity(pid) || executorIdentity(pid) === "unknown") live = false;
    if (pid === process.pid && task.instance !== instance) live = false;
    if (live) { try { process.kill(pid, 0); } catch { live = false; } }
    if (!live) value.open = false; // Never clear an abandoned task or infer acceptance.
  }
  return value;
}
function locked<T>(fn: (state: State) => T, write = true, committed?: () => void): T {
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch (error) { throw new CampaignLedgerUnavailable((error as NodeJS.ErrnoException).code === "EEXIST" ? lockReason(lock) : "ledger_io"); }
  try {
    fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ instance }), { mode: 0o600 });
    const state = read(file);
    const result = fn(state);
    if (write) {
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      const fd = fs.openSync(tmp, "wx", 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
      const dir = fs.openSync(path.dirname(file), "r");
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
    committed?.(); // Invoke provider only after durable phase, still serialized with close.
    return result;
  } finally {
    fs.rmSync(path.join(lock, "owner.json"), { force: true });
    fs.rmdirSync(lock);
  }
}
export function campaignOperationsStatus() {
  try {
    return locked(s => ({ available: true, open: process.env.CAMPAIGN_RECOVERY_ONLY === "true" ? false : s.open, generation: s.generation,
      drained: (!s.open || process.env.CAMPAIGN_RECOVERY_ONLY === "true") && Object.keys(s.tasks).length === 0 && !pendingFault(filename()),
      ledgerFault: pendingFault(filename()),
      instance, build, tasks: Object.entries(s.tasks).map(([id, task]) => ({ id, ...task })),
      audit: s.audit.slice(-20) }), false);
  } catch (error) { return { available: false, open: false, generation: null, drained: false, instance, build, tasks: [], audit: [], ledgerFault: error instanceof CampaignLedgerUnavailable ? error.reason : "ledger_io_or_corrupt" }; }
}
export function setCampaignOperations(open: boolean, expectedGeneration: number, actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("operation_reason_required");
  locked(s => {
    if (s.generation !== expectedGeneration) throw new Error("operation_generation_conflict");
    if (open && (process.env.CAMPAIGN_RECOVERY_ONLY === "true" || Object.keys(s.tasks).length)) throw new Error("operation_not_drained");
    if (open && pendingFault(filename())) throw new Error("operation_ledger_review_required");
    if (open && !validatedHostId()) throw new Error("operation_topology_unvalidated");
    if (open) s.hostId = validatedHostId()!;
    s.open = open; s.generation++;
    s.audit.push({ action: open ? "open" : "close", actor, reason, at: new Date().toISOString(), generation: s.generation });
  });
  return campaignOperationsStatus();
}
export function campaignOperationsAreOpen() {
  if (process.env.CAMPAIGN_RECOVERY_ONLY === "true") return false;
  try { return locked(s => s.open, false); } catch { return false; }
}
function admit(kind: string, phase: string, cleanup = false) {
  if (process.env.CAMPAIGN_RECOVERY_ONLY === "true" || executorIdentity(process.pid) === "unknown") throw new CampaignOperationsClosed();
  const id = crypto.randomUUID();
  locked(s => {
    if (!s.open && !cleanup) throw new CampaignOperationsClosed();
    s.tasks[id] = { parent: context.getStore(), instance, build, generation: s.generation, kind, phase, startedAt: new Date().toISOString() };
  });
  return id;
}
function done(id: string) { locked(s => {
  if (Object.values(s.tasks).some(t => t.parent === id && t.kind === "provider")) {
    s.open = false; s.generation++;
    s.audit.push({ action: "uncertain_close", actor: instance, reason: "unfinished_child_requires_review", at: new Date().toISOString(), generation: s.generation });
  }
  delete s.tasks[id];
}); }
export function campaignTask<T>(kind: string, fn: () => Promise<T>, cleanup = false): Promise<T> {
  // Synchronous admission happens before fn's first await, including detached work.
  const id = admit(kind, "admitted", cleanup);
  return context.run(id, async () => {
    try { return await fn(); } finally {
      try { done(id); } catch (error) { retainLedgerFault(error); }
    }
  });
}
export async function campaignProviderAttempt<T>(intent: () => Promise<void>, submit: () => Promise<T>, reference?: { clientId: string; campaignId: string; messageId: string }) {
  const id = admit("provider", "intent");
  if (reference) locked(s => { s.tasks[id].reference = reference; });
  try { await intent(); } catch (error) { done(id); throw error; }
  // Persist before invoking submit, with the same lock spanning that boundary.
  // Once submitted, a lock-release error must not discard its eventual response.
  let pending: Promise<T> | undefined;
  let ledgerFailed = false;
  try {
    locked(s => {
      if (!s.open) throw new CampaignOperationsClosed();
      s.tasks[id].phase = "provider_or_uncertain";
    }, true, () => { pending = submit(); });
  } catch (error) {
    if (!pending) throw error;
    ledgerFailed = true; retainLedgerFault(error);
  }
  const result = await pending!;
  try { locked(s => { s.tasks[id].phase = "persisting"; }); }
  catch (error) { ledgerFailed = true; retainLedgerFault(error); }
  // SQL persistence by the caller takes precedence over ledger bookkeeping.
  // A known response is never transformed into a rejection by an FS exception.
  return { result, persisted: () => {
    if (ledgerFailed) return false;
    try { done(id); return true; }
    catch (error) { ledgerFailed = true; retainLedgerFault(error); return false; }
  } };
}

export function isCampaignMutation(method: string | undefined, pathname: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method || "GET")) return false;
  // Exact consent-management endpoints retain their own authentication, feature
  // policy and tenant scope. No suffix/prefix exception may admit a send route.
  if (method === "POST" && ["/app/campaigns/opt-out", "/app/campaigns/opt-out/revoke"].includes(pathname)) return false;
  // User stop actions remain available under maintenance; existing RBAC applies.
  if (/\/(pause|cancel)$/.test(pathname)) return false;
  return /^\/(app|admin)\/(campaigns|campaign-batches)(\/|$)/.test(pathname) || /^\/public-api\/v1\/campaigns(\/|$)/.test(pathname);
}

// Administrative recovery only. Caller must prove a durable reconciliation receipt.
// Archive the full task in the fsynced ledger audit; never reopen admissions here.
function archiveReconciledCampaignTask(params: {
  generation: number; taskId: string; reference: NonNullable<Task["reference"]>;
  expectedTaskHash: string; receiptId: string; actor: string;
}, reason: "durable_failed_result_no_retry" | "durable_accepted_delivered_historical_crm_disposition_no_retry") {
  if (!params.actor.trim() || !params.receiptId.trim()) throw new Error("reconciliation_actor_receipt_required");
  locked(s => {
    const prior = s.audit.find(a => a.action === "provider_reconciled" && a.receiptId === params.receiptId);
    if (prior) {
      if (reason === "durable_accepted_delivered_historical_crm_disposition_no_retry") {
        const archived = prior.resolvedTask?.task;
        if (s.open || s.generation !== params.generation + 1 || Object.keys(s.tasks).length || pendingFault(filename()) ||
          prior.reason !== reason || !archived || JSON.stringify(archived.reference) !== JSON.stringify(params.reference) ||
          crypto.createHash("sha256").update(JSON.stringify(archived, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex") !== params.expectedTaskHash) throw new Error("reconciliation_archived_result_drift");
      }
      if (prior.resolvedTask?.id !== params.taskId) throw new Error("reconciliation_receipt_conflict");
      return;
    }
    if (s.open || s.generation !== params.generation || pendingFault(filename())) throw new Error("reconciliation_guard_drift");
    if (Object.keys(s.tasks).length !== 1) throw new Error("reconciliation_other_tasks_present");
    const task = s.tasks[params.taskId];
    if (!task || task.kind !== "provider" || task.phase !== "persisting" ||
      JSON.stringify(task.reference) !== JSON.stringify(params.reference)) throw new Error("reconciliation_task_mismatch");
    const taskHash = crypto.createHash("sha256").update(JSON.stringify(task, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");
    if (taskHash !== params.expectedTaskHash) throw new Error("reconciliation_task_drift");
    s.generation++;
    s.audit.push({ action: "provider_reconciled", actor: params.actor, reason,
      at: new Date().toISOString(), generation: s.generation, receiptId: params.receiptId,
      resolvedTask: { id: params.taskId, task } });
    delete s.tasks[params.taskId]; // Resolved task survives in audit; pending tasks are never discarded.
  });
  return campaignOperationsStatus();
}

// Existing FAILED131026 callers retain their exact reason and contract.
export function acknowledgeReconciledCampaignTask(params: Parameters<typeof archiveReconciledCampaignTask>[0]) {
  return archiveReconciledCampaignTask(params, "durable_failed_result_no_retry");
}
// Only the result-specific verifier may call this administrative primitive.
export function acknowledgeAcceptedDeliveredCampaignTask(params: Parameters<typeof archiveReconciledCampaignTask>[0]) {
  return archiveReconciledCampaignTask(params, "durable_accepted_delivered_historical_crm_disposition_no_retry");
}
// Observation only: no mkdir/lock/write, no masked-open defaults. Used by the
// offline recovery verifier, not by runtime admissions or drain certification.
export function readCampaignReconciliationFence() {
  const file = filename();
  if (fs.existsSync(`${file}.lock`) || pendingFault(file)) throw new Error("reconciliation_fence_busy_or_uncertain");
  const first = fs.lstatSync(file); if (!first.isFile() || first.isSymbolicLink()) throw new Error("reconciliation_fence_file_invalid");
  const raw = fs.readFileSync(file), second = fs.lstatSync(file);
  const value = JSON.parse(raw.toString("utf8")) as State;
  if (first.ino !== second.ino || first.mtimeMs !== second.mtimeMs || first.size !== second.size ||
    !raw.equals(fs.readFileSync(file)) || fs.existsSync(`${file}.lock`) || pendingFault(file)) throw new Error("reconciliation_fence_read_incomplete");
  if (value.version !== 1 || typeof value.open !== "boolean" || !Number.isInteger(value.generation) ||
    !value.tasks || typeof value.tasks !== "object" || Array.isArray(value.tasks) || !Array.isArray(value.audit) ||
    !validatedHostId() || value.hostId !== validatedHostId()) throw new Error("reconciliation_fence_schema_or_topology_invalid");
  return value;
}
