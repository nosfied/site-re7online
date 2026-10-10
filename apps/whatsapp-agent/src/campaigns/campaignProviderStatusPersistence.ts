import { MessageStatus, Prisma, type PrismaClient } from '@prisma/client';
import { shouldApplyProviderStatus } from './campaignDeliveryTruth.js';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Campaign-only boundary: provider truth is durable before fallible CRM work.
 * Lock covers SQL only, never provider/CRM. Concurrent status observations are
 * re-evaluated under the row lock with the canonical monotonic contract.
 */
export async function persistCampaignProviderStatus(db: PrismaClient, p: {
  id: string; clientId: string; metaMessageId: string; phoneNumberId: string | null;
  webhookPhoneNumberId: string; incomingStatus: string | null; incomingTimestamp: unknown;
  normalizedStatus: string; errorBody: string | null; metaStatus: Prisma.InputJsonObject;
}) {
  return db.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "OutboundMessage" WHERE id = ${p.id}::uuid FOR UPDATE`);
    const row = await tx.outboundMessage.findUnique({ where: { id: p.id } });
    if (!row || row.clientId !== p.clientId || row.metaMessageId !== p.metaMessageId ||
        row.phoneNumberId !== p.phoneNumberId ||
        (row.phoneNumberId !== null && row.phoneNumberId !== p.webhookPhoneNumberId) ||
        (row.provider !== null && row.provider !== 'meta') ||
        (row.channel !== null && row.channel !== 'whatsapp') ||
        (row.channelAccountId !== null && row.channelAccountId !== p.webhookPhoneNumberId)) {
      throw new Error('campaign_provider_status_identity_mismatch');
    }
    const raw = object(row.rawPayload), current = object(raw.metaStatus);
    if (!shouldApplyProviderStatus({
      currentStatus: typeof current.lastStatus === 'string' ? current.lastStatus : null,
      currentStatusAt: current.lastStatusAt,
      incomingStatus: p.incomingStatus, incomingStatusAt: p.incomingTimestamp,
    })) return null;
    return tx.outboundMessage.update({ where: { id: row.id }, data: {
      status: p.normalizedStatus === 'FAILED' ? MessageStatus.FAILED : row.status,
      errorBody: p.normalizedStatus === 'FAILED' ? p.errorBody : row.errorBody,
      rawPayload: { ...raw, metaStatus: { ...p.metaStatus,
        providerConversationId: p.metaStatus.conversationId ?? null,
        conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : null,
      } } as Prisma.InputJsonObject,
    } });
  }, { maxWait: 5000, timeout: 10000 });
}
