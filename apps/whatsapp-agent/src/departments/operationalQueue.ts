import { Prisma, type PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const INTERNAL_OPERATIONAL_QUEUE_NAME = "Atendimento interno";
export const OPERATIONAL_QUEUE_UNAVAILABLE_MESSAGE =
  "Este setor ainda não está disponível para receber atendimentos.";

export class OperationalQueueUnavailableError extends Error {
  readonly code = "operational_queue_unavailable";
  readonly status = 409;

  constructor() {
    super(OPERATIONAL_QUEUE_UNAVAILABLE_MESSAGE);
  }
}

export async function resolveDepartmentOperationalQueue(
  prisma: PrismaLike,
  params: { clientId: string; departmentId: string; requireActive?: boolean }
) {
  const department = await prisma.department.findFirst({
    where: {
      id: params.departmentId,
      clientId: params.clientId,
      ...(params.requireActive === false ? {} : { isActive: true }),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      operationalQueue: {
        select: { id: true, name: true, clientId: true, departmentId: true },
      },
    },
  });
  if (!department?.operationalQueue) {
    throw new OperationalQueueUnavailableError();
  }
  return { department, queue: department.operationalQueue };
}

async function createInternalQueue(
  tx: Prisma.TransactionClient,
  params: { clientId: string; departmentId: string }
) {
  return tx.queue.create({
    data: {
      clientId: params.clientId,
      departmentId: params.departmentId,
      name: INTERNAL_OPERATIONAL_QUEUE_NAME,
    },
    select: { id: true, name: true, clientId: true, departmentId: true },
  });
}

export async function createDepartmentWithOperationalQueue(
  prisma: PrismaClient,
  params: {
    clientId: string;
    name: string;
    slug: string;
    isActive?: boolean;
    testHooks?: { beforeQueueCreate?: () => void | Promise<void> };
  }
) {
  const activate = params.isActive ?? true;
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: {
        clientId: params.clientId,
        name: params.name,
        slug: params.slug,
        isActive: false,
      },
      select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
    });
    if (!activate) return department;
    await params.testHooks?.beforeQueueCreate?.();
    const queue = await createInternalQueue(tx, {
      clientId: params.clientId,
      departmentId: department.id,
    });
    return tx.department.update({
      where: { id: department.id },
      data: { operationalQueueId: queue.id, isActive: true },
      select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
    });
  });
}

export async function updateDepartmentWithOperationalQueueLifecycle(
  prisma: PrismaClient,
  params: {
    clientId: string;
    departmentId: string;
    name?: string;
    slug?: string;
    isActive?: boolean;
  }
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.department.findFirst({
      where: { id: params.departmentId, clientId: params.clientId },
      select: {
        id: true,
        isActive: true,
        operationalQueueId: true,
        queues: { select: { id: true }, take: 2 },
      },
    });
    if (!existing) return null;
    const nextActive = params.isActive ?? existing.isActive;
    const metadata = {
      ...(params.name ? { name: params.name } : {}),
      ...(params.slug ? { slug: params.slug } : {}),
    };
    if (!nextActive) {
      return tx.department.update({
        where: { id: existing.id },
        data: { ...metadata, isActive: false },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
      });
    }
    let operationalQueueId = existing.operationalQueueId;
    if (!operationalQueueId && !existing.isActive && existing.queues.length === 0) {
      operationalQueueId = (
        await createInternalQueue(tx, {
          clientId: params.clientId,
          departmentId: existing.id,
        })
      ).id;
    }
    if (!operationalQueueId) {
      throw new OperationalQueueUnavailableError();
    }
    return tx.department.update({
      where: { id: existing.id },
      data: {
        ...metadata,
        ...(operationalQueueId ? { operationalQueueId } : {}),
        isActive: true,
      },
      select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
    });
  });
}

export async function replaceDepartmentOperationalQueue(
  prisma: PrismaClient,
  params: { clientId: string; departmentId: string; queueId: string }
) {
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.findFirst({
      where: { id: params.departmentId, clientId: params.clientId },
      select: { id: true },
    });
    if (!department) return null;
    const queue = await tx.queue.findFirst({
      where: {
        id: params.queueId,
        clientId: params.clientId,
        departmentId: params.departmentId,
      },
      select: { id: true },
    });
    if (!queue) {
      throw new OperationalQueueUnavailableError();
    }
    return tx.department.update({
      where: { id: department.id },
      data: { operationalQueueId: queue.id },
      select: { id: true, name: true, slug: true, isActive: true, operationalQueueId: true },
    });
  });
}
