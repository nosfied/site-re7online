import { Prisma, type PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

export type WebSessionDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const STATUS_PRIORITY: Record<WebSessionDeliveryStatus, number> = {
  failed: 99,
  read: 3,
  delivered: 2,
  sent: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBaileysReceiptStatus(value: unknown): WebSessionDeliveryStatus | null {
  if (typeof value === "number") {
    if (value === 0) return "failed";
    if (value === 2) return "sent";
    if (value === 3) return "delivered";
    if (value === 4 || value === 5) return "read";
    return null;
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return normalizeBaileysReceiptStatus(Number(text));
  if (text === "error" || text === "failed") return "failed";
  if (text === "server_ack" || text === "serverack" || text === "sender" || text === "sent") return "sent";
  if (text === "delivery_ack" || text === "deliveryack" || text === "delivered") return "delivered";
  if (text === "read" || text === "read-self" || text === "played") return "read";
  return null;
}

export function shouldApplyWebSessionReceiptStatus(
  currentStatus: unknown,
  nextStatus: WebSessionDeliveryStatus
) {
  const current = normalizeBaileysReceiptStatus(currentStatus);
  if (!current) return true;
  if (current === "failed" && nextStatus !== "failed") return false;
  return STATUS_PRIORITY[nextStatus] >= STATUS_PRIORITY[current];
}

export async function recordWebSessionOutboundReceipt(params: {
  prisma: PrismaClient;
  clientId: string;
  channelAccountId: string;
  externalMessageId: string;
  status: WebSessionDeliveryStatus;
  observedAt?: Date | string | null;
  requestId: string;
}) {
  const externalMessageId = params.externalMessageId.trim();
  if (!externalMessageId) return { updated: false as const, reason: "missing_external_message_id" as const };

  const outbound = await params.prisma.outboundMessage.findFirst({
    where: {
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
      externalMessageId,
    },
    select: {
      id: true,
      clientId: true,
      waId: true,
      waIdCanonical: true,
      messageId: true,
      externalMessageId: true,
      rawPayload: true,
    },
  });
  if (!outbound) return { updated: false as const, reason: "outbound_not_found" as const };

  const currentRaw = isRecord(outbound.rawPayload) ? outbound.rawPayload : {};
  const currentStatusPayload = isRecord(currentRaw.webSessionStatus) ? currentRaw.webSessionStatus : null;
  const currentStatus = typeof currentStatusPayload?.lastStatus === "string" ? currentStatusPayload.lastStatus : null;
  if (!shouldApplyWebSessionReceiptStatus(currentStatus, params.status)) {
    return { updated: false as const, reason: "stale_status" as const };
  }

  const observedAt =
    params.observedAt instanceof Date
      ? params.observedAt.toISOString()
      : typeof params.observedAt === "string" && params.observedAt.trim()
        ? params.observedAt.trim()
        : new Date().toISOString();

  await params.prisma.outboundMessage.update({
    where: { id: outbound.id },
    data: {
      rawPayload: {
        ...currentRaw,
        webSessionStatus: {
          lastStatus: params.status,
          lastStatusAt: observedAt,
          externalMessageIdPresent: true,
        },
      } as Prisma.InputJsonValue,
    },
  });
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      waId: undefined,
      waIdCanonical: undefined,
      messageId: outbound.messageId ?? undefined,
      requestId: params.requestId,
      eventName: "whatsapp.web_session.receipt.updated",
      payloadJson: {
        provider: "web_session",
        channel: "whatsapp",
        channelAccountId: params.channelAccountId,
        outboundMessageId: outbound.messageId,
        externalMessageIdPresent: true,
        status: params.status,
        waIdLast4: (outbound.waIdCanonical ?? canonicalizeBrazilWaId(outbound.waId)).slice(-4),
        waIdLength: (outbound.waIdCanonical ?? canonicalizeBrazilWaId(outbound.waId)).length,
      } satisfies Prisma.InputJsonObject,
    },
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    logger.warn({
      event: "whatsapp.web_session.receipt.event_failed",
      requestId: params.requestId,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
  });
  return { updated: true as const, messageId: outbound.messageId, waId: outbound.waId, waIdCanonical: outbound.waIdCanonical };
}
