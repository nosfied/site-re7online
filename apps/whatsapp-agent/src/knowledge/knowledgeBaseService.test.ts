import test from "node:test";
import assert from "node:assert/strict";
import {
  createKnowledgeBaseArticle,
  listKnowledgeBase,
  normalizeKnowledgeKey,
  transitionKnowledgeBaseArticle,
} from "./knowledgeBaseService.js";

function now() {
  return new Date("2026-06-20T12:00:00.000Z");
}

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: "article_1",
    clientId: "client_a",
    collectionId: null,
    key: "horario",
    title: "Horario de atendimento",
    summary: null,
    question: null,
    body: "Atendimento de segunda a sexta.",
    tags: [],
    intentKeys: [],
    sourceType: "manual",
    sourceNote: null,
    sourceUrl: null,
    status: "draft",
    visibility: "internal",
    version: 1,
    createdByUserId: "user_1",
    updatedByUserId: "user_1",
    publishedByUserId: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    collection: null,
    ...overrides,
  };
}

function makeCollection(overrides: Record<string, unknown> = {}) {
  return {
    id: "collection_1",
    key: "faq",
    name: "FAQ",
    description: null,
    status: "active",
    visibility: "internal",
    createdAt: now(),
    updatedAt: now(),
    _count: { articles: 0 },
    ...overrides,
  };
}

test("normalizeKnowledgeKey creates stable ascii keys", () => {
  assert.equal(normalizeKnowledgeKey("", "Endereço da Loja!"), "endereco-da-loja");
  assert.equal(normalizeKnowledgeKey("  Catálogo 2026  ", "fallback"), "catalogo-2026");
});

test("listKnowledgeBase scopes collections and articles by tenant", async () => {
  const calls: Array<{ model: string; where: unknown }> = [];
  const prisma = {
    knowledgeBaseCollection: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "collection", where: args.where });
        return [makeCollection()];
      },
    },
    knowledgeBaseArticle: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "article", where: args.where });
        return [makeArticle()];
      },
    },
  };

  const result = await listKnowledgeBase({ prisma: prisma as never, clientId: "client_a" });

  assert.equal(result.collections.length, 1);
  assert.equal(result.articles.length, 1);
  assert.deepEqual(calls.map((call) => call.where), [{ clientId: "client_a" }, { clientId: "client_a" }]);
});

test("createKnowledgeBaseArticle rejects collection from another tenant", async () => {
  const prisma = {
    knowledgeBaseCollection: {
      findFirst: async (args: { where: { clientId: string } }) =>
        args.where.clientId === "client_b" ? { id: "collection_1" } : null,
    },
    knowledgeBaseArticle: {
      create: async () => makeArticle(),
    },
  };

  const result = await createKnowledgeBaseArticle({
    prisma: prisma as never,
    clientId: "client_a",
    userId: "user_1",
    input: {
      collectionId: "collection_1",
      title: "Endereco",
      body: "Rua principal.",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "collection_not_found");
});

test("transitionKnowledgeBaseArticle publishes only tenant-scoped article", async () => {
  const prisma = {
    knowledgeBaseArticle: {
      findFirst: async (args: { where: { id: string; clientId: string } }) =>
        args.where.id === "article_1" && args.where.clientId === "client_a"
          ? { id: "article_1" }
          : null,
      update: async () =>
        makeArticle({
          status: "published",
          publishedAt: now(),
          publishedByUserId: "user_1",
          version: 2,
        }),
    },
  };

  const denied = await transitionKnowledgeBaseArticle({
    prisma: prisma as never,
    clientId: "client_b",
    userId: "user_1",
    articleId: "article_1",
    action: "publish",
  });
  assert.equal(denied.ok, false);

  const allowed = await transitionKnowledgeBaseArticle({
    prisma: prisma as never,
    clientId: "client_a",
    userId: "user_1",
    articleId: "article_1",
    action: "publish",
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.article.status, "published");
    assert.equal(allowed.article.version, 2);
  }
});
