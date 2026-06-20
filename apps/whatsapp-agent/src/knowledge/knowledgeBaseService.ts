import type { PrismaClient } from "@prisma/client";

export const KNOWLEDGE_BASE_COLLECTION_STATUSES = ["active", "archived"] as const;
export const KNOWLEDGE_BASE_ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export const KNOWLEDGE_BASE_VISIBILITIES = ["internal", "operator", "public"] as const;
export const KNOWLEDGE_BASE_SOURCE_TYPES = ["manual", "document", "faq", "flow", "intent", "crm"] as const;

export type KnowledgeBaseCollectionStatus = (typeof KNOWLEDGE_BASE_COLLECTION_STATUSES)[number];
export type KnowledgeBaseArticleStatus = (typeof KNOWLEDGE_BASE_ARTICLE_STATUSES)[number];
export type KnowledgeBaseVisibility = (typeof KNOWLEDGE_BASE_VISIBILITIES)[number];
export type KnowledgeBaseSourceType = (typeof KNOWLEDGE_BASE_SOURCE_TYPES)[number];

export type KnowledgeBaseArticleInput = {
  collectionId?: string | null;
  key?: string | null;
  title?: string | null;
  summary?: string | null;
  question?: string | null;
  body?: string | null;
  tags?: unknown;
  intentKeys?: unknown;
  sourceType?: string | null;
  sourceNote?: string | null;
  sourceUrl?: string | null;
  visibility?: string | null;
};

export type KnowledgeBaseCollectionInput = {
  key?: string | null;
  name?: string | null;
  description?: string | null;
  visibility?: string | null;
};

const MAX_KEY_LENGTH = 96;
const MAX_TITLE_LENGTH = 180;
const MAX_SUMMARY_LENGTH = 400;
const MAX_BODY_LENGTH = 12000;
const MAX_NOTE_LENGTH = 1000;
const MAX_URL_LENGTH = 500;
const MAX_TAGS = 30;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

export function normalizeKnowledgeKey(input: unknown, fallback: string) {
  const source = typeof input === "string" && input.trim() ? input : fallback;
  const normalized = source
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_KEY_LENGTH);
  return normalized || "knowledge-item";
}

function normalizeStringList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) =>
          typeof item === "string"
            ? item
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_:-]+/g, "")
                .slice(0, 60)
            : ""
        )
        .filter(Boolean)
    )
  ).slice(0, MAX_TAGS);
}

function normalizeCollectionStatus(input: unknown): KnowledgeBaseCollectionStatus {
  return input === "archived" ? "archived" : "active";
}

function normalizeArticleStatus(input: unknown): KnowledgeBaseArticleStatus {
  return input === "published" || input === "archived" ? input : "draft";
}

function normalizeVisibility(input: unknown): KnowledgeBaseVisibility {
  return input === "operator" || input === "public" ? input : "internal";
}

function normalizeSourceType(input: unknown): KnowledgeBaseSourceType {
  return input === "document" ||
    input === "faq" ||
    input === "flow" ||
    input === "intent" ||
    input === "crm"
    ? input
    : "manual";
}

