import { ConversationOperationalStatus } from "@prisma/client";

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function elapsedSeconds(from: Date | string | null | undefined, to: Date | string | null | undefined) {
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (!fromDate || !toDateValue) return null;
  return Math.max(0, Math.floor((toDateValue.getTime() - fromDate.getTime()) / 1000));
}

export function buildConversationOperationalTimingFields(params: {
  source?: {
    firstResponseAt?: Date | string | null;
    lastInboundAt?: Date | string | null;
  } | null;
  operational?: {
    assignedAt?: string | null;
    closedAt?: string | null;
    status?: string | ConversationOperationalStatus | null;
  } | null;
  now?: Date | string | null;
}) {
  const now = params.now ?? new Date();
  const status = params.operational?.status ?? null;
  const isClosed = status === ConversationOperationalStatus.CLOSED || status === "CLOSED" || Boolean(params.operational?.closedAt);
  const waitingFirstResponseSec =
    !isClosed && !params.source?.firstResponseAt
      ? elapsedSeconds(params.source?.lastInboundAt, now)
      : null;
  const activeDurationSec =
    params.operational?.assignedAt
      ? elapsedSeconds(params.operational.assignedAt, params.operational.closedAt ?? now)
      : null;
  return {
    waitingFirstResponseSec,
    activeDurationSec,
  };
}
