import type { Prisma } from "@prisma/client";

export type InboxMessageVisibility = "human_timeline" | "management_only";
export type InboxVisibilityPolicy = "shared" | "assignee_only_after_assignment";

export type HumanInboxProjectionInput = {
  status?: "WAITING" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED" | string | null;
  mode?: "BOT" | "HUMAN" | string | null;
  handoffStatus?: "none" | "pending" | "active" | "NONE" | "PENDING" | "ACTIVE" | string | null;
  assignedUserId?: string | null;
  assignedAt?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  handoffActivatedAt?: string | Date | null;
};

export type UserInboxVisibilityInput = HumanInboxProjectionInput & {
  currentUserId?: string | null;
  userRole?: string | null;
  userDepartmentId?: string | null;
  userDepartmentIds?: string[] | null;
  policy?: InboxVisibilityPolicy | string | null;
  userParticipated?: boolean;
};

export function normalizeInboxVisibilityPolicy(value: unknown): InboxVisibilityPolicy {
  return value === "assignee_only_after_assignment" ? "assignee_only_after_assignment" : "shared";
}

export function isManagementOnlyInboxMessage(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return false;
  return (rawPayload as Record<string, unknown>).inboxVisibility === "management_only";
}

export function withInboxMessageVisibility(
  rawPayload: Prisma.InputJsonObject,
  visibility: InboxMessageVisibility,
  kind: string
): Prisma.InputJsonObject {
  return {
    ...rawPayload,
    inboxVisibility: visibility,
    inboxInteractionKind: kind,
  };
}

export function shouldProjectConversationToHumanInbox(input: HumanInboxProjectionInput) {
  const status = String(input.status ?? "").trim().toUpperCase();
  const mode = String(input.mode ?? "").trim().toUpperCase();
  const handoffStatus = String(input.handoffStatus ?? "").trim().toUpperCase();
  const hasDepartment = Boolean(String(input.departmentId ?? "").trim());
  const hasQueue = Boolean(String(input.queueId ?? "").trim());
  const hasAssignedUser = Boolean(String(input.assignedUserId ?? "").trim());
  const hasAssignedAt = Boolean(String(input.assignedAt ?? "").trim());
  const hasHandoffActivatedAt = Boolean(input.handoffActivatedAt);
  const hasOperationalDestination = hasDepartment && hasQueue;

  if (
    handoffStatus === "ACTIVE" &&
    hasOperationalDestination &&
    (status === "WAITING" || status === "IN_PROGRESS")
  ) {
    return true;
  }

  if (mode === "HUMAN" && hasOperationalDestination && (status === "WAITING" || status === "IN_PROGRESS")) {
    return true;
  }

  if (
    hasAssignedUser &&
    (mode === "HUMAN" || status === "IN_PROGRESS" || status === "WAITING_USER" || status === "WAITING")
  ) {
    return true;
  }

  if (status === "CLOSED") {
    return hasHandoffActivatedAt || hasAssignedAt || hasAssignedUser;
  }

  return false;
}

function isDepartmentScopedRole(role?: string | null) {
  const normalized = String(role ?? "").trim().toUpperCase();
  return normalized === "AGENT" || normalized === "SUPERVISOR";
}

function isAgentRole(role?: string | null) {
  return String(role ?? "").trim().toUpperCase() === "AGENT";
}

function getUserDepartmentIds(input: {
  userDepartmentId?: string | null;
  userDepartmentIds?: string[] | null;
}) {
  const ids = Array.isArray(input.userDepartmentIds)
    ? input.userDepartmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const primary = String(input.userDepartmentId ?? "").trim();
  return ids.length ? ids : primary ? [primary] : [];
}

function userHasDepartmentAccess(input: UserInboxVisibilityInput) {
  const departmentId = String(input.departmentId ?? "").trim();
  if (!departmentId) return false;
  return getUserDepartmentIds(input).includes(departmentId);
}

export function shouldUserSeeConversationInInbox(input: UserInboxVisibilityInput) {
  if (!shouldProjectConversationToHumanInbox(input)) return false;

  const role = String(input.userRole ?? "").trim().toUpperCase();
  if (!isDepartmentScopedRole(role)) return true;

  const currentUserId = String(input.currentUserId ?? "").trim();
  const assignedUserId = String(input.assignedUserId ?? "").trim();
  if (currentUserId && assignedUserId === currentUserId) return true;

  const policy = normalizeInboxVisibilityPolicy(input.policy);
  const status = String(input.status ?? "").trim().toUpperCase();

  if (policy === "assignee_only_after_assignment" && isAgentRole(role)) {
    if (assignedUserId) return false;
    if (status === "CLOSED") return input.userParticipated === true;
  }

  return userHasDepartmentAccess(input);
}
