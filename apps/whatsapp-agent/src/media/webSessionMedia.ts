import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export type WebSessionMediaKind = "image" | "audio" | "document" | "video";

export type WebSessionStoredMedia = {
  kind: WebSessionMediaKind;
  mediaId: string;
  mediaRef: string;
  storageRef: string;
  storageProvider: "local_web_session";
  mimeType: string;
  fileName: string | null;
  caption: string | null;
  sizeBytes: number;
};

export type WebSessionMediaValidation = {
  kind: WebSessionMediaKind;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;
};

export class WebSessionMediaError extends Error {
  constructor(
    public readonly code:
      | "web_session_media_invalid"
      | "web_session_media_too_large"
      | "web_session_media_not_found"
      | "web_session_media_symlink"
      | "web_session_media_write_failed",
    public readonly status: 400 | 404 | 413 | 500,
    message: string
  ) {
    super(message);
  }
}

export const WEB_SESSION_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
]);

function findRepositoryRoot(start = process.cwd()) {
  let current = path.resolve(start);
  for (let index = 0; index < 8; index += 1) {
    if (
      fsSync.existsSync(path.join(current, "apps", "whatsapp-agent")) &&
      fsSync.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

export function getWebSessionMediaRoot() {
  const configured = process.env.WEB_SESSION_MEDIA_ROOT?.trim();
  return path.resolve(configured || path.join(findRepositoryRoot(), "apps", "whatsapp-agent", ".data", "media", "web-session"));
}

async function assertNoSymlinkWithinRoot(root: string, targetPath: string) {
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WebSessionMediaError("web_session_media_invalid", 400, "Referencia de mídia invalida.");
  }
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const stats = await fs.lstat(cursor);
      if (stats.isSymbolicLink()) {
        throw new WebSessionMediaError("web_session_media_symlink", 400, "Referencia de mídia invalida.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
}

export function sanitizeMediaFileName(input: string | null | undefined) {
  const value = String(input ?? "").trim();
  if (!value) return null;
  return value.replace(/[^\w.\- ]+/g, "_").replace(/\.\.+/g, "_").slice(0, 140) || null;
}

function sanitizeStorageSegment(input: string) {
  return input.replace(/[^\w.-]+/g, "_").replace(/\.\.+/g, "_").slice(0, 160) || crypto.randomUUID();
}

function extensionForMimeType(mimeType: string, fallback = "bin") {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "audio/ogg" || mimeType === "audio/opus") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "text/csv") return "csv";
  return fallback;
}

function getExtension(fileName: string | null | undefined) {
  const value = String(fileName ?? "").trim().toLowerCase();
  const index = value.lastIndexOf(".");
  return index >= 0 ? value.slice(index + 1) : "";
}

function normalizeMimeType(value: string | null | undefined) {
  return String(value ?? "application/octet-stream").trim().toLowerCase() || "application/octet-stream";
}

function detectImageMimeType(content: Buffer) {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
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
  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (content.length >= 6) {
    const signature = content.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  return null;
}

export function detectWebSessionMediaKind(mimeType: string | null | undefined, fileName?: string | null): WebSessionMediaKind | null {
  const normalized = normalizeMimeType(mimeType);
  if (normalized.startsWith("image/")) return normalized === "image/svg+xml" ? null : "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  const extension = getExtension(fileName);
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "image";
  if (["aac", "m4a", "mp3", "ogg", "opus", "wav", "webm"].includes(extension)) return "audio";
  if (["mp4", "mov", "webm"].includes(extension)) return "video";
  if (extension) return "document";
  return null;
}

function assertAllowedMimeForKind(kind: WebSessionMediaKind, mimeType: string) {
  if (mimeType === "image/svg+xml" || mimeType === "text/html" || mimeType === "application/javascript") {
    throw new WebSessionMediaError("web_session_media_invalid", 400, "Tipo de arquivo nao permitido.");
  }
  if (kind === "image" && IMAGE_MIME_TYPES.has(mimeType)) return;
  if (kind === "audio" && AUDIO_MIME_TYPES.has(mimeType)) return;
  if (kind === "video" && VIDEO_MIME_TYPES.has(mimeType)) return;
  if (kind === "document" && DOCUMENT_MIME_TYPES.has(mimeType)) return;
  throw new WebSessionMediaError("web_session_media_invalid", 400, "Tipo de arquivo nao permitido.");
}

export function validateWebSessionMedia(params: {
  content: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
  kind?: WebSessionMediaKind | null;
}): WebSessionMediaValidation {
  if (params.content.length <= 0) {
    throw new WebSessionMediaError("web_session_media_invalid", 400, "Arquivo vazio.");
  }
  if (params.content.length > WEB_SESSION_MEDIA_MAX_BYTES) {
    throw new WebSessionMediaError("web_session_media_too_large", 413, "Arquivo excede o limite permitido de 10 MB.");
  }
  const fileName = sanitizeMediaFileName(params.fileName);
  const declaredMime = normalizeMimeType(params.mimeType);
  const kind = params.kind ?? detectWebSessionMediaKind(declaredMime, fileName);
  if (!kind) {
    throw new WebSessionMediaError("web_session_media_invalid", 400, "Tipo de arquivo nao permitido.");
  }
  if (kind === "image") {
    const detected = detectImageMimeType(params.content);
    if (!detected || detected !== declaredMime) {
      throw new WebSessionMediaError("web_session_media_invalid", 400, "Imagem invalida.");
    }
  }
  assertAllowedMimeForKind(kind, declaredMime);
  return {
    kind,
    mimeType: declaredMime,
    fileName,
    sizeBytes: params.content.length,
  };
}

export async function storeWebSessionMediaFile(params: {
  clientId: string;
  messageId: string;
  content: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
  caption?: string | null;
  kind?: WebSessionMediaKind | null;
}): Promise<WebSessionStoredMedia & { absolutePath: string }> {
  const validated = validateWebSessionMedia(params);
  const root = getWebSessionMediaRoot();
  const mediaRef = crypto.randomUUID();
  const safeClientId = sanitizeStorageSegment(params.clientId);
  const safeMessageId = sanitizeStorageSegment(params.messageId);
  const extension = extensionForMimeType(validated.mimeType, getExtension(validated.fileName) || "bin");
  const storageKey = `${safeClientId}/${safeMessageId}-${mediaRef}.${extension}`;
  const absolutePath = path.join(root, storageKey);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WebSessionMediaError("web_session_media_invalid", 400, "Referencia de mídia invalida.");
  }
  const tmpPath = path.join(root, ".tmp", `${mediaRef}.tmp`);
  try {
    await assertNoSymlinkWithinRoot(root, path.dirname(absolutePath));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o750 });
    await fs.mkdir(path.dirname(tmpPath), { recursive: true, mode: 0o750 });
    await assertNoSymlinkWithinRoot(root, path.dirname(absolutePath));
    await assertNoSymlinkWithinRoot(root, path.dirname(tmpPath));
    await fs.writeFile(tmpPath, params.content, { mode: 0o640 });
    await fs.rename(tmpPath, absolutePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    await fs.rm(absolutePath, { force: true }).catch(() => undefined);
    throw new WebSessionMediaError(
      "web_session_media_write_failed",
      500,
      error instanceof Error ? error.message : "Falha ao salvar mídia."
    );
  }
  return {
    kind: validated.kind,
    mediaId: `web-session:${mediaRef}`,
    mediaRef,
    storageRef: storageKey,
    storageProvider: "local_web_session",
    mimeType: validated.mimeType,
    fileName: validated.fileName,
    caption: params.caption?.trim() || null,
    sizeBytes: validated.sizeBytes,
    absolutePath,
  };
}

export async function deleteWebSessionStoredMedia(media: WebSessionStoredMedia | null | undefined) {
  if (!media?.storageRef || media.storageProvider !== "local_web_session") return;
  const root = getWebSessionMediaRoot();
  const absolutePath = path.resolve(root, media.storageRef);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  try {
    await assertNoSymlinkWithinRoot(root, absolutePath);
    await fs.rm(absolutePath, { force: true });
  } catch {
    return;
  }
}

export async function resolveWebSessionStoredMedia(rawPayload: unknown) {
  const root = getWebSessionMediaRoot();
  const media = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? (rawPayload as Record<string, unknown>).media
    : null;
  if (!media || typeof media !== "object" || Array.isArray(media)) return null;
  const record = media as Record<string, unknown>;
  if (record.storageProvider !== "local_web_session") return null;
  const storageRef = typeof record.storageRef === "string" ? record.storageRef : "";
  if (!storageRef.trim()) return null;
  const absolutePath = path.resolve(root, storageRef);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    await assertNoSymlinkWithinRoot(root, absolutePath);
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) return null;
    return {
      absolutePath,
      size: stats.size,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : "application/octet-stream",
      fileName: typeof record.fileName === "string" ? record.fileName : null,
    };
  } catch {
    return null;
  }
}
