import crypto from "node:crypto";
import { MessageType, type Prisma, type PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ALL_SOURCES = ["conversation", "inbound_message", "outbound_message"] as const;

type SearchShadowSource = (typeof ALL_SOURCES)[number];

type ClientRow = {
  id: string;
  clientKey: string;
  profile: string | null;
  features: Prisma.JsonValue | null;
};

type SearchCandidate = {
  clientId: string;
  clientKey: string;
  entityType: "conversation" | "message";
  entityId: string;
  title: string | null;
  body: string | null;
  channel: string | null;
  source: SearchShadowSource;
  language: string | null;
  reason: "eligible";
};

type SearchSkipped = {
  clientId: string;
  clientKey: string;
  entityType: "conversation" | "message" | null;
  entityId: string | null;
  source: SearchShadowSource | null;
  reason:
    | "tenant_feature_disabled"
    | "runtime_enabled"
    | "source_not_supported"
    | "empty_index_content"
    | "existing_index";
};

export type SearchShadowReport = {
  ok: true;
  dryRun: boolean;
  recorded: boolean;
  runId: string;
  tenant: string;
  source: SearchShadowSource | "all";
  checkedTenants: number;
  scanned: number;
  eligible: number;
  skipped: number;
  recordsCreated: number;
  eventWrites: number;
  candidates: SearchCandidate[];
  skippedItems: SearchSkipped[];
};

export type SearchShadowParams = {
  prisma: PrismaClient;
  tenant: string;
  source?: string | null;
  limit?: number;
  record?: boolean;
};

function buildSearchShadowRunId() {
  return `search-shadow:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_LIMIT)));
}

function normalizeSource(value: string | null | undefined): SearchShadowSource | "all" | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "all";
  if (normalized === "all") return "all";
  if ((ALL_SOURCES as readonly string[]).includes(normalized)) return normalized as SearchShadowSource;
  return null;
}

function normalizeText(value: string | null | undefined, max = 4000) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function normalizeChannel(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function messageTypeLabel(type: MessageType) {
  return String(type).toLowerCase();
}

function buildSkipped(
  client: ClientRow,
  params: Omit<SearchSkipped, "clientId" | "clientKey">
): SearchSkipped {
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    ...params,
  };
}

function buildConversationCandidate(client: ClientRow, row: {
  id: string;
  waIdCanonical: string | null;
  waId: string;
  channel: string | null;
  provider: string | null;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SearchCandidate | SearchSkipped {
  const channel = normalizeChannel(row.channel) ?? "whatsapp";
  const title = `Conversa ${channel}`;
  const body = normalizeText(
    [
      row.waIdCanonical || row.waId ? "identificador normalizado disponivel" : "",
      row.provider ? `provider ${row.provider}` : "",
      row.departmentId ? "departamento vinculado" : "",
    ].filter(Boolean).join(" ")
  );
  if (!body) {
    return buildSkipped(client, {
      entityType: "conversation",
      entityId: row.id,
      source: "conversation",
      reason: "empty_index_content",
    });
  }
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    entityType: "conversation",
    entityId: row.id,
    title,
    body,
    channel,
    source: "conversation",
    language: null,
    reason: "eligible",
  };
}

function buildInboundCandidate(client: ClientRow, row: {
  id: string;
  messageId: string;
  type: MessageType;
  bodyText: string | null;
  channel: string | null;
  createdAt: Date;
}): SearchCandidate | SearchSkipped {
  const body = normalizeText(row.bodyText);
  if (!body) {
    return buildSkipped(client, {
      entityType: "message",
      entityId: row.id,
      source: "inbound_message",
      reason: "empty_index_content",
    });
  }
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    entityType: "message",
    entityId: row.id,
    title: `Mensagem recebida ${messageTypeLabel(row.type)}`,
    body,
    channel: normalizeChannel(row.channel) ?? "whatsapp",
    source: "inbound_message",
    language: null,
    reason: "eligible",
  };
}

function buildOutboundCandidate(client: ClientRow, row: {
  id: string;
  messageId: string | null;
  type: MessageType;
  bodyText: string | null;
  templateName: string | null;
  templateLang: string | null;
  channel: string | null;
  createdAt: Date;
}): SearchCandidate | SearchSkipped {
  const body = normalizeText(row.bodyText ?? row.templateName);
  if (!body) {
    return buildSkipped(client, {
      entityType: "message",
      entityId: row.id,
      source: "outbound_message",
      reason: "empty_index_content",
    });
  }
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    entityType: "message",
    entityId: row.id,
    title: `Mensagem enviada ${messageTypeLabel(row.type)}`,
    body,
    channel: normalizeChannel(row.channel) ?? "whatsapp",
    source: "outbound_message",
    language: row.templateLang,
    reason: "eligible",
  };
}

async function persistSearchIndex(params: {
  prisma: PrismaClient;
  candidate: SearchCandidate;
}) {
  const existing = await params.prisma.searchIndex.findUnique({
    where: {
      clientId_entityType_entityId: {
        clientId: params.candidate.clientId,
        entityType: params.candidate.entityType,
        entityId: params.candidate.entityId,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false as const };
  await params.prisma.searchIndex.create({
    data: {
      clientId: params.candidate.clientId,
      entityType: params.candidate.entityType,
      entityId: params.candidate.entityId,
      title: params.candidate.title,
      body: params.candidate.body,
      channel: params.candidate.channel,
      source: params.candidate.source,
      language: params.candidate.language,
    },
  });
  return { created: true as const };
}

async function persistSearchEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  requestId: string;
  eventName: string;
  payload: Record<string, unknown>;
}) {
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: params.requestId,
      eventName: params.eventName,
      payloadJson: params.payload as Prisma.InputJsonValue,
    },
  });
}

export async function runSearchShadowIndexer(params: SearchShadowParams): Promise<SearchShadowReport> {
  const source = normalizeSource(params.source);
  if (!source) throw new Error("invalid_source");

  const limit = normalizeLimit(params.limit);
  const record = params.record === true;
  const runId = buildSearchShadowRunId();
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenant },
    select: { id: true, clientKey: true, profile: true, features: true },
  });
  if (!client) throw new Error("tenant_not_found");

  const featureEnabled = hasFeature(client, "advancedSearch");
  const runtimeEnabled = hasFeature(client, "advancedSearchRuntime");
  const report: SearchShadowReport = {
    ok: true,
    dryRun: !record,
    recorded: record,
    runId,
    tenant: params.tenant,
    source,
    checkedTenants: 1,
    scanned: 0,
    eligible: 0,
    skipped: 0,
    recordsCreated: 0,
    eventWrites: 0,
    candidates: [],
    skippedItems: [],
  };

  if (!featureEnabled || runtimeEnabled) {
    const reason = !featureEnabled ? "tenant_feature_disabled" : "runtime_enabled";
    report.skippedItems.push(buildSkipped(client, { entityType: null, entityId: null, source: null, reason }));
    report.skipped = 1;
    logger.info({ event: "search.shadow_skipped", runId, tenant: params.tenant, reason });
    return report;
  }

  await persistSearchEvent({
    prisma: params.prisma,
    clientId: client.id,
    requestId: `${runId}:run`,
    eventName: "search.shadow_run",
    payload: { source, record, limit },
  });
  report.eventWrites += 1;

  const sources = source === "all" ? [...ALL_SOURCES] : [source];
  for (const currentSource of sources) {
    if (currentSource === "conversation") {
      const rows = await params.prisma.conversation.findMany({
        where: { clientId: client.id, deletedAt: null, anonymizedAt: null },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
        select: {
          id: true,
          waIdCanonical: true,
          waId: true,
          channel: true,
          provider: true,
          departmentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      report.scanned += rows.length;
      for (const row of rows) {
        const candidate = buildConversationCandidate(client, row);
        await handleCandidate({ prisma: params.prisma, report, candidate, record, runId });
      }
    }
    if (currentSource === "inbound_message") {
      const rows = await params.prisma.inboundMessage.findMany({
        where: { clientId: client.id },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          messageId: true,
          type: true,
          bodyText: true,
          channel: true,
          createdAt: true,
        },
      });
      report.scanned += rows.length;
      for (const row of rows) {
        const candidate = buildInboundCandidate(client, row);
        await handleCandidate({ prisma: params.prisma, report, candidate, record, runId });
      }
    }
    if (currentSource === "outbound_message") {
      const rows = await params.prisma.outboundMessage.findMany({
        where: { clientId: client.id },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          messageId: true,
          type: true,
          bodyText: true,
          templateName: true,
          templateLang: true,
          channel: true,
          createdAt: true,
        },
      });
      report.scanned += rows.length;
      for (const row of rows) {
        const candidate = buildOutboundCandidate(client, row);
        await handleCandidate({ prisma: params.prisma, report, candidate, record, runId });
      }
    }
  }

  return report;
}

async function handleCandidate(params: {
  prisma: PrismaClient;
  report: SearchShadowReport;
  candidate: SearchCandidate | SearchSkipped;
  record: boolean;
  runId: string;
}) {
  if (params.candidate.reason !== "eligible") {
    params.report.skipped += 1;
    params.report.skippedItems.push(params.candidate);
    logger.info({
      event: "search.shadow_skipped",
      runId: params.runId,
      source: params.candidate.source,
      reason: params.candidate.reason,
      entityType: params.candidate.entityType,
    });
    return;
  }

  const existing = await params.prisma.searchIndex.findUnique({
    where: {
      clientId_entityType_entityId: {
        clientId: params.candidate.clientId,
        entityType: params.candidate.entityType,
        entityId: params.candidate.entityId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    params.report.skipped += 1;
    params.report.skippedItems.push({
      clientId: params.candidate.clientId,
      clientKey: params.candidate.clientKey,
      entityType: params.candidate.entityType,
      entityId: params.candidate.entityId,
      source: params.candidate.source,
      reason: "existing_index",
    });
    return;
  }

  params.report.eligible += 1;
  params.report.candidates.push(params.candidate);
  logger.info({
    event: "search.shadow_candidate",
    runId: params.runId,
    source: params.candidate.source,
    entityType: params.candidate.entityType,
    channel: params.candidate.channel,
  });

  if (!params.record) return;
  const result = await persistSearchIndex({ prisma: params.prisma, candidate: params.candidate });
  if (result.created) {
    params.report.recordsCreated += 1;
    await persistSearchEvent({
      prisma: params.prisma,
      clientId: params.candidate.clientId,
      requestId: `${params.runId}:recorded:${params.candidate.entityType}:${params.candidate.entityId}`,
      eventName: "search.shadow_recorded",
      payload: {
        entityType: params.candidate.entityType,
        source: params.candidate.source,
        channel: params.candidate.channel,
      },
    });
    params.report.eventWrites += 1;
  }
}
