import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export type WebSessionAdvisoryLock = {
  accountId: string;
  key: bigint;
  acquired: boolean;
  release(): Promise<boolean>;
};

export function webSessionAdvisoryLockKey(accountId: string) {
  const hash = crypto.createHash("sha256").update(accountId, "utf8").digest();
  return hash.readBigInt64BE(0);
}

function normalizeLockResult(rows: unknown) {
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first || typeof first !== "object") return false;
  const value = (first as Record<string, unknown>).acquired ?? (first as Record<string, unknown>).released;
  return value === true || value === "t";
}

export async function acquireWebSessionAdvisoryLock(params: {
  prisma: PrismaClient;
  accountId: string;
}): Promise<WebSessionAdvisoryLock> {
  const key = webSessionAdvisoryLockKey(params.accountId);
  const rows = await params.prisma.$queryRaw<Array<{ acquired: boolean }>>(
    Prisma.sql`SELECT pg_try_advisory_lock(${key}) AS acquired`
  );
  const acquired = normalizeLockResult(rows);
  return {
    accountId: params.accountId,
    key,
    acquired,
    async release() {
      if (!acquired) return false;
      return releaseWebSessionAdvisoryLock({ prisma: params.prisma, accountId: params.accountId });
    },
  };
}

export async function releaseWebSessionAdvisoryLock(params: {
  prisma: PrismaClient;
  accountId: string;
}) {
  const key = webSessionAdvisoryLockKey(params.accountId);
  const rows = await params.prisma.$queryRaw<Array<{ released: boolean }>>(
    Prisma.sql`SELECT pg_advisory_unlock(${key}) AS released`
  );
  return normalizeLockResult(rows);
}
