import { Prisma, type ConversationRuntimeState } from "@prisma/client";

// Observed control, not a proposed document. No lock is held across provider I/O.
export const runtimeWriteTokenSelect = {
  clientId: true, waId: true, channel: true, provider: true, channelAccountId: true,
  answers: true, lastInboundMessageId: true, updatedAt: true, version: true, mode: true, handoffStatus: true,
  assignedUserId: true, assignedAt: true, departmentId: true, queueId: true,
  status: true, closedAt: true, lastInboundAt: true,
} as const;
export type RuntimeWriteToken = Pick<ConversationRuntimeState, keyof typeof runtimeWriteTokenSelect>;

export function captureRuntimeWriteToken(row: RuntimeWriteToken): RuntimeWriteToken {
  return Object.fromEntries(Object.keys(runtimeWriteTokenSelect).map(key => [key, key === "answers" ? structuredClone(row.answers) : row[key as keyof RuntimeWriteToken]])) as RuntimeWriteToken;
}

function tokenWhere(token: RuntimeWriteToken): Prisma.ConversationRuntimeStateWhereInput {
  return { ...token, answers: { equals: token.answers === null ? Prisma.AnyNull : token.answers } };
}

const invalidatedTokens = new WeakSet<RuntimeWriteToken>();
export function invalidateRuntimeWriteToken(token: RuntimeWriteToken) {
  invalidatedTokens.add(token);
}

// A receipt is earned by the activity UPDATE itself, never by rereading current state.
// The shared token belongs only to this execution; shallow state transforms retain it.
export async function recordOwnRuntimeOutboundActivity(params: {
  prisma: Pick<Prisma.TransactionClient, "conversationRuntimeState">;
  clientId: string;
  waId: string;
  expected: RuntimeWriteToken;
  sentAt: Date;
  messageId: string;
  channelAccountId: string;
}): Promise<boolean> {
  const token = params.expected;
  if (invalidatedTokens.has(token) || token.clientId !== params.clientId || token.waId !== params.waId) return false;
  const rows = await params.prisma.conversationRuntimeState.updateManyAndReturn({
    where: { ...tokenWhere(token), OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lte: params.sentAt } }] },
    data: { provider: "web_session", channelAccountId: params.channelAccountId,
      lastOutboundAt: params.sentAt, lastOutboundMessageId: params.messageId },
    select: runtimeWriteTokenSelect,
  });
  if (!rows[0]) { invalidateRuntimeWriteToken(token); return false; }
  Object.assign(token, captureRuntimeWriteToken(rows[0]));
  return true;
}

export async function updateRuntimeIfUnchanged(params: {
  prisma: Pick<Prisma.TransactionClient, "conversationRuntimeState">;
  clientId: string;
  waId: string;
  expected: RuntimeWriteToken;
  data: Prisma.ConversationRuntimeStateUpdateManyMutationInput;
}): Promise<RuntimeWriteToken | null> {
  if (invalidatedTokens.has(params.expected) || params.expected.clientId !== params.clientId || params.expected.waId !== params.waId) return null;
  const rows = await params.prisma.conversationRuntimeState.updateManyAndReturn({
    where: { ...tokenWhere(params.expected), clientId: params.clientId, waId: params.waId },
    data: { ...params.data, version: { increment: 1 } },
    select: runtimeWriteTokenSelect,
  });
  return rows[0] ? captureRuntimeWriteToken(rows[0]) : null;
}
