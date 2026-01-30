import fs from "node:fs/promises";
import path from "node:path";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";

const dataDir = path.resolve(process.cwd(), ".data");
const dataFile = path.join(dataDir, "whatsapp-events.json");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readAll(): Promise<StoredRecord[]> {
  try {
    const content = await fs.readFile(dataFile, "utf-8");
    return JSON.parse(content) as StoredRecord[];
  } catch {
    return [];
  }
}

async function writeAll(records: StoredRecord[]) {
  await ensureDataDir();
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(records, null, 2), "utf-8");
  await fs.rename(tempFile, dataFile);
}

export const jsonFileStorage: Storage = {
  async saveIncomingMessage(record: StoredRecord) {
    const records = await readAll();
    records.push(record);
    await writeAll(records);
  },
  async updateStatus(messageId: string, status: MessageStatus, extra?: Record<string, unknown>) {
    const records = await readAll();
    const index = records.findIndex((item) => item.messageId === messageId);
    if (index >= 0) {
      records[index] = {
        ...records[index],
        status,
        meta: { ...(records[index].meta ?? {}), ...(extra ?? {}) },
      };
      await writeAll(records);
    }
  },
};
