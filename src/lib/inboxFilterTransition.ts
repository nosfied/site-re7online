import type { ConversationFilter } from "./inboxConversationFilters";

export type FilterableInboxConversation = {
  status: "WAITING" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED" | null;
  mode: "BOT" | "HUMAN" | null;
  handoffStatus?: string | null;
  assignedUserId?: string | null;
  assignedAt?: string | null;
};

export type InboxCompositionActivity = {
  draft: string;
  hasReplyTarget: boolean;
  hasMedia: boolean;
  audioState: "idle" | "recording" | "stopping";
};

export type InboxFilterTransitionDecision =
  | "retain"
  | "retain_outside_filter"
  | "clear";

export type InboxQuickFilter = "ALL" | "UNREAD" | "HUMAN" | "ASSIGNED";

export type InboxFilterEligibility = {
  primaryFilter: ConversationFilter;
  userId: string | null | undefined;
  activeDepartmentId: string | null;
  conversationDepartmentId: string | null | undefined;
  activeChannel: string | null;
  conversationChannel: string | null | undefined;
  quickFilter: InboxQuickFilter;
  isUnread: boolean;
};

function getOperationalStatus(item: FilterableInboxConversation) {
  if (item.assignedUserId && item.status === "WAITING") return "IN_PROGRESS";
  if (item.status) return item.status;
  if (item.mode === "HUMAN") {
    return item.assignedUserId ? "IN_PROGRESS" : "WAITING";
  }
  return null;
}

function isAutomationConversation(item: FilterableInboxConversation) {
  return (
    item.mode === "BOT" &&
    (item.status === "WAITING" || item.status === "WAITING_USER" || item.status === null) &&
    (item.handoffStatus ?? "none") === "none" &&
    !item.assignedUserId &&
    !item.assignedAt
  );
}

export function conversationMatchesPrimaryFilter(
  item: FilterableInboxConversation,
  filter: ConversationFilter,
  userId: string | null | undefined
) {
  const automation = isAutomationConversation(item);
  if (filter !== "AUTOMATION" && automation) return false;
  const status = getOperationalStatus(item);
  switch (filter) {
    case "AUTOMATION":
      return automation;
    case "WAITING":
    case "IN_PROGRESS":
    case "WAITING_USER":
    case "CLOSED":
      return status === filter;
    case "MINE":
      return Boolean(userId) && item.assignedUserId === userId;
    case "UNASSIGNED":
      return !item.assignedUserId;
    default:
      return true;
  }
}

export function conversationMatchesInboxFilters(
  item: FilterableInboxConversation,
  eligibility: InboxFilterEligibility
) {
  if (
    eligibility.activeDepartmentId &&
    (eligibility.conversationDepartmentId ?? null) !== eligibility.activeDepartmentId
  ) {
    return false;
  }
  if (
    eligibility.activeChannel &&
    eligibility.conversationChannel !== eligibility.activeChannel
  ) {
    return false;
  }
  switch (eligibility.quickFilter) {
    case "UNREAD":
      if (!eligibility.isUnread) return false;
      break;
    case "HUMAN":
      if (item.mode !== "HUMAN") return false;
      break;
    case "ASSIGNED":
      if (!item.assignedUserId) return false;
      break;
    default:
      break;
  }
  return conversationMatchesPrimaryFilter(
    item,
    eligibility.primaryFilter,
    eligibility.userId
  );
}

export function hasUnsentInboxComposition(activity: InboxCompositionActivity) {
  return (
    Boolean(activity.draft.trim()) ||
    activity.hasReplyTarget ||
    activity.hasMedia ||
    activity.audioState !== "idle"
  );
}

export function decideInboxFilterTransition(input: {
  filterChanged: boolean;
  hasSelection: boolean;
  selectionMatchesNextFilter: boolean;
  composition: InboxCompositionActivity;
}): InboxFilterTransitionDecision {
  if (!input.filterChanged || !input.hasSelection || input.selectionMatchesNextFilter) {
    return "retain";
  }
  return hasUnsentInboxComposition(input.composition)
    ? "retain_outside_filter"
    : "clear";
}

function identitySetsOverlap(
  expected: Array<string | null | undefined>,
  received: Array<string | null | undefined>
) {
  const normalize = (value: string | null | undefined) => String(value ?? "").trim();
  const expectedValues = new Set(expected.map(normalize).filter(Boolean));
  return received.map(normalize).some((value) => Boolean(value) && expectedValues.has(value));
}

export function shouldPublishInboxTimelineResponse(input: {
  requestSequence: number;
  currentSequence: number;
  expectedConversationIdentities: Array<string | null | undefined>;
  responseConversationIdentities: Array<string | null | undefined>;
}) {
  return (
    input.requestSequence === input.currentSequence &&
    identitySetsOverlap(
      input.expectedConversationIdentities,
      input.responseConversationIdentities
    )
  );
}
