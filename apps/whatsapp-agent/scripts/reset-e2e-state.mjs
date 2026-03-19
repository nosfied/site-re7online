#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] ?? "";
};

const sanitizeClientKey = (value) => value.replace(/[^a-zA-Z0-9._-]/g, "_");

const lead = getArg("--lead");
const attendant = getArg("--attendant");
const tenant = getArg("--tenant");
const resetEvents = args.includes("--events");

if (!lead || !attendant) {
  console.error("FAIL: use --lead <waId> --attendant <waId> [--tenant <clientKey>] [--events]");
  process.exit(1);
}

const dataRootDir = path.resolve(process.cwd(), ".data");
const dataDir = tenant
  ? path.join(dataRootDir, sanitizeClientKey(tenant))
  : dataRootDir;
const conversationsFile = path.join(dataDir, "conversations.json");
const eventsFile = path.join(dataDir, "whatsapp-events.json");
const BACKUP_MIN_INTERVAL_MINUTES = Number(
  process.env.BACKUP_MIN_INTERVAL_MINUTES ?? "60"
);
const BACKUP_MAX_DIRS = Number(process.env.BACKUP_MAX_DIRS ?? "10");

let cachedBackupDir = null;

async function getBackupDir() {
  if (cachedBackupDir !== null) return cachedBackupDir;
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const backupDirs = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith("backup-"))
        .map(async (e) => {
          const full = path.join(dataDir, e.name);
          const stat = await fs.stat(full);
          return { name: e.name, full, mtimeMs: stat.mtimeMs };
        })
    );
    backupDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = backupDirs[0];
    if (latest) {
      const minMs = (Number.isNaN(BACKUP_MIN_INTERVAL_MINUTES) ? 60 : BACKUP_MIN_INTERVAL_MINUTES) * 60 * 1000;
      if (Date.now() - latest.mtimeMs < minMs) {
        cachedBackupDir = null;
        return null;
      }
    }
  } catch {
    // ignore read errors
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(dataDir, `backup-${ts}`);
  await fs.mkdir(backupDir, { recursive: true });
  cachedBackupDir = backupDir;
  return backupDir;
}

async function backupFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  const backupDir = await getBackupDir();
  if (!backupDir) return;
  const dest = path.join(backupDir, path.basename(filePath));
  await fs.copyFile(filePath, dest);
}

async function enforceBackupRetention() {
  if (Number.isNaN(BACKUP_MAX_DIRS) || BACKUP_MAX_DIRS <= 0) return;
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const backupDirs = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith("backup-"))
      .map(async (e) => {
        const full = path.join(dataDir, e.name);
        const stat = await fs.stat(full);
        return { name: e.name, full, mtimeMs: stat.mtimeMs };
      })
  );
  backupDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toRemove = backupDirs.slice(BACKUP_MAX_DIRS);
  for (const dir of toRemove) {
    await fs.rm(dir.full, { recursive: true, force: true });
  }
}

async function resetConversations() {
  let raw;
  try {
    raw = await fs.readFile(conversationsFile, "utf-8");
  } catch {
    console.error("WARN: conversations.json não encontrado");
    return;
  }
  const conversations = JSON.parse(raw);
  if (!Array.isArray(conversations)) return;

  const targets = new Set([lead, attendant]);
  const epochIso = new Date(0).toISOString();
  const baseConversation = (waId, isAttendant = false) => ({
    waId,
    firstSeenAt: epochIso,
    lastInboundAt: epochIso,
    window: {
      isOpen: false,
      expiresAt: epochIso,
    },
    handoff: { status: "none" },
    demoStatus: "none",
    answers: {},
    ...(isAttendant ? { window: { isOpen: false, expiresAt: epochIso } } : {}),
  });
  const resetKeys = [
    "intent",
    "lastIntent",
    "templateNeeded",
    "templateSuggested",
    "lastNeedAt",
    "lastInboundAt",
    "lastOutboundAt",
    "lastInboundMessageId",
    "lastOutboundMessageId",
    "leadRequestedAt",
    "leadCapturedAt",
    "demoStatus",
    "lastDemoRequestedAt",
    "lastDemoScheduledAt",
    "demoPreferredSchedule",
    "lastHandoffDemoScheduledKey",
    "lastHandoffDemoScheduledAt",
    "flow",
    "flowStep",
    "window",
  ];

  const updated = conversations.map((conv) => {
    if (!targets.has(conv.waId)) return conv;
    const next = { ...conv };
    for (const key of resetKeys) {
      delete next[key];
    }
    next.demoStatus = "none";
    next.answers = {};
    next.handoff = { status: "none" };
    if (conv.waId === attendant) {
      next.window = {
        isOpen: false,
        expiresAt: new Date(0).toISOString(),
      };
    }
    return next;
  });

  const existing = new Set(updated.map((conv) => conv.waId));
  if (!existing.has(lead)) {
    updated.push(baseConversation(lead, false));
  }
  if (!existing.has(attendant)) {
    updated.push(baseConversation(attendant, true));
  }

  await fs.writeFile(conversationsFile, JSON.stringify(updated, null, 2));
}

async function resetEventsFile() {
  if (!resetEvents) return;
  let raw;
  try {
    raw = await fs.readFile(eventsFile, "utf-8");
  } catch {
    console.error("WARN: whatsapp-events.json não encontrado");
    return;
  }
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) return;
  const filtered = records.filter((item) => {
    const messageId = String(item?.messageId ?? "");
    if (messageId.startsWith("wamid.e2e.")) return false;
    return true;
  });
  await fs.writeFile(eventsFile, JSON.stringify(filtered, null, 2));
}

await fs.mkdir(dataDir, { recursive: true });
await backupFile(conversationsFile);
if (resetEvents) await backupFile(eventsFile);
await enforceBackupRetention();
await resetConversations();
await resetEventsFile();
console.log("OK: reset-e2e-state");