function serializeCollection(item: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { articles: number };
}) {
  return {
    id: item.id,
    key: item.key,
    name: item.name,
    description: item.description,
    status: normalizeCollectionStatus(item.status),
    visibility: normalizeVisibility(item.visibility),
    articleCount: item._count?.articles ?? 0,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeArticle(item: {
  id: string;
  clientId: string;
  collectionId: string | null;
  key: string;
  title: string;
  summary: string | null;
  question: string | null;
  body: string;
  tags: unknown;
  intentKeys: unknown;
  sourceType: string;
  sourceNote: string | null;
  sourceUrl: string | null;
  status: string;
  visibility: string;
  version: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  collection?: { id: string; key: string; name: string } | null;
}) {
  return {
    id: item.id,
    collectionId: item.collectionId,
    collection: item.collection ?? null,
    key: item.key,
    title: item.title,
    summary: item.summary,
    question: item.question,
    body: item.body,
    tags: normalizeStringList(item.tags),
    intentKeys: normalizeStringList(item.intentKeys),
    sourceType: normalizeSourceType(item.sourceType),
    sourceNote: item.sourceNote,
    sourceUrl: item.sourceUrl,
    status: normalizeArticleStatus(item.status),
    visibility: normalizeVisibility(item.visibility),
    version: item.version,
    createdByUserId: item.createdByUserId,
    updatedByUserId: item.updatedByUserId,
    publishedByUserId: item.publishedByUserId,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listKnowledgeBase(params: {
  prisma: PrismaClient;
  clientId: string;
  status?: string | null;
  search?: string | null;
}) {
  const status = params.status ? normalizeArticleStatus(params.status) : null;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const [collections, articles] = await Promise.all([
    params.prisma.knowledgeBaseCollection.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { _count: { select: { articles: true } } },
    }),
    params.prisma.knowledgeBaseArticle.findMany({
      where: {
        clientId: params.clientId,
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { key: { contains: search, mode: "insensitive" } },
                { summary: { contains: search, mode: "insensitive" } },
                { question: { contains: search, mode: "insensitive" } },
                { body: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { collection: { select: { id: true, key: true, name: true } } },
      take: 200,
    }),
  ]);
  return {
    collections: collections.map(serializeCollection),
    articles: articles.map(serializeArticle),
  };
}

export async function getKnowledgeBaseArticle(params: {
  prisma: PrismaClient;
  clientId: string;
  articleId: string;
}) {
  const article = await params.prisma.knowledgeBaseArticle.findFirst({
    where: { id: params.articleId, clientId: params.clientId },
    include: { collection: { select: { id: true, key: true, name: true } } },
  });
  return article ? serializeArticle(article) : null;
}

export async function createKnowledgeBaseCollection(params: {
  prisma: PrismaClient;
  clientId: string;
  input: KnowledgeBaseCollectionInput;
}) {
  const name = normalizeText(params.input.name, MAX_TITLE_LENGTH);
  if (!name) {
    return { ok: false as const, error: "collection_name_required" };
  }
  const key = normalizeKnowledgeKey(params.input.key, name);
  const collection = await params.prisma.knowledgeBaseCollection.create({
    data: {
      clientId: params.clientId,
      key,
      name,
      description: normalizeOptionalText(params.input.description, MAX_NOTE_LENGTH),
      visibility: normalizeVisibility(params.input.visibility),
    },
    include: { _count: { select: { articles: true } } },
  });
  return { ok: true as const, collection: serializeCollection(collection) };
}

function buildArticleData(input: KnowledgeBaseArticleInput) {
  const title = normalizeText(input.title, MAX_TITLE_LENGTH);
  const body = normalizeText(input.body, MAX_BODY_LENGTH);
  if (!title) return { ok: false as const, error: "article_title_required" };
  if (!body) return { ok: false as const, error: "article_body_required" };
  return {
    ok: true as const,
    data: {
      collectionId: typeof input.collectionId === "string" && input.collectionId.trim() ? input.collectionId.trim() : null,
      key: normalizeKnowledgeKey(input.key, title),
      title,
      summary: normalizeOptionalText(input.summary, MAX_SUMMARY_LENGTH),
      question: normalizeOptionalText(input.question, MAX_SUMMARY_LENGTH),
      body,
      tags: normalizeStringList(input.tags),
      intentKeys: normalizeStringList(input.intentKeys),
      sourceType: normalizeSourceType(input.sourceType),
      sourceNote: normalizeOptionalText(input.sourceNote, MAX_NOTE_LENGTH),
      sourceUrl: normalizeOptionalText(input.sourceUrl, MAX_URL_LENGTH),
      visibility: normalizeVisibility(input.visibility),
    },
  };
}

export async function createKnowledgeBaseArticle(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  input: KnowledgeBaseArticleInput;
}) {
  const normalized = buildArticleData(params.input);
  if (!normalized.ok) return normalized;
  if (normalized.data.collectionId) {
    const collection = await params.prisma.knowledgeBaseCollection.findFirst({
      where: { id: normalized.data.collectionId, clientId: params.clientId },
      select: { id: true },
    });
    if (!collection) return { ok: false as const, error: "collection_not_found" };
  }
  const article = await params.prisma.knowledgeBaseArticle.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
      createdByUserId: params.userId,
      updatedByUserId: params.userId,
    },
    include: { collection: { select: { id: true, key: true, name: true } } },
  });
  return { ok: true as const, article: serializeArticle(article) };
}

export async function updateKnowledgeBaseArticle(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  articleId: string;
  input: KnowledgeBaseArticleInput;
}) {
  const existing = await params.prisma.knowledgeBaseArticle.findFirst({
    where: { id: params.articleId, clientId: params.clientId },
    select: { id: true, version: true },
  });
  if (!existing) return { ok: false as const, error: "article_not_found" };
  const normalized = buildArticleData(params.input);
  if (!normalized.ok) return normalized;
  if (normalized.data.collectionId) {
    const collection = await params.prisma.knowledgeBaseCollection.findFirst({
      where: { id: normalized.data.collectionId, clientId: params.clientId },
      select: { id: true },
    });
    if (!collection) return { ok: false as const, error: "collection_not_found" };
  }
  const article = await params.prisma.knowledgeBaseArticle.update({
    where: { id: existing.id },
    data: {
      ...normalized.data,
      updatedByUserId: params.userId,
      version: { increment: 1 },
    },
    include: { collection: { select: { id: true, key: true, name: true } } },
  });
  return { ok: true as const, article: serializeArticle(article) };
}

export async function transitionKnowledgeBaseArticle(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  articleId: string;
  action: "publish" | "unpublish" | "archive";
}) {
  const existing = await params.prisma.knowledgeBaseArticle.findFirst({
    where: { id: params.articleId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "article_not_found" };
  const now = new Date();
  const article = await params.prisma.knowledgeBaseArticle.update({
    where: { id: existing.id },
    data:
      params.action === "publish"
        ? {
            status: "published",
            publishedAt: now,
            archivedAt: null,
            publishedByUserId: params.userId,
            updatedByUserId: params.userId,
            version: { increment: 1 },
          }
        : params.action === "archive"
          ? {
              status: "archived",
              archivedAt: now,
              updatedByUserId: params.userId,
              version: { increment: 1 },
            }
          : {
              status: "draft",
              publishedAt: null,
              publishedByUserId: null,
              updatedByUserId: params.userId,
              version: { increment: 1 },
            },
    include: { collection: { select: { id: true, key: true, name: true } } },
  });
  return { ok: true as const, article: serializeArticle(article) };
}

