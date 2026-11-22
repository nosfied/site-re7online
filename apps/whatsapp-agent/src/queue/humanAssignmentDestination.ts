import type { Prisma, PrismaClient } from "@prisma/client";
import { findDefaultOperationalDepartment } from "../bootstrap/defaultOperationalDepartment.js";
import {
  OperationalQueueUnavailableError,
  resolveDepartmentOperationalQueue,
} from "../departments/operationalQueue.js";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type HumanAssignmentDestination = {
  departmentId: string;
  queueId: string;
  source: "conversation" | "tenant_default";
};

function normalizeId(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/** Resolve a valid destination before persisting a completed human assignment. */
export async function resolveHumanAssignmentDestination(
  prisma: PrismaLike,
  params: { clientId: string; departmentId?: string | null; queueId?: string | null }
): Promise<HumanAssignmentDestination> {
  const explicitDepartmentId = normalizeId(params.departmentId);
  const explicitQueueId = normalizeId(params.queueId);
  const defaultDepartment = explicitDepartmentId
    ? null
    : await findDefaultOperationalDepartment(prisma as PrismaClient, params.clientId);
  const departmentId = explicitDepartmentId ?? defaultDepartment?.id ?? null;
  if (!departmentId) throw new OperationalQueueUnavailableError();

  const operational = await resolveDepartmentOperationalQueue(prisma, {
    clientId: params.clientId,
    departmentId,
  });
  if (explicitQueueId && explicitQueueId !== operational.queue.id) {
    throw new OperationalQueueUnavailableError();
  }
  return {
    departmentId: operational.department.id,
    queueId: operational.queue.id,
    source: explicitDepartmentId ? "conversation" : "tenant_default",
  };
}
