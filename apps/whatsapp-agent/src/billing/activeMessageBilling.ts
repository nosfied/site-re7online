import crypto from "node:crypto";
import { MessageType, Prisma } from "@prisma/client";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

export const ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE = "billing.active_message.delivered";
export const ACTIVE_MESSAGE_BILLING_VERSION = "active-message-billing-v1";
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

type RawRecord = Record<string, unknown>;

type ActiveMessageOutbound = {
  id: string;
  clientId: string;
  waId: string;
  waIdCanonical?: string | null;
  messageId?: string | null;
  metaMessageId?: string | null;
  type: MessageType | string;
  templateName?: string | null;
  rawPayload?: Prisma.JsonValue | null;
  createdAt?: Date | null;
};

type ConversationWindowEvidence = {
  conversationId: string | null;
  lastInboundAt: Date | null;
};

type EventCreateInput = {
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  requestId?: string | null;
  eventName: string;
  payloadJson: Prisma.InputJsonValue;
  createdAt?: Date;
};

export type ActiveMessageBillingPrisma = {
  event: {
    create(args: { data: EventCreateInput } | any): Promise<unknown>;
  };
  conversation: {
    findFirst(args: any): Promise<{ id: string; lastInboundAt: Date | null } | null>;
  };
  conversationRuntimeState?: {
    findFirst(args: any): Promise<{ id: string; lastInboundAt: Date | null } | null>;
  };
};

export type ActiveMessageBillingInput = {
  outbound: ActiveMessageOutbound;
  deliveryStatus: string;
  deliveredAt: Date;
  pricingCategory?: string | null;
  providerMessageId?: string | null;
};

export type ActiveMessageBillingResult =
  | { ok: true; billable: true; eventType: typeof ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE; requestId: string }
  | {
      ok: true;
      billable: false;
      reason:
        | "not_delivered"
        | "not_template"
        | "not_campaign"
        | "not_utility"
        | "inside_window"
        | "unknown_window"
        | "duplicate";
    }
  | { ok: false; billable: false; reason: "error"; error: string };

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRawPayload(value: Prisma.JsonValue | null | undefined): RawRecord {
  return isRecord(value) ? value : {};
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isDeliveredStatus(value: unknown) {
  const status = normalizeStatus(value);
  return status === "delivered" || status === "read";
}

function normalizeCategory(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSource(value: unknown) {
  return String(value ?? "").trim();
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function maskLast4(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : null;
}

function hashIdentity(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function getNestedRecord(parent: RawRecord, key: string) {
  const value = parent[key];
  return isRecord(value) ? value : null;
}

function resolveCampaignId(raw: RawRecord) {
  return typeof raw.campaignId === "string" && raw.campaignId.trim() ? raw.campaignId.trim() : null;
}

function resolveConversationId(raw: RawRecord) {
  return typeof raw.conversationId === "string" && raw.conversationId.trim()
    ? raw.conversationId.trim()
    : null;
}

function resolveTemplateCategory(input: ActiveMessageBillingInput, raw: RawRecord) {
  const metaUsage = getNestedRecord(raw, "metaUsage");
  const metaStatus = getNestedRecord(raw, "metaStatus");
  return (
    normalizeCategory(input.pricingCategory) ||
    normalizeCategory(raw.templateCategory) ||
    normalizeCategory(metaStatus?.pricingCategory) ||
    normalizeCategory(metaUsage?.metaCategory)
  );
}

function isCampaignSource(raw: RawRecord) {
  if (raw.campaignTestSend === true) return false;
  const source = normalizeSource(raw.source);
  const metaUsage = getNestedRecord(raw, "metaUsage");
  if (metaUsage?.campaignTestSend === true) return false;
  const usageSource = normalizeSource(metaUsage?.source);
  return (
    Boolean(resolveCampaignId(raw)) &&
    (source === "campaign" ||
      source === "manual_campaign_send" ||
      usageSource === "campaign" ||
      usageSource === "manual_campaign_send")
  );
}

function requestIdFor(params: {
  clientId: string;
  providerMessageId: string;
}) {
  return [
    "billing",
    "active_message",
    "delivered",
    params.clientId,
    "whatsapp",
    "meta_cloud",
    params.providerMessageId,
  ].join(":");
}

function windowIsOpenAtSend(params: { sentAt: Date | null; lastInboundAt: Date | null }) {
  if (!params.sentAt || !params.lastInboundAt) return null;
  const elapsed = params.sentAt.getTime() - params.lastInboundAt.getTime();
  return elapsed >= 0 && elapsed < CUSTOMER_SERVICE_WINDOW_MS;
}

async function resolveWindowEvidence(
  prisma: ActiveMessageBillingPrisma,
  outbound: ActiveMessageOutbound,
  raw: RawRecord
): Promise<ConversationWindowEvidence> {
  const conversationId = resolveConversationId(raw);
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, clientId: outbound.clientId },
      select: { id: true, lastInboundAt: true },
    });
    if (conversation) return { conversationId: conversation.id, lastInboundAt: conversation.lastInboundAt };
  }
  const waIdCanonical = outbound.waIdCanonical ?? canonicalizeBrazilWaId(outbound.waId);
  const conversation = await prisma.conversation.findFirst({
    where: {
      clientId: outbound.clientId,
      OR: [{ waId: outbound.waId }, ...(waIdCanonical ? [{ waIdCanonical }] : [])],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, lastInboundAt: true },
  });
  if (conversation) return { conversationId: conversation.id, lastInboundAt: conversation.lastInboundAt };
  if (prisma.conversationRuntimeState) {
    const runtime = await prisma.conversationRuntimeState.findFirst({
      where: {
        clientId: outbound.clientId,
        OR: [{ waId: outbound.waId }, ...(waIdCanonical ? [{ waIdCanonical }] : [])],
      },
      orderBy: [{ updatedAt: "desc" }, { firstSeenAt: "desc" }],
      select: { id: true, lastInboundAt: true },
    });
    if (runtime) return { conversationId: null, lastInboundAt: runtime.lastInboundAt };
  }
  return { conversationId: conversationId ?? null, lastInboundAt: null };
}

