import type { Prisma, PrismaClient } from "@prisma/client";
import type { ChatbotPendingHandoff } from "./chatbotFlow.js";
import { getDepartmentAvailability, type DepartmentAvailabilityStatus } from "../departments/businessHours.js";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type DepartmentAwareHandoffDecision =
  | {
      kind: "open";
      availabilityStatus: Extract<DepartmentAvailabilityStatus, "OPEN" | "NO_SCHEDULE">;
      departmentId: string | null;
      queueId: string | null;
      departmentName: string | null;
      queueName: string | null;
      shouldAssign: true;
    }
  | {
      kind: "closed";
      availabilityStatus: "CLOSED";
      departmentId: string;
      queueId: string | null;
      departmentName: string | null;
      queueName: string | null;
      closedText: string;
      shouldAssign: false;
    }
  | {
      kind: "blocked";
      reason: "department_not_found" | "queue_not_found" | "queue_required" | "no_queue_for_department";
      departmentId: string | null;
      queueId: string | null;
      shouldAssign: false;
    };

function supportsDepartmentBusinessHours(prisma: PrismaLike) {
  const candidate = prisma as unknown as {
    tenantOperationalConfig?: unknown;
    departmentBusinessHour?: unknown;
  };
  return Boolean(candidate.tenantOperationalConfig && candidate.departmentBusinessHour);
}

export async function resolveDepartmentAwareHandoff(
  prisma: PrismaLike,
  params: {
    clientId: string;
    pendingHandoff: ChatbotPendingHandoff;
    currentDepartmentId?: string | null;
    currentQueueId?: string | null;
    at?: Date;
  }
): Promise<DepartmentAwareHandoffDecision> {
  const requestedDepartmentId = params.pendingHandoff.departmentId ?? params.currentDepartmentId ?? null;
  const requestedQueueId = params.pendingHandoff.queueId ?? params.currentQueueId ?? null;
  if (!supportsDepartmentBusinessHours(prisma)) {
    return {
      kind: "open",
      availabilityStatus: "NO_SCHEDULE",
      departmentId: requestedDepartmentId,
      queueId: requestedQueueId,
      departmentName: null,
      queueName: null,
      shouldAssign: true,
    };
  }
  let queue = requestedQueueId
    ? await prisma.queue.findFirst({
        where: { clientId: params.clientId, id: requestedQueueId },
        select: { id: true, name: true, departmentId: true },
      })
    : null;
  if (requestedQueueId && !queue) {
    return {
      kind: "blocked",
      reason: "queue_not_found",
      departmentId: requestedDepartmentId,
      queueId: requestedQueueId,
      shouldAssign: false,
    };
  }

  const departmentId = queue?.departmentId ?? requestedDepartmentId;
  const department = departmentId
    ? await prisma.department.findFirst({
        where: { clientId: params.clientId, id: departmentId, isActive: true },
        select: {
          id: true,
          name: true,
          operationalQueue: {
            select: { id: true, name: true, departmentId: true },
          },
        },
      })
    : null;
  if (departmentId && !department) {
    return {
      kind: "blocked",
      reason: "department_not_found",
      departmentId,
      queueId: queue?.id ?? requestedQueueId,
      shouldAssign: false,
    };
  }
  if (!department) {
    return {
      kind: "open",
      availabilityStatus: "NO_SCHEDULE",
      departmentId: null,
      queueId: queue?.id ?? requestedQueueId,
      departmentName: null,
      queueName: queue?.name ?? null,
      shouldAssign: true,
    };
  }

  if (!queue) {
    queue = department.operationalQueue;
    if (!queue) {
      return {
        kind: "blocked",
        reason: "no_queue_for_department",
        departmentId: department.id,
        queueId: null,
        shouldAssign: false,
      };
    }
  }

  const availability = await getDepartmentAvailability(prisma as PrismaClient, {
    clientId: params.clientId,
    departmentId: department.id,
    at: params.at,
  });
  if (availability.status === "CLOSED") {
    return {
      kind: "closed",
      availabilityStatus: "CLOSED",
      departmentId: department.id,
      queueId: queue?.id ?? requestedQueueId,
      departmentName: department.name,
      queueName: queue?.name ?? null,
      closedText: params.pendingHandoff.closedText ?? params.pendingHandoff.feedbackText,
      shouldAssign: false,
    };
  }

  return {
    kind: "open",
    availabilityStatus: availability.status,
    departmentId: department.id,
    queueId: queue?.id ?? requestedQueueId,
    departmentName: department.name,
    queueName: queue?.name ?? null,
    shouldAssign: true,
  };
}
