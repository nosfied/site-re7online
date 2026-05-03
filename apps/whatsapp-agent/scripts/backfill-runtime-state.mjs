import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, ConversationOperationalStatus, HandoffStatus } from "@prisma/client";

const prisma = new PrismaClient();
const appDir = path.resolve(process.cwd());
const dataDir = path.join(appDir, ".data");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    clientKey: readArg(args, "--client-key"),
    dryRun: args.includes("--dry-run"),
  };
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] || null;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toHandoffStatus(value) {
  const normalized = String(value || "none").toLowerCase();
  if (normalized === "pending") return HandoffStatus.PENDING;
  if (normalized === "active") return HandoffStatus.ACTIVE;
  return HandoffStatus.NONE;
}

function toOperationalStatus(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "WAITING") return ConversationOperationalStatus.WAITING;
  if (normalized === "IN_PROGRESS") return ConversationOperationalStatus.IN_PROGRESS;
  if (normalized === "WAITING_USER") return ConversationOperationalStatus.WAITING_USER;
  if (normalized === "CLOSED") return ConversationOperationalStatus.CLOSED;
  return null;
}

function normalizeDemoStatus(value) {
  if (value === "requested" || value === "scheduled") return value;
  return "none";
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function listClientKeys(requestedClientKey) {
  if (requestedClientKey) return [requestedClientKey];
  const entries = await fs.readdir(dataDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function buildData(clientId, state, refs) {
  const departmentId = state.departmentId && refs.departmentIds.has(state.departmentId)
    ? state.departmentId
    : null;
  const queueId = state.queueId && refs.queueIds.has(state.queueId)
    ? state.queueId
    : null;
  return {
    clientId,
    waId: state.waId,
    waIdCanonical: state.waIdCanonical ?? null,
    conversationKey: state.conversationKey ?? null,
    firstSeenAt: toDate(state.firstSeenAt),
    windowIsOpen: Boolean(state.window?.isOpen),
    windowExpiresAt: toDate(state.window?.expiresAt),
    lastInboundAt: toDate(state.lastInboundAt),
    lastOutboundAt: toDate(state.lastOutboundAt),
    lastInboundMessageId: state.lastInboundMessageId ?? null,
    lastOutboundMessageId: state.lastOutboundMessageId ?? null,
    intent: state.intent ?? null,
    handoffStatus: toHandoffStatus(state.handoff?.status),
    handoffRequestedAt: toDate(state.handoff?.requestedAt),
    handoffActivatedAt: toDate(state.handoff?.activatedAt),
    handoffReleasedAt: toDate(state.handoff?.releasedAt),
    templateNeeded: state.templateNeeded ?? false,
    templateSuggested: state.templateSuggested ?? null,
    lastNeedAt: toDate(state.lastNeedAt),
    lastIntent: state.lastIntent ?? null,
    leadRequestedAt: toDate(state.leadRequestedAt),
    leadCapturedAt: toDate(state.leadCapturedAt),
    demoStatus: normalizeDemoStatus(state.demoStatus),
    lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
    lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
    demoPreferredSchedule: state.demoPreferredSchedule ?? null,
    lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
    lastHandoffDemoScheduledAt: toDate(state.lastHandoffDemoScheduledAt),
    flow: state.flow ?? null,
    flowStep: Number.isInteger(state.flowStep) ? state.flowStep : null,
    chatbotNodeId: state.chatbotNodeId ?? null,
    chatbotActive: state.chatbotActive ?? false,
    answers: state.answers ?? {},
    mode: state.mode ?? null,
    assignedUserId: state.assignedUserId ?? null,
    assignedTo: state.assignedTo ?? null,
    assignedAt: toDate(state.assignedAt),
    departmentId,
    queueId,
    status: toOperationalStatus(state.status),
    closedAt: toDate(state.closedAt),
  };
}

async function run() {
  const options = parseArgs();
  const clientKeys = await listClientKeys(options.clientKey);
  const summary = {
    event: "runtime_state.backfill.completed",
    dryRun: options.dryRun,
    clientsScanned: 0,
    recordsScanned: 0,
    recordsUpserted: 0,
    clientsMissing: [],
    filesMissing: [],
    invalidReferences: 0,
  };

  for (const clientKey of clientKeys) {
    const client = await prisma.client.findUnique({
      where: { clientKey },
      select: { id: true, clientKey: true },
    });
    if (!client) {
      summary.clientsMissing.push(clientKey);
      continue;
    }
    const filePath = path.join(dataDir, clientKey, "conversations.json");
    const states = await readJson(filePath);
    if (!Array.isArray(states)) {
      summary.filesMissing.push(filePath);
      continue;
    }
    const departmentIds = Array.from(new Set(states.map((state) => state?.departmentId).filter(Boolean)));
    const queueIds = Array.from(new Set(states.map((state) => state?.queueId).filter(Boolean)));
    const [departments, queues] = await Promise.all([
      departmentIds.length
        ? prisma.department.findMany({
            where: { clientId: client.id, id: { in: departmentIds } },
            select: { id: true },
          })
        : [],
      queueIds.length
        ? prisma.queue.findMany({
            where: { clientId: client.id, id: { in: queueIds } },
            select: { id: true },
          })
        : [],
    ]);
    const refs = {
      departmentIds: new Set(departments.map((item) => item.id)),
      queueIds: new Set(queues.map((item) => item.id)),
    };

    summary.clientsScanned += 1;
    for (const state of states) {
      if (!state?.waId) continue;
      summary.recordsScanned += 1;
      if (state.departmentId && !refs.departmentIds.has(state.departmentId)) {
        summary.invalidReferences += 1;
      }
      if (state.queueId && !refs.queueIds.has(state.queueId)) {
        summary.invalidReferences += 1;
      }
      const data = buildData(client.id, state, refs);
      if (!options.dryRun) {
        await prisma.conversationRuntimeState.upsert({
          where: { clientId_waId: { clientId: client.id, waId: state.waId } },
          create: data,
          update: { ...data, version: { increment: 1 } },
        });
      }
      summary.recordsUpserted += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "runtime_state.backfill.failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
