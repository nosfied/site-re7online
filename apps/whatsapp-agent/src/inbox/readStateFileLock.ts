import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fsyncDirectory, writeDurableExclusive } from "./readStateDurability.js";

const LOCK_KIND = "CONVERTA_INBOX_READ_STATE_WRITE_LOCK_V1";
const MAX_ACQUIRE_ATTEMPTS = 8;

type LockAuthority = {
  schemaVersion: 1;
  kind: typeof LOCK_KIND;
  targetPath: string;
  bootId: string;
  pid: number;
  processStartTicks: string;
  nonce: string;
};

export class InboxReadStateWriteConflict extends Error {
  constructor(readonly reason = "active") {
    super("inbox_read_state_write_conflict");
  }
}

export function inboxReadStateLockPath(targetFile: string) {
  return `${targetFile}.write-lock`;
}

function canonicalLock(authority: LockAuthority) {
  return `${JSON.stringify(authority)}\n`;
}

async function readBootId() {
  return (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
}

async function readProcessStartTicks(pid: number) {
  const raw = await fs.readFile(`/proc/${pid}/stat`, "utf8");
  const commandEnd = raw.lastIndexOf(")");
  const fields = commandEnd < 0 ? [] : raw.slice(commandEnd + 2).trim().split(/\s+/);
  const startTicks = fields[19];
  if (!startTicks || !/^\d+$/.test(startTicks)) throw new Error("inbox_read_state_lock_process_identity");
  return startTicks;
}

async function currentAuthority(targetFile: string): Promise<LockAuthority> {
  return {
    schemaVersion: 1,
    kind: LOCK_KIND,
    targetPath: path.resolve(targetFile),
    bootId: await readBootId(),
    pid: process.pid,
    processStartTicks: await readProcessStartTicks(process.pid),
    nonce: crypto.randomUUID(),
  };
}

function parseAuthority(raw: string, targetFile: string): LockAuthority {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InboxReadStateWriteConflict("authority_invalid");
  }
  const authority = value as Partial<LockAuthority>;
  if (
    authority.schemaVersion !== 1 || authority.kind !== LOCK_KIND ||
    authority.targetPath !== path.resolve(targetFile) ||
    typeof authority.bootId !== "string" || !authority.bootId ||
    !Number.isSafeInteger(authority.pid) || Number(authority.pid) <= 0 ||
    typeof authority.processStartTicks !== "string" || !/^\d+$/.test(authority.processStartTicks) ||
    typeof authority.nonce !== "string" || !authority.nonce
  ) throw new InboxReadStateWriteConflict("authority_invalid");
  return authority as LockAuthority;
}

async function readAuthenticatedLock(lockPath: string, targetFile: string) {
  const info = await fs.lstat(lockPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 || info.nlink !== 1) {
    throw new InboxReadStateWriteConflict("identity_invalid");
  }
  const raw = await fs.readFile(lockPath, "utf8");
  return { authority: parseAuthority(raw, targetFile), info, raw };
}

async function authorityIsActive(authority: LockAuthority) {
  if (authority.bootId !== await readBootId()) return false;
  try {
    return await readProcessStartTicks(authority.pid) === authority.processStartTicks;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new InboxReadStateWriteConflict("process_identity_unavailable");
  }
}

async function recoverOrphan(lockPath: string, targetFile: string) {
  const observed = await readAuthenticatedLock(lockPath, targetFile);
  if (await authorityIsActive(observed.authority)) throw new InboxReadStateWriteConflict();
  const quarantine = `${lockPath}.orphan-${process.pid}-${crypto.randomUUID()}`;
  try {
    await fs.rename(lockPath, quarantine);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const moved = await fs.lstat(quarantine);
  const movedRaw = await fs.readFile(quarantine, "utf8");
  if (moved.dev !== observed.info.dev || moved.ino !== observed.info.ino || movedRaw !== observed.raw) {
    try {
      await fs.link(quarantine, lockPath);
      await fs.unlink(quarantine);
      await fsyncDirectory(path.dirname(lockPath));
    } catch (restoreError) {
      if ((restoreError as NodeJS.ErrnoException).code !== "EEXIST") throw restoreError;
    }
    throw new InboxReadStateWriteConflict("orphan_identity_changed");
  }
  await fs.unlink(quarantine);
  await fsyncDirectory(path.dirname(lockPath));
}

async function acquire(targetFile: string) {
  const lockPath = inboxReadStateLockPath(targetFile);
  const authority = await currentAuthority(targetFile);
  const raw = canonicalLock(authority);
  const pending = `${lockPath}.pending-${authority.pid}-${authority.nonce}`;
  await writeDurableExclusive(pending, raw);
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    try {
      await fs.link(pending, lockPath);
      await fsyncDirectory(path.dirname(lockPath));
      await fs.unlink(pending);
      await fsyncDirectory(path.dirname(lockPath));
      const acquired = await readAuthenticatedLock(lockPath, targetFile);
      if (acquired.raw !== raw) throw new InboxReadStateWriteConflict("publication_mismatch");
      return { lockPath, authority, raw, info: acquired.info };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        await fs.unlink(pending).catch(() => undefined);
        throw error;
      }
      try {
        await recoverOrphan(lockPath, targetFile);
      } catch (recoveryError) {
        await fs.unlink(pending).catch(() => undefined);
        await fsyncDirectory(path.dirname(lockPath));
        throw recoveryError;
      }
    }
  }
  await fs.unlink(pending).catch(() => undefined);
  throw new InboxReadStateWriteConflict("acquire_retry_exhausted");
}

async function release(acquired: Awaited<ReturnType<typeof acquire>>) {
  const current = await readAuthenticatedLock(acquired.lockPath, acquired.authority.targetPath);
  if (current.info.dev !== acquired.info.dev || current.info.ino !== acquired.info.ino || current.raw !== acquired.raw) {
    throw new InboxReadStateWriteConflict("release_identity_changed");
  }
  await fs.unlink(acquired.lockPath);
  await fsyncDirectory(path.dirname(acquired.lockPath));
}

export async function withInboxReadStateWriteLock<T>(targetFile: string, fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(targetFile), { recursive: true, mode: 0o700 });
  const acquired = await acquire(targetFile);
  try {
    return await fn();
  } finally {
    await release(acquired);
  }
}
