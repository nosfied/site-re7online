import { Prisma } from "@prisma/client";
import { parseMetaUsageMonth } from "./metaUsageSummary.js";
import {
  RECEPTIVE_SESSION_EVENT_TYPE,
  RECEPTIVE_SESSION_METER_VERSION,
  RECEPTIVE_SESSION_WINDOW_MS,
} from "./receptiveSessionMeter.js";

type EventRow = {
  id: string;
  requestId: string | null;
  messageId: string | null;
  waIdCanonical: string | null;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
};

type PrismaLike = {
  event: {
    findMany(args: any): Promise<EventRow[]>;
  };
};

export type ReceptiveSessionReportRow = {
  sessionStartedAt: string;
  sessionEndsAt: string;
  channel: string;
  provider: string;
  maskedContact: string | null;
  sourceInboundMessageId: string | null;
  providerMessageId: string | null;
  meterVersion: string;
};

export type MonthlyReceptiveSessionReport = {
  ok: true;
  reportType: "receptive_sessions_monthly";
  tenantKey: string | null;
  tenantName: string | null;
  month: string;
  generatedAt: string;
  currency: string | null;
  unitPrice: number | null;
  total: number | null;
  summary: {
    sessionCount: number;
    evidenceCount: number;
    channel: "whatsapp";
    provider: "meta_cloud";
    windowHours: 24;
    meterVersion: typeof RECEPTIVE_SESSION_METER_VERSION;
  };
  rows: ReceptiveSessionReportRow[];
  notes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function monthRange(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return {
    gte: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)),
    lt: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)),
  };
}

function sanitizeTenantText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 120) : null;
}

function readString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function readDateIso(value: unknown, fallback: Date) {
  const source = typeof value === "string" || value instanceof Date ? value : fallback;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function normalizeUnitPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function parseReceptiveSessionUnitPrice(value: string | number | null | undefined) {
  return normalizeUnitPrice(value);
}

function eventToRow(event: EventRow): ReceptiveSessionReportRow {
  const payload = isRecord(event.payloadJson) ? event.payloadJson : {};
  const sessionStartedAt = readDateIso(payload.sessionStartedAt, event.createdAt);
  const sessionEndsAt = readDateIso(
    payload.sessionEndsAt,
    new Date(new Date(sessionStartedAt).getTime() + RECEPTIVE_SESSION_WINDOW_MS)
  );
  return {
    sessionStartedAt,
    sessionEndsAt,
    channel: readString(payload.channel) ?? "whatsapp",
    provider: readString(payload.provider) ?? "meta_cloud",
    maskedContact: readString(payload.waIdMasked),
    sourceInboundMessageId: readString(payload.sourceInboundMessageId) ?? event.messageId,
    providerMessageId: readString(payload.providerMessageId),
    meterVersion: readString(payload.meterVersion) ?? RECEPTIVE_SESSION_METER_VERSION,
  };
}

export async function buildMonthlyReceptiveSessionReport(params: {
  prisma: PrismaLike;
  clientId: string;
  tenantKey?: string | null;
  tenantName?: string | null;
  month: string;
  now?: Date;
  unitPrice?: string | number | null;
  currency?: string | null;
}): Promise<MonthlyReceptiveSessionReport> {
  const range = monthRange(params.month);
  const events = await params.prisma.event.findMany({
    where: {
      clientId: params.clientId,
      eventName: RECEPTIVE_SESSION_EVENT_TYPE,
      createdAt: { gte: range.gte, lt: range.lt },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      requestId: true,
      messageId: true,
      waIdCanonical: true,
      payloadJson: true,
      createdAt: true,
    },
  });
  const rows = events.map(eventToRow);
  const unitPrice = normalizeUnitPrice(params.unitPrice);
  const total = unitPrice === null ? null : Number((unitPrice * rows.length).toFixed(4));
  return {
    ok: true,
    reportType: "receptive_sessions_monthly",
    tenantKey: sanitizeTenantText(params.tenantKey),
    tenantName: sanitizeTenantText(params.tenantName),
    month: params.month,
    generatedAt: (params.now ?? new Date()).toISOString(),
    currency: unitPrice === null ? null : String(params.currency ?? "BRL").trim().slice(0, 12) || "BRL",
    unitPrice,
    total,
    summary: {
      sessionCount: rows.length,
      evidenceCount: events.length,
      channel: "whatsapp",
      provider: "meta_cloud",
      windowHours: 24,
      meterVersion: RECEPTIVE_SESSION_METER_VERSION,
    },
    rows,
    notes: [
      "Cada linha representa uma sessao receptiva iniciada pelo cliente em uma janela UTC de 24h.",
      "A atribuicao mensal usa sessionStartedAt.",
      "Preco unitario e moeda sao parametros de relatorio, nao regra global do produto.",
    ],
  };
}

function csvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function buildMonthlyReceptiveSessionCsv(report: MonthlyReceptiveSessionReport) {
  const header = [
    "sessionStartedAt",
    "sessionEndsAt",
    "channel",
    "provider",
    "maskedContact",
    "sourceInboundMessageId",
    "providerMessageId",
    "meterVersion",
    "unitPrice",
    "currency",
  ];
  const lines = [header.join(",")];
  for (const row of report.rows) {
    lines.push(
      [
        row.sessionStartedAt,
        row.sessionEndsAt,
        row.channel,
        row.provider,
        row.maskedContact,
        row.sourceInboundMessageId,
        row.providerMessageId,
        row.meterVersion,
        report.unitPrice ?? "",
        report.currency ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  lines.push(
    [
      "SUMMARY",
      report.month,
      "sessionCount",
      report.summary.sessionCount,
      "total",
      report.total ?? "",
      "",
      "",
      report.unitPrice ?? "",
      report.currency ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  return `${lines.join("\n")}\n`;
}

export function buildMonthlyReceptiveSessionCsvFileName(params: { tenantKey?: string | null; month: string }) {
  const tenant = String(params.tenantKey ?? "tenant")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tenant";
  const month = parseMetaUsageMonth(params.month) ?? "month";
  return `receptive-sessions-${tenant}-${month}.csv`;
}
