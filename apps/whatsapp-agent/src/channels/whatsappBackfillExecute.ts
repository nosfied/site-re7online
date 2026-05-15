import {
  hashWhatsAppExternalUser,
  simulateWhatsAppBackfillRecord,
  type BackfillModelName,
  type WhatsAppBackfillClient,
  type WhatsAppBackfillDryRunReport,
  type WhatsAppBackfillRecord,
} from "./whatsappBackfillDryRun.js";

export const WHATSAPP_BACKFILL_CONFIRMATION = "BACKFILL_MULTICHANNEL_WHATSAPP";

export type WhatsAppBackfillExistingFields = {
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  externalUserRef?: string | null;
  legacyWaId?: string | null;
};

export type WhatsAppBackfillExecutableRecord = WhatsAppBackfillRecord & WhatsAppBackfillExistingFields;

export type WhatsAppBackfillExpectedFields = {
  channel: "whatsapp";
  provider: "meta";
  channelAccountId: string;
  externalUserHash: string;
  externalUserRef: null;
  legacyWaId: string;
};

export type WhatsAppBackfillUpdatePlan = {
  model: BackfillModelName;
  recordId: string;
  action: "update" | "skip" | "conflict" | "missing";
  expected?: WhatsAppBackfillExpectedFields;
  updateData?: Partial<WhatsAppBackfillExpectedFields>;
  divergentFields: string[];
  missingFields: string[];
  waIdHash: string | null;
  channelAccountIdHash: string | null;
  reason?: string;
};

export type WhatsAppBackfillExecuteReport = {
  ok: boolean;
  dryRun: boolean;
  execute: boolean;
  generatedAt: string;
  durationMs: number;
  filters: {
    tenant: string | null;
  };
  updated: Record<BackfillModelName, number>;
  skippedAlreadyFilled: Record<BackfillModelName, number>;
  conflicts: Record<BackfillModelName, number>;
  missing: Record<BackfillModelName, number>;
  totals: {
    updated: number;
    skippedAlreadyFilled: number;
    conflicts: number;
    missing: number;
  };
  samples: Array<{
    model: BackfillModelName;
    recordId: string;
    action: WhatsAppBackfillUpdatePlan["action"];
    waIdHash: string | null;
    channelAccountIdHash: string | null;
    reason?: string;
  }>;
};

const MODEL_NAMES: BackfillModelName[] = [
  "conversations",
  "runtimeStates",
  "inboundMessages",
  "outboundMessages",
  "leads",
  "contacts",
];

const MULTICHANNEL_FIELD_NAMES: Array<keyof WhatsAppBackfillExpectedFields> = [
  "channel",
  "provider",
  "channelAccountId",
  "externalUserHash",
  "externalUserRef",
  "legacyWaId",
];

