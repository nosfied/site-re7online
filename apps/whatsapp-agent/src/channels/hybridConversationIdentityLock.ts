import { Prisma, type PrismaClient } from "@prisma/client";
import { getBrazilNinthDigitVariant } from "../crm/crmWhatsappIdentity.js";
import { normalizeWaIdDigits } from "../utils/waid.js";

export function hybridConversationIdentityLockKey(input: { clientId: string; waId: string }) {
  const waId = normalizeWaIdDigits(input.waId);
  const variant = getBrazilNinthDigitVariant(waId);
  // This is only an exclusion key. Conversation/account authorization remains in
  // resolveInboundConversationIdentity after the lock has been acquired.
  const group = variant ? [waId, variant].sort()[0] : waId;
  return `re7.hybrid.conversation.identity.v2:${input.clientId}:${group}`;
}

/** Serialize only identity selection/materialization, never provider work. */
export async function withHybridConversationIdentityLock<T>(
  prisma: PrismaClient,
  input: { clientId: string; waId: string },
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWaitMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const key = hybridConversationIdentityLockKey(input);
  const maxWaitMs = options.maxWaitMs ?? 15000;
  const timeoutMs = options.timeoutMs ?? 15000;
  const lockWaitMs = Math.max(1, Math.min(maxWaitMs, timeoutMs - 100));
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT set_config('lock_timeout', ${`${lockWaitMs}ms`}, true)`);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    return work(tx);
  }, { maxWait: maxWaitMs, timeout: timeoutMs });
}
