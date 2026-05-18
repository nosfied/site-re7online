import {
  hashWhatsAppExternalUser,
  maskWhatsAppId,
  type BackfillModelName,
  type WhatsAppBackfillClient,
} from "./whatsappBackfillDryRun.js";
import {
  buildWhatsAppBackfillExpectedFields,
  planWhatsAppBackfillRecordUpdate,
  type WhatsAppBackfillExecutableRecord,
  type WhatsAppBackfillUpdatePlan,
} from "./whatsappBackfillExecute.js";

export const WHATSAPP_SHADOW_REPAIR_CONFIRMATION = "REPAIR_MISSING_WHATSAPP_SHADOW";

export type WhatsAppShadowRepairModelName = Extract<BackfillModelName, "conversations" | "leads">;

export type WhatsAppShadowRepairCandidate = WhatsAppBackfillExecutableRecord & {
  model: WhatsAppShadowRepairModelName;
};

export type WhatsAppShadowRepairAction =
  | "update"
  | "already_filled"
  | "conflict"
  | "missing_expected_fields"
  | "skipped_anonymized"
  | "unsupported_model";

export type WhatsAppShadowRepairPlan = {
  model: WhatsAppShadowRepairModelName;
  recordId: string;
  action: WhatsAppShadowRepairAction;
  waIdHash: string | null;
  channelAccountIdHash: string | null;
  missingFields: string[];
  divergentFields: string[];
  reason?: string;
  updateData?: WhatsAppBackfillUpdatePlan["updateData"];
};

export type WhatsAppShadowRepairReport = {
  ok: boolean;
  dryRun: boolean;
  execute: boolean;
  generatedAt: string;
  filters: {
    tenant: string | null;
  };
  totals: {
    checked: number;
    updated: number;
    alreadyFilled: number;
    conflicts: number;
    missingExpectedFields: number;
    skippedAnonymized: number;
    unsupported: number;
  };
  byModel: Record<WhatsAppShadowRepairModelName, {
    checked: number;
    updated: number;
    alreadyFilled: number;
    conflicts: number;
    missingExpectedFields: number;
    skippedAnonymized: number;
  }>;
  plans: WhatsAppShadowRepairPlan[];
};

const REPAIR_MODELS = new Set<BackfillModelName>(["conversations", "leads"]);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAnonymizedOrMaskedWaId(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.startsWith("anon:") || normalized.includes("*");
}

function hashForReport(value: string | null | undefined) {
  return maskWhatsAppId(value);
}

function emptyModelSummary() {
  return {
    checked: 0,
    updated: 0,
    alreadyFilled: 0,
    conflicts: 0,
    missingExpectedFields: 0,
    skippedAnonymized: 0,
  };
}

export function assertWhatsAppShadowRepairConfirmation(confirm: string | undefined, execute: boolean) {
  if (!execute) return;
  if (confirm !== WHATSAPP_SHADOW_REPAIR_CONFIRMATION) {
    throw new Error(`--execute exige --confirm "${WHATSAPP_SHADOW_REPAIR_CONFIRMATION}"`);
  }
}

export function shouldLoadWhatsAppShadowRepairCandidate(record: WhatsAppBackfillExecutableRecord) {
  const channel = normalizeText(record.channel).toLowerCase();
  if (channel && channel !== "whatsapp") return false;
  return (
    !record.channel ||
    !record.provider ||
    !record.channelAccountId ||
    !record.externalUserHash ||
    !record.legacyWaId
  );
}

