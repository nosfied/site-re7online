import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient, TrainingContentStatus, TrainingContentType } from "@prisma/client";
import { logger } from "../logger/logger.js";
import { getTrainingContentRoot } from "./trainingContent.js";

export const TRAINING_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export type TrainingFileUpload = {
  fileName: string | null;
  mimeType: string;
  content: Buffer;
};

export type TrainingContentInput = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  type?: unknown;
  sortOrder?: unknown;
  status?: unknown;
  downloadable?: unknown;
};

export type TrainingContentErrorCode =
  | "training_storage_unavailable"
  | "training_content_not_found"
  | "training_file_required"
  | "training_file_invalid"
  | "training_file_too_large"
  | "training_invalid_input"
  | "training_content_unavailable";

export class TrainingContentError extends Error {
  status: number;
  code: TrainingContentErrorCode;

  constructor(status: number, code: TrainingContentErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,90}$/;
const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(pdf|mp4)$/;
const CATEGORY_FALLBACK = "Primeiros passos";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeOptionalText(value: unknown, max: number) {
  const normalized = normalizeText(value, max);
  return normalized || null;
}

function normalizeSortOrder(value: unknown) {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-999999, Math.min(999999, Math.trunc(numeric)));
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não", "off"].includes(normalized)) return false;
  }
  return false;
}

function normalizeType(value: unknown): TrainingContentType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "VIDEO") return TrainingContentType.VIDEO;
  if (normalized === "PDF") return TrainingContentType.PDF;
  return null;
}

function normalizeStatus(value: unknown): TrainingContentStatus {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "PUBLISHED" ? TrainingContentStatus.PUBLISHED : TrainingContentStatus.DRAFT;
}

function sanitizeOriginalFilename(value: string | null | undefined) {
  const base = path.basename(String(value ?? "").trim()).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160);
  return base || "training-content";
}

function extensionForType(type: TrainingContentType) {
  return type === TrainingContentType.PDF ? ".pdf" : ".mp4";
}

function mimeForType(type: TrainingContentType) {
  return type === TrainingContentType.PDF ? "application/pdf" : "video/mp4";
}

function labelForType(type: TrainingContentType) {
  return type === TrainingContentType.PDF ? "pdf" : "video";
}

function normalizeContentId(title: string) {
  const ascii = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return ascii && CONTENT_ID_PATTERN.test(ascii) ? ascii : `training-${crypto.randomUUID().slice(0, 8)}`;
}

