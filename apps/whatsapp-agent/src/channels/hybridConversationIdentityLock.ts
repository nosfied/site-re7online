import { Prisma, type PrismaClient } from "@prisma/client";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

/** Serialize only identity selection/materialization, never provider work. */
export async function withHybridConversationIdentityLock<T>(
  prisma: PrismaClient,
  input: { clientId: string; waId: string },
  work: () => Promise<T>
): Promise<T> {
  const key = `re7.hybrid.conversation.identity.v1:${input.clientId}:${canonicalizeBrazilWaId(input.waId)}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    return work();
  }, { timeout: 15000 });
}
