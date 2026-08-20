import type { Prisma } from "@prisma/client";

export type InboxMessageVisibility = "human_timeline" | "management_only";

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