async function buildUniqueContentId(prisma: PrismaClient, title: string) {
  const base = normalizeContentId(title);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.trainingContent.findUnique({
      where: { contentId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function validateFileForType(file: TrainingFileUpload | null, type: TrainingContentType) {
  if (!file) {
    throw new TrainingContentError(400, "training_file_required", "Arquivo obrigatorio.");
  }
  if (file.content.length <= 0) {
    throw new TrainingContentError(400, "training_file_invalid", "Arquivo invalido.");
  }
  if (file.content.length > TRAINING_UPLOAD_MAX_BYTES) {
    throw new TrainingContentError(413, "training_file_too_large", "Arquivo grande demais.");
  }
  const expectedExtension = extensionForType(type);
  const expectedMime = mimeForType(type);
  const originalFilename = sanitizeOriginalFilename(file.fileName);
  const extension = path.extname(originalFilename).toLowerCase();
  const mimeType = file.mimeType.trim().toLowerCase();
  if (extension !== expectedExtension || mimeType !== expectedMime) {
    throw new TrainingContentError(400, "training_file_invalid", "Formato de arquivo nao permitido.");
  }
  if (type === TrainingContentType.PDF && !file.content.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new TrainingContentError(400, "training_file_invalid", "Arquivo PDF invalido.");
  }
  if (type === TrainingContentType.VIDEO) {
    const probe = file.content.subarray(4, 12).toString("latin1");
    if (!probe.includes("ftyp")) {
      throw new TrainingContentError(400, "training_file_invalid", "Arquivo MP4 invalido.");
    }
  }
  return {
    originalFilename,
    mimeType: expectedMime,
    sizeBytes: file.content.length,
  };
}

async function ensureTrainingRoot() {
  const root = getTrainingContentRoot();
  if (!root) {
    throw new TrainingContentError(
      503,
      "training_storage_unavailable",
      "Storage de treinamento nao configurado."
    );
  }
  await fs.mkdir(root, { recursive: true });
  return fs.realpath(root);
}

async function resolveStoragePath(storageKey: string) {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
  }
  const rootRealPath = await ensureTrainingRoot();
  const absolutePath = path.resolve(rootRealPath, storageKey);
  const rootPrefix = rootRealPath.endsWith(path.sep) ? rootRealPath : `${rootRealPath}${path.sep}`;
  if (absolutePath !== rootRealPath && !absolutePath.startsWith(rootPrefix)) {
    throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
  }
  return { rootRealPath, absolutePath };
}

async function writeTrainingFile(file: TrainingFileUpload, type: TrainingContentType) {
  const storageKey = `${crypto.randomUUID()}${extensionForType(type)}`;
  const { rootRealPath, absolutePath } = await resolveStoragePath(storageKey);
  const tempDir = path.join(rootRealPath, ".tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${storageKey}.${process.pid}.tmp`);
  try {
    await fs.writeFile(tempPath, file.content, { flag: "wx" });
    await fs.rename(tempPath, absolutePath);
    return storageKey;
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    logger.error({
      event: "training.content.file_store_failed",
      type: labelForType(type),
      reason: (error as NodeJS.ErrnoException).code ?? (error as Error).name,
    });
    throw new TrainingContentError(500, "training_content_unavailable", "Falha ao armazenar arquivo.");
  }
}

async function removeTrainingFile(storageKey: string | null | undefined) {
  if (!storageKey) return;
  try {
    const { absolutePath } = await resolveStoragePath(storageKey);
    await fs.rm(absolutePath, { force: true });
  } catch (error) {
    logger.warn({
      event: "training.content.file_remove_failed",
      storageKeyHash: crypto.createHash("sha256").update(String(storageKey)).digest("hex").slice(0, 16),
      reason: (error as NodeJS.ErrnoException).code ?? (error as Error).name,
    });
  }
}

function normalizeTrainingPayload(input: TrainingContentInput, options: { requireType: boolean }) {
  const title = normalizeText(input.title, 160);
  if (!title) {
    throw new TrainingContentError(400, "training_invalid_input", "Titulo obrigatorio.");
  }
  const type = normalizeType(input.type);
  if (options.requireType && !type) {
    throw new TrainingContentError(400, "training_invalid_input", "Tipo obrigatorio.");
  }
  return {
    title,
    description: normalizeOptionalText(input.description, 800),
    category: normalizeText(input.category, 120) || CATEGORY_FALLBACK,
    type,
    sortOrder: normalizeSortOrder(input.sortOrder),
    status: normalizeStatus(input.status),
    downloadable: normalizeBoolean(input.downloadable),
  };
}

function serializeAdminItem(item: {
  id: string;
  contentId: string;
  type: TrainingContentType;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
  status: TrainingContentStatus;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  downloadable: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    contentId: item.contentId,
    type: item.type,
    title: item.title,
    description: item.description,
    category: item.category,
    sortOrder: item.sortOrder,
    status: item.status,
    originalFilename: item.originalFilename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    downloadable: item.downloadable,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    previewUrl: `/admin/training/${encodeURIComponent(item.id)}/content`,
    downloadUrl: `/admin/training/${encodeURIComponent(item.id)}/content?download=1`,
  };
}

function emitTrainingAudit(event: string, item: { id: string; contentId: string; type?: TrainingContentType; status?: TrainingContentStatus }) {
  logger.info({
    event,
    trainingContentId: item.id,
    contentId: item.contentId,
    ...(item.type ? { type: item.type } : {}),
    ...(item.status ? { status: item.status } : {}),
  });
}

export async function listTrainingContentAdmin(prisma: PrismaClient) {
  const items = await prisma.trainingContent.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }, { createdAt: "asc" }],
  });
  return { ok: true, items: items.map(serializeAdminItem) };
}

