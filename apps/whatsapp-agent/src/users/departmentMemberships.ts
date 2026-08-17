import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type UserDepartmentMembershipView = {
  departmentId: string;
  departmentName: string | null;
  departmentIsActive: boolean | null;
  isPrimary: boolean;
  isActive: boolean;
  source: "membership" | "legacy";
};

export class DepartmentMembershipValidationError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DepartmentMembershipValidationError";
    this.code = code;
    this.status = status;
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeDepartmentMembershipInput(input: {
  departmentIds?: unknown;
  primaryDepartmentId?: unknown;
  legacyDepartmentId?: unknown;
}): { departmentIds: string[]; primaryDepartmentId: string | null } {
  const rawDepartmentIds = Array.isArray(input.departmentIds)
    ? input.departmentIds
    : typeof input.legacyDepartmentId === "string" && input.legacyDepartmentId.trim()
      ? [input.legacyDepartmentId]
      : [];
  const departmentIds = uniqueStrings(rawDepartmentIds.filter((item): item is string => typeof item === "string"));
  const rawPrimary =
    typeof input.primaryDepartmentId === "string" && input.primaryDepartmentId.trim()
      ? input.primaryDepartmentId.trim()
      : typeof input.legacyDepartmentId === "string" && input.legacyDepartmentId.trim()
        ? input.legacyDepartmentId.trim()
        : null;
  const primaryDepartmentId = rawPrimary && departmentIds.includes(rawPrimary) ? rawPrimary : departmentIds.length === 1 ? departmentIds[0] : rawPrimary;
  return { departmentIds, primaryDepartmentId };
}

export async function getUserDepartmentMemberships(
  prisma: PrismaLike,
  params: {
    clientId: string;
    userId: string;
    includeInactive?: boolean;
    fallbackToLegacy?: boolean;
  }
): Promise<UserDepartmentMembershipView[]> {
  const memberships = await prisma.userDepartmentMembership.findMany({
    where: {
      clientId: params.clientId,
      userId: params.userId,
      ...(params.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      departmentId: true,
      isPrimary: true,
      isActive: true,
      department: { select: { name: true, isActive: true } },
    },
  });
  if (memberships.length > 0) {
    return memberships.map((item) => ({
      departmentId: item.departmentId,
      departmentName: item.department.name,
      departmentIsActive: item.department.isActive,
      isPrimary: item.isPrimary,
      isActive: item.isActive,
      source: "membership",
    }));
  }

  if (params.fallbackToLegacy === false) return [];
  const user = await prisma.user.findFirst({
    where: { id: params.userId, clientId: params.clientId, departmentId: { not: null } },
    select: {
      departmentId: true,
      department: { select: { name: true, isActive: true } },
    },
  });
  if (!user?.departmentId) return [];
  return [
    {
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      departmentIsActive: user.department?.isActive ?? null,
      isPrimary: true,
      isActive: true,
      source: "legacy",
    },
  ];
}

export async function syncUserDepartmentMemberships(
  prisma: PrismaClient,
  params: {
    clientId: string;
    userId: string;
    departmentIds: string[];
    primaryDepartmentId: string | null;
  }
) {
  const departmentIds = uniqueStrings(params.departmentIds);
  const requestedPrimaryDepartmentId = params.primaryDepartmentId?.trim() || null;
  const primaryDepartmentId =
    requestedPrimaryDepartmentId ?? (departmentIds.length === 1 ? departmentIds[0] : null);
  if (departmentIds.length > 0 && !primaryDepartmentId) {
    throw new DepartmentMembershipValidationError(
      "primary_department_required",
      "Select a primary department when the user has operational departments."
    );
  }
  if (primaryDepartmentId && !departmentIds.includes(primaryDepartmentId)) {
    throw new DepartmentMembershipValidationError(
      "primary_department_invalid",
      "Primary department must be one of the selected departments."
    );
  }

  const user = await prisma.user.findFirst({
    where: { id: params.userId, clientId: params.clientId },
    select: { id: true },
  });
  if (!user) {
    throw new DepartmentMembershipValidationError("user_not_found", "User not found", 404);
  }

  if (departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { clientId: params.clientId, id: { in: departmentIds } },
      select: { id: true },
    });
    if (departments.length !== departmentIds.length) {
      throw new DepartmentMembershipValidationError(
        "department_not_found",
        "Department not found for this tenant.",
        404
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.userDepartmentMembership.updateMany({
      where: { clientId: params.clientId, userId: params.userId },
      data: { isPrimary: false, isActive: false },
    });
    for (const departmentId of departmentIds) {
      await tx.userDepartmentMembership.upsert({
        where: { userId_departmentId: { userId: params.userId, departmentId } },
        create: {
          clientId: params.clientId,
          userId: params.userId,
          departmentId,
          isPrimary: departmentId === primaryDepartmentId,
          isActive: true,
        },
        update: {
          clientId: params.clientId,
          isPrimary: departmentId === primaryDepartmentId,
          isActive: true,
        },
      });
    }
    await tx.user.update({
      where: { id: params.userId },
      data: { departmentId: primaryDepartmentId },
    });
    return getUserDepartmentMemberships(tx, {
      clientId: params.clientId,
      userId: params.userId,
      fallbackToLegacy: false,
    });
  });
}

export async function getEligibleUsersForDepartmentAssignment(
  prisma: PrismaLike,
  params: {
    clientId: string;
    departmentId: string;
    includeSupervisors: boolean;
    fallbackToLegacy?: boolean;
  }
): Promise<Array<{ id: string; createdAt: Date }>> {
  const roleFilter = params.includeSupervisors ? { in: ["AGENT", "SUPERVISOR"] } : "AGENT";
  const membershipRows = await prisma.userDepartmentMembership.findMany({
    where: {
      clientId: params.clientId,
      departmentId: params.departmentId,
      isActive: true,
      user: {
        clientId: params.clientId,
        isActive: true,
        role: roleFilter,
      },
    },
    select: {
      user: { select: { id: true, createdAt: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (membershipRows.length > 0 || params.fallbackToLegacy === false) {
    return membershipRows.map((row) => row.user);
  }
  return prisma.user.findMany({
    where: {
      clientId: params.clientId,
      isActive: true,
      role: roleFilter,
      departmentId: params.departmentId,
    },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
