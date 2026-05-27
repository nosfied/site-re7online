#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  EventRetentionCategory,
  classifyEventRetentionPolicy,
} from "../src/events/eventRetentionPolicy.js";

type Options = {
  dryRun: boolean;
  days: number;
  clientKey?: string;
  includeNoise: boolean;
  noiseOnly: boolean;
  compactOnly: boolean;
  confirmOperational: boolean;
  json: boolean;
};

type RetentionReport = {
  generatedAt: string;
  dryRun: boolean;
  filters: {
    clientKey: string | null;
    days: number;
    noiseDays: number;
    includeNoise: boolean;
    noiseOnly: boolean;
    compactOnly: boolean;
    confirmOperational: boolean;
  };
  scanned: number;
  critical: number;
  operational: number;
  noise: number;
  compacted: number;
  deleted: number;
  skipped: number;
  affectedEventNames: Array<{
    eventName: string;
    category: EventRetentionCategory;
    count: number;
  }>;
};

const DEFAULT_OPERATIONAL_RETENTION_DAYS = 90;
const DEFAULT_NOISE_RETENTION_DAYS = 15;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    days: DEFAULT_OPERATIONAL_RETENTION_DAYS,
    includeNoise: false,
    noiseOnly: false,
    compactOnly: false,
    confirmOperational: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--days": {
        if (!next || next.startsWith("--")) throw new Error("--days exige um valor");
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
          throw new Error(`--days inválido: ${next}`);
        }
        options.days = parsed;
        index += 1;
        break;
      }
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error("--client-key exige um valor");
        options.clientKey = next;
        index += 1;
        break;
      case "--include-noise":
        options.includeNoise = true;
        break;
      case "--noise-only":
        options.noiseOnly = true;
        break;
      case "--compact-only":
        options.compactOnly = true;
        break;
      case "--confirm-operational":
        options.confirmOperational = true;
        break;
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
  }

  if (options.noiseOnly && !options.includeNoise) {
    throw new Error("--noise-only exige --include-noise");
  }

  return options;
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function subtractDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function logEvent(event: string, payload: Record<string, unknown>) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

async function resolveClientId(prisma: PrismaClient, clientKey?: string) {
  if (!clientKey) return null;
  const client = await prisma.client.findUnique({
    where: { clientKey },
    select: { id: true },
  });
  return client?.id ?? null;
}

async function getEventNameCounts(
  prisma: PrismaClient,
  where: Prisma.EventWhereInput,
  cutoffs: Record<EventRetentionCategory, Date>
): Promise<Array<{ eventName: string; count: number; category: EventRetentionCategory }>> {
  const grouped = await prisma.event.groupBy({
    by: ["eventName"],
    where,
    _count: { _all: true },
  });
  const counts = await Promise.all(
    grouped.map(async (row) => {
      const category = classifyEventRetentionPolicy(row.eventName);
      const count = await prisma.event.count({
        where: {
          ...where,
          eventName: row.eventName,
          createdAt: { lt: cutoffs[category] },
        },
      });
      return {
        eventName: row.eventName,
        count,
        category,
      };
    })
  );
  return counts.filter((row) => row.count > 0).sort((left, right) => right.count - left.count);
}

