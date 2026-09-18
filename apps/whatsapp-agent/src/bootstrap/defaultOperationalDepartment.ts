import { Prisma, type PrismaClient } from "@prisma/client";
import {
  createDepartmentWithOperationalQueue,
  resolveDepartmentOperationalQueue,
} from "../departments/operationalQueue.js";
import { normalizeDepartmentSlug } from "../utils/departmentSlug.js";

export const DEFAULT_OPERATIONAL_DEPARTMENT_NAME = "Atendimento Geral";
const LEGACY_OPERATIONAL_DEPARTMENT_NAMES = new Set(["atendimento"]);
const LEGACY_OPERATIONAL_DEPARTMENT_SLUGS = new Set(["atendimento"]);
const LEGACY_OPERATIONAL_DEPARTMENT_NAME_PREFIX = "departamento legado";
const LEGACY_OPERATIONAL_DEPARTMENT_SLUG_PREFIX = "departamento-legado";

export function isLegacyOperationalDepartment(department: {
  name?: string | null;
  slug?: string | null;
}) {
  const name = department.name?.trim().toLowerCase() ?? "";
  const slug = department.slug?.trim().toLowerCase() ?? "";
  return (
    LEGACY_OPERATIONAL_DEPARTMENT_NAMES.has(name) ||
    LEGACY_OPERATIONAL_DEPARTMENT_SLUGS.has(slug) ||
    name.startsWith(LEGACY_OPERATIONAL_DEPARTMENT_NAME_PREFIX) ||
    slug.startsWith(LEGACY_OPERATIONAL_DEPARTMENT_SLUG_PREFIX)
  );
}

export async function findDefaultOperationalDepartment(
  prisma: PrismaClient,
  clientId: string
) {
  if (!clientId) return null;
  const slug = normalizeDepartmentSlug(DEFAULT_OPERATIONAL_DEPARTMENT_NAME);
  return prisma.department.findFirst({
    where: {
      clientId,
      isActive: true,
      OR: [{ slug }, { name: DEFAULT_OPERATIONAL_DEPARTMENT_NAME }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getDefaultOperationalDepartment(
  prisma: PrismaClient,
  clientId: string,
  options: { createIfMissing?: boolean } = {}
) {
  if (!clientId) return null;
  const createIfMissing = options.createIfMissing ?? true;
  const slug = normalizeDepartmentSlug(DEFAULT_OPERATIONAL_DEPARTMENT_NAME);
  const existing = await findDefaultOperationalDepartment(prisma, clientId);
  if (existing) return existing;
  if (!createIfMissing) return null;
  try {
    return await createDepartmentWithOperationalQueue(prisma, {
      clientId,
      name: DEFAULT_OPERATIONAL_DEPARTMENT_NAME,
      slug,
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
    return findDefaultOperationalDepartment(prisma, clientId);
  }
}

export async function ensureDefaultOperationalDepartmentAndQueue(
  prisma: PrismaClient,
  clientId: string
) {
  const department = await getDefaultOperationalDepartment(prisma, clientId);
  if (!department) {
    throw new Error("default_operational_department_missing");
  }
  const resolved = await resolveDepartmentOperationalQueue(prisma, {
    clientId,
    departmentId: department.id,
  });
  return { department, queue: resolved.queue };
}

export async function resolveOperationalDepartmentId(
  prisma: PrismaClient,
  clientId: string,
  departmentId?: string | null
) {
  const fallback = await getDefaultOperationalDepartment(prisma, clientId, { createIfMissing: false });
  if (!departmentId) return fallback?.id ?? null;
  const department = await prisma.department.findFirst({
    where: { clientId, id: departmentId },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!department || !department.isActive || isLegacyOperationalDepartment(department)) {
    return fallback?.id ?? null;
  }
  return department.id;
}
