import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";
import type { Prisma } from "@prisma/client";
import { logger } from "../logger/logger.js";

export const SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

export type SupportAttachmentUpload = {
  fileName: string | null;
  mimeType: string;
  content: Buffer;
};

export type SupportAttachmentMetadata = {
  kind: "image";
  attachmentRef: string;
  storageKey: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  originalFilename: string | null;
  width: number | null;
  height: number | null;
};

export class SupportAttachmentError extends Error {
  constructor(
    public readonly code:
      | "support_attachment_storage_unconfigured"
      | "support_attachment_invalid"
      | "support_attachment_too_large"
      | "support_attachment_write_failed"
      | "support_attachment_not_found",
    public readonly status: 400 | 404 | 413 | 500 | 503,
    message: string
  ) {
    super(message);
  }
}

function normalizeRoot(root: string) {
  const trimmed = root.trim();
  if (!trimmed) {
    throw new SupportAttachmentError(
      "support_attachment_storage_unconfigured",
      503,
      "Armazenamento de anexos de suporte nao configurado."
    );
  }
  return path.resolve(trimmed);
}

function sanitizeOriginalFilename(input: string | null | undefined) {
  const value = String(input ?? "").trim();
  if (!value) return null;
  return value.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || null;
}

function getExtension(fileName: string | null | undefined) {
  const ext = String(fileName ?? "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  return ext && ext !== String(fileName ?? "").trim().toLowerCase() ? ext : "";
}

function extensionForMimeType(mimeType: SupportAttachmentMetadata["mimeType"]) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function detectImageMimeType(content: Buffer): SupportAttachmentMetadata["mimeType"] | null {
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return "image/png";
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function parsePngDimensions(content: Buffer) {
  if (content.length < 24) return { width: null, height: null };
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
  };
}

function parseWebpDimensions(content: Buffer) {
  if (content.length < 30) return { width: null, height: null };
  const chunk = content.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && content.length >= 30) {
    return {
      width: 1 + content.readUIntLE(24, 3),
      height: 1 + content.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && content.length >= 30) {
    return {
      width: content.readUInt16LE(26) & 0x3fff,
      height: content.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && content.length >= 25) {
    const bits = content.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return { width: null, height: null };
}

function parseJpegDimensions(content: Buffer) {
  let offset = 2;
  while (offset + 9 < content.length) {
    if (content[offset] !== 0xff) break;
    const marker = content[offset + 1];
    const length = content.readUInt16BE(offset + 2);
    if (length < 2) break;
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        width: content.readUInt16BE(offset + 7),
        height: content.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }
  return { width: null, height: null };
}

function parseImageDimensions(mimeType: SupportAttachmentMetadata["mimeType"], content: Buffer) {
  try {
    if (mimeType === "image/png") return parsePngDimensions(content);
    if (mimeType === "image/jpeg") return parseJpegDimensions(content);
    if (mimeType === "image/webp") return parseWebpDimensions(content);
  } catch {
    return { width: null, height: null };
  }
  return { width: null, height: null };
}

export function validateSupportImageUpload(file: SupportAttachmentUpload): Omit<SupportAttachmentMetadata, "attachmentRef" | "storageKey"> {
  const sizeBytes = file.content.length;
  if (sizeBytes <= 0) {
    throw new SupportAttachmentError("support_attachment_invalid", 400, "Selecione uma imagem valida.");
  }
  if (sizeBytes > SUPPORT_ATTACHMENT_MAX_BYTES) {
    throw new SupportAttachmentError("support_attachment_too_large", 413, "Imagem grande demais.");
  }
  const declaredMime = file.mimeType.trim().toLowerCase();
  const detectedMime = detectImageMimeType(file.content);
  if (!detectedMime || declaredMime !== detectedMime) {
    throw new SupportAttachmentError("support_attachment_invalid", 400, "Formato de imagem nao permitido.");
  }
  const ext = getExtension(file.fileName);
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
    throw new SupportAttachmentError("support_attachment_invalid", 400, "Formato de imagem nao permitido.");
  }
  if ((ext === "png" && detectedMime !== "image/png") || (ext === "webp" && detectedMime !== "image/webp")) {
    throw new SupportAttachmentError("support_attachment_invalid", 400, "Formato de imagem nao permitido.");
  }
  if ((ext === "jpg" || ext === "jpeg") && detectedMime !== "image/jpeg") {
    throw new SupportAttachmentError("support_attachment_invalid", 400, "Formato de imagem nao permitido.");
  }
  const dimensions = parseImageDimensions(detectedMime, file.content);
  return {
    kind: "image",
    mimeType: detectedMime,
    sizeBytes,
    originalFilename: sanitizeOriginalFilename(file.fileName),
    width: dimensions.width,
    height: dimensions.height,
  };
}

export async function storeSupportImageAttachment(params: {
  root: string;
  clientId: string;
  conversationId: string;
  file: SupportAttachmentUpload;
}): Promise<SupportAttachmentMetadata & { absolutePath: string }> {
  const root = normalizeRoot(params.root);
  const validated = validateSupportImageUpload(params.file);
  const attachmentRef = crypto.randomUUID();
  const storageId = crypto.randomUUID();
  const storageKey = `${storageId}.${extensionForMimeType(validated.mimeType)}`;
  const directory = path.join(root, params.clientId, params.conversationId);
  const tmpDirectory = path.join(root, ".tmp");
  const tmpPath = path.join(tmpDirectory, `${storageId}.tmp`);
  const absolutePath = path.join(directory, storageKey);

  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o750 });
    await fs.mkdir(tmpDirectory, { recursive: true, mode: 0o750 });
    await fs.writeFile(tmpPath, params.file.content, { mode: 0o640 });
    await fs.rename(tmpPath, absolutePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    await fs.rm(absolutePath, { force: true }).catch(() => undefined);
    logger.error({
      event: "support.attachment.store_failed",
      clientId: params.clientId,
      conversationId: params.conversationId,
      message: (error as Error).message,
    });
    throw new SupportAttachmentError("support_attachment_write_failed", 500, "Falha ao armazenar imagem.");
  }

  return {
    ...validated,
    attachmentRef,
    storageKey,
    absolutePath,
  };
}

