import type { PrismaClient } from "@prisma/client";
import { normalizeDepartmentSlug } from "../utils/departmentSlug.js";

export const DEFAULT_DEPARTMENTS = [
  "Atendimento Geral",
  "Saúde",
  "Educação",
  "Assistência Social",
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

  for (const name of DEFAULT_DEPARTMENTS) {
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
      update: { isActive: true },
      create: {
        clientId: params.clientId,
        name,
        slug,
        isActive: true,
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
      : !existing.isActive
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
