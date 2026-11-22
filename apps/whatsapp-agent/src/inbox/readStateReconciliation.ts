import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileInboxReadStateSources, type InboxReadState } from "./readStateStore.js";

const REQUEST_KIND = "CONVERTA_INBOX_READ_STATE_RECONCILIATION_V1";

type Source = { path: string; sha256: string };
type Request = {
  schemaVersion: 1;
  kind: typeof REQUEST_KIND;
  operationId: string;
  tenantId: string;
  scope: { type: "shared" } | { type: "assigned"; assignedUserId: string };
  sources: Source[];
  destination: { path: string; expectedExistingSha256: string | null };
  excludedConversationKeys: string[];
  lockPath: string;
  journalPath: string;
  receiptPath: string;
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}

function canonical(value: unknown) {
  return `${JSON.stringify(sortValue(value))}\n`;
}

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readRegularFile(file: string) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("reconciliation_file_identity");
  return fs.readFile(file);
}

async function writePrivateAtomic(file: string, payload: string) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, payload, { mode: 0o600, flag: "wx" });
  await fs.rename(temporary, file);
}

function parseRequest(raw: Buffer): Request {
  const value = JSON.parse(raw.toString("utf8")) as Request;
  if (value.schemaVersion !== 1 || value.kind !== REQUEST_KIND || !value.operationId || !value.tenantId) {
    throw new Error("reconciliation_request_schema");
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0 || !Array.isArray(value.excludedConversationKeys)) {
    throw new Error("reconciliation_request_schema");
  }
  const paths = [value.destination?.path, value.lockPath, value.journalPath, value.receiptPath, ...value.sources.map((item) => item.path)];
  if (paths.some((item) => typeof item !== "string" || !path.isAbsolute(item))) {
    throw new Error("reconciliation_path_absolute");
  }
  if (new Set(paths).size !== paths.length) throw new Error("reconciliation_path_overlap");
  if (!path.resolve(value.destination.path).split(path.sep).includes(value.tenantId)) {
    throw new Error("reconciliation_tenant_boundary");
  }
  if (value.scope?.type === "assigned" && !value.scope.assignedUserId) throw new Error("reconciliation_scope");
  if (value.scope?.type !== "shared" && value.scope?.type !== "assigned") throw new Error("reconciliation_scope");
  return value;
}

async function readState(source: Source): Promise<InboxReadState> {
  const raw = await readRegularFile(source.path);
  if (sha256(raw) !== source.sha256) throw new Error("reconciliation_source_sha256");
  return JSON.parse(raw.toString("utf8")) as InboxReadState;
}

export async function reconcileInboxReadStateRequest(requestPath: string, expectedRequestSha256: string) {
  const requestRaw = await readRegularFile(requestPath);
  const requestInfo = await fs.lstat(requestPath);
  if ((requestInfo.mode & 0o077) !== 0) throw new Error("reconciliation_request_mode");
  const requestSha256 = sha256(requestRaw);
  if (requestSha256 !== expectedRequestSha256) throw new Error("reconciliation_request_sha256");
  const request = parseRequest(requestRaw);

  try {
    const receiptRaw = await readRegularFile(request.receiptPath);
    const receipt = JSON.parse(receiptRaw.toString("utf8")) as Record<string, unknown>;
    if (receipt.operationId !== request.operationId || receipt.requestSha256 !== requestSha256 || receipt.state !== "VERIFIED") {
      throw new Error("reconciliation_receipt_conflict");
    }
    return { state: "REPLAY_VERIFIED", receiptSha256: sha256(receiptRaw) } as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(request.lockPath), { recursive: true, mode: 0o700 });
  const lock = await fs.open(request.lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("reconciliation_concurrent_operation");
    throw error;
  });
  try {
    const states = await Promise.all(request.sources.map(readState));
    const merged = reconcileInboxReadStateSources(states);
    if (!merged.ok) throw new Error(`reconciliation_${merged.code}:${merged.conversationKey}`);
    for (const key of request.excludedConversationKeys) {
      delete merged.state.lastReadAtByConversationKey[key];
      delete merged.state.manuallyUnreadByConversationKey[key];
    }
    const destinationPayload = `${JSON.stringify(merged.state, null, 2)}\n`;
    const destinationSha256 = sha256(destinationPayload);

    let existingSha256: string | null = null;
    try {
      existingSha256 = sha256(await readRegularFile(request.destination.path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existingSha256 !== request.destination.expectedExistingSha256) {
      if (existingSha256 !== destinationSha256) throw new Error("reconciliation_destination_changed");
    }

    const attempt = {
    schemaVersion: 1,
    kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_JOURNAL",
    operationId: request.operationId,
    requestSha256,
    state: "ATTEMPT",
    destinationSha256,
  };
    try {
      await writePrivateAtomic(request.journalPath, canonical(attempt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = JSON.parse((await readRegularFile(request.journalPath)).toString("utf8"));
      if (current.operationId !== request.operationId || current.requestSha256 !== requestSha256) {
        throw new Error("reconciliation_journal_conflict");
      }
    }
    if (existingSha256 !== destinationSha256) await writePrivateAtomic(request.destination.path, destinationPayload);
    const verified = { ...attempt, state: "VERIFIED" };
    await fs.writeFile(request.journalPath, canonical(verified), { mode: 0o600 });
    const receipt = {
    schemaVersion: 1,
    kind: "CONVERTA_INBOX_READ_STATE_RECONCILIATION_RECEIPT",
    operationId: request.operationId,
    requestSha256,
    state: "VERIFIED",
    destinationSha256,
    sourceSha256: request.sources.map((source) => source.sha256),
    };
    await writePrivateAtomic(request.receiptPath, canonical(receipt));
    return { state: "VERIFIED", receiptSha256: sha256(canonical(receipt)), destinationSha256 } as const;
  } finally {
    await lock.close();
    await fs.unlink(request.lockPath).catch(() => undefined);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [requestPath, requestSha256] = process.argv.slice(2);
  if (!requestPath || !requestSha256) throw new Error("usage: request-path request-sha256");
  reconcileInboxReadStateRequest(requestPath, requestSha256).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`));
}
