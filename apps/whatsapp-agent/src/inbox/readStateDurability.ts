import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export async function fsyncDirectory(directory: string) {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeDurableAtomic(targetFile: string, payload: string, temporaryFile: string) {
  const directory = path.dirname(targetFile);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let createdByInvocation = false;
  try {
    try {
      const handle = await fs.open(temporaryFile, "wx", 0o600);
      createdByInvocation = true;
      try {
        await handle.writeFile(payload, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (createdByInvocation || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const handle = await fs.open(temporaryFile, constants.O_RDWR | constants.O_NOFOLLOW);
      try {
        const info = await handle.stat();
        const existing = await handle.readFile("utf8");
        if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || existing !== payload) {
          throw new Error("read_state_durable_temporary_conflict");
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    await fs.rename(temporaryFile, targetFile);
    await fsyncDirectory(directory);
  } catch (error) {
    if (createdByInvocation) {
      await fs.unlink(temporaryFile).catch((unlinkError) => {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      });
    }
    throw error;
  }
}

export async function writeDurableExclusive(targetFile: string, payload: string) {
  const directory = path.dirname(targetFile);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await fs.open(targetFile, "wx", 0o600);
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDirectory(directory);
}