export async function recordActiveMessageDeliveryIfNeeded(params: {
  prisma: ActiveMessageBillingPrisma;
  input: ActiveMessageBillingInput;
}): Promise<ActiveMessageBillingResult> {
  const { input } = params;
  try {
    if (!isDeliveredStatus(input.deliveryStatus)) return { ok: true, billable: false, reason: "not_delivered" };
    if (input.outbound.type !== MessageType.TEMPLATE && input.outbound.type !== "TEMPLATE") {
      return { ok: true, billable: false, reason: "not_template" };
    }
    const raw = getRawPayload(input.outbound.rawPayload);
    if (!isCampaignSource(raw)) return { ok: true, billable: false, reason: "not_campaign" };
    const templateCategory = resolveTemplateCategory(input, raw);
    if (templateCategory !== "utility") return { ok: true, billable: false, reason: "not_utility" };

    const sentAt = parseDate(input.outbound.createdAt);
    const windowEvidence = await resolveWindowEvidence(params.prisma, input.outbound, raw);
    const windowOpen = windowIsOpenAtSend({ sentAt, lastInboundAt: windowEvidence.lastInboundAt });
    if (windowOpen === true) return { ok: true, billable: false, reason: "inside_window" };
    if (windowOpen !== false) return { ok: true, billable: false, reason: "unknown_window" };

    const providerMessageId =
      input.providerMessageId ||
      input.outbound.metaMessageId ||
      input.outbound.messageId ||
      input.outbound.id;
    const requestId = requestIdFor({ clientId: input.outbound.clientId, providerMessageId });
    const campaignId = resolveCampaignId(raw);
    const waIdCanonical = input.outbound.waIdCanonical ?? canonicalizeBrazilWaId(input.outbound.waId);
    const payload = {
      billingType: "active_message_delivery",
      channel: "whatsapp",
      provider: "meta_cloud",
      campaignId,
      outboundMessageId: input.outbound.id,
      providerMessageId,
      templateName: input.outbound.templateName ?? null,
      templateCategory,
      sentAt: sentAt?.toISOString() ?? null,
      deliveredAt: input.deliveredAt.toISOString(),
      customerServiceWindowOpenAtSend: false,
      lastInboundAt: windowEvidence.lastInboundAt?.toISOString() ?? null,
      waIdMasked: maskLast4(waIdCanonical ?? input.outbound.waId),
      contactIdentityHash: waIdCanonical ? hashIdentity(waIdCanonical) : null,
      billingClassificationVersion: ACTIVE_MESSAGE_BILLING_VERSION,
    } satisfies Prisma.InputJsonObject;

    try {
      await params.prisma.event.create({
        data: {
          clientId: input.outbound.clientId,
          conversationId: windowEvidence.conversationId ?? undefined,
          waId: input.outbound.waId,
          waIdCanonical: waIdCanonical ?? undefined,
          messageId: input.outbound.messageId ?? input.outbound.id,
          requestId,
          eventName: ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE,
          payloadJson: payload,
          createdAt: input.deliveredAt,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: true, billable: false, reason: "duplicate" };
      }
      throw error;
    }
    return { ok: true, billable: true, eventType: ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE, requestId };
  } catch (error) {
    return { ok: false, billable: false, reason: "error", error: (error as Error).message };
  }
}
