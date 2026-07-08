export type ConversationSlaRuntimeState = {
  status?: string | null;
  assignedUserId?: string | null;
  queueId?: string | null;
};

export type ConversationSlaMetric = {
  firstResponseTimeSec: number | null;
  resolutionTimeSec: number | null;
};

export type ConversationSlaOperationalSummary = {
  waitingFirstResponse: number;
  inProgress: number;
  waitingUser: number;
  closed: number;
  avgFirstResponseTimeSec: number | null;
  avgResolutionTimeSec: number | null;
};

function averageSeconds(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildConversationSlaOperationalSummary(
  metrics: ConversationSlaMetric[],
  runtimeStates: ConversationSlaRuntimeState[]
): ConversationSlaOperationalSummary {
  const firstResponseValues = metrics
    .map((item) => item.firstResponseTimeSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const resolutionValues = metrics
    .map((item) => item.resolutionTimeSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    waitingFirstResponse: runtimeStates.filter((item) => item.status === "WAITING").length,
    inProgress: runtimeStates.filter((item) => item.status === "IN_PROGRESS").length,
    waitingUser: runtimeStates.filter((item) => item.status === "WAITING_USER").length,
    closed: runtimeStates.filter((item) => item.status === "CLOSED").length,
    avgFirstResponseTimeSec: averageSeconds(firstResponseValues),
    avgResolutionTimeSec: averageSeconds(resolutionValues),
  };
}
