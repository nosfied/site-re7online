import { Prisma, type PrismaClient } from "@prisma/client";

export type OperationalConfigPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * Serialize a read/transform/write of one tenant's configuration. Reads used to
 * derive the mutation MUST happen inside operation, after this lock. Do not pass
 * a previously computed config, perform external I/O, or open nested transactions.
 * Existing caller transactions retain the row lock until their own commit.
 */
export async function withLockedTenantOperationalConfig<T>(
  prisma: OperationalConfigPrisma,
  clientId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { createIfMissing?: true } | { createIfMissing: false; onMissing: () => NoInfer<T> } = {}
): Promise<T> {
  const run = async (tx: Prisma.TransactionClient) => {
    if (options.createIfMissing !== false) {
      // The unique clientId constraint arbitrates concurrent creation. Never
      // update the winner's JSON with an empty document on conflict.
      await tx.tenantOperationalConfig.createMany({
        data: [{ clientId, config: {} }],
        skipDuplicates: true,
      });
    }
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "TenantOperationalConfig"
      WHERE "clientId" = ${clientId}::uuid FOR UPDATE
    `);
    // An absent row cannot be locked. Do not subsequently read a row that may
    // appear concurrently and then mutate it without a lock. Linearize no-op
    // operations at the absent-row SELECT instead.
    if (locked.length === 0 && options.createIfMissing === false) return options.onMissing();
    return operation(tx);
  };
  if ("$transaction" in prisma && typeof prisma.$transaction === "function") {
    return prisma.$transaction(run);
  }
  return run(prisma as Prisma.TransactionClient);
}
