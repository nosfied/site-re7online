import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { resolveTemplateMediaFile } from "./templateMediaStorage.js";
import { uploadMedia } from "../whatsapp/whatsapp.client.js";

export type AccountUploadScope = {
  clientId: string;
  assetId: string;
  assetSha256: string;
  kind: "IMAGE" | "VIDEO";
  phoneNumberId: string;
  credentialGeneration: string;
};

type UploadAsset = AccountUploadScope & {
  storageKey: string;
  mimeType: string;
  originalFilename: string | null;
  accessToken: string;
};

type UploadResult =
  | { ok: true; mediaId: string; reused: boolean }
  | { ok: false; error: "upload_failed" | "upload_uncertain" | "upload_in_progress" | "content_mismatch" };

const inFlight = new Map<string, Promise<UploadResult>>();
const LEASE_MS = 30 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const UNCERTAIN_BACKOFF_MS = 30 * 60 * 1000;

function confirmedTtlMs() {
  const seconds = Number.parseInt(process.env.TEMPLATE_MEDIA_META_TTL_SECONDS ?? "86400", 10);
  const bounded = Number.isFinite(seconds) && seconds >= 300 && seconds <= 30 * 24 * 60 * 60 ? seconds : 86400;
  return bounded * 1000;
}

function scopeKey(scope: AccountUploadScope) {
  return [scope.clientId, scope.assetId, scope.assetSha256, scope.kind, scope.phoneNumberId, scope.credentialGeneration].join("\u001f");
}

function uniqueWhere(scope: AccountUploadScope) {
  return {
    clientId: scope.clientId,
    assetId: scope.assetId,
    assetSha256: scope.assetSha256,
    kind: scope.kind,
    phoneNumberId: scope.phoneNumberId,
    credentialGeneration: scope.credentialGeneration,
  };
}

export async function resolveAccountScopedTemplateMediaWithPersistentLease(asset: UploadAsset): Promise<UploadResult> {
  const prisma = getPrisma();
  const now = new Date();
  const where = uniqueWhere(asset);
  let row = await prisma.templateMediaAccountUpload.findUnique({
    where: { template_media_account_upload_scope: where },
  });

  if (row?.state === "confirmed" && row.mediaId && row.validUntil && row.validUntil > now) {
    return { ok: true, mediaId: row.mediaId, reused: true };
  }
  if ((row?.state === "uncertain" || row?.state === "failed") && row.validUntil && row.validUntil > now) {
    return { ok: false, error: row.state === "uncertain" ? "upload_uncertain" : "upload_failed" };
  }

  const attemptId = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  let acquired = false;
  if (!row) {
    try {
      row = await prisma.templateMediaAccountUpload.create({
        data: { ...where, state: "uploading", attemptId, leaseExpiresAt },
      });
      acquired = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      row = await prisma.templateMediaAccountUpload.findUnique({
        where: { template_media_account_upload_scope: where },
      });
    }
  }
  if (!acquired && row && (!row.leaseExpiresAt || row.leaseExpiresAt <= now || row.state !== "uploading")) {
    const claimed = await prisma.templateMediaAccountUpload.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: {
        state: "uploading",
        attemptId,
        leaseExpiresAt,
        mediaId: null,
        validUntil: null,
        lastErrorCode: null,
      },
    });
    acquired = claimed.count === 1;
  }
  if (!acquired) {
    for (let index = 0; index < 40; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const observed = await prisma.templateMediaAccountUpload.findUnique({
        where: { template_media_account_upload_scope: where },
      });
      if (observed?.state === "confirmed" && observed.mediaId && observed.validUntil && observed.validUntil > new Date()) {
        return { ok: true, mediaId: observed.mediaId, reused: true };
      }
      if (observed?.state === "uncertain") return { ok: false, error: "upload_uncertain" };
      if (observed?.state === "failed") return { ok: false, error: "upload_failed" };
    }
    return { ok: false, error: "upload_in_progress" };
  }

  const stored = await resolveTemplateMediaFile(asset.storageKey).catch(() => null);
  const contentHash = stored
    ? crypto.createHash("sha256").update(stored.content).digest("hex")
    : null;
  if (!stored || contentHash !== asset.assetSha256) {
    await prisma.templateMediaAccountUpload.updateMany({
      where: { id: row!.id, attemptId },
      data: { state: "failed", leaseExpiresAt: null, validUntil: new Date(Date.now() + FAILURE_BACKOFF_MS), lastErrorCode: "content_mismatch" },
    });
    return { ok: false, error: "content_mismatch" };
  }

  const uploaded = await uploadMedia(
    new Blob([new Uint8Array(stored.content)], { type: asset.mimeType }),
    asset.mimeType,
    { accessToken: asset.accessToken, phoneNumberId: asset.phoneNumberId },
    asset.originalFilename
  );
  if (!uploaded.ok) {
    const uncertain = uploaded.status === undefined;
    await prisma.templateMediaAccountUpload.updateMany({
      where: { id: row!.id, attemptId },
      data: {
        state: uncertain ? "uncertain" : "failed",
        leaseExpiresAt: null,
        validUntil: new Date(Date.now() + (uncertain ? UNCERTAIN_BACKOFF_MS : FAILURE_BACKOFF_MS)),
        lastErrorCode: uncertain ? "provider_result_unknown" : `provider_http_${uploaded.status}`,
      },
    });
    logger.warn({
      event: "template.media.account_upload.failed",
      clientId: asset.clientId,
      assetId: asset.assetId,
      state: uncertain ? "uncertain" : "failed",
    });
    return { ok: false, error: uncertain ? "upload_uncertain" : "upload_failed" };
  }

  const uploadedAt = new Date();
  await prisma.templateMediaAccountUpload.updateMany({
    where: { id: row!.id, attemptId },
    data: {
      state: "confirmed",
      mediaId: uploaded.mediaId,
      uploadedAt,
      validUntil: new Date(uploadedAt.getTime() + confirmedTtlMs()),
      leaseExpiresAt: null,
      lastErrorCode: null,
    },
  });
  return { ok: true, mediaId: uploaded.mediaId, reused: false };
}

export async function resolveAccountScopedTemplateMedia(asset: UploadAsset): Promise<UploadResult> {
  const key = scopeKey(asset);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = resolveAccountScopedTemplateMediaWithPersistentLease(asset).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

export function clearTemplateMediaUploadSingleFlightForTests() {
  inFlight.clear();
}

export function isExplicitTemplateMediaRejection(status: number, body: string) {
  if (status !== 400 && status !== 404) return false;
  const normalized = body.toLowerCase();
  return normalized.includes("media") && (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("not found") ||
    normalized.includes("does not exist")
  );
}

export async function invalidateConfirmedTemplateMedia(scope: AccountUploadScope, mediaId: string) {
  await getPrisma().templateMediaAccountUpload.updateMany({
    where: {
      ...uniqueWhere(scope),
      state: "confirmed",
      mediaId,
    },
    data: {
      state: "expired",
      validUntil: new Date(0),
      lastErrorCode: "provider_media_rejected",
    },
  });
}
