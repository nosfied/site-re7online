export type InboxMessageMedia = {
  kind: "image" | "audio" | "video" | "document";
  mimeType?: string;
  fileName?: string;
  caption?: string;
  hasDownload: boolean;
  downloadUrl?: string;
};

type MediaPayload = {
  mediaId?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  caption?: unknown;
  sha256?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeMediaKind(type: string): InboxMessageMedia["kind"] | null {
  const normalized = type.trim().toLowerCase();
  if (normalized === "image" || normalized === "audio" || normalized === "video" || normalized === "document") {
    return normalized;
  }
  return null;
}

function normalizeMediaPayload(rawPayload: unknown): MediaPayload | null {
  const typed = asObject(rawPayload);
  const media = asObject(typed?.media);
  if (!media) return null;
  return media as MediaPayload;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function buildInboxMessageMedia(params: {
  type: string;
  rawPayload?: unknown;
  downloadUrl?: string;
}): InboxMessageMedia | null {
  const kind = normalizeMediaKind(params.type);
  if (!kind) return null;
  const media = normalizeMediaPayload(params.rawPayload);
  const downloadUrl = normalizeOptionalString(params.downloadUrl);
  return {
    kind,
    mimeType: normalizeOptionalString(media?.mimeType),
    fileName: normalizeOptionalString(media?.fileName),
    caption: normalizeOptionalString(media?.caption),
    hasDownload: Boolean(downloadUrl && normalizeOptionalString(media?.mediaId)),
    downloadUrl,
  };
}

export function extractRawMediaId(rawPayload: unknown): string | null {
  return normalizeOptionalString(normalizeMediaPayload(rawPayload)?.mediaId) ?? null;
}
