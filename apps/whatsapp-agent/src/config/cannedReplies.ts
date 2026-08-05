import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export type CannedReply = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

type CannedReplyInput = {
  title?: unknown;
  body?: unknown;
  category?: unknown;
};

export class CannedReplyValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "CannedReplyValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeWhitespace(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertNoMarkup(input: string, field: string) {
  if (/[<>]/.test(input) || /script:/i.test(input) || /javascript:/i.test(input)) {
    throw new CannedReplyValidationError("invalid_canned_reply", `${field} contem caracteres nao permitidos.`);
  }
}

function normalizeTitle(input: unknown) {
  const value = normalizeWhitespace(typeof input === "string" ? input : "");
  if (!value) {
    throw new CannedReplyValidationError("invalid_canned_reply", "Titulo da mensagem pronta e obrigatorio.");
  }
  if (value.length > 80) {
    throw new CannedReplyValidationError("invalid_canned_reply", "Titulo deve ter no maximo 80 caracteres.");
  }
  assertNoMarkup(value, "Titulo");
  return value;
}

function normalizeBody(input: unknown) {
  const value = normalizeWhitespace(typeof input === "string" ? input : "");
  if (!value) {
    throw new CannedReplyValidationError("invalid_canned_reply", "Texto da mensagem pronta e obrigatorio.");
  }
  if (value.length > 2000) {
    throw new CannedReplyValidationError("invalid_canned_reply", "Texto deve ter no maximo 2000 caracteres.");
  }
  assertNoMarkup(value, "Texto");
  return value;
}

function normalizeCategory(input: unknown) {
  const value = normalizeWhitespace(typeof input === "string" ? input : "");
  if (!value) return null;
  if (value.length > 48) {
    throw new CannedReplyValidationError("invalid_canned_reply", "Categoria deve ter no maximo 48 caracteres.");
  }
  assertNoMarkup(value, "Categoria");
  return value;
}

function normalizeStoredCannedReply(input: unknown): CannedReply | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const title = typeof input.title === "string" ? normalizeWhitespace(input.title) : "";
  const body = typeof input.body === "string" ? normalizeWhitespace(input.body) : "";
  if (!id || !title || !body) return null;
  return {
    id,
    title: title.slice(0, 80),
    body: body.slice(0, 2000),
    active: input.active !== false,
    category: normalizeCategory(input.category),
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : new Date(0).toISOString(),
    updatedAt: typeof input.updatedAt === "string" && input.updatedAt ? input.updatedAt : new Date(0).toISOString(),
    createdBy: typeof input.createdBy === "string" && input.createdBy ? input.createdBy : null,
    updatedBy: typeof input.updatedBy === "string" && input.updatedBy ? input.updatedBy : null,
  };
}

function readCannedRepliesFromConfig(config: unknown) {
  if (!isRecord(config) || !Array.isArray(config.cannedReplies)) return [];
  return config.cannedReplies
    .map(normalizeStoredCannedReply)
    .filter((item): item is CannedReply => Boolean(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function loadOperationalConfig(prisma: PrismaClient, clientId: string) {
  const record = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId },
    select: { config: true },
  });
  return isRecord(record?.config) ? { ...record.config } : {};
}

async function saveOperationalConfig(
  prisma: PrismaClient,
  clientId: string,
  config: Record<string, unknown>
) {
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId },
    update: {
      config: config as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId,
      config: config as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
  });
}

export async function listCannedReplies(params: {
  prisma: PrismaClient;
  clientId: string;
  includeInactive?: boolean;
}) {
  const config = await loadOperationalConfig(params.prisma, params.clientId);
  const replies = readCannedRepliesFromConfig(config);
  return params.includeInactive ? replies : replies.filter((reply) => reply.active);
}

export async function getCannedReply(params: {
  prisma: PrismaClient;
  clientId: string;
  replyId: string;
}) {
  const replies = await listCannedReplies({
    prisma: params.prisma,
    clientId: params.clientId,
    includeInactive: true,
  });
  return replies.find((reply) => reply.id === params.replyId) ?? null;
}

export async function createCannedReply(params: {
  prisma: PrismaClient;
  clientId: string;
  input: CannedReplyInput;
  userId: string;
}) {
  const now = new Date().toISOString();
  const config = await loadOperationalConfig(params.prisma, params.clientId);
  const replies = readCannedRepliesFromConfig(config);
  const reply: CannedReply = {
    id: crypto.randomUUID(),
    title: normalizeTitle(params.input.title),
    body: normalizeBody(params.input.body),
    category: normalizeCategory(params.input.category),
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: params.userId,
    updatedBy: params.userId,
  };
  const nextConfig = {
    ...config,
    cannedReplies: [reply, ...replies],
  };
  await saveOperationalConfig(params.prisma, params.clientId, nextConfig);
  return reply;
}

export async function updateCannedReply(params: {
  prisma: PrismaClient;
  clientId: string;
  replyId: string;
  input: CannedReplyInput;
  userId: string;
}) {
  const now = new Date().toISOString();
  const config = await loadOperationalConfig(params.prisma, params.clientId);
  const replies = readCannedRepliesFromConfig(config);
  const index = replies.findIndex((reply) => reply.id === params.replyId);
  if (index === -1) return null;
  const current = replies[index];
  if (!current) return null;
  const next: CannedReply = {
    ...current,
    title: Object.prototype.hasOwnProperty.call(params.input, "title")
      ? normalizeTitle(params.input.title)
      : current.title,
    body: Object.prototype.hasOwnProperty.call(params.input, "body")
      ? normalizeBody(params.input.body)
      : current.body,
    category: Object.prototype.hasOwnProperty.call(params.input, "category")
      ? normalizeCategory(params.input.category)
      : current.category,
    updatedAt: now,
    updatedBy: params.userId,
  };
  replies[index] = next;
  await saveOperationalConfig(params.prisma, params.clientId, {
    ...config,
    cannedReplies: replies,
  });
  return next;
}

export async function setCannedReplyActive(params: {
  prisma: PrismaClient;
  clientId: string;
  replyId: string;
  active: boolean;
  userId: string;
}) {
  const now = new Date().toISOString();
  const config = await loadOperationalConfig(params.prisma, params.clientId);
  const replies = readCannedRepliesFromConfig(config);
  const index = replies.findIndex((reply) => reply.id === params.replyId);
  if (index === -1) return null;
  const current = replies[index];
  if (!current) return null;
  const next: CannedReply = {
    ...current,
    active: params.active,
    updatedAt: now,
    updatedBy: params.userId,
  };
  replies[index] = next;
  await saveOperationalConfig(params.prisma, params.clientId, {
    ...config,
    cannedReplies: replies,
  });
  return next;
}
