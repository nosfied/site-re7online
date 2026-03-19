#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const sanitizeClientKey = (value) => value.replace(/[^a-zA-Z0-9._-]/g, "_");
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");
const CLIENT_KEY = process.env.CLIENT_KEY ? sanitizeClientKey(process.env.CLIENT_KEY) : "";
const TTL_DAYS = Number(process.env.TTL_DAYS ?? "7");
const eventsFile = CLIENT_KEY
  ? path.join(DATA_DIR, CLIENT_KEY, "whatsapp-events.json")
  : path.join(DATA_DIR, "whatsapp-events.json");

const ttlMs = Number.isNaN(TTL_DAYS) ? 7 * 24 * 60 * 60 * 1000 : TTL_DAYS * 24 * 60 * 60 * 1000;
const cutoff = Date.now() - ttlMs;

function toMs(item) {
  const createdAt = item?.createdAt;
  if (createdAt) {
    const ts = Date.parse(createdAt);
    if (Number.isFinite(ts)) return ts;
  }
  const rawTs = item?.timestamp;
  if (rawTs !== undefined && rawTs !== null) {
    const n = Number(rawTs);
    if (Number.isFinite(n)) {
      return n < 1e12 ? n * 1000 : n;
    }
  }
  return null;
}

async function run() {
  let raw;
  try {
    raw = await fs.readFile(eventsFile, "utf-8");
  } catch {
    console.error(`WARN: ${eventsFile} não encontrado`);
    process.exit(0);
  }
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    console.error("FAIL: whatsapp-events.json não é array");
    process.exit(1);
  }

  const before = data.length;
  const filtered = data.filter((item) => {
    const messageId = String(item?.messageId ?? "");
    if (!messageId.startsWith("wamid.e2e.")) return true;
    const ts = toMs(item);
    if (ts === null) return true;
    return ts >= cutoff;
  });
  const removed = before - filtered.length;

  if (removed === 0) {
    console.log(`OK: no e2e events removed (total=${before})`);
    return;
  }

  const tmp = `${eventsFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(filtered, null, 2));
  await fs.rename(tmp, eventsFile);
  console.log(`OK: removed=${removed} before=${before} after=${filtered.length}`);
}

run().catch((err) => {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
});
