import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger/logger.js";
import {
  trainingCatalogManifest,
  type TrainingCatalogItem,
  type TrainingCatalogItemType,
  type TrainingCatalogManifest,
  type TrainingCatalogSection,
} from "./trainingCatalog.js";

export type SerializedTrainingCatalogItem = Omit<TrainingCatalogItem, "path"> & {
  contentId?: string;
  available: boolean;
  streamUrl?: string;
  downloadUrl?: string;
};

export type SerializedTrainingCatalog = {
  ok: true;
  version: number;
  storageConfigured: boolean;
  sections: Array<Omit<TrainingCatalogSection, "items"> & { items: SerializedTrainingCatalogItem[] }>;
};

export type TrainingContentResolution =
  | {
      ok: true;
      item: TrainingCatalogItem & { path: string };
      absolutePath: string;
      stat: { size: number; mtime: Date };
      mimeType: string;
      fileName: string;
    }
  | {
      ok: false;
      status: 400 | 404 | 503;
      error: "training_storage_unavailable" | "training_content_not_found" | "training_content_unavailable";
      message: string;
    };

const ALLOWED_TYPES = new Set<TrainingCatalogItemType>(["video", "pdf", "link"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,80}$/;
const ALLOWED_EXTENSIONS: Record<"video" | "pdf", string[]> = {
  video: [".mp4"],
  pdf: [".pdf"],
};

export function getTrainingContentRoot() {
  return (process.env.TRAINING_CONTENT_ROOT ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const tags = Array.from(
    new Set(
      value
        .map((item) => normalizeString(item, 60))
        .filter((item) => ID_PATTERN.test(item))
    )
  );
  return tags.length ? tags : undefined;
}

function isSafeRelativePath(value: string) {
  if (!value || path.isAbsolute(value) || value.includes("\0")) return false;
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return normalized === value && !normalized.startsWith("../") && normalized !== "..";
}

function sanitizeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return base || "training-content";
}

function mimeForItem(item: TrainingCatalogItem) {
  if (item.type === "video") return "video/mp4";
  if (item.type === "pdf") return "application/pdf";
  return null;
}

function normalizeItem(rawItem: unknown, seenIds: Set<string>): TrainingCatalogItem | null {
  if (!isRecord(rawItem)) return null;
  const id = normalizeString(rawItem.id, 90);
  const type = normalizeString(rawItem.type, 20) as TrainingCatalogItemType;
  const title = normalizeString(rawItem.title, 160);
  if (!ID_PATTERN.test(id) || seenIds.has(id) || !ALLOWED_TYPES.has(type) || !title) return null;
  seenIds.add(id);
  const description = normalizeString(rawItem.description, 400);
  const pathValue = normalizeString(rawItem.path, 400);
  const url = normalizeString(rawItem.url, 600);
  if ((type === "video" || type === "pdf") && !isSafeRelativePath(pathValue)) return null;
  if (type === "link" && !/^https:\/\//i.test(url)) return null;
  if (type === "video" || type === "pdf") {
    const extension = path.extname(pathValue).toLowerCase();
    if (!ALLOWED_EXTENSIONS[type].includes(extension)) return null;
  }
  const tags = normalizeTags(rawItem.tags);
  const durationLabel = normalizeString(rawItem.durationLabel, 80);
  const updatedAt = normalizeString(rawItem.updatedAt, 40);
  return {
    id,
    type,
    title,
    ...(description ? { description } : {}),
    ...(type === "link" ? { url } : { path: pathValue }),
    ...(durationLabel ? { durationLabel } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(tags ? { tags } : {}),
    ...(typeof rawItem.downloadable === "boolean" ? { downloadable: rawItem.downloadable } : {}),
  };
}

export function getValidatedTrainingCatalog(
  manifest: TrainingCatalogManifest = trainingCatalogManifest
): TrainingCatalogManifest {
  const seenIds = new Set<string>();
  const sections: TrainingCatalogSection[] = [];
  for (const rawSection of manifest.sections ?? []) {
    if (!isRecord(rawSection)) continue;
    const id = normalizeString(rawSection.id, 90);
    const title = normalizeString(rawSection.title, 160);
    if (!ID_PATTERN.test(id) || !title) continue;
    const items: TrainingCatalogItem[] = [];
    if (Array.isArray(rawSection.items)) {
      rawSection.items.forEach((item, index) => {
        const normalized = normalizeItem(item, seenIds);
        if (normalized) {
          items.push(normalized);
          return;
        }
        logger.warn({
          event: "training.catalog.invalid_item_skipped",
          sectionId: id,
          itemIndex: index,
        });
      });
    }
    sections.push({
      id,
      title,
      ...(normalizeString(rawSection.description, 400)
        ? { description: normalizeString(rawSection.description, 400) }
        : {}),
      items,
    });
  }
  return { version: Number.isInteger(manifest.version) ? manifest.version : 1, sections };
}

export function findTrainingCatalogItem(contentId: string, manifest = getValidatedTrainingCatalog()) {
  const id = normalizeString(contentId, 90);
  if (!ID_PATTERN.test(id)) return null;
  for (const section of manifest.sections) {
    const item = section.items.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

export function serializeTrainingCatalog(): SerializedTrainingCatalog {
  const storageConfigured = Boolean(getTrainingContentRoot());
  const manifest = getValidatedTrainingCatalog();
  return {
    ok: true,
    version: manifest.version,
    storageConfigured,
    sections: manifest.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      items: section.items.map((item) => {
        const base = {
          id: item.id,
          type: item.type,
          title: item.title,
          description: item.description,
          durationLabel: item.durationLabel,
          updatedAt: item.updatedAt,
          tags: item.tags,
          downloadable: item.downloadable,
        };
        if (item.type === "link") {
          return { ...base, url: item.url, available: Boolean(item.url) };
        }
        const contentId = item.id;
        return {
          ...base,
          contentId,
          available: storageConfigured,
          streamUrl: `/app/training/content/${encodeURIComponent(contentId)}`,
          ...(item.downloadable
            ? { downloadUrl: `/app/training/content/${encodeURIComponent(contentId)}/download` }
            : {}),
        };
      }),
    })),
  };
}

export async function resolveTrainingContent(contentId: string): Promise<TrainingContentResolution> {
  const root = getTrainingContentRoot();
  if (!root) {
    return {
      ok: false,
      status: 503,
      error: "training_storage_unavailable",
      message: "Os materiais de treinamento ainda nao estao disponiveis.",
    };
  }
  const item = findTrainingCatalogItem(contentId);
  if (!item || item.type === "link" || !item.path) {
    return {
      ok: false,
      status: 404,
      error: "training_content_not_found",
      message: "Material nao encontrado.",
    };
  }
  const mimeType = mimeForItem(item);
  if (!mimeType) {
    return {
      ok: false,
      status: 404,
      error: "training_content_not_found",
      message: "Material nao encontrado.",
    };
  }
  try {
    const rootRealPath = await fs.realpath(root);
    const absolutePath = path.resolve(rootRealPath, item.path);
    const fileRealPath = await fs.realpath(absolutePath);
    const rootPrefix = rootRealPath.endsWith(path.sep) ? rootRealPath : `${rootRealPath}${path.sep}`;
    if (fileRealPath !== rootRealPath && !fileRealPath.startsWith(rootPrefix)) {
      logger.warn({
        event: "training.content.path_escape_blocked",
        contentId: item.id,
      });
      return {
        ok: false,
        status: 404,
        error: "training_content_not_found",
        message: "Material nao encontrado.",
      };
    }
    const stat = await fs.stat(fileRealPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        status: 404,
        error: "training_content_not_found",
        message: "Material nao encontrado.",
      };
    }
    return {
      ok: true,
      item: item as TrainingCatalogItem & { path: string },
      absolutePath: fileRealPath,
      stat: { size: stat.size, mtime: stat.mtime },
      mimeType,
      fileName: sanitizeFileName(item.path),
    };
  } catch (error) {
    logger.warn({
      event: "training.content.unavailable",
      contentId: item.id,
      reason: (error as NodeJS.ErrnoException).code ?? (error as Error).name,
    });
    return {
      ok: false,
      status: 404,
      error: "training_content_unavailable",
      message: "Material indisponivel no momento.",
    };
  }
}

export function parseTrainingRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { ok: false as const };
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (!startRaw && !endRaw) return { ok: false as const };
  let start = startRaw ? Number.parseInt(startRaw, 10) : 0;
  let end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
  if (!startRaw && endRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { ok: false as const };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { ok: false as const };
  }
  return { ok: true as const, start, end: Math.min(end, size - 1) };
}
