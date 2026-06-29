export function buildConversationProtocol(conversation: { id?: string | null; createdAt?: Date | string | null }) {
  const id = typeof conversation.id === "string" ? conversation.id.replace(/-/g, "") : "";
  if (id.length >= 12) return `CVT-${id.slice(0, 12).toUpperCase()}`;
  const createdAt =
    conversation.createdAt instanceof Date
      ? conversation.createdAt
      : conversation.createdAt
        ? new Date(conversation.createdAt)
        : null;
  const timestamp =
    createdAt && Number.isFinite(createdAt.getTime())
      ? createdAt.getTime().toString(36).toUpperCase()
      : "SEMID";
  return `CVT-${timestamp}`;
}
