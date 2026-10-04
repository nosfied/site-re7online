import { MessageStatus, Prisma, type PrismaClient } from "@prisma/client";
import { ensureCampaignOutboundConversationUnlocked } from "../campaigns/campaignOutboundConversation.js";
import { withHybridConversationIdentityLock } from "./hybridConversationIdentityLock.js";
import { resolveCampaignRecipientConversationTarget } from "../campaigns/campaignRecipientConversationBridge.js";
import { getBrazilNinthDigitVariant } from "../crm/crmWhatsappIdentity.js";
import { parseOutboundReturnDestination } from "../routing/outboundReturnDestination.js";
import { normalizeHybridWhatsappNumber, resolveHybridWhatsappIdentityStatus } from "../web-session/hybridIdentity.js";
import { normalizeWaIdDigits } from "../utils/waid.js";

/** Resolve an already existing conversation; never create or merge an identity. */
export async function resolveInboundConversationIdentity(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    clientId: string;
    waId: string;
    provider: "meta" | "web_session";
    channelAccountId: string;
  }
) {
  const waId = normalizeWaIdDigits(input.waId);
  const target = await resolveCampaignRecipientConversationTarget(prisma, {
    clientId: input.clientId,
    inputWaId: waId,
  });
  if (target.resolved && target.matchedBy === "exact_conversation_waid" && target.conversationId) {
    return { waId: target.winningWaId, reason: "resolved", conversationId: target.conversationId } as const;
  }
  if (!target.resolved || !target.conversationId) {
    return { waId, reason: target.reason === "ambiguous" ? "ambiguous" : "unchanged" } as const;
  }

  // The numerical variant is only a candidate. Both transports must be bound
  // to the same provider-confirmed public number and the precise live accounts.
  const [candidate, hybrid, metaConfig, webAccounts] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: target.conversationId },
      select: { clientId: true, waId: true, provider: true, phoneNumberId: true, channelAccountId: true, deletedAt: true, anonymizedAt: true },
    }),
    resolveHybridWhatsappIdentityStatus({ prisma: prisma as PrismaClient, clientId: input.clientId }),
    prisma.tenantMetaConfig.findUnique({ where: { clientId: input.clientId }, select: { phoneNumberId: true } }),
    prisma.channelAccount.findMany({
      where: { clientId: input.clientId, channel: "whatsapp", provider: "web_session", runtimeEnabled: true, status: { not: "archived_duplicate" } },
      select: { channelAccountId: true },
    }),
  ]);
  const webAccountId = webAccounts.length === 1 ? webAccounts[0]?.channelAccountId : null;
  const metaPhoneNumberId = metaConfig?.phoneNumberId;
  const accountIsCurrent = input.provider === "meta"
    ? input.channelAccountId === metaPhoneNumberId
    : input.channelAccountId === webAccountId;
  const candidateIsCurrent = candidate?.provider === "meta"
    ? candidate.phoneNumberId === metaPhoneNumberId
    : candidate?.provider === "web_session" && candidate.channelAccountId === webAccountId;
  const publicNumberConfirmed =
    hybrid.meta.configured && hybrid.meta.canonicalNumber &&
    hybrid.web.canonicalNumber && hybrid.web.status !== "RELEASED" &&
    hybrid.web.status !== "INVALIDATED_BY_META_IDENTITY_CHANGE" &&
    !hybrid.conflict && !hybrid.numberReplacement &&
    normalizeHybridWhatsappNumber(hybrid.meta.canonicalNumber) ===
      normalizeHybridWhatsappNumber(hybrid.web.canonicalNumber);
  if (
    !candidate || candidate.clientId !== input.clientId || candidate.deletedAt || candidate.anonymizedAt ||
    !metaPhoneNumberId || !webAccountId || !accountIsCurrent || !candidateIsCurrent || !publicNumberConfirmed
  ) {
    return { waId, reason: "unconfirmed_account" } as const;
  }
  return { waId: target.winningWaId, reason: "resolved", conversationId: target.conversationId } as const;
}

