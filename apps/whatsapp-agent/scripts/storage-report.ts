#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

type Options = {
  json: boolean;
  clientKey?: string;
  topTenants: number;
  includeEvents: boolean;
};

type TableMetric = {
  rows: number;
  totalSize: string | null;
  totalBytes: number | null;
};

type TenantMetric = {
  clientId: string;
  clientKey: string;
  name: string | null;
  conversations: number;
  runtimeStates: number;
  inboundMessages: number;
  outboundMessages: number;
  events: number;
  leads: number;
  leadNotes: number;
  approximateRows: number;
};

type Report = {
  generatedAt: string;
  filters: {
    clientKey: string | null;
    topTenants: number;
    includeEvents: boolean;
  };
  postgres: {
    databaseSize: string | null;
    databaseBytes: number | null;
    tables: Record<string, TableMetric>;
  };
  tenants: TenantMetric[];
  filesystem: {
    dataSize: string;
    dataBytes: number;
    mediaOutboundSize: string;
    mediaOutboundBytes: number;
    logsSize: string;
    logsBytes: number;
    runtimeJsonLegacySize: string;
    runtimeJsonLegacyBytes: number;
    pm2LogsSize: string | null;
    pm2LogsBytes: number | null;
  };
  retention: {
    tenants: Array<{
      clientKey: string;
      retentionDays: number;
      anonymizedConversations: number;
      deletedConversations: number;
      inconsistentHistoryVisibleAfter: number;
    }>;
    runtimeWithoutConversation: number;
    orphanRuntimeStates: number;
    anonymizedRuntimeStates: number;
  };
  eventGrowth?: {
    last24h: number;
    last7d: number;
    last30d: number;
    topEventNames: Array<{ eventName: string; count: number }>;
  };
};

const MONITORED_TABLES = [
  "Event",
  "InboundMessage",
  "OutboundMessage",
  "Conversation",
  "ConversationRuntimeState",
  "Lead",
  "LeadNote",
] as const;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    topTenants: 10,
    includeEvents: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error("--client-key exige um valor");
        options.clientKey = next;
        index += 1;
        break;
      case "--top-tenants": {
        if (!next || next.startsWith("--")) throw new Error("--top-tenants exige um valor");
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
          throw new Error(`--top-tenants inválido: ${next}`);
        }
        options.topTenants = parsed;
        index += 1;
        break;
      }
      case "--include-events":
        options.includeEvents = true;
        break;
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
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

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

async function directorySize(target: string): Promise<number> {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch {
    return 0;
  }
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    total += await directorySize(path.join(target, entry.name));
  }
  return total;
}

