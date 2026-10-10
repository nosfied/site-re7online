import { MessageStatus, Prisma, type PrismaClient, type OutboundMessage } from "@prisma/client";

type Accepted = { clientId: string; phoneNumberId?: string; waId: string; waIdCanonical: string;
  messageId: string; metaMessageId: string; templateName: string; templateLang: string;
  bodyText: string | null; requestId: string; rawPayload: Prisma.InputJsonObject };
const canonical = (v: unknown): string => JSON.stringify(v, (_k, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

// Campaign-local durability boundary, after provider. Never writes an existing
// result: a concurrent webhook's status/activity/provenance must remain intact.
export function verifyAcceptedCampaignResult(row: OutboundMessage | null, p: Accepted) {
  const raw = object(row?.rawPayload), meta = object(raw.metaStatus);
  if (!row || row.clientId !== p.clientId || row.messageId !== p.messageId || row.metaMessageId !== p.metaMessageId ||
      row.waId !== p.waId || row.waIdCanonical !== p.waIdCanonical || row.phoneNumberId !== (p.phoneNumberId ?? null) ||
      (row.channel !== null && row.channel !== "whatsapp") || (row.provider !== null && row.provider !== "meta") ||
      (row.channelAccountId !== null && row.channelAccountId !== (p.phoneNumberId ?? null)) ||
      row.type !== "TEMPLATE" || row.templateName !== p.templateName || row.templateLang !== p.templateLang ||
      row.bodyText !== p.bodyText || raw.source !== "campaign" || raw.campaignId !== p.rawPayload.campaignId ||
      raw.campaignRunId !== p.rawPayload.campaignRunId ||
      canonical(raw.components ?? null) !== canonical(p.rawPayload.components ?? null) ||
      canonical(raw.returnDestination ?? null) !== canonical(p.rawPayload.returnDestination ?? null) ||
      (row.status !== MessageStatus.SENT && !(row.status === MessageStatus.FAILED && meta.lastStatus === "failed" && meta.metaMessageId === p.metaMessageId))) {
    throw new Error("campaign_accepted_result_mismatch");
  }
  return row;
}

export async function persistVerifiedAcceptedCampaignResult(db: PrismaClient, p: Accepted) {
  if (!p.metaMessageId || !p.messageId) throw new Error("campaign_accepted_result_reference_required");
  const where = { clientId_messageId: { clientId: p.clientId, messageId: p.messageId } };
  const existing = await db.outboundMessage.findUnique({ where });
  if (existing) return verifyAcceptedCampaignResult(existing, p);
  try {
    await db.outboundMessage.create({ data: { ...p, channel: "whatsapp", provider: "meta",
      channelAccountId: p.phoneNumberId ?? null, type: "TEMPLATE", status: MessageStatus.SENT } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    // A uniqueness conflict is not evidence of successful persistence.
  }
  return verifyAcceptedCampaignResult(await db.outboundMessage.findUnique({ where }), p);
}
