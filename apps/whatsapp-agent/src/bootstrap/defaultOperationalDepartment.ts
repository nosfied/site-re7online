import type { PrismaClient } from "@prisma/client";
import { normalizeDepartmentSlug } from "../utils/departmentSlug.js";

export const DEFAULT_OPERATIONAL_DEPARTMENT_NAME = "Atendimento Geral";
export const DEFAULT_OPERATIONAL_QUEUE_NAME = "Fila Geral";

export async function getDefaultOperationalDepartment(
  prisma: PrismaClient,
  clientId: string
) {
  if (!clientId) return null;
  const slug = normalizeDepartmentSlug(DEFAULT_OPERATIONAL_DEPARTMENT_NAME);
  const existing = await prisma.department.findFirst({
    where: {
      clientId,
      isActive: true,
      OR: [{ slug }, { name: DEFAULT_OPERATIONAL_DEPARTMENT_NAME }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  if (existing) return existing;
  return prisma.department.create({
    data: {
      clientId,
      name: DEFAULT_OPERATIONAL_DEPARTMENT_NAME,
      slug,
      isActive: true,
    },
    select: { id: true, name: true },
  });
}

export async function ensureDefaultOperationalDepartmentAndQueue(
  prisma: PrismaClient,
  clientId: string
) {
  const department = await getDefaultOperationalDepartment(prisma, clientId);
  if (!department) {
    throw new Error("default_operational_department_missing");
  }
  const queue = await prisma.queue.upsert({
    where: {
      clientId_departmentId_name: {
        clientId,
        departmentId: department.id,
        name: DEFAULT_OPERATIONAL_QUEUE_NAME,
      },
    },
    update: {},
    create: {
      clientId,
      departmentId: department.id,
      name: DEFAULT_OPERATIONAL_QUEUE_NAME,
    },
    select: { id: true, name: true, departmentId: true },
  });
  return { department, queue };
}
