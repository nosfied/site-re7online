import { Prisma } from "@prisma/client";
import { ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE } from "./activeMessageBilling.js";
import { CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT } from "../campaigns/optOutRegistry.js";

type CampaignRow = {
  id: string;
  name: string;
  templateName: string;
  totalRecipients: number;
  sentCount: number;
  blockedCount: number;
  createdAt: Date;
};

type OutboundRow = {
  id: string;
  messageId: string | null;
  status: string;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
};

type EventRow = {
  id: string;
  messageId: string | null;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
};

export type ActiveMessageBillingReportPrisma = {
  campaign: {
    findMany(args: any): Promise<CampaignRow[]>;
  };
  outboundMessage: {
    findMany(args: any): Promise<OutboundRow[]>;
  };
  event: {
    findMany(args: any): Promise<EventRow[]>;
  };
};

export type ActiveMessageBillingReportRow = {
  campaignId: string;
  campaignName: string;
  template: string;
  category: string | null;
  firstActivityAt: string | null;
  processed: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  rejected: number;
  blocked: number;
  optOut: number;
  billableDelivered: number;
  metaEstimatedCostUsd: string | null;
  unitPrice: string | null;
  total: string | null;
};

export type ActiveMessageBillingReport = {
  ok: true;
  reportType: "active_message_billing";
  month: string | null;
  from: string;
  to: string;
  generatedAt: string;
  unitPrice: string | null;
  currency: string;
  summary: {
    campaigns: number;
    processed: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    rejected: number;
    blocked: number;
    optOut: number;
    billableDelivered: number;
    total: string | null;
  };
  rows: ActiveMessageBillingReportRow[];
  notes: string[];
};

const MONEY_SCALE = 10_000_000n;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRaw(value: Prisma.JsonValue | null) {
  return isRecord(value) ? value : {};
}

function getNested(value: Record<string, unknown>, key: string) {
  return isRecord(value[key]) ? (value[key] as Record<string, unknown>) : null;
}

function resolveCampaignId(raw: Record<string, unknown>, messageId: string | null) {
  if (typeof raw.campaignId === "string" && raw.campaignId.trim()) return raw.campaignId.trim();
  const value = String(messageId ?? "");
  if (!value.startsWith("campaign.")) return null;
  const suffix = value.slice("campaign.".length);
  const separator = suffix.lastIndexOf(".");
  return separator > 0 ? suffix.slice(0, separator) : null;
}

function statusOf(message: OutboundRow) {
  const raw = getRaw(message.rawPayload);
  const metaStatus = getNested(raw, "metaStatus");
  const status = String(metaStatus?.lastStatus ?? message.status ?? "").trim().toLowerCase();
  if (status === "read") return "read";
  if (status === "delivered") return "delivered";
  if (status === "failed" || status === "failed_before_delivery") return "failed";
  return "sent";
}

function isRejected(message: OutboundRow) {
  const raw = getRaw(message.rawPayload);
  const metaStatus = getNested(raw, "metaStatus");
  const values = [
    metaStatus?.statusDetail,
    metaStatus?.errorData,
    metaStatus?.errors,
    getNested(raw, "metaUsage")?.billingRule,
  ];
  return values.some((value) => JSON.stringify(value ?? "").toLowerCase().includes("reject"));
}

function categoryOf(message: OutboundRow) {
  const raw = getRaw(message.rawPayload);
  const metaStatus = getNested(raw, "metaStatus");
  const metaUsage = getNested(raw, "metaUsage");
  return String(metaStatus?.pricingCategory ?? raw.templateCategory ?? metaUsage?.metaCategory ?? "").trim() || null;
}

function estimateCost(message: OutboundRow) {
  const raw = getRaw(message.rawPayload);
  const metaUsage = getNested(raw, "metaUsage");
  const value = metaUsage?.estimatedMetaCostUsd;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePayloadCampaignId(value: Prisma.JsonValue) {
  if (!isRecord(value)) return null;
  return typeof value.campaignId === "string" && value.campaignId.trim() ? value.campaignId.trim() : null;
}

function parseOptOutCampaignId(event: EventRow) {
  const payloadCampaignId = parsePayloadCampaignId(event.payloadJson);
  if (payloadCampaignId) return payloadCampaignId;
  return typeof event.messageId === "string" && event.messageId.trim() ? event.messageId.trim() : null;
}

function parsePrice(input: unknown) {
  const text = String(input ?? "").trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d{1,12}(?:\.\d{1,7})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(7, "0"));
  return { text: `${whole}${fraction ? `.${fraction}` : ""}`, units };
}

