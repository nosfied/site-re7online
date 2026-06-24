import type { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SNIPPET_LENGTH = 280;

export class AdvancedSearchRuntimeDisabledError extends Error {
  constructor() {
    super("advanced_search_runtime_disabled");
    this.name = "AdvancedSearchRuntimeDisabledError";
  }
}

export type AdvancedSearchListParams = {
  prisma: PrismaClient;
  clientId: string;
  runtimeEnabled?: boolean;
  query?: string | null;
  entityType?: string | null;
  channel?: string | null;
  source?: string | null;
  language?: string | null;
  cursor?: string | null;
  limit?: number | null;
};

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT;
  const normalized = Math.trunc(value ?? DEFAULT_LIMIT);
  if (normalized < 1) return DEFAULT_LIMIT;
  return Math.min(normalized, MAX_LIMIT);
}

function buildSnippet(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, SNIPPET_LENGTH - 3)}...`;
}

function serializeIndex(item: {
  id: string;
  entityType: string;
  entityId: string;
  title: string | null;
  body: string | null;
  channel: string | null;
  source: string | null;
  language: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.title,
    body: buildSnippet(item.body),
    snippet: buildSnippet(item.body),
    channel: item.channel,
    source: item.source,
    language: item.language,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listSearchIndexes(params: AdvancedSearchListParams) {
  const limit = normalizeLimit(params.limit);
  const query = normalizeString(params.query);
  if (query && !params.runtimeEnabled) {
    throw new AdvancedSearchRuntimeDisabledError();
  }
  const entityType = normalizeString(params.entityType);
  const channel = normalizeString(params.channel);
  const source = normalizeString(params.source);
  const language = normalizeString(params.language);
  const cursor = normalizeString(params.cursor);

  const where: Prisma.SearchIndexWhereInput = {
    clientId: params.clientId,
    ...(entityType ? { entityType } : {}),
    ...(channel ? { channel } : {}),
    ...(source ? { source } : {}),
    ...(language ? { language } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { body: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await params.prisma.searchIndex.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      entityType: true,
      entityId: true,
      title: true,
      body: true,
      channel: true,
      source: true,
      language: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    indexes: page.map(serializeIndex),
    pageInfo: {
      limit,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    },
    filters: {
      query,
      entityType,
      channel,
      source,
      language,
    },
    mode: query ? "runtime" : "diagnostic",
    runtimeEnabled: params.runtimeEnabled === true,
  };
}
