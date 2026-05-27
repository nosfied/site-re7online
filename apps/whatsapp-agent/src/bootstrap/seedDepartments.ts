import type { PrismaClient } from "@prisma/client";
import { DEFAULT_OPERATIONAL_DEPARTMENT_NAME } from "./defaultOperationalDepartment.js";
import { normalizeDepartmentSlug } from "../utils/departmentSlug.js";

export const DEFAULT_DEPARTMENTS = [
  { name: DEFAULT_OPERATIONAL_DEPARTMENT_NAME, isActive: true },
  { name: "Saúde", isActive: false },
  { name: "Educação", isActive: false },
  { name: "Assistência Social", isActive: false },
] as const;

export type SeedDepartmentsResult = {
  created: number;
  reactivated: number;
  unchanged: number;
  total: number;
  items: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: Date;
    action: "created" | "reactivated" | "unchanged";
  }>;
};

export async function ensureDefaultDepartments(
  prisma: PrismaClient,
  params: {
    clientId: string;
  }
): Promise<SeedDepartmentsResult> {
  let created = 0;
  let reactivated = 0;
  let unchanged = 0;
  const items: SeedDepartmentsResult["items"] = [];

  for (const defaultDepartment of DEFAULT_DEPARTMENTS) {
    const { name } = defaultDepartment;
    const slug = normalizeDepartmentSlug(name);
    const existing = await prisma.department.findUnique({
      where: {
        clientId_slug: {
          clientId: params.clientId,
          slug,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
      },
    });

    const department = await prisma.department.upsert({
      where: {
        clientId_slug: {
          clientId: params.clientId,
          slug,
        },
      },
      update: defaultDepartment.isActive ? { isActive: true } : {},
      create: {
        clientId: params.clientId,
        name,
        slug,
        isActive: defaultDepartment.isActive,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    });

    const action = !existing
      ? "created"
      : defaultDepartment.isActive && !existing.isActive
        ? "reactivated"
        : "unchanged";

    if (action === "created") created += 1;
    if (action === "reactivated") reactivated += 1;
    if (action === "unchanged") unchanged += 1;

    items.push({
      ...department,
      action,
    });
  }

  return {
    created,
    reactivated,
    unchanged,
    total: DEFAULT_DEPARTMENTS.length,
    items,
  };
}
