import fs from "node:fs/promises";
import path from "node:path";

export class InboxReadStateWriteConflict extends Error {
  constructor() {
    super("inbox_read_state_write_conflict");
  }
}

export function inboxReadStateLockPath(targetFile: string) {
  return `${targetFile}.write-lock`;
}

export async function withInboxReadStateWriteLock<T>(targetFile: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = inboxReadStateLockPath(targetFile);
  await fs.mkdir(path.dirname(targetFile), { recursive: true, mode: 0o700 });
  try {
    await fs.mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new InboxReadStateWriteConflict();
    throw error;
  }
  try {
    return await fn();
  } finally {
    await fs.rmdir(lockPath);
  }
}
