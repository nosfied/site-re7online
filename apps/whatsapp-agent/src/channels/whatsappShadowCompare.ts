import {
  buildWhatsAppBackfillExpectedFields,
  type WhatsAppBackfillExecutableRecord,
} from "./whatsappBackfillExecute.js";
import {
  hashWhatsAppExternalUser,
  type BackfillModelName,
  type WhatsAppBackfillClient,
} from "./whatsappBackfillDryRun.js";

export type WhatsAppShadowCompareStatus = "matched" | "missing" | "mismatched" | "warning";

export type WhatsAppShadowCompareModelSummary = {
  checked: number;
  matched: number;
  missing: number;
  mismatched: number;
  warnings: number;
};

export type WhatsAppShadowCompareSample = {
  model: BackfillModelName;
  recordId: string;
  status: WhatsAppShadowCompareStatus;
  clientKey?: string;
  waIdHash: string | null;
  channelAccountIdHash: string | null;
  missingFields?: string[];
  mismatchedFields?: string[];
  reason?: string;
  warningType?: "non_blocking_anonymized_drift";
};

export type WhatsAppShadowCompareReport = {
  ok: boolean;
  generatedAt: string;
  filters: {
    tenant: string | null;
    limit: number;
    includeSamples: boolean;
    includeAnonymized: boolean;
  };
  counts: WhatsAppShadowCompareModelSummary;
  byModel: Record<BackfillModelName, WhatsAppShadowCompareModelSummary>;
  blockingMissing: number;
  blockingMismatched: number;
  nonBlockingWarnings: Array<{
    type: "non_blocking_anonymized_drift";
    model: BackfillModelName;
    count: number;
  }>;
  samples: WhatsAppShadowCompareSample[];
};

const MODEL_NAMES: BackfillModelName[] = [
  "conversations",
  "runtimeStates",
  "inboundMessages",
  "outboundMessages",
  "leads",
  "contacts",
];

const COMPARED_FIELDS = [
  "channel",
  "provider",
  "channelAccountId",
  "externalUserHash",
  "legacyWaId",
] as const;

function emptySummary(): WhatsAppShadowCompareModelSummary {
  return {
    checked: 0,
    matched: 0,
    missing: 0,
    mismatched: 0,
    warnings: 0,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashForReport(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? `hash:${hashWhatsAppExternalUser(normalized)}` : null;
}

function hasNoValue(value: unknown) {
  return value == null || value === "";
}

function isWhatsAppCompareRecord(record: WhatsAppBackfillExecutableRecord) {
  const channel = normalizeText(record.channel).toLowerCase();
  return channel === "" || channel === "whatsapp";
}

function isAnonymizedOrMaskedWaId(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.startsWith("anon:") || normalized.includes("*");
}

function compareRecord(
  record: WhatsAppBackfillExecutableRecord,
  client?: WhatsAppBackfillClient,
  options?: { includeAnonymized?: boolean }
): WhatsAppShadowCompareSample {
  const expected = buildWhatsAppBackfillExpectedFields(record, client);
  const waIdHash = hashForReport(record.waId);
  if (!expected) {
    const status: WhatsAppShadowCompareStatus =
      !options?.includeAnonymized && isAnonymizedOrMaskedWaId(record.waId) ? "warning" : "missing";
    return {
      model: record.model,
      recordId: record.id,
      status,
      clientKey: record.clientKey,
      waIdHash,
      channelAccountIdHash: null,
      reason: status === "warning" ? "anonymized_or_masked_identity" : "missing_expected_fields",
      ...(status === "warning" ? { warningType: "non_blocking_anonymized_drift" as const } : {}),
    };
  }

  const missingFields: string[] = [];
  const mismatchedFields: string[] = [];

  for (const field of COMPARED_FIELDS) {
    const current = record[field];
    const next = expected[field];
    if (hasNoValue(current)) {
      missingFields.push(field);
      continue;
    }
    if (current !== next) {
      mismatchedFields.push(field);
    }
  }

  if (record.externalUserRef != null && record.externalUserRef !== "") {
    mismatchedFields.push("externalUserRef");
  }

  const status: WhatsAppShadowCompareStatus =
    mismatchedFields.length > 0
      ? "mismatched"
      : missingFields.length > 0
        ? "missing"
        : "matched";
  const finalStatus: WhatsAppShadowCompareStatus =
    status !== "matched" && !options?.includeAnonymized && isAnonymizedOrMaskedWaId(record.waId)
      ? "warning"
      : status;

  return {
    model: record.model,
    recordId: record.id,
    status: finalStatus,
    clientKey: record.clientKey,
    waIdHash,
    channelAccountIdHash: hashForReport(expected.channelAccountId),
    ...(missingFields.length ? { missingFields } : {}),
    ...(mismatchedFields.length ? { mismatchedFields } : {}),
    ...(finalStatus === "warning"
      ? { reason: "anonymized_or_masked_identity", warningType: "non_blocking_anonymized_drift" as const }
      : {}),
  };
}

export function buildWhatsAppShadowCompareReport(input: {
  clients: WhatsAppBackfillClient[];
  records: Record<BackfillModelName, WhatsAppBackfillExecutableRecord[]>;
  tenant?: string | null;
  limit?: number;
  includeSamples?: boolean;
  includeAnonymized?: boolean;
  nowIso?: string;
}): WhatsAppShadowCompareReport {
  const clientsById = new Map(input.clients.map((client) => [client.id, client]));
  const limit = Math.max(0, Math.min(100, Math.trunc(input.limit ?? 20)));
  const includeSamples = input.includeSamples === true;
  const byModel = Object.fromEntries(MODEL_NAMES.map((model) => [model, emptySummary()])) as Record<
    BackfillModelName,
    WhatsAppShadowCompareModelSummary
  >;
  const samples: WhatsAppShadowCompareSample[] = [];

  for (const model of MODEL_NAMES) {
    for (const record of input.records[model] ?? []) {
      if (!isWhatsAppCompareRecord(record)) continue;
      const comparison = compareRecord(record, clientsById.get(record.clientId), {
        includeAnonymized: input.includeAnonymized === true,
      });
      const summary = byModel[model];
      summary.checked += 1;
      if (comparison.status === "warning") {
        summary.warnings += 1;
      } else {
        summary[comparison.status] += 1;
      }
      if (includeSamples && comparison.status !== "matched" && samples.length < limit) {
        samples.push(comparison);
      }
    }
  }

  const counts = MODEL_NAMES.reduce((total, model) => {
    const current = byModel[model];
    total.checked += current.checked;
    total.matched += current.matched;
    total.missing += current.missing;
    total.mismatched += current.mismatched;
    total.warnings += current.warnings;
    return total;
  }, emptySummary());
  const nonBlockingWarnings = MODEL_NAMES.flatMap((model) => {
    const count = byModel[model].warnings;
    return count > 0 ? [{ type: "non_blocking_anonymized_drift" as const, model, count }] : [];
  });

  return {
    ok: counts.missing === 0 && counts.mismatched === 0,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    filters: {
      tenant: input.tenant ?? null,
      limit,
      includeSamples,
      includeAnonymized: input.includeAnonymized === true,
    },
    counts,
    byModel,
    blockingMissing: counts.missing,
    blockingMismatched: counts.mismatched,
    nonBlockingWarnings,
    samples,
  };
}

export const WHATSAPP_SHADOW_COMPARE_REQUIRED_COLUMNS: Record<string, string[]> = {
  Conversation: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  ConversationRuntimeState: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  InboundMessage: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  OutboundMessage: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  Lead: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
};
