export function makeConversationKey(clientKey: string, waId: string) {
  return `${clientKey}:${waId}`;
}

export function getClientKeyFromConversationKey(conversationKey?: string | null) {
  const value = (conversationKey ?? "").trim();
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  return value.slice(0, separator);
}
