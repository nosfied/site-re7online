import { ConversationOperationalStatus, type PrismaClient } from "@prisma/client";

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
    orderBy: [
      { handoffActivatedAt: "asc" },
      { updatedAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: { id: true },
    take: 500,
  });
  const index = items.findIndex((item) => item.id === params.runtimeStateId);
  return index >= 0 ? index + 1 : null;
}
