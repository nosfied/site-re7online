import { Prisma } from "@prisma/client";

export type MetaUsageSource =
  | "inbox_text"
  | "inbox_template"
  | "canned_reply"
  | "campaign"
  | "manual_campaign_send"
  | "bot"
  | "unknown";

export type MetaUsageMessageKind =
  | "free_text"
  | "template"
  | "canned_reply"
  | "media"
  | "unknown";

export type MetaUsageCategory =
  | "service"
  | "utility"
  | "marketing"
  | "authentication"
  | "unknown";

export type MetaUsageDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "read"
  | "unknown";

export type MetaUsageBillingRule =
  | "current_service_free"
  | "post_2026_10_service_billable"
  | "utility_billable"
  | "marketing_billable"
  | "authentication_billable"
  | "free_entry_point"
  | "non_billable_inbound"
  | "unknown";

export type MetaUsageLedgerPayload = {
  direction: "inbound" | "outbound";
  outboundMessageId: string | null;
  conversationId: string | null;
  campaignId: string | null;
  source: MetaUsageSource;
  messageKind: MetaUsageMessageKind;
  metaCategory: MetaUsageCategory;
  templateName: string | null;
  windowOpenAtSend: boolean | "unknown";
  deliveryStatus: MetaUsageDeliveryStatus;
  estimatedBillable: boolean | "unknown";
  estimatedMetaUnitCostUsd: number | null;
  estimatedMetaCostUsd: number | null;
  rateCardVersion: string;
  billingRule: MetaUsageBillingRule;
  country: "BR" | "unknown";
  waIdLast4: string | null;
  waIdLength: number | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type MetaUsageLedgerInput = {
  direction?: "inbound" | "outbound";
  outboundMessageId?: string | null;
  conversationId?: string | null;
  campaignId?: string | null;
  source?: MetaUsageSource | string | null;
  messageKind?: MetaUsageMessageKind | string | null;
  templateName?: string | null;
  templateCategory?: string | null;
  sentAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  status?: string | null;
  windowOpenAtSend?: boolean | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  currentDate?: Date | string | null;
};

const META_BR_PLANNING_RATE_CARD_VERSION = "meta-br-planning-2026-08";
const SERVICE_BILLING_CHANGE_DATE = Date.UTC(2026, 9, 1, 0, 0, 0);

const META_BR_PLANNING_RATES_USD: Partial<Record<MetaUsageCategory, number>> = {
  marketing: 0.0625,
  utility: 0.008,
  authentication: 0.0315,
  service: 0,
};

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date | string | null | undefined) {
  return normalizeDate(value)?.toISOString() ?? null;
}

function normalizeSource(value: MetaUsageLedgerInput["source"]): MetaUsageSource {
  switch (value) {
    case "inbox_text":
    case "inbox_template":
    case "canned_reply":
    case "campaign":
    case "manual_campaign_send":
    case "bot":
      return value;
    default:
      return "unknown";
  }
}

function normalizeMessageKind(value: MetaUsageLedgerInput["messageKind"]): MetaUsageMessageKind {
  switch (value) {
    case "free_text":
    case "template":
    case "canned_reply":
    case "media":
      return value;
    default:
      return "unknown";
  }
}

export function normalizeMetaCategory(value: string | null | undefined): MetaUsageCategory {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "service":
      return "service";
    case "utility":
      return "utility";
    case "marketing":
      return "marketing";
    case "authentication":
      return "authentication";
    default:
      return "unknown";
  }
}

export function normalizeMetaUsageDeliveryStatus(value: string | null | undefined): MetaUsageDeliveryStatus {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "queued":
      return "queued";
    case "sent":
    case "sENT":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "failed_before_delivery":
      return "failed";
    default:
      return "unknown";
  }
}

export function inferCountryFromWaId(value: string | null | undefined): "BR" | "unknown" {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") ? "BR" : "unknown";
}

function buildWaRef(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return { waIdLast4: null, waIdLength: null };
  return { waIdLast4: digits.slice(-4), waIdLength: digits.length };
}

