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
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(temporaryFile, "wx", 0o600);
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryFile, targetFile);
    await fsyncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryFile).catch((unlinkError) => {
      if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
    });
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
