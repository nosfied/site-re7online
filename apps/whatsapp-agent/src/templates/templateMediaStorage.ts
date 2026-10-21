import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const TEMPLATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const TEMPLATE_VIDEO_MAX_BYTES = 16 * 1024 * 1024;

export type TemplateMediaKind = "IMAGE" | "VIDEO";
export type TemplateMediaPurpose = "TEMPLATE_EXAMPLE" | "CAMPAIGN";

export type TemplateMediaUpload = {
  content: Buffer;
  mimeType: string;
  fileName: string | null;
  kind: TemplateMediaKind;
};

export type ValidatedTemplateMedia = {
  kind: TemplateMediaKind;
  mimeType: "image/jpeg" | "image/png" | "video/mp4" | "video/3gpp";
  sizeBytes: number;
  sha256: string;
  originalFilename: string | null;
  extension: "jpg" | "png" | "mp4" | "3gp";
};

export class TemplateMediaError extends Error {
  constructor(
    public readonly code:
      | "template_media_invalid"
      | "template_media_empty"
      | "template_media_too_large"
      | "template_media_kind_mismatch"
      | "template_media_storage_invalid"
      | "template_media_storage_failed"
      | "template_media_not_found",
    public readonly status: 400 | 404 | 413 | 500,
    message: string
  ) {
    super(message);
    this.name = "TemplateMediaError";
  }
}

function findRepositoryRoot(start = process.cwd()) {
  let current = path.resolve(start);
  for (let index = 0; index < 8; index += 1) {
    if (fsSync.existsSync(path.join(current, "apps", "whatsapp-agent")) && fsSync.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

export function getTemplateMediaRoot() {
  const configured = process.env.TEMPLATE_MEDIA_ROOT?.trim();
  return path.resolve(
    configured || path.join(findRepositoryRoot(), "apps", "whatsapp-agent", ".data", "media", "template-campaign")
  );
}

function normalizeMime(value: string) {
  return value.trim().toLowerCase().split(";", 1)[0] ?? "";
}

function safeOriginalFilename(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return path.basename(normalized).replace(/[^\w.\- ]+/g, "_").replace(/\.\.+/g, "_").slice(0, 140) || null;
}

function extensionOf(value: string | null | undefined) {
  const ext = path.extname(String(value ?? "").trim()).toLowerCase().replace(/^\./, "");
  return ext;
}

function detectImage(content: Buffer) {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg" as const;
  if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return "image/png" as const;
  return null;
}

function detectVideo(content: Buffer) {
  if (content.length < 12 || content.subarray(4, 8).toString("ascii") !== "ftyp") return null;
  const brand = content.subarray(8, 12).toString("ascii").toLowerCase();
  if (brand.startsWith("3g")) return "video/3gpp" as const;
  return "video/mp4" as const;
}

export function validateTemplateMediaUpload(upload: TemplateMediaUpload): ValidatedTemplateMedia {
  if (upload.content.length === 0) {
    throw new TemplateMediaError("template_media_empty", 400, "Arquivo vazio.");
  }
  const limit = upload.kind === "IMAGE" ? TEMPLATE_IMAGE_MAX_BYTES : TEMPLATE_VIDEO_MAX_BYTES;
  if (upload.content.length > limit) {
    throw new TemplateMediaError("template_media_too_large", 413, "Arquivo excede o limite permitido.");
  }
  const declared = normalizeMime(upload.mimeType);
  const detected = upload.kind === "IMAGE" ? detectImage(upload.content) : detectVideo(upload.content);
  if (!detected || detected !== declared) {
    throw new TemplateMediaError("template_media_invalid", 400, "MIME e conteúdo do arquivo não correspondem.");
  }
  const originalFilename = safeOriginalFilename(upload.fileName);
  const extension = extensionOf(originalFilename);
  const allowedExtensions = detected === "image/jpeg"
    ? ["jpg", "jpeg"]
    : detected === "image/png"
      ? ["png"]
      : detected === "video/3gpp"
        ? ["3gp", "3gpp"]
        : ["mp4"];
  if (!originalFilename || !allowedExtensions.includes(extension)) {
    throw new TemplateMediaError("template_media_invalid", 400, "Extensão incompatível com a mídia.");
  }
  return {
    kind: upload.kind,
    mimeType: detected,
    sizeBytes: upload.content.length,
    sha256: crypto.createHash("sha256").update(upload.content).digest("hex"),
    originalFilename,
    extension: detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : detected === "video/3gpp" ? "3gp" : "mp4",
  };
}

function safeSegment(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
  if (!normalized) throw new TemplateMediaError("template_media_storage_invalid", 400, "Referência de armazenamento inválida.");
  return normalized;
}

async function assertNoSymlink(root: string, target: string) {
  try {
    if ((await fs.lstat(root)).isSymbolicLink()) {
      throw new TemplateMediaError("template_media_storage_invalid", 400, "Symlink não permitido no armazenamento de mídia.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TemplateMediaError("template_media_storage_invalid", 400, "Referência de armazenamento inválida.");
  }
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) {
        throw new TemplateMediaError("template_media_storage_invalid", 400, "Symlink não permitido no armazenamento de mídia.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
}

export async function storeTemplateMedia(params: {
  clientId: string;
  purpose: TemplateMediaPurpose;
  upload: TemplateMediaUpload;
}) {
  const validated = validateTemplateMediaUpload(params.upload);
  const root = getTemplateMediaRoot();
  const id = crypto.randomUUID();
  const storageKey = `${safeSegment(params.clientId)}/${params.purpose.toLowerCase()}/${id}.${validated.extension}`;
  const finalPath = path.join(root, storageKey);
  const tempDir = path.join(root, ".tmp");
  const tempPath = path.join(tempDir, `${id}.tmp`);
  try {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.chmod(root, 0o700);
    await assertNoSymlink(root, path.dirname(finalPath));
    await fs.mkdir(path.dirname(finalPath), { recursive: true, mode: 0o700 });
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(tempPath, params.upload.content, { mode: 0o600, flag: "wx" });
    await fs.rename(tempPath, finalPath);
    await fs.chmod(finalPath, 0o600);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    await fs.rm(finalPath, { force: true }).catch(() => undefined);
    if (error instanceof TemplateMediaError) throw error;
    throw new TemplateMediaError("template_media_storage_failed", 500, "Falha ao armazenar mídia.");
  }
  return { id, storageKey, absolutePath: finalPath, ...validated };
}

export async function resolveTemplateMediaFile(storageKey: string) {
  const root = getTemplateMediaRoot();
  const absolutePath = path.resolve(root, storageKey);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TemplateMediaError("template_media_storage_invalid", 400, "Referência de armazenamento inválida.");
  }
  await assertNoSymlink(root, absolutePath);
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) throw new Error("not_file");
    const content = await fs.readFile(absolutePath);
    return { absolutePath, content, sizeBytes: stats.size };
  } catch {
    throw new TemplateMediaError("template_media_not_found", 404, "Mídia não encontrada.");
  }
}

export async function removeUnreferencedTemplateMedia(storageKey: string) {
  const root = getTemplateMediaRoot();
  const absolutePath = path.resolve(root, storageKey);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  await assertNoSymlink(root, absolutePath);
  await fs.rm(absolutePath, { force: true });
  return true;
}
