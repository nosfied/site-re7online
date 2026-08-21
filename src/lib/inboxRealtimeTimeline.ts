import type { AppRealtimeEvent } from "@/lib/appRealtime";
import type { ConversationOperationalStatus, InboxConversationItem, InboxMessageItem } from "@/lib/whatsappAdminApi";

export function isManagementOnlyRealtimeMessage(
  event: Pick<Extract<AppRealtimeEvent, { type: "message.created" }>, "message">
) {
  return event.message.inboxVisibility === "management_only";
}

export function isNonHumanTimelineRealtimeMessage(
  event: Pick<Extract<AppRealtimeEvent, { type: "message.created" }>, "humanInboxVisible" | "message">
) {
  return isManagementOnlyRealtimeMessage(event) || event.humanInboxVisible === false;
}

export function shouldApplyRealtimeMessageToHumanTimeline(
  event: Pick<Extract<AppRealtimeEvent, { type: "message.created" }>, "humanInboxVisible" | "message">
) {
  if (isNonHumanTimelineRealtimeMessage(event)) return false;
  return event.humanInboxVisible === true || event.message.inboxVisibility === "human_timeline";
}

export function isHumanTimelineMessageItem(item: { inboxVisibility?: InboxMessageItem["inboxVisibility"] }) {
  return item.inboxVisibility !== "management_only";
}

export function getRealtimeHumanInboxVisibility(
  event: Pick<Extract<AppRealtimeEvent, { type: "message.created" | "conversation.handoff.updated" }>, "humanInboxVisible">
) {
  return typeof event.humanInboxVisible === "boolean" ? event.humanInboxVisible : null;
}

export function normalizeConversationIdentity(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function uniqueConversationIdentities(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeConversationIdentity).filter(Boolean)));
}

export function realtimeConversationCandidates(
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">
) {
  return uniqueConversationIdentities([event.waIdCanonical, event.waId]);
}

export function selectedConversationCandidates(input: {
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  return uniqueConversationIdentities([
    ...input.selectedConversationIdentityCandidates,
    input.selectedConversationKey,
    input.selectedConversationWaId,
  ]);
}

export function realtimeEventTargetsSelectedConversation(input: {
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">;
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  const selectedCandidates = selectedConversationCandidates(input);
  if (selectedCandidates.length === 0) return false;
  const eventCandidates = realtimeConversationCandidates(input.event);
  return eventCandidates.some((candidate) => selectedCandidates.includes(candidate));
}

export function resolveRealtimeTimelineConversationKey(input: {
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">;
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  if (realtimeEventTargetsSelectedConversation(input)) {
    return input.selectedConversationKey ?? realtimeConversationCandidates(input.event)[0] ?? null;
  }
  return realtimeConversationCandidates(input.event)[0] ?? null;
}

export function resolveRealtimeConversationOperationalProjection(
  current: Pick<
    InboxConversationItem,
    "mode" | "status" | "handoffStatus" | "assignedUserId" | "departmentId" | "queueId"
  >,
  event: {
    mode?: InboxConversationItem["mode"] | null;
    status?: ConversationOperationalStatus | null;
    handoffStatus?: InboxConversationItem["handoffStatus"];
    assignedUserId?: string | null;
    departmentId?: string | null;
    queueId?: string | null;
  }
) {
  const hasExplicitStatus = Object.prototype.hasOwnProperty.call(event, "status");
  if (hasExplicitStatus) {
    return {
      mode: event.mode ?? current.mode,
      status: event.status ?? null,
      handoffStatus: event.handoffStatus ?? current.handoffStatus,
      assignedUserId: event.assignedUserId !== undefined ? event.assignedUserId : current.assignedUserId,
      departmentId: event.departmentId !== undefined ? event.departmentId : current.departmentId,
      queueId: event.queueId !== undefined ? event.queueId : current.queueId,
    };
  }

  if (current.status === "CLOSED") {
    return {
      mode: current.mode,
      status: current.status,
      handoffStatus: current.handoffStatus,
      assignedUserId: current.assignedUserId,
      departmentId: current.departmentId,
      queueId: current.queueId,
    };
  }

  return {
    mode: event.mode ?? current.mode,
    status: current.status,
    handoffStatus: event.handoffStatus ?? current.handoffStatus,
    assignedUserId: event.assignedUserId !== undefined ? event.assignedUserId : current.assignedUserId,
    departmentId: event.departmentId !== undefined ? event.departmentId : current.departmentId,
    queueId: event.queueId !== undefined ? event.queueId : current.queueId,
  };
}