/** A provider-accepted campaign can be answered before DELIVERED/READ arrives. */
async function prepareAcceptedCampaignReturnConversationUnlocked(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    clientId: string;
    clientKey: string;
    waId: string;
    provider: "meta" | "web_session";
    channelAccountId: string;
    inboundAt: Date;
  }
) {
  const existing = await resolveInboundConversationIdentity(prisma, input);
  if (existing.reason !== "unchanged") return existing;
  const waId = normalizeWaIdDigits(input.waId);
  const variant = getBrazilNinthDigitVariant(waId);
  const [hybrid, metaConfig, webAccounts] = await Promise.all([
    resolveHybridWhatsappIdentityStatus({ prisma: prisma as PrismaClient, clientId: input.clientId }),
    prisma.tenantMetaConfig.findUnique({ where: { clientId: input.clientId }, select: { phoneNumberId: true } }),
    prisma.channelAccount.findMany({
      where: { clientId: input.clientId, channel: "whatsapp", provider: "web_session", runtimeEnabled: true, status: { not: "archived_duplicate" } },
      select: { channelAccountId: true },
    }),
  ]);
  const metaPhoneNumberId = metaConfig?.phoneNumberId;
  const webAccountId = webAccounts.length === 1 ? webAccounts[0]?.channelAccountId : null;
  if (!metaPhoneNumberId || !webAccountId || hybrid.conflict || hybrid.numberReplacement ||
      !hybrid.meta.configured || !hybrid.meta.canonicalNumber ||
      normalizeHybridWhatsappNumber(hybrid.meta.canonicalNumber) !==
        normalizeHybridWhatsappNumber(hybrid.web.canonicalNumber) ||
      hybrid.web.status === "RELEASED" || hybrid.web.status === "INVALIDATED_BY_META_IDENTITY_CHANGE" ||
      (input.provider === "meta" && input.channelAccountId !== metaPhoneNumberId) ||
      (input.provider === "web_session" && input.channelAccountId !== webAccountId)) {
    return existing;
  }
  const outbounds = await prisma.outboundMessage.findMany({
    where: {
      clientId: input.clientId,
      phoneNumberId: metaPhoneNumberId,
      waId: { in: Array.from(new Set([waId, variant].filter(Boolean))) as string[] },
      status: MessageStatus.SENT,
      metaMessageId: { not: null },
      createdAt: { lte: input.inboundAt },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      waId: true, waIdCanonical: true, phoneNumberId: true, messageId: true,
      templateName: true, createdAt: true, rawPayload: true,
    },
  });
  const pending = outbounds.filter((outbound) => {
    const payload = outbound.rawPayload;
    return payload && typeof payload === "object" && !Array.isArray(payload) &&
      payload.deliveryConversationPending === true &&
      typeof payload.campaignId === "string" &&
      Boolean(parseOutboundReturnDestination(payload.returnDestination));
  });
  if (pending.length !== 1) return existing;
  const outbound = pending[0]!;
  const payload = outbound.rawPayload as Record<string, unknown>;
  if (!outbound.messageId || !outbound.templateName) return existing;
  await ensureCampaignOutboundConversationUnlocked(prisma, {
    clientId: input.clientId,
    clientKey: input.clientKey,
    waId: outbound.waId,
    waIdCanonical: outbound.waIdCanonical,
    phoneNumberId: outbound.phoneNumberId,
    messageId: outbound.messageId,
    campaignId: payload.campaignId as string,
    campaignRunId: typeof payload.campaignRunId === "string" ? payload.campaignRunId : `inbound:${outbound.messageId}`,
    templateName: outbound.templateName,
    sentAt: outbound.createdAt,
    source: "campaign",
    returnDestination: parseOutboundReturnDestination(payload.returnDestination),
  });
  return resolveInboundConversationIdentity(prisma, input);
}

export async function prepareAcceptedCampaignReturnConversation(
  prisma: PrismaClient,
  input: Parameters<typeof prepareAcceptedCampaignReturnConversationUnlocked>[1]
) {
  return withHybridConversationIdentityLock(prisma, input, (tx) =>
    prepareAcceptedCampaignReturnConversationUnlocked(tx, input)
  );
}
