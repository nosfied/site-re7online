import type {
  MetaUsageBillingRule,
  MetaUsageCategory,
  MetaUsageMessageKind,
  MetaUsageSource,
} from "./metaUsageLedger.js";
import { buildMetaUsageEventPayload } from "./metaUsageLedger.js";
import type { MetaUsagePolicy, MetaUsageSummary } from "./metaUsageSummary.js";

export type MetaCostPreviewWarningLevel = "none" | "info" | "warning" | "danger";

export type MetaCostPreview = {
  source: MetaUsageSource;
  messageKind: MetaUsageMessageKind;
  metaCategory: MetaUsageCategory;
  country: "BR" | "unknown";
  recipientCount: number;
  eligibleCount: number;
  blockedCount: number;
  unitCostUsd: number | null;
  estimatedCostUsd: number | null;
  estimatedBillable: boolean | "unknown";
  unknownCostCount: number;
  billingRule: MetaUsageBillingRule;
  rateCardVersion: string;
  windowOpenAtSend: boolean | "unknown";
  policyMode: MetaUsagePolicy["mode"] | null;
  monthlyLimitUsd: number | null;
  currentMonthUsageUsd: number | null;
  projectedMonthUsageUsd: number | null;
  usagePercentAfterSend: number | null;
  warningLevel: MetaCostPreviewWarningLevel;
  notes: string[];
};

export type MetaCostPreviewInput = {
  source: MetaUsageSource;
  messageKind: MetaUsageMessageKind;
  templateCategory?: string | null;
  templateName?: string | null;
  recipientCount?: number | null;
  eligibleCount?: number | null;
  blockedCount?: number | null;
  windowOpenAtSend?: boolean | "unknown" | null;
  country?: "BR" | "unknown" | null;
  currentDate?: Date | string | null;
  policy?: MetaUsagePolicy | null;
  summary?: Pick<MetaUsageSummary, "deliveredEstimatedCostUsd"> | null;
};

function normalizeCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeWindow(value: MetaCostPreviewInput["windowOpenAtSend"]) {
  return typeof value === "boolean" ? value : "unknown";
}

function roundUsd(value: number) {
  return Number(value.toFixed(4));
}

function percent(value: number | null, limit: number | null) {
  if (value === null || limit === null || limit <= 0) return null;
  return Number(((value / limit) * 100).toFixed(2));
}

function resolveWarning(params: {
  category: MetaUsageCategory;
  usagePercentAfterSend: number | null;
  unknownCostCount: number;
}) {
  if (params.usagePercentAfterSend !== null && params.usagePercentAfterSend >= 100) return "danger";
  if (params.category === "marketing") return "warning";
  if (params.unknownCostCount > 0) return "warning";
  if (params.usagePercentAfterSend !== null && params.usagePercentAfterSend >= 70) return "warning";
  return "info";
}

export function buildMetaCostPreview(input: MetaCostPreviewInput): MetaCostPreview {
  const recipientCount = normalizeCount(input.recipientCount);
  const eligibleCount = normalizeCount(input.eligibleCount ?? recipientCount);
  const blockedCount = normalizeCount(input.blockedCount ?? Math.max(recipientCount - eligibleCount, 0));
  const country = input.country ?? "BR";
  const windowOpenAtSend = normalizeWindow(input.windowOpenAtSend);

  const usagePayload =
    country === "unknown"
      ? null
      : buildMetaUsageEventPayload({
          source: input.source,
          messageKind: input.messageKind,
          templateCategory: input.templateCategory,
          templateName: input.templateName,
          status: "sent",
          currentDate: input.currentDate,
          windowOpenAtSend: windowOpenAtSend === "unknown" ? null : windowOpenAtSend,
          waId: country === "BR" ? "5500000000000" : null,
        });

  const metaCategory =
    usagePayload?.metaCategory ??
    (input.messageKind === "template" ? "unknown" : "service");
  const unitCostUsd = usagePayload?.estimatedMetaUnitCostUsd ?? null;
  const estimatedBillable = usagePayload?.estimatedBillable ?? "unknown";
  const estimatedCostUsd =
    estimatedBillable === true && unitCostUsd !== null ? roundUsd(unitCostUsd * eligibleCount) : null;
  const unknownCostCount =
    (estimatedBillable === true || estimatedBillable === "unknown") && unitCostUsd === null
      ? eligibleCount
      : 0;
  const currentMonthUsageUsd = input.summary?.deliveredEstimatedCostUsd ?? null;
  const projectedMonthUsageUsd =
    currentMonthUsageUsd !== null && estimatedCostUsd !== null
      ? roundUsd(currentMonthUsageUsd + estimatedCostUsd)
      : currentMonthUsageUsd;
  const monthlyLimitUsd = input.policy?.monthlyLimitUsd ?? null;
  const usagePercentAfterSend = percent(projectedMonthUsageUsd, monthlyLimitUsd);
  const notes = [
    "Estimativa sujeita à entrega, categoria, país e política vigente da Meta.",
  ];
  if (input.messageKind === "template") {
    notes.push(`Este modelo é da categoria ${metaCategory}. A cobrança final depende da entrega e da tabela vigente da Meta.`);
  }
  if (input.messageKind === "free_text" || input.messageKind === "canned_reply") {
    notes.push("Mensagem pronta é enviada como texto livre/service. A cobrança depende da entrega e da política vigente da Meta.");
  }
  if (metaCategory === "marketing") {
    notes.push("Modelo Marketing tem custo significativamente maior.");
  }
  if (unknownCostCount > 0 || country === "unknown" || metaCategory === "unknown") {
    notes.push("Valor a confirmar conforme rate card Meta vigente.");
  }
  if (blockedCount > 0) {
    notes.push("Contatos bloqueados ou inelegíveis não entram na estimativa.");
  }

  return {
    source: input.source,
    messageKind: input.messageKind,
    metaCategory,
    country,
    recipientCount,
    eligibleCount,
    blockedCount,
    unitCostUsd,
    estimatedCostUsd,
    estimatedBillable,
    unknownCostCount,
    billingRule: usagePayload?.billingRule ?? "unknown",
    rateCardVersion: usagePayload?.rateCardVersion ?? "unknown",
    windowOpenAtSend,
    policyMode: input.policy?.mode ?? null,
    monthlyLimitUsd,
    currentMonthUsageUsd,
    projectedMonthUsageUsd,
    usagePercentAfterSend,
    warningLevel: resolveWarning({ category: metaCategory, usagePercentAfterSend, unknownCostCount }),
    notes,
  };
}

export function buildTemplateCostPreview(
  input: Omit<MetaCostPreviewInput, "messageKind"> & { source: MetaUsageSource }
) {
  return buildMetaCostPreview({ ...input, messageKind: "template" });
}

export function buildBatchCostPreview(input: MetaCostPreviewInput) {
  return buildMetaCostPreview(input);
}