async function getTableMetrics(prisma: PrismaClient) {
  const metrics: Record<string, TableMetric> = {};
  const sizeRows = await prisma.$queryRawUnsafe<
    Array<{ table: string; total_size: string; bytes: string }>
  >(`
    SELECT relname AS table,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           pg_total_relation_size(relid)::text AS bytes
    FROM pg_catalog.pg_statio_user_tables
    WHERE relname IN (${MONITORED_TABLES.map((table) => `'${table}'`).join(",")})
  `);
  const sizeByTable = new Map(sizeRows.map((row) => [row.table, row]));

  for (const table of MONITORED_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM "${table}"`
    );
    const size = sizeByTable.get(table);
    metrics[table] = {
      rows: toNumber(rows[0]?.count),
      totalSize: size?.total_size ?? null,
      totalBytes: size ? toNumber(size.bytes) : null,
    };
  }
  return metrics;
}

async function getDatabaseSize(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ size: string; bytes: string }>>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size, pg_database_size(current_database())::text AS bytes"
  );
  return {
    size: rows[0]?.size ?? null,
    bytes: rows[0] ? toNumber(rows[0].bytes) : null,
  };
}

async function getTenantMetrics(prisma: PrismaClient, options: Options): Promise<TenantMetric[]> {
  const clients = await prisma.client.findMany({
    where: options.clientKey ? { clientKey: options.clientKey } : undefined,
    select: { id: true, clientKey: true, name: true },
  });
  const metrics: TenantMetric[] = [];
  for (const client of clients) {
    const [
      conversations,
      runtimeStates,
      inboundMessages,
      outboundMessages,
      events,
      leads,
      leadNotes,
    ] = await Promise.all([
      prisma.conversation.count({ where: { clientId: client.id } }),
      prisma.conversationRuntimeState.count({ where: { clientId: client.id } }),
      prisma.inboundMessage.count({ where: { clientId: client.id } }),
      prisma.outboundMessage.count({ where: { clientId: client.id } }),
      prisma.event.count({ where: { clientId: client.id } }),
      prisma.lead.count({ where: { tenantId: client.id } }),
      prisma.leadNote.count({ where: { tenantId: client.id } }),
    ]);
    metrics.push({
      clientId: client.id,
      clientKey: client.clientKey,
      name: client.name,
      conversations,
      runtimeStates,
      inboundMessages,
      outboundMessages,
      events,
      leads,
      leadNotes,
      approximateRows:
        conversations + runtimeStates + inboundMessages + outboundMessages + events + leads + leadNotes,
    });
  }
  return metrics.sort((left, right) => right.approximateRows - left.approximateRows).slice(0, options.topTenants);
}

async function getRetentionHealth(prisma: PrismaClient, options: Options) {
  const clients = await prisma.client.findMany({
    where: options.clientKey ? { clientKey: options.clientKey } : undefined,
    select: { id: true, clientKey: true },
  });
  const tenants = [];
  for (const client of clients) {
    const retention = await prisma.retentionConfig.findUnique({
      where: { clientId: client.id },
      select: { retentionDays: true },
    });
    const [anonymizedConversations, deletedConversations, inconsistentHistoryVisibleAfter] =
      await Promise.all([
        prisma.conversation.count({ where: { clientId: client.id, anonymizedAt: { not: null } } }),
        prisma.conversation.count({ where: { clientId: client.id, deletedAt: { not: null } } }),
        prisma.conversation.count({
          where: {
            clientId: client.id,
            anonymizedAt: { not: null },
            historyVisibleAfter: null,
          },
        }),
      ]);
    tenants.push({
      clientKey: client.clientKey,
      retentionDays: retention?.retentionDays ?? 90,
      anonymizedConversations,
      deletedConversations,
      inconsistentHistoryVisibleAfter,
    });
  }

  const clientIds = clients.map((client) => client.id);
  if (options.clientKey && clientIds.length === 0) {
    return {
      tenants,
      runtimeWithoutConversation: 0,
      orphanRuntimeStates: 0,
      anonymizedRuntimeStates: 0,
    };
  }
  const scopedRuntimeWhere = clientIds.length
    ? `r."clientId" IN (${clientIds.map((id) => sqlString(id)).join(",")})`
    : "TRUE";
  const orphanRows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(`
    SELECT COUNT(*)::text AS count
    FROM "ConversationRuntimeState" r
    WHERE ${scopedRuntimeWhere}
    AND NOT EXISTS (
      SELECT 1 FROM "Conversation" c
      WHERE c."clientId" = r."clientId"
      AND (c."waId" = r."waId" OR c."waIdCanonical" = r."waIdCanonical")
    )
  `);
  const anonymizedRuntimeRows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(`
    SELECT COUNT(*)::text AS count
    FROM "ConversationRuntimeState" r
    WHERE ${scopedRuntimeWhere}
    AND (r."waId" LIKE '%*%' OR r."waId" LIKE 'anon:%')
  `);

  return {
    tenants,
    runtimeWithoutConversation: toNumber(orphanRows[0]?.count),
    orphanRuntimeStates: toNumber(orphanRows[0]?.count),
    anonymizedRuntimeStates: toNumber(anonymizedRuntimeRows[0]?.count),
  };
}

async function getEventGrowth(prisma: PrismaClient, options: Options) {
  const client = options.clientKey
    ? await prisma.client.findUnique({ where: { clientKey: options.clientKey }, select: { id: true } })
    : null;
  if (options.clientKey && !client) {
    return {
      last24h: 0,
      last7d: 0,
      last30d: 0,
      topEventNames: [],
    };
  }
  const clientFilter = client ? `AND "clientId" = ${sqlString(client.id)}` : "";
  const [last24h, last7d, last30d, topEventNames] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL '24 hours' ${clientFilter}`
    ),
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL '7 days' ${clientFilter}`
    ),
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM "Event" WHERE "createdAt" >= NOW() - INTERVAL '30 days' ${clientFilter}`
    ),
    prisma.$queryRawUnsafe<Array<{ eventName: string; count: string }>>(
      `SELECT "eventName", COUNT(*)::text AS count
       FROM "Event"
       WHERE "createdAt" >= NOW() - INTERVAL '30 days' ${clientFilter}
       GROUP BY "eventName"
       ORDER BY COUNT(*) DESC
       LIMIT 15`
    ),
  ]);
  return {
    last24h: toNumber(last24h[0]?.count),
    last7d: toNumber(last7d[0]?.count),
    last30d: toNumber(last30d[0]?.count),
    topEventNames: topEventNames.map((row) => ({ eventName: row.eventName, count: toNumber(row.count) })),
  };
}