function multiplyPrice(price: ReturnType<typeof parsePrice>, count: number) {
  if (!price) return null;
  const total = price.units * BigInt(Math.max(0, count));
  const whole = total / MONEY_SCALE;
  const fraction = (total % MONEY_SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addMoney(left: string | null, right: string | null) {
  const a = parsePrice(left);
  const b = parsePrice(right);
  if (!a && !b) return null;
  const total = (a?.units ?? 0n) + (b?.units ?? 0n);
  const whole = total / MONEY_SCALE;
  const fraction = (total % MONEY_SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function parseActiveMessageBillingMonth(input: string | null | undefined, now = new Date()) {
  const value = String(input ?? "").trim();
  if (value) {
    if (!/^\d{4}-\d{2}$/.test(value)) return null;
    const month = Number(value.slice(5, 7));
    if (month < 1 || month > 12) return null;
    return value;
  }
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return {
    from: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)),
  };
}

export async function buildActiveMessageBillingReport(params: {
  prisma: ActiveMessageBillingReportPrisma;
  clientId: string;
  month: string;
  campaignId?: string | null;
  unitPrice?: string | number | null;
  currency?: string | null;
  now?: Date;
}): Promise<ActiveMessageBillingReport> {
  const range = monthRange(params.month);
  const price = parsePrice(params.unitPrice);
  const billingEvents = await params.prisma.event.findMany({
    where: {
      clientId: params.clientId,
      eventName: ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE,
      createdAt: { gte: range.from, lt: range.to },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, messageId: true, payloadJson: true, createdAt: true },
  });
  const eventCampaignIds = new Set(
    billingEvents.map((event) => parsePayloadCampaignId(event.payloadJson)).filter((value): value is string => Boolean(value))
  );
  const eventMessageIds = billingEvents
    .map((event) => event.messageId)
    .filter((value): value is string => Boolean(value));
  const outboundMessages = await params.prisma.outboundMessage.findMany({
    where: {
      clientId: params.clientId,
      type: "TEMPLATE",
      OR: [
        { createdAt: { gte: range.from, lt: range.to } },
        ...(eventMessageIds.length ? [{ messageId: { in: eventMessageIds } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, messageId: true, status: true, rawPayload: true, createdAt: true },
  });
  const campaignIds = new Set<string>(eventCampaignIds);
  for (const message of outboundMessages) {
    const campaignId = resolveCampaignId(getRaw(message.rawPayload), message.messageId);
    if (campaignId) campaignIds.add(campaignId);
  }
  if (params.campaignId) {
    campaignIds.clear();
    campaignIds.add(params.campaignId);
  }
  const campaigns =
    campaignIds.size > 0
      ? await params.prisma.campaign.findMany({
          where: { clientId: params.clientId, id: { in: Array.from(campaignIds) } },
          select: {
            id: true,
            name: true,
            templateName: true,
            totalRecipients: true,
            sentCount: true,
            blockedCount: true,
            createdAt: true,
          },
        })
      : [];
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const billableByCampaign = new Map<string, number>();
  for (const event of billingEvents) {
    const campaignId = parsePayloadCampaignId(event.payloadJson);
    if (!campaignId || !campaignById.has(campaignId)) continue;
    billableByCampaign.set(campaignId, (billableByCampaign.get(campaignId) ?? 0) + 1);
  }
  const optOutEvents =
    campaignIds.size > 0
      ? await params.prisma.event.findMany({
          where: {
            clientId: params.clientId,
            eventName: CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT,
            messageId: { in: Array.from(campaignIds) },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, messageId: true, payloadJson: true, createdAt: true },
        })
      : [];
  const optOutByCampaign = new Map<string, number>();
  for (const event of optOutEvents) {
    const campaignId = parseOptOutCampaignId(event);
    if (!campaignId || !campaignById.has(campaignId)) continue;
    optOutByCampaign.set(campaignId, (optOutByCampaign.get(campaignId) ?? 0) + 1);
  }

  const messagesByCampaign = new Map<string, OutboundRow[]>();
  for (const message of outboundMessages) {
    const campaignId = resolveCampaignId(getRaw(message.rawPayload), message.messageId);
    if (!campaignId || !campaignById.has(campaignId)) continue;
    const current = messagesByCampaign.get(campaignId) ?? [];
    current.push(message);
    messagesByCampaign.set(campaignId, current);
  }

  const rows: ActiveMessageBillingReportRow[] = campaigns
    .map((campaign) => {
      const messages = messagesByCampaign.get(campaign.id) ?? [];
      let sent = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;
      let rejected = 0;
      let metaEstimatedCostUsd = 0;
      let hasMetaCost = false;
      let category: string | null = null;
      let firstActivityAt: Date | null = campaign.createdAt;
      for (const message of messages) {
        const status = statusOf(message);
        if (status === "sent") sent += 1;
        if (status === "delivered") delivered += 1;
        if (status === "read") read += 1;
        if (status === "failed") failed += 1;
        if (status === "failed" && isRejected(message)) rejected += 1;
        category ??= categoryOf(message);
        const cost = estimateCost(message);
        if (cost !== null) {
          hasMetaCost = true;
          metaEstimatedCostUsd = Number((metaEstimatedCostUsd + cost).toFixed(4));
        }
        if (message.createdAt < firstActivityAt) firstActivityAt = message.createdAt;
      }
      const optOut = optOutByCampaign.get(campaign.id) ?? 0;
      const billableDelivered = billableByCampaign.get(campaign.id) ?? 0;
      const total = multiplyPrice(price, billableDelivered);
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        template: campaign.templateName,
        category,
        firstActivityAt: firstActivityAt?.toISOString() ?? null,
        processed: campaign.totalRecipients,
        sent,
        delivered,
        read,
        failed,
        rejected,
        blocked: campaign.blockedCount,
        optOut,
        billableDelivered,
        metaEstimatedCostUsd: hasMetaCost ? metaEstimatedCostUsd.toFixed(4) : null,
        unitPrice: price?.text ?? null,
        total,
      };
    })
    .sort((left, right) => String(left.firstActivityAt ?? "").localeCompare(String(right.firstActivityAt ?? "")));

  const summary = rows.reduce<ActiveMessageBillingReport["summary"]>(
    (acc, row) => ({
      campaigns: acc.campaigns + 1,
      processed: acc.processed + row.processed,
      sent: acc.sent + row.sent,
      delivered: acc.delivered + row.delivered,
      read: acc.read + row.read,
      failed: acc.failed + row.failed,
      rejected: acc.rejected + row.rejected,
      blocked: acc.blocked + row.blocked,
      optOut: acc.optOut + row.optOut,
      billableDelivered: acc.billableDelivered + row.billableDelivered,
      total: addMoney(acc.total, row.total),
    }),
    {
      campaigns: 0,
      processed: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      rejected: 0,
      blocked: 0,
      optOut: 0,
      billableDelivered: 0,
      total: null,
    }
  );

  return {
    ok: true,
    reportType: "active_message_billing",
    month: params.month,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    generatedAt: (params.now ?? new Date()).toISOString(),
    unitPrice: price?.text ?? null,
    currency: String(params.currency ?? "BRL").trim().slice(0, 12) || "BRL",
    summary,
    rows,
    notes: [
      "Unidades faturaveis contratuais usam delivery/read confirmado e categoria utility.",
      "O periodo financeiro usa deliveredAt/event.createdAt da unidade faturavel.",
      "Custo Meta estimado e total contratual sao exibidos separadamente.",
    ],
  };
}

export function buildActiveMessageBillingCsv(report: ActiveMessageBillingReport) {
  const header = [
    "campaign",
    "template",
    "category",
    "processed",
    "sent",
    "delivered",
    "read",
    "failed",
    "rejected",
    "blocked",
    "optOut",
    "billableDelivered",
    "unitPrice",
    "total",
    "metaEstimatedCostUsd",
  ];
  const rows = report.rows.map((row) => [
    row.campaignName,
    row.template,
    row.category ?? "",
    row.processed,
    row.sent,
    row.delivered,
    row.read,
    row.failed,
    row.rejected,
    row.blocked,
    row.optOut,
    row.billableDelivered,
    row.unitPrice ?? "",
    row.total ?? "",
    row.metaEstimatedCostUsd ?? "",
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
