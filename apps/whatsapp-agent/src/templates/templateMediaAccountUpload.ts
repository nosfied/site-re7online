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

type ExistingUploadRow = {
  state: string;
  mediaId: string | null;
  leaseExpiresAt: Date | null;
  validUntil: Date | null;
};

type ExistingUploadDecision =
  | { action: "reuse"; mediaId: string }
  | { action: "deny"; error: "upload_failed" | "upload_uncertain" }
  | { action: "wait" }
  | { action: "reclaim" };

type PersistentLeaseTestHooks = {
  afterMissingRead?: () => Promise<void>;
  afterCreateConflict?: () => Promise<void>;
  afterConfirmedPersisted?: () => void;
};

const inFlight = new Map<string, Promise<UploadResult>>();
const LEASE_MS = 30 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const UNCERTAIN_BACKOFF_MS = 30 * 60 * 1000;
let persistentLeaseTestHooks: PersistentLeaseTestHooks | null = null;

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

export function classifyExistingTemplateMediaUpload(row: ExistingUploadRow, now: Date): ExistingUploadDecision {
  if (row.state === "confirmed" && row.mediaId && row.validUntil && row.validUntil > now) {
    return { action: "reuse", mediaId: row.mediaId };
  }
  if ((row.state === "uncertain" || row.state === "failed") && row.validUntil && row.validUntil > now) {
    return { action: "deny", error: row.state === "uncertain" ? "upload_uncertain" : "upload_failed" };
  }
  if (row.state === "uploading" && row.leaseExpiresAt && row.leaseExpiresAt > now) {
    return { action: "wait" };
  }
  if (
    row.state === "expired" ||
    row.state === "confirmed" ||
    row.state === "failed" ||
    row.state === "uncertain" ||
    row.state === "uploading"
  ) {
    return { action: "reclaim" };
  }
  return { action: "wait" };
}

function reclaimableStateWhere(now: Date) {
  return {
    OR: [
      { state: "expired" },
      { state: "uploading", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
      { state: "confirmed", OR: [{ mediaId: null }, { validUntil: null }, { validUntil: { lte: now } }] },
      { state: { in: ["failed", "uncertain"] }, OR: [{ validUntil: null }, { validUntil: { lte: now } }] },
    ],
  };
}

function terminalResult(decision: ExistingUploadDecision): UploadResult | null {
  if (decision.action === "reuse") return { ok: true, mediaId: decision.mediaId, reused: true };
  if (decision.action === "deny") return { ok: false, error: decision.error };
  return null;
}

export async function resolveAccountScopedTemplateMediaWithPersistentLease(asset: UploadAsset): Promise<UploadResult> {
  const prisma = getPrisma();
  const now = new Date();
  const where = uniqueWhere(asset);
  let row = await prisma.templateMediaAccountUpload.findUnique({
    where: { template_media_account_upload_scope: where },
  });

  if (row) {
    const terminal = terminalResult(classifyExistingTemplateMediaUpload(row, now));
    if (terminal) return terminal;
  }

  const attemptId = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  let acquired = false;
  if (!row) {
    await persistentLeaseTestHooks?.afterMissingRead?.();
    try {
      row = await prisma.templateMediaAccountUpload.create({
        data: { ...where, state: "uploading", attemptId, leaseExpiresAt },
      });
      acquired = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      await persistentLeaseTestHooks?.afterCreateConflict?.();
      row = await prisma.templateMediaAccountUpload.findUnique({
        where: { template_media_account_upload_scope: where },
      });
    }
  }
  if (!acquired && row) {
    const claimNow = new Date();
    const decision = classifyExistingTemplateMediaUpload(row, claimNow);
    const terminal = terminalResult(decision);
    if (terminal) return terminal;
    if (decision.action === "reclaim") {
      const claimed = await prisma.templateMediaAccountUpload.updateMany({
        where: {
          id: row.id,
          updatedAt: row.updatedAt,
          ...reclaimableStateWhere(claimNow),
        },
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
  }
  if (!acquired) {
    for (let index = 0; index < 40; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const observed = await prisma.templateMediaAccountUpload.findUnique({
        where: { template_media_account_upload_scope: where },
      });
      if (observed) {
        const terminal = terminalResult(classifyExistingTemplateMediaUpload(observed, new Date()));
        if (terminal) return terminal;
      }
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
  const persisted = await prisma.templateMediaAccountUpload.updateMany({
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
  if (persisted.count !== 1) {
    logger.warn({
      event: "template.media.account_upload.owner_lost",
      clientId: asset.clientId,
      assetId: asset.assetId,
    });
    return { ok: false, error: "upload_uncertain" };
  }
  persistentLeaseTestHooks?.afterConfirmedPersisted?.();
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

export function setTemplateMediaPersistentLeaseTestHooksForTests(hooks: PersistentLeaseTestHooks | null) {
  persistentLeaseTestHooks = hooks;
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