async function buildReport(prisma: PrismaClient, options: Options): Promise<Report> {
  const cwd = process.cwd();
  const dataDir = path.join(cwd, ".data");
  const mediaOutboundDir = path.join(dataDir, "media", "outbound");
  const logsDir = path.join(dataDir, "logs");
  const pm2LogsDir = path.join(process.env.HOME ?? "", ".pm2", "logs");
  const dataEntries = await fs.readdir(dataDir, { withFileTypes: true }).catch(() => []);
  const legacyDirs = dataEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runtime-json-legacy"))
    .map((entry) => path.join(dataDir, entry.name));

  const [
    databaseSize,
    tables,
    tenants,
    retention,
    dataBytes,
    mediaOutboundBytes,
    logsBytes,
    pm2LogsBytes,
    ...legacySizes
  ] = await Promise.all([
    getDatabaseSize(prisma),
    getTableMetrics(prisma),
    getTenantMetrics(prisma, options),
    getRetentionHealth(prisma, options),
    directorySize(dataDir),
    directorySize(mediaOutboundDir),
    directorySize(logsDir),
    pm2LogsDir ? directorySize(pm2LogsDir) : Promise.resolve(0),
    ...legacyDirs.map((dir) => directorySize(dir)),
  ]);
  const runtimeJsonLegacyBytes = legacySizes.reduce((sum, value) => sum + value, 0);
  const report: Report = {
    generatedAt: new Date().toISOString(),
    filters: {
      clientKey: options.clientKey ?? null,
      topTenants: options.topTenants,
      includeEvents: options.includeEvents,
    },
    postgres: {
      databaseSize: databaseSize.size,
      databaseBytes: databaseSize.bytes,
      tables,
    },
    tenants,
    filesystem: {
      dataSize: formatBytes(dataBytes),
      dataBytes,
      mediaOutboundSize: formatBytes(mediaOutboundBytes),
      mediaOutboundBytes,
      logsSize: formatBytes(logsBytes),
      logsBytes,
      runtimeJsonLegacySize: formatBytes(runtimeJsonLegacyBytes),
      runtimeJsonLegacyBytes,
      pm2LogsSize: pm2LogsDir ? formatBytes(pm2LogsBytes) : null,
      pm2LogsBytes: pm2LogsDir ? pm2LogsBytes : null,
    },
    retention,
  };
  if (options.includeEvents) {
    report.eventGrowth = await getEventGrowth(prisma, options);
  }
  return report;
}

function printHuman(report: Report) {
  console.log(`Storage Report - ${report.generatedAt}`);
  console.log(`Database: ${report.postgres.databaseSize ?? "unknown"}`);
  console.log("");
  console.log("Tables:");
  for (const [table, metric] of Object.entries(report.postgres.tables)) {
    console.log(`- ${table}: ${metric.rows} rows, ${metric.totalSize ?? "unknown"}`);
  }
  console.log("");
  console.log("Top tenants:");
  for (const tenant of report.tenants) {
    console.log(
      `- ${tenant.clientKey}: rows=${tenant.approximateRows}, conversations=${tenant.conversations}, runtime=${tenant.runtimeStates}, messages=${tenant.inboundMessages + tenant.outboundMessages}, events=${tenant.events}`
    );
  }
  console.log("");
  console.log("Filesystem:");
  console.log(`- .data: ${report.filesystem.dataSize}`);
  console.log(`- media/outbound: ${report.filesystem.mediaOutboundSize}`);
  console.log(`- logs: ${report.filesystem.logsSize}`);
  console.log(`- runtime-json-legacy: ${report.filesystem.runtimeJsonLegacySize}`);
  if (report.filesystem.pm2LogsSize) console.log(`- PM2 logs: ${report.filesystem.pm2LogsSize}`);
  console.log("");
  console.log("Retention health:");
  console.log(`- orphan runtime states: ${report.retention.orphanRuntimeStates}`);
  console.log(`- anonymized runtime states: ${report.retention.anonymizedRuntimeStates}`);
  for (const tenant of report.retention.tenants) {
    console.log(
      `- ${tenant.clientKey}: retention=${tenant.retentionDays}d, anonymized=${tenant.anonymizedConversations}, deleted=${tenant.deletedConversations}, historyVisibleAfterMissing=${tenant.inconsistentHistoryVisibleAfter}`
    );
  }
  if (report.eventGrowth) {
    console.log("");
    console.log("Event growth:");
    console.log(`- 24h: ${report.eventGrowth.last24h}`);
    console.log(`- 7d: ${report.eventGrowth.last7d}`);
    console.log(`- 30d: ${report.eventGrowth.last30d}`);
    console.log("- top event names:");
    for (const item of report.eventGrowth.topEventNames) {
      console.log(`  - ${item.eventName}: ${item.count}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnv();
  const prisma = new PrismaClient();
  const startedAt = new Date().toISOString();
  console.error(
    JSON.stringify({
      timestamp: startedAt,
      event: "storage.report.started",
      clientKey: options.clientKey ?? null,
      includeEvents: options.includeEvents,
    })
  );
  try {
    const report = await buildReport(prisma, options);
    const warnings = [
      report.retention.orphanRuntimeStates > 0 ? "orphan_runtime_states" : null,
      report.retention.anonymizedRuntimeStates > 0 ? "anonymized_runtime_states" : null,
      report.retention.tenants.some((tenant) => tenant.inconsistentHistoryVisibleAfter > 0)
        ? "history_visible_after_missing"
        : null,
    ].filter((item): item is string => Boolean(item));
    for (const warning of warnings) {
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), event: "storage.report.warning", warning }));
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "storage.report.completed",
        warnings,
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "storage.report.failed",
      message: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
