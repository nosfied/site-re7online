import { maskWhatsAppId, type BackfillModelName } from "./whatsappBackfillDryRun.js";

export const WHATSAPP_SHADOW_RELEASE_CONFIRMATION = "RELEASE_ANONYMIZED_MULTICHANNEL_IDENTITY";

export type WhatsAppShadowReleaseModelName = Extract<BackfillModelName, "conversations" | "leads">;

export type WhatsAppShadowReleaseCollisionRecord = {
  model: WhatsAppShadowReleaseModelName;
  recordId: string;
  tenantKey?: string;
  waId?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  legacyWaId?: string | null;
  externalUserRef?: string | null;
  deletedAt?: Date | string | null;
  anonymizedAt?: Date | string | null;
};

export type WhatsAppShadowReleasePlan = {
  model: WhatsAppShadowReleaseModelName;
  recordId: string;
  action: "release" | "already_released" | "skip";
  tenantKey?: string;
  reason: "collides_with_active_missing" | "already_released" | "not_anonymized_or_deleted";
  collisionTargetModel?: WhatsAppShadowReleaseModelName;
  collisionTargetId?: string;
  waIdHash: string | null;
  channelAccountIdHash: string | null;
};

export type WhatsAppShadowReleaseReport = {
  ok: boolean;
  dryRun: boolean;
  execute: boolean;
  generatedAt: string;
  filters: {
    tenant: string | null;
  };
  totals: {
    checked: number;
    released: number;
    alreadyReleased: number;
    skipped: number;
    conflicts: number;
  };
  byModel: Record<WhatsAppShadowReleaseModelName, {
    checked: number;
    released: number;
    alreadyReleased: number;
    skipped: number;
  }>;
  plans: WhatsAppShadowReleasePlan[];
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMaskedOrAnon(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.startsWith("anon:") || normalized.includes("*");
}

function hasIdentity(record: WhatsAppShadowReleaseCollisionRecord) {
  return Boolean(
    normalizeText(record.channelAccountId) ||
      normalizeText(record.externalUserHash) ||
      normalizeText(record.legacyWaId) ||
      normalizeText(record.externalUserRef)
  );
}

export function isReleasableAnonymizedIdentity(record: WhatsAppShadowReleaseCollisionRecord) {
  return Boolean(record.deletedAt || record.anonymizedAt || isMaskedOrAnon(record.waId));
}

export function assertWhatsAppShadowReleaseConfirmation(confirm: string | undefined, execute: boolean) {
  if (!execute) return;
  if (confirm !== WHATSAPP_SHADOW_RELEASE_CONFIRMATION) {
    throw new Error(`--execute exige --confirm "${WHATSAPP_SHADOW_RELEASE_CONFIRMATION}"`);
  }
}

export function planWhatsAppShadowReleaseRecord(
  record: WhatsAppShadowReleaseCollisionRecord,
  target: {
    model: WhatsAppShadowReleaseModelName;
    recordId: string;
  }
): WhatsAppShadowReleasePlan {
  const base = {
    model: record.model,
    recordId: record.recordId,
    tenantKey: record.tenantKey,
    collisionTargetModel: target.model,
    collisionTargetId: target.recordId,
    waIdHash: maskWhatsAppId(record.waId),
    channelAccountIdHash: maskWhatsAppId(record.channelAccountId),
  };

  if (!isReleasableAnonymizedIdentity(record)) {
    return {
      ...base,
      action: "skip",
      reason: "not_anonymized_or_deleted",
    };
  }

  if (!hasIdentity(record)) {
    return {
      ...base,
      action: "already_released",
      reason: "already_released",
    };
  }

  return {
    ...base,
    action: "release",
    reason: "collides_with_active_missing",
  };
}

function emptyModelSummary() {
  return {
    checked: 0,
    released: 0,
    alreadyReleased: 0,
    skipped: 0,
  };
}

export function buildWhatsAppShadowReleaseReport(input: {
  plans: WhatsAppShadowReleasePlan[];
  tenant?: string | null;
  execute?: boolean;
  nowIso?: string;
}): WhatsAppShadowReleaseReport {
  const byModel = {
    conversations: emptyModelSummary(),
    leads: emptyModelSummary(),
  };

  for (const plan of input.plans) {
    const summary = byModel[plan.model];
    summary.checked += 1;
    if (plan.action === "release") summary.released += 1;
    if (plan.action === "already_released") summary.alreadyReleased += 1;
    if (plan.action === "skip") summary.skipped += 1;
  }

  const totals = {
    checked: input.plans.length,
    released: input.plans.filter((plan) => plan.action === "release").length,
    alreadyReleased: input.plans.filter((plan) => plan.action === "already_released").length,
    skipped: input.plans.filter((plan) => plan.action === "skip").length,
    conflicts: input.plans.filter((plan) => plan.action === "skip").length,
  };

  return {
    ok: totals.conflicts === 0,
    dryRun: input.execute !== true,
    execute: input.execute === true,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    filters: {
      tenant: input.tenant ?? null,
    },
    totals,
    byModel,
    plans: input.plans,
  };
}

export function assertWhatsAppShadowReleaseReportSafe(report: WhatsAppShadowReleaseReport) {
  if (!report.ok) {
    throw new Error(`release abortado: conflicts=${report.totals.conflicts} skipped=${report.totals.skipped}`);
  }
}
