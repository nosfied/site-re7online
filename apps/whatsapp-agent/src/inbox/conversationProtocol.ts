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

export function buildConversationProtocolNotice(protocol: string) {
  return `Seu protocolo de atendimento é ${protocol}. Guarde este número para acompanhamento.`;
}

export function normalizeConversationProtocol(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PROTOCOLO\s+/i, "")
    .replace(/^CVT[-\s]?/i, "")
    .replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 12) return null;
  return `CVT-${normalized.slice(0, 12)}`;
}

export function getConversationIdPrefixFromProtocol(value: string | null | undefined) {
  const protocol = normalizeConversationProtocol(value);
  if (!protocol) return null;
  const suffix = protocol.slice("CVT-".length).toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(suffix)) return null;
  return `${suffix.slice(0, 8)}-${suffix.slice(8, 12)}`;
}
