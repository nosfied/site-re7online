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
type State = { version: 1; open: boolean; generation: number; tasks: Record<string, Task>; audit: Array<{ action: string; actor: string; reason: string; at: string; generation: number }> };
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
function filename() {
  const file = process.env.CAMPAIGN_OPERATIONS_FILE;
  if (!file || !path.isAbsolute(file)) throw new CampaignOperationsClosed();
  return file;
}
function read(file: string): State {
  if (!fs.existsSync(file)) return { version: 1, open: false, generation: 0, tasks: {}, audit: [] };
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as State;
  if (value.version !== 1 || typeof value.open !== "boolean" || !Number.isInteger(value.generation) ||
      !value.tasks || typeof value.tasks !== "object" || Array.isArray(value.tasks) || !Array.isArray(value.audit)) throw new CampaignOperationsClosed();
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
function locked<T>(fn: (state: State) => T, write = true): T {
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch { throw new CampaignOperationsClosed(); }
  try {
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
    return result;
  } finally { fs.rmdirSync(lock); }
}
export function campaignOperationsStatus() {
  try {
    return locked(s => ({ available: true, open: true /* recovery artifact: campaigns cannot open */ ? false : s.open, generation: s.generation,
      drained: (!s.open || true /* recovery artifact: campaigns cannot open */) && Object.keys(s.tasks).length === 0 && !fs.existsSync(`${filename()}.uncertain`),
      instance, build, tasks: Object.entries(s.tasks).map(([id, task]) => ({ id, ...task })),
      audit: s.audit.slice(-20) }), false);
  } catch { return { available: false, open: false, generation: null, drained: false, instance, build, tasks: [], audit: [] }; }
}
export function setCampaignOperations(open: boolean, expectedGeneration: number, actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("operation_reason_required");
  locked(s => {
    if (s.generation !== expectedGeneration) throw new Error("operation_generation_conflict");
    if (open && (true /* recovery artifact: campaigns cannot open */ || Object.keys(s.tasks).length)) throw new Error("operation_not_drained");
    s.open = open; s.generation++;
    s.audit.push({ action: open ? "open" : "close", actor, reason, at: new Date().toISOString(), generation: s.generation });
  });
  return campaignOperationsStatus();
}
export function campaignOperationsAreOpen() {
  if (true /* recovery artifact: campaigns cannot open */) return false;
  try { return locked(s => s.open, false); } catch { return false; }
}
function admit(kind: string, phase: string, cleanup = false) {
  if (true /* recovery artifact: campaigns cannot open */ || executorIdentity(process.pid) === "unknown") throw new CampaignOperationsClosed();
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
    try { return await fn(); } finally { done(id); }
  });
}
export async function campaignProviderAttempt<T>(intent: () => Promise<void>, submit: () => Promise<T>, reference?: { clientId: string; campaignId: string; messageId: string }) {
  const id = admit("provider", "intent");
  if (reference) locked(s => { s.tasks[id].reference = reference; });
  try { await intent(); } catch (error) { done(id); throw error; }
  // Serialize the actual invocation with close, not just HTTP admission. If
  // intent persistence races close, preserve that intent for explicit review.
  try {
    const pending = locked(s => {
      if (!s.open) throw new CampaignOperationsClosed();
      s.tasks[id].phase = "provider_or_uncertain";
      return submit();
    });
    const result = await pending;
    locked(s => { s.tasks[id].phase = "persisting"; });
    return { result, persisted: () => done(id) };
  } catch (error) {
    // No timeout or restart clears this. Existing domain intent/results are the
    // reconciliation evidence; this ledger never claims delivery.
    throw error;
  }
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
