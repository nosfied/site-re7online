import { MessageStatus, MessageType } from "@prisma/client";
import { getTenant } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";

export type UsageGateParams = {
  clientId: string;
  clientKey: string;
  messageType: "text" | "template" | "media";
  requestId?: string;
  waId?: string;
};

export type UsageGateResult = {
  allowed: boolean;
  reason?: "limit_reached";
  usage: {
    messagesSent: number;
    messagesReceived: number;
    templatesSent: number;
    messagesLimit: number | null;
    period: string;
  };
  planName: string | null;
};

function getMonthRangeUtc(now: Date) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  const period = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  return { from, to, period };
}

export async function checkUsageGate(params: UsageGateParams): Promise<UsageGateResult> {
  const prisma = getPrisma();
  const tenant = await getTenant(params.clientKey);
  const { from, to, period } = getMonthRangeUtc(new Date());
  const [messagesSent, messagesReceived, templatesSent] = await Promise.all([
    prisma.outboundMessage.count({
      where: {
        clientId: params.clientId,
        createdAt: { gte: from, lt: to },
        status: MessageStatus.SENT,
        type: { in: [MessageType.TEXT, MessageType.TEMPLATE] },
      },
    }),
    prisma.inboundMessage.count({
      where: {
        clientId: params.clientId,
        createdAt: { gte: from, lt: to },
      },
    }),
    prisma.outboundMessage.count({
      where: {
        clientId: params.clientId,
        createdAt: { gte: from, lt: to },
        status: MessageStatus.SENT,
        type: MessageType.TEMPLATE,
      },
    }),
  ]);

  const messagesLimit =
    typeof tenant?.messagesLimit === "number" ? tenant.messagesLimit : null;
  const planName = tenant?.planName?.trim() ? tenant.planName.trim() : null;
  const countedForUsage = messagesLimit !== null;

  if (messagesLimit !== null && messagesSent >= messagesLimit) {
    logger.warn({
      event: "usage.limit.reached",
      clientKey: params.clientKey,
      clientId: params.clientId,
      planName,
      messageType: params.messageType,
      countedForUsage,
      period,
      messagesSent,
      messagesLimit,
      requestId: params.requestId,
      waId: params.waId ?? null,
    });
    return {
      allowed: false,
      reason: "limit_reached",
      usage: {
        messagesSent,
        messagesReceived,
        templatesSent,
        messagesLimit,
        period,
      },
      planName,
    };
  }

  logger.info({
    event: "usage.checked",
    clientKey: params.clientKey,
    clientId: params.clientId,
    planName,
    messageType: params.messageType,
    direction: "outbound",
    countedForUsage,
    period,
    messagesSent,
    messagesReceived,
    templatesSent,
    messagesLimit,
    requestId: params.requestId,
    waId: params.waId ?? null,
  });

  return {
    allowed: true,
    usage: {
      messagesSent,
      messagesReceived,
      templatesSent,
      messagesLimit,
      period,
    },
    planName,
  };
}