function emptyModelCounts(): Record<BackfillModelName, number> {
  return {
    conversations: 0,
    runtimeStates: 0,
    inboundMessages: 0,
    outboundMessages: 0,
    leads: 0,
    contacts: 0,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashForReport(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? `hash:${hashWhatsAppExternalUser(normalized)}` : null;
}

export function assertWhatsAppBackfillExecuteAllowed(env: NodeJS.ProcessEnv, execute: boolean) {
  if (!execute) return;
  if (env.NODE_ENV === "production" && env.ALLOW_PRODUCTION_BACKFILL !== "true") {
    throw new Error(
      "channels:backfill --execute bloqueado em NODE_ENV=production; use staging/copia ou defina ALLOW_PRODUCTION_BACKFILL=true somente com aprovacao formal"
    );
  }
}

export function assertWhatsAppBackfillConfirmation(confirm: string | undefined, execute: boolean) {
  if (!execute) return;
  if (confirm !== WHATSAPP_BACKFILL_CONFIRMATION) {
    throw new Error(`--execute exige --confirm "${WHATSAPP_BACKFILL_CONFIRMATION}"`);
  }
}

export function assertWhatsAppBackfillDryRunSafe(report: WhatsAppBackfillDryRunReport) {
  const missing = Object.values(report.missingChannelAccountId).reduce((total, value) => total + value, 0);
  if (report.conflicts.length > 0 || missing > 0) {
    throw new Error(
      `backfill abortado: dry-run encontrou conflicts=${report.conflicts.length} missingChannelAccountId=${missing}`
    );
  }
}

export function buildWhatsAppBackfillExpectedFields(
  record: WhatsAppBackfillRecord,
  client?: WhatsAppBackfillClient
): WhatsAppBackfillExpectedFields | null {
  const { simulation, risks } = simulateWhatsAppBackfillRecord(record, client);
  const waId = normalizeText(record.waId);
  if (risks.length > 0 || !waId || !simulation.channelAccountId || !simulation.externalUserHash) {
    return null;
  }

  return {
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: simulation.channelAccountId,
    externalUserHash: simulation.externalUserHash,
    externalUserRef: null,
    legacyWaId: waId,
  };
}

export function planWhatsAppBackfillRecordUpdate(
  record: WhatsAppBackfillExecutableRecord,
  client?: WhatsAppBackfillClient
): WhatsAppBackfillUpdatePlan {
  const expected = buildWhatsAppBackfillExpectedFields(record, client);
  const waIdHash = hashForReport(record.waId);

  if (!expected) {
    return {
      model: record.model,
      recordId: record.id,
      action: "missing",
      divergentFields: [],
      missingFields: [],
      waIdHash,
      channelAccountIdHash: null,
      reason: "missing_expected_fields",
    };
  }

  const divergentFields: string[] = [];
  const missingFields: string[] = [];
  const updateData: Record<string, string | null> = {};

  for (const field of MULTICHANNEL_FIELD_NAMES) {
    const current = record[field];
    const next = expected[field];
    if (field === "externalUserRef") {
      if (current == null || current === "") continue;
      divergentFields.push(field);
      continue;
    }
    if (current == null || current === "") {
      missingFields.push(field);
      updateData[field] = next;
      continue;
    }
    if (current !== next) {
      divergentFields.push(field);
    }
  }

  if (divergentFields.length > 0) {
    return {
      model: record.model,
      recordId: record.id,
      action: "conflict",
      expected,
      divergentFields,
      missingFields,
      waIdHash,
      channelAccountIdHash: hashForReport(expected.channelAccountId),
      reason: "existing_multichannel_fields_diverge",
    };
  }

  if (missingFields.length === 0) {
    return {
      model: record.model,
      recordId: record.id,
      action: "skip",
      expected,
      divergentFields,
      missingFields,
      waIdHash,
      channelAccountIdHash: hashForReport(expected.channelAccountId),
      reason: "already_filled",
    };
  }

  return {
    model: record.model,
    recordId: record.id,
    action: "update",
    expected,
    updateData,
    divergentFields,
    missingFields,
    waIdHash,
    channelAccountIdHash: hashForReport(expected.channelAccountId),
  };
}

export function buildWhatsAppBackfillExecuteReport(input: {
  plans: WhatsAppBackfillUpdatePlan[];
  execute: boolean;
  tenant?: string | null;
  startedAtMs?: number;
  nowIso?: string;
  sampleLimit?: number;
}): WhatsAppBackfillExecuteReport {
  const updated = emptyModelCounts();
  const skippedAlreadyFilled = emptyModelCounts();
  const conflicts = emptyModelCounts();
  const missing = emptyModelCounts();

  for (const plan of input.plans) {
    if (plan.action === "update") updated[plan.model] += 1;
    if (plan.action === "skip") skippedAlreadyFilled[plan.model] += 1;
    if (plan.action === "conflict") conflicts[plan.model] += 1;
    if (plan.action === "missing") missing[plan.model] += 1;
  }

  const totals = {
    updated: Object.values(updated).reduce((total, value) => total + value, 0),
    skippedAlreadyFilled: Object.values(skippedAlreadyFilled).reduce((total, value) => total + value, 0),
    conflicts: Object.values(conflicts).reduce((total, value) => total + value, 0),
    missing: Object.values(missing).reduce((total, value) => total + value, 0),
  };

  const sampleLimit = Math.max(0, Math.min(100, Math.trunc(input.sampleLimit ?? 20)));
  const startedAtMs = input.startedAtMs ?? Date.now();

  return {
    ok: totals.conflicts === 0 && totals.missing === 0,
    dryRun: input.execute !== true,
    execute: input.execute === true,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    filters: {
      tenant: input.tenant ?? null,
    },
    updated,
    skippedAlreadyFilled,
    conflicts,
    missing,
    totals,
    samples: input.plans.slice(0, sampleLimit).map((plan) => ({
      model: plan.model,
      recordId: plan.recordId,
      action: plan.action,
      waIdHash: plan.waIdHash,
      channelAccountIdHash: plan.channelAccountIdHash,
      ...(plan.reason ? { reason: plan.reason } : {}),
    })),
  };
}

export function flattenWhatsAppBackfillRecords(records: Record<BackfillModelName, WhatsAppBackfillExecutableRecord[]>) {
  return MODEL_NAMES.flatMap((model) => records[model] ?? []);
}
