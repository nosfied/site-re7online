import type { Prisma } from "@prisma/client";

export type InboxMessageVisibility = "human_timeline" | "management_only";

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
