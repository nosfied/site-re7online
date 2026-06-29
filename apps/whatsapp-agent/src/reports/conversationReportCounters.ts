export type ConversationReportRuntimeState = {
  assignedUserId?: string | null;
  assignedUserIds?: string[];
  status?: string | null;
  mode?: string | null;
  assignmentCount?: number | null;
};

export function isAutomatedConversationReportState(state: ConversationReportRuntimeState | undefined) {
  return (
    state?.mode === "BOT" &&
    !state.assignedUserId &&
    (state.assignedUserIds ?? []).length === 0 &&
    (state.status === null || state.status === undefined || state.status === "WAITING")
  );
}

export function getHumanTransferReportCount(state: ConversationReportRuntimeState | undefined) {
  const count = state?.assignmentCount;
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