function resolveBillingForCategory(params: {
  direction: "inbound" | "outbound";
  category: MetaUsageCategory;
  deliveryStatus: MetaUsageDeliveryStatus;
  currentDate: Date;
}) {
  if (params.direction === "inbound") {
    return {
      estimatedBillable: false as const,
      estimatedMetaUnitCostUsd: null,
      billingRule: "non_billable_inbound" as const,
    };
  }

  if (params.deliveryStatus === "failed") {
    return {
      estimatedBillable: false as const,
      estimatedMetaUnitCostUsd: null,
      billingRule: "unknown" as const,
    };
  }

  if (params.category === "service") {
    if (params.currentDate.getTime() < SERVICE_BILLING_CHANGE_DATE) {
      return {
        estimatedBillable: false as const,
        estimatedMetaUnitCostUsd: 0,
        billingRule: "current_service_free" as const,
      };
    }
    return {
      estimatedBillable: true as const,
      estimatedMetaUnitCostUsd: null,
      billingRule: "post_2026_10_service_billable" as const,
    };
  }

  if (params.category === "utility") {
    return {
      estimatedBillable: true as const,
      estimatedMetaUnitCostUsd: META_BR_PLANNING_RATES_USD.utility ?? null,
      billingRule: "utility_billable" as const,
    };
  }

  if (params.category === "marketing") {
    return {
      estimatedBillable: true as const,
      estimatedMetaUnitCostUsd: META_BR_PLANNING_RATES_USD.marketing ?? null,
      billingRule: "marketing_billable" as const,
    };
  }

  if (params.category === "authentication") {
    return {
      estimatedBillable: true as const,
      estimatedMetaUnitCostUsd: META_BR_PLANNING_RATES_USD.authentication ?? null,
      billingRule: "authentication_billable" as const,
    };
  }

  return {
    estimatedBillable: "unknown" as const,
    estimatedMetaUnitCostUsd: null,
    billingRule: "unknown" as const,
  };
}

export function buildMetaUsageEventPayload(input: MetaUsageLedgerInput): MetaUsageLedgerPayload {
  const direction = input.direction ?? "outbound";
  const source = normalizeSource(input.source);
  const messageKind = normalizeMessageKind(input.messageKind);
  const normalizedCategory = normalizeMetaCategory(input.templateCategory);
  const metaCategory =
    normalizedCategory !== "unknown"
      ? normalizedCategory
      : messageKind === "template"
        ? "unknown"
        : "service";
  const deliveryStatus = normalizeMetaUsageDeliveryStatus(input.status);
  const currentDate = normalizeDate(input.currentDate) ?? new Date();
  const country = inferCountryFromWaId(input.waIdCanonical ?? input.waId);
  const billing = resolveBillingForCategory({
    direction,
    category: metaCategory,
    deliveryStatus,
    currentDate,
  });
  const estimatedMetaCostUsd =
    billing.estimatedBillable === true && billing.estimatedMetaUnitCostUsd !== null
      ? billing.estimatedMetaUnitCostUsd
      : null;
  const waRef = buildWaRef(input.waIdCanonical ?? input.waId);

  return {
    direction,
    outboundMessageId: input.outboundMessageId ?? null,
    conversationId: input.conversationId ?? null,
    campaignId: input.campaignId ?? null,
    source,
    messageKind,
    metaCategory,
    templateName: input.templateName ?? null,
    windowOpenAtSend: typeof input.windowOpenAtSend === "boolean" ? input.windowOpenAtSend : "unknown",
    deliveryStatus,
    estimatedBillable: billing.estimatedBillable,
    estimatedMetaUnitCostUsd: billing.estimatedMetaUnitCostUsd,
    estimatedMetaCostUsd,
    rateCardVersion: META_BR_PLANNING_RATE_CARD_VERSION,
    billingRule: billing.billingRule,
    country,
    waIdLast4: waRef.waIdLast4,
    waIdLength: waRef.waIdLength,
    sentAt: toIso(input.sentAt),
    deliveredAt: toIso(input.deliveredAt),
  };
}

export function classifyOutboundUsage(input: MetaUsageLedgerInput) {
  return buildMetaUsageEventPayload({ ...input, direction: "outbound" });
}

export function estimateMetaBilling(input: MetaUsageLedgerInput) {
  const payload = buildMetaUsageEventPayload(input);
  return {
    estimatedBillable: payload.estimatedBillable,
    estimatedMetaUnitCostUsd: payload.estimatedMetaUnitCostUsd,
    estimatedMetaCostUsd: payload.estimatedMetaCostUsd,
    rateCardVersion: payload.rateCardVersion,
    billingRule: payload.billingRule,
  };
}

export async function recordMetaUsageLedgerEvent(params: {
  prisma: {
    event: {
      create(args: {
        data: {
          clientId: string;
          conversationId?: string;
          waId?: string;
          waIdCanonical?: string;
          messageId?: string;
          requestId?: string;
          eventName: string;
          payloadJson: Prisma.InputJsonValue;
        };
      }): Promise<unknown>;
    };
  };
  clientId: string;
  eventName?: "meta.usage.estimated" | "meta.usage.updated";
  requestId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  input: MetaUsageLedgerInput;
}) {
  const eventName =
    params.eventName ??
    (normalizeMetaUsageDeliveryStatus(params.input.status) === "sent"
      ? "meta.usage.estimated"
      : "meta.usage.updated");
  const payload = buildMetaUsageEventPayload(params.input);
  const requestId =
    params.requestId ??
    `meta-usage:${params.messageId ?? payload.outboundMessageId ?? "unknown"}:${payload.deliveryStatus}`;
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? undefined,
        waId: params.waId ?? undefined,
        waIdCanonical: params.waIdCanonical ?? undefined,
        messageId: params.messageId ?? undefined,
        requestId,
        eventName,
        payloadJson: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return payload;
    }
    throw error;
  }
  return payload;
}
