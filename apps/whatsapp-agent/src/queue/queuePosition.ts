import { ConversationOperationalStatus, type PrismaClient, type Prisma } from "@prisma/client";

export type QueueWaitingItem = {
  id: string;
  handoffActivatedAt?: Date | null;
  createdAt?: Date | null;
};

export function getCanonicalQueueOrderBy(): Prisma.ConversationRuntimeStateOrderByWithRelationInput[] {
  return [
    { handoffActivatedAt: "asc" },
    { createdAt: "asc" },
    { id: "asc" },
  ];
}

function dateValue(value?: Date | null) {
  return value instanceof Date ? value.getTime() : Number.MAX_SAFE_INTEGER;
}

export function compareCanonicalQueueItems(left: QueueWaitingItem, right: QueueWaitingItem) {
  const handoffDiff = dateValue(left.handoffActivatedAt) - dateValue(right.handoffActivatedAt);
  if (handoffDiff !== 0) return handoffDiff;
  const createdDiff = dateValue(left.createdAt) - dateValue(right.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return left.id.localeCompare(right.id);
}

export async function getQueuePosition(params: {
  prisma: PrismaClient;
  clientId: string;
  runtimeStateId: string;
  queueId: string | null;
}) {
  if (!params.queueId) return null;
  const items = await params.prisma.conversationRuntimeState.findMany({
    where: {
      clientId: params.clientId,
      queueId: params.queueId,
      status: ConversationOperationalStatus.WAITING,
      assignedUserId: null,
      closedAt: null,
    },
    orderBy: getCanonicalQueueOrderBy(),
    select: { id: true },
    take: 500,
  });
  const index = items.findIndex((item) => item.id === params.runtimeStateId);
  return index >= 0 ? index + 1 : null;
}