export function planWhatsAppShadowRepairCandidate(
  record: WhatsAppBackfillExecutableRecord,
  client?: WhatsAppBackfillClient
): WhatsAppShadowRepairPlan {
  const waIdHash = hashForReport(record.waId);

  if (!REPAIR_MODELS.has(record.model)) {
    return {
      model: "conversations",
      recordId: record.id,
      action: "unsupported_model",
      waIdHash,
      channelAccountIdHash: null,
      missingFields: [],
      divergentFields: [],
      reason: "unsupported_model",
    };
  }

  const model = record.model as WhatsAppShadowRepairModelName;
  if (isAnonymizedOrMaskedWaId(record.waId)) {
    return {
      model,
      recordId: record.id,
      action: "skipped_anonymized",
      waIdHash,
      channelAccountIdHash: null,
      missingFields: [],
      divergentFields: [],
      reason: "anonymized_or_masked_identity",
    };
  }

  const expected = buildWhatsAppBackfillExpectedFields(record, client);
  if (!expected) {
    return {
      model,
      recordId: record.id,
      action: "missing_expected_fields",
      waIdHash,
      channelAccountIdHash: null,
      missingFields: [],
      divergentFields: [],
      reason: "missing_expected_fields",
    };
  }

  const backfillPlan = planWhatsAppBackfillRecordUpdate(record, client);
  if (backfillPlan.action === "conflict") {
    return {
      model,
      recordId: record.id,
      action: "conflict",
      waIdHash,
      channelAccountIdHash: hashForReport(expected.channelAccountId),
      missingFields: backfillPlan.missingFields,
      divergentFields: backfillPlan.divergentFields,
      reason: backfillPlan.reason,
    };
  }
  if (backfillPlan.action === "missing") {
    return {
      model,
      recordId: record.id,
      action: "missing_expected_fields",
      waIdHash,
      channelAccountIdHash: null,
      missingFields: [],
      divergentFields: [],
      reason: backfillPlan.reason ?? "missing_expected_fields",
    };
  }
  if (backfillPlan.action === "skip") {
    return {
      model,
      recordId: record.id,
      action: "already_filled",
      waIdHash,
      channelAccountIdHash: hashForReport(expected.channelAccountId),
      missingFields: [],
      divergentFields: [],
      reason: "already_filled",
    };
  }

  return {
    model,
    recordId: record.id,
    action: "update",
    waIdHash,
    channelAccountIdHash: hashForReport(expected.channelAccountId),
    missingFields: backfillPlan.missingFields,
    divergentFields: [],
    updateData: backfillPlan.updateData,
  };
}

export function buildWhatsAppShadowRepairReport(input: {
  plans: WhatsAppShadowRepairPlan[];
  tenant?: string | null;
  execute?: boolean;
  nowIso?: string;
}): WhatsAppShadowRepairReport {
  const byModel = {
    conversations: emptyModelSummary(),
    leads: emptyModelSummary(),
  };

  for (const plan of input.plans) {
    const summary = byModel[plan.model];
    summary.checked += 1;
    if (plan.action === "update") summary.updated += 1;
    if (plan.action === "already_filled") summary.alreadyFilled += 1;
    if (plan.action === "conflict") summary.conflicts += 1;
    if (plan.action === "missing_expected_fields") summary.missingExpectedFields += 1;
    if (plan.action === "skipped_anonymized") summary.skippedAnonymized += 1;
  }

  const totals = {
    checked: input.plans.length,
    updated: input.plans.filter((plan) => plan.action === "update").length,
    alreadyFilled: input.plans.filter((plan) => plan.action === "already_filled").length,
    conflicts: input.plans.filter((plan) => plan.action === "conflict").length,
    missingExpectedFields: input.plans.filter((plan) => plan.action === "missing_expected_fields").length,
    skippedAnonymized: input.plans.filter((plan) => plan.action === "skipped_anonymized").length,
    unsupported: input.plans.filter((plan) => plan.action === "unsupported_model").length,
  };

  return {
    ok:
      totals.conflicts === 0 &&
      totals.missingExpectedFields === 0 &&
      totals.skippedAnonymized === 0 &&
      totals.unsupported === 0,
    dryRun: input.execute !== true,
    execute: input.execute === true,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    filters: {
      tenant: input.tenant ?? null,
    },
    totals,
    byModel,
    plans: input.plans.map(({ updateData: _updateData, ...plan }) => plan),
  };
}

export function assertWhatsAppShadowRepairReportSafe(report: WhatsAppShadowRepairReport) {
  if (!report.ok) {
    throw new Error(
      `repair abortado: conflicts=${report.totals.conflicts} missingExpectedFields=${report.totals.missingExpectedFields} skippedAnonymized=${report.totals.skippedAnonymized}`
    );
  }
}

export function summarizeWhatsAppShadowRepairHash(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? `hash:${hashWhatsAppExternalUser(normalized)}` : null;
}