export async function createTrainingContentAdmin(
  prisma: PrismaClient,
  input: TrainingContentInput,
  file: TrainingFileUpload | null
) {
  const payload = normalizeTrainingPayload(input, { requireType: true });
  const type = payload.type as TrainingContentType;
  const validatedFile = validateFileForType(file, type);
  const storageKey = await writeTrainingFile(file as TrainingFileUpload, type);
  try {
    const contentId = await buildUniqueContentId(prisma, payload.title);
    const item = await prisma.trainingContent.create({
      data: {
        contentId,
        type,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        sortOrder: payload.sortOrder,
        status: payload.status,
        storageKey,
        originalFilename: validatedFile.originalFilename,
        mimeType: validatedFile.mimeType,
        sizeBytes: validatedFile.sizeBytes,
        downloadable: payload.downloadable,
        publishedAt: payload.status === TrainingContentStatus.PUBLISHED ? new Date() : null,
      },
    });
    emitTrainingAudit("training.content.created", item);
    if (item.status === TrainingContentStatus.PUBLISHED) {
      emitTrainingAudit("training.content.published", item);
    }
    return { ok: true, item: serializeAdminItem(item) };
  } catch (error) {
    await removeTrainingFile(storageKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TrainingContentError(409, "training_invalid_input", "Identificador de conteudo ja existe.");
    }
    throw error;
  }
}

export async function updateTrainingContentAdmin(
  prisma: PrismaClient,
  id: string,
  input: TrainingContentInput
) {
  const existing = await prisma.trainingContent.findUnique({ where: { id } });
  if (!existing) {
    throw new TrainingContentError(404, "training_content_not_found", "Treinamento nao encontrado.");
  }
  const payload = normalizeTrainingPayload(
    {
      ...existing,
      ...input,
    },
    { requireType: false }
  );
  const nextStatus = normalizeStatus(input.status ?? existing.status);
  const item = await prisma.trainingContent.update({
    where: { id },
    data: {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      sortOrder: payload.sortOrder,
      status: nextStatus,
      downloadable: payload.downloadable,
      publishedAt:
        nextStatus === TrainingContentStatus.PUBLISHED
          ? existing.publishedAt ?? new Date()
          : null,
    },
  });
  emitTrainingAudit("training.content.updated", item);
  if (existing.status !== item.status) {
    emitTrainingAudit(
      item.status === TrainingContentStatus.PUBLISHED
        ? "training.content.published"
        : "training.content.unpublished",
      item
    );
  }
  return { ok: true, item: serializeAdminItem(item) };
}

export async function replaceTrainingContentFileAdmin(
  prisma: PrismaClient,
  id: string,
  file: TrainingFileUpload | null
) {
  const existing = await prisma.trainingContent.findUnique({ where: { id } });
  if (!existing) {
    throw new TrainingContentError(404, "training_content_not_found", "Treinamento nao encontrado.");
  }
  const validatedFile = validateFileForType(file, existing.type);
  const nextStorageKey = await writeTrainingFile(file as TrainingFileUpload, existing.type);
  try {
    const item = await prisma.trainingContent.update({
      where: { id },
      data: {
        storageKey: nextStorageKey,
        originalFilename: validatedFile.originalFilename,
        mimeType: validatedFile.mimeType,
        sizeBytes: validatedFile.sizeBytes,
      },
    });
    await removeTrainingFile(existing.storageKey);
    emitTrainingAudit("training.content.file_replaced", item);
    return { ok: true, item: serializeAdminItem(item) };
  } catch (error) {
    await removeTrainingFile(nextStorageKey);
    throw error;
  }
}

