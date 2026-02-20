#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] ?? "";
};

const lead = getArg("--lead");
const attendant = getArg("--attendant");
const resetEvents = args.includes("--events");

if (!lead || !attendant) {
  console.error("FAIL: use --lead <waId> --attendant <waId> [--events]");
  process.exit(1);
}

const dataDir = path.resolve(process.cwd(), ".data");
const conversationsFile = path.join(dataDir, "conversations.json");
const eventsFile = path.join(dataDir, "whatsapp-events.json");

async function backupFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(dataDir, `backup-${ts}`);
  await fs.mkdir(backupDir, { recursive: true });
  const dest = path.join(backupDir, path.basename(filePath));
  await fs.copyFile(filePath, dest);
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
await resetConversations();
await resetEventsFile();
console.log("OK: reset-e2e-state");
