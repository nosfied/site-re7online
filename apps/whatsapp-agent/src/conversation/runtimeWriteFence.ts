import type { ConversationRuntimeState, Prisma } from "@prisma/client";

// Observed control, not a proposed document. No lock is held across provider I/O.
export const runtimeWriteTokenSelect = {
  updatedAt: true, version: true, mode: true, handoffStatus: true,
  assignedUserId: true, assignedAt: true, departmentId: true, queueId: true,
  status: true, closedAt: true, lastInboundAt: true,
} as const;
export type RuntimeWriteToken = Pick<ConversationRuntimeState, keyof typeof runtimeWriteTokenSelect>;

export function captureRuntimeWriteToken(row: RuntimeWriteToken): RuntimeWriteToken {
  return Object.fromEntries(Object.keys(runtimeWriteTokenSelect).map(key => [key, row[key as keyof RuntimeWriteToken]])) as RuntimeWriteToken;
}

export async function updateRuntimeIfUnchanged(params: {
  prisma: Pick<Prisma.TransactionClient, "conversationRuntimeState">;
  clientId: string;
  waId: string;
  expected: RuntimeWriteToken;
  data: Prisma.ConversationRuntimeStateUpdateManyMutationInput;
}): Promise<RuntimeWriteToken | null> {
  const rows = await params.prisma.conversationRuntimeState.updateManyAndReturn({
    where: { ...params.expected, clientId: params.clientId, waId: params.waId },
    data: { ...params.data, version: { increment: 1 } },
    select: runtimeWriteTokenSelect,
  });
  return rows[0] ? captureRuntimeWriteToken(rows[0]) : null;
}