async function compactOperationalEvents(params: {
  prisma: PrismaClient;
  clientId: string | null;
  cutoff: Date;
  eventNames: string[];
  dryRun: boolean;
}) {
  if (params.eventNames.length === 0) return { compacted: 0, skipped: 0 };

  const rows = await params.prisma.$queryRaw<
    Array<{
      clientId: string;
      eventName: string;
      count: bigint;
      firstAt: Date;
      lastAt: Date;
    }>
  >`
    SELECT "clientId", "eventName", COUNT(*) AS count, MIN("createdAt") AS "firstAt", MAX("createdAt") AS "lastAt"
    FROM "Event"
    WHERE "createdAt" < ${params.cutoff}
    AND "eventName" IN (${Prisma.join(params.eventNames)})
    ${params.clientId ? Prisma.sql`AND "clientId" = ${params.clientId}` : Prisma.empty}
    GROUP BY "clientId", "eventName"
  `;

  if (params.dryRun) return { compacted: rows.length, skipped: 0 };

  let compacted = 0;
  let skipped = 0;
  for (const row of rows) {
    const bucket = params.cutoff.toISOString().slice(0, 10);
    const requestId = `events-retention:${row.clientId}:${row.eventName}:${bucket}`;
    try {
      await params.prisma.event.create({
        data: {
          clientId: row.clientId,
          eventName: "events.retention.compacted",
          requestId,
          payloadJson: {
            action: "events.retention.compacted",
            originalEventName: row.eventName,
            count: toNumber(row.count),
            firstAt: row.firstAt.toISOString(),
            lastAt: row.lastAt.toISOString(),
            cutoff: params.cutoff.toISOString(),
          },
        },
      });
      compacted += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  if (compacted > 0) logEvent("events.retention.compacted", { compacted });
  return { compacted, skipped };
}

async function executeEventsRetention(prisma: PrismaClient, options: Options): Promise<RetentionReport> {
  const clientId = await resolveClientId(prisma, options.clientKey);
  const noiseDays = Math.min(options.days, DEFAULT_NOISE_RETENTION_DAYS);
  if (options.clientKey && !clientId) {
    return {
      generatedAt: new Date().toISOString(),
      dryRun: options.dryRun,
      filters: {
        clientKey: options.clientKey,
        days: options.days,
        noiseDays,
        includeNoise: options.includeNoise,
        noiseOnly: options.noiseOnly,
        compactOnly: options.compactOnly,
        confirmOperational: options.confirmOperational,
      },
      scanned: 0,
      critical: 0,
      operational: 0,
      noise: 0,
      compacted: 0,
      deleted: 0,
      skipped: 0,
      affectedEventNames: [],
    };
  }

  const operationalCutoff = subtractDays(options.days);
  const noiseCutoff = subtractDays(noiseDays);
  const scopedWhere: Prisma.EventWhereInput = clientId ? { clientId } : {};
  const eventNameCounts = await getEventNameCounts(prisma, scopedWhere, {
    CRITICAL: operationalCutoff,
    OPERATIONAL: operationalCutoff,
    NOISE: noiseCutoff,
  });

  const filteredEventNameCounts = options.noiseOnly
    ? eventNameCounts.filter((item) => item.category === "NOISE")
    : eventNameCounts;

  const operationalEventNames = filteredEventNameCounts
    .filter((item) => item.category === "OPERATIONAL")
    .map((item) => item.eventName);
  const noiseEventNames = filteredEventNameCounts
    .filter((item) => item.category === "NOISE")
    .map((item) => item.eventName);

  if (!options.dryRun && operationalEventNames.length > 0 && !options.confirmOperational) {
    throw new Error(
      "execução real com eventos OPERATIONAL exige --confirm-operational; use --noise-only para limpar somente ruído"
    );
  }

  const compactResult = await compactOperationalEvents({
    prisma,
    clientId,
    cutoff: operationalCutoff,
    eventNames: operationalEventNames,
    dryRun: options.dryRun,
  });

  let deleted = 0;
  if (!options.dryRun && !options.compactOnly && operationalEventNames.length > 0) {
    const result = await prisma.event.deleteMany({
      where: {
        ...scopedWhere,
        eventName: { in: operationalEventNames },
        createdAt: { lt: operationalCutoff },
      },
    });
    deleted += result.count;
    if (result.count > 0) logEvent("events.retention.deleted", { category: "OPERATIONAL", deleted: result.count });
  }

  if (options.includeNoise && !options.dryRun && !options.compactOnly && noiseEventNames.length > 0) {
    const result = await prisma.event.deleteMany({
      where: {
        ...scopedWhere,
        eventName: { in: noiseEventNames },
        createdAt: { lt: noiseCutoff },
      },
    });
    deleted += result.count;
    if (result.count > 0) logEvent("events.retention.deleted", { category: "NOISE", deleted: result.count });
  }

  if (options.dryRun || options.compactOnly) {
    const operationalDeleteCandidates = await prisma.event.count({
      where: {
        ...scopedWhere,
        eventName: { in: operationalEventNames },
        createdAt: { lt: operationalCutoff },
      },
    });
    const noiseDeleteCandidates = options.includeNoise
      ? await prisma.event.count({
          where: {
            ...scopedWhere,
            eventName: { in: noiseEventNames },
            createdAt: { lt: noiseCutoff },
          },
        })
      : 0;
    deleted = options.dryRun ? operationalDeleteCandidates + noiseDeleteCandidates : 0;
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    filters: {
      clientKey: options.clientKey ?? null,
      days: options.days,
      noiseDays,
      includeNoise: options.includeNoise,
      noiseOnly: options.noiseOnly,
      compactOnly: options.compactOnly,
      confirmOperational: options.confirmOperational,
    },
    scanned: filteredEventNameCounts.reduce((sum, item) => sum + item.count, 0),
    critical: filteredEventNameCounts
      .filter((item) => item.category === "CRITICAL")
      .reduce((sum, item) => sum + item.count, 0),
    operational: filteredEventNameCounts
      .filter((item) => item.category === "OPERATIONAL")
      .reduce((sum, item) => sum + item.count, 0),
    noise: filteredEventNameCounts
      .filter((item) => item.category === "NOISE")
      .reduce((sum, item) => sum + item.count, 0),
    compacted: compactResult.compacted,
    deleted,
    skipped: compactResult.skipped,
    affectedEventNames: filteredEventNameCounts,
  };
}

function printHuman(report: RetentionReport) {
  console.log(`Events Retention - ${report.generatedAt}`);
  console.log(`Dry-run: ${report.dryRun ? "yes" : "no"}`);
  console.log(`Client: ${report.filters.clientKey ?? "all"}`);
  console.log(`Mode: ${report.filters.noiseOnly ? "noise-only" : "operational+noise"}`);
  console.log(`Operational cutoff: ${report.filters.days}d`);
  console.log(`Noise cutoff: ${report.filters.noiseDays}d (${report.filters.includeNoise ? "included" : "not included"})`);
  console.log("");
  console.log(`Scanned: ${report.scanned}`);
  console.log(`Critical preserved: ${report.critical}`);
  console.log(`Operational eligible: ${report.operational}`);
  console.log(`Noise eligible: ${report.noise}`);
  console.log(`Compacted groups: ${report.compacted}`);
  console.log(`${report.dryRun ? "Would delete" : "Deleted"}: ${report.deleted}`);
  console.log(`Skipped: ${report.skipped}`);
  console.log("");
  console.log("Affected event names:");
  for (const item of report.affectedEventNames.slice(0, 30)) {
    console.log(`- ${item.eventName}: ${item.count} (${item.category})`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnv();
  const prisma = new PrismaClient();
  logEvent("events.retention.started", {
    dryRun: options.dryRun,
    clientKey: options.clientKey ?? null,
    days: options.days,
    includeNoise: options.includeNoise,
    noiseOnly: options.noiseOnly,
    compactOnly: options.compactOnly,
    confirmOperational: options.confirmOperational,
  });
  try {
    const report = await executeEventsRetention(prisma, options);
    if (report.scanned === 0) {
      logEvent("events.retention.skipped", { reason: "no_eligible_events", clientKey: options.clientKey ?? null });
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    logEvent("events.retention.completed", {
      dryRun: report.dryRun,
      scanned: report.scanned,
      critical: report.critical,
      operational: report.operational,
      noise: report.noise,
      compacted: report.compacted,
      deleted: report.deleted,
      skipped: report.skipped,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logEvent("events.retention.failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