export async function deleteTrainingContentAdmin(prisma: PrismaClient, id: string) {
  const existing = await prisma.trainingContent.findUnique({ where: { id } });
  if (!existing) {
    throw new TrainingContentError(404, "training_content_not_found", "Treinamento nao encontrado.");
  }
  await prisma.trainingContent.delete({ where: { id } });
  await removeTrainingFile(existing.storageKey);
  emitTrainingAudit("training.content.deleted", existing);
  return { ok: true };
}

export async function serializeTrainingCatalogFromDb(prisma: PrismaClient) {
  const items = await prisma.trainingContent.findMany({
    where: { status: TrainingContentStatus.PUBLISHED },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }, { createdAt: "asc" }],
  });
  const sections = new Map<string, ReturnType<typeof serializeAdminItem>[]>();
  for (const item of items) {
    const key = item.category || CATEGORY_FALLBACK;
    const sectionItems = sections.get(key) ?? [];
    sectionItems.push(serializeAdminItem(item));
    sections.set(key, sectionItems);
  }
  return {
    ok: true as const,
    version: 2,
    storageConfigured: Boolean(getTrainingContentRoot()),
    sections: Array.from(sections.entries()).map(([category, sectionItems]) => ({
      id: normalizeContentId(category),
      title: category,
      items: sectionItems.map((item) => ({
        id: item.contentId,
        type: item.type === TrainingContentType.PDF ? "pdf" : "video",
        title: item.title,
        description: item.description ?? undefined,
        contentId: item.contentId,
        available: Boolean(getTrainingContentRoot()),
        streamUrl: `/app/training/content/${encodeURIComponent(item.contentId)}`,
        ...(item.downloadable
          ? { downloadUrl: `/app/training/content/${encodeURIComponent(item.contentId)}/download` }
          : {}),
        downloadable: item.downloadable,
        updatedAt: item.updatedAt,
      })),
    })),
  };
}

export async function resolveTrainingContentFromDb(params: {
  prisma: PrismaClient;
  contentId: string;
  includeDraft?: boolean;
}) {
  const contentId = normalizeText(params.contentId, 100);
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
  }
  const item = await params.prisma.trainingContent.findUnique({ where: { contentId } });
  if (!item || (!params.includeDraft && item.status !== TrainingContentStatus.PUBLISHED)) {
    throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
  }
  try {
    const { absolutePath, rootRealPath } = await resolveStoragePath(item.storageKey);
    const fileRealPath = await fs.realpath(absolutePath);
    const rootPrefix = rootRealPath.endsWith(path.sep) ? rootRealPath : `${rootRealPath}${path.sep}`;
    if (fileRealPath !== rootRealPath && !fileRealPath.startsWith(rootPrefix)) {
      throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
    }
    const stat = await fs.stat(fileRealPath);
    if (!stat.isFile()) {
      throw new TrainingContentError(404, "training_content_not_found", "Material nao encontrado.");
    }
    return {
      ok: true as const,
      item,
      absolutePath: fileRealPath,
      stat: { size: stat.size, mtime: stat.mtime },
      mimeType: item.mimeType,
      fileName: sanitizeOriginalFilename(item.originalFilename),
    };
  } catch (error) {
    if (error instanceof TrainingContentError) throw error;
    logger.warn({
      event: "training.content.unavailable",
      contentId: item.contentId,
      reason: (error as NodeJS.ErrnoException).code ?? (error as Error).name,
    });
    throw new TrainingContentError(404, "training_content_unavailable", "Material indisponivel no momento.");
  }
}

export async function resolveTrainingContentByAdminId(params: {
  prisma: PrismaClient;
  id: string;
}) {
  const item = await params.prisma.trainingContent.findUnique({ where: { id: params.id } });
  if (!item) {
    throw new TrainingContentError(404, "training_content_not_found", "Treinamento nao encontrado.");
  }
  return resolveTrainingContentFromDb({
    prisma: params.prisma,
    contentId: item.contentId,
    includeDraft: true,
  });
}

export function trainingContentErrorBody(error: TrainingContentError) {
  return {
    error: error.code,
    message: error.message,
  };
}

export function parseTrainingContentJsonInput(value: unknown): TrainingContentInput {
  return isRecord(value) ? value : {};
}
