import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dataDir = path.join(process.cwd(), ".data");

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] || null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    clientKey: readArg(args, "--client-key"),
  };
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeHandoffStatus(value) {
  const normalized = String(value || "none").toLowerCase();
  if (normalized === "pending") return "PENDING";
  if (normalized === "active") return "ACTIVE";
  if (normalized === "PENDING" || normalized === "ACTIVE") return normalized;
  return "NONE";
}

function normalizeOperationalStatus(value) {
  const normalized = String(value || "").toUpperCase();
  return ["WAITING", "IN_PROGRESS", "WAITING_USER", "CLOSED"].includes(normalized)
    ? normalized
    : null;
}

function jsonView(state) {
  return {
    mode: state.mode ?? null,
    handoffStatus: normalizeHandoffStatus(state.handoff?.status),
    assignedUserId: state.assignedUserId ?? null,
    departmentId: state.departmentId ?? null,
    queueId: state.queueId ?? null,
    status: normalizeOperationalStatus(state.status),
    lastInboundAt: toIso(state.lastInboundAt),
    lastOutboundAt: toIso(state.lastOutboundAt),
  };
}

function dbView(state) {
  return {
    mode: state.mode ?? null,
    handoffStatus: state.handoffStatus ?? "NONE",
    assignedUserId: state.assignedUserId ?? null,
    departmentId: state.departmentId ?? null,
    queueId: state.queueId ?? null,
    status: state.status ?? null,
    lastInboundAt: toIso(state.lastInboundAt),
    lastOutboundAt: toIso(state.lastOutboundAt),
  };
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

function diffFields(left, right) {
  return Object.keys(left).filter((key) => (left[key] ?? null) !== (right[key] ?? null));
}

async function run() {
  const options = parseArgs();
  const clientKeys = await listClientKeys(options.clientKey);
  const summary = {
    event: "runtime_state.validation.completed",
    clientsScanned: 0,
    recordsScanned: 0,
    missingInPostgres: 0,
    mismatches: 0,
    samples: [],
  };

  for (const clientKey of clientKeys) {
    const client = await prisma.client.findUnique({
      where: { clientKey },
      select: { id: true },
    });
    if (!client) continue;
    const filePath = path.join(dataDir, clientKey, "conversations.json");
    const states = await readJson(filePath);
    if (!Array.isArray(states)) continue;
    summary.clientsScanned += 1;

    for (const state of states) {
      if (!state?.waId) continue;
      summary.recordsScanned += 1;
      const db = await prisma.conversationRuntimeState.findUnique({
        where: { clientId_waId: { clientId: client.id, waId: state.waId } },
      });
      if (!db) {
        summary.missingInPostgres += 1;
        if (summary.samples.length < 20) {
          summary.samples.push({ clientKey, waId: state.waId, kind: "missing_in_postgres" });
        }
        continue;
      }
      const fields = diffFields(jsonView(state), dbView(db));
      if (fields.length > 0) {
        summary.mismatches += 1;
        if (summary.samples.length < 20) {
          summary.samples.push({
            clientKey,
            waId: state.waId,
            kind: "field_mismatch",
            fields,
          });
        }
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.missingInPostgres > 0 || summary.mismatches > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "runtime_state.validation.failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