export async function removeSupportAttachmentFile(params: {
  root: string;
  clientId: string;
  conversationId: string;
  storageKey: string;
}) {
  try {
    const resolved = await resolveSupportAttachmentFile({
      root: params.root,
      clientId: params.clientId,
      conversationId: params.conversationId,
      metadata: {
        kind: "image",
        attachmentRef: "cleanup",
        storageKey: params.storageKey,
        mimeType: "image/png",
        sizeBytes: 0,
        originalFilename: null,
        width: null,
        height: null,
      },
    });
    await fs.rm(resolved.absolutePath, { force: true });
  } catch {
    return;
  }
}

export function supportAttachmentToJson(metadata: SupportAttachmentMetadata, caption: string | null): Prisma.InputJsonValue {
  return {
    kind: metadata.kind,
    attachmentRef: metadata.attachmentRef,
    storageKey: metadata.storageKey,
    mimeType: metadata.mimeType,
    sizeBytes: metadata.sizeBytes,
    originalFilename: metadata.originalFilename,
    width: metadata.width,
    height: metadata.height,
    caption,
  } satisfies Prisma.InputJsonValue;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractSupportAttachmentMetadata(rawPayload: unknown): (SupportAttachmentMetadata & { caption: string | null }) | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const attachment = (rawPayload as Record<string, unknown>).supportAttachment;
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return null;
  const record = attachment as Record<string, unknown>;
  const kind = readString(record, "kind");
  const attachmentRef = readString(record, "attachmentRef");
  const storageKey = readString(record, "storageKey");
  const mimeType = readString(record, "mimeType");
  const sizeBytes = readNumber(record, "sizeBytes");
  if (
    kind !== "image" ||
    !attachmentRef ||
    !storageKey ||
    (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") ||
    sizeBytes === null
  ) {
    return null;
  }
  return {
    kind,
    attachmentRef,
    storageKey,
    mimeType,
    sizeBytes,
    originalFilename: readString(record, "originalFilename"),
    width: readNumber(record, "width"),
    height: readNumber(record, "height"),
    caption: readString(record, "caption"),
  };
}

export async function resolveSupportAttachmentFile(params: {
  root: string;
  clientId: string;
  conversationId: string;
  metadata: SupportAttachmentMetadata;
}) {
  const root = normalizeRoot(params.root);
  const storageKey = params.metadata.storageKey.replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!storageKey || storageKey !== params.metadata.storageKey) {
    throw new SupportAttachmentError("support_attachment_not_found", 404, "Imagem nao encontrada.");
  }
  const absolutePath = path.resolve(root, params.clientId, params.conversationId, storageKey);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SupportAttachmentError("support_attachment_not_found", 404, "Imagem nao encontrada.");
  }
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new SupportAttachmentError("support_attachment_not_found", 404, "Imagem nao encontrada.");
  }
  return { absolutePath, stat };
}

export function streamSupportAttachment(params: {
  res: ServerResponse;
  absolutePath: string;
  metadata: SupportAttachmentMetadata & { caption?: string | null };
}) {
  const fileName = sanitizeOriginalFilename(params.metadata.originalFilename) || `support-image.${extensionForMimeType(params.metadata.mimeType)}`;
  params.res.writeHead(200, {
    "Content-Type": params.metadata.mimeType,
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Content-Length": String(params.metadata.sizeBytes),
  });
  createReadStream(params.absolutePath).pipe(params.res);
}
