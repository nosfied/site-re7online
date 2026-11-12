const PORTUGUESE_DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeInboxConversationSearch(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(PORTUGUESE_DIACRITICS, "")
    .trim()
    .toLowerCase();
}

export function normalizeInboxPhoneSearch(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeInboxProtocolSearch(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PROTOCOLO\s*/i, "")
    .replace(/^CVT[-\s]?/i, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function inboxConversationMatchesSearch(
  item: {
    protocol?: string | null;
    leadName?: string | null;
    leadPhone?: string | null;
    waId?: string | null;
    waIdCanonical?: string | null;
    id?: string | null;
    lastMessage?: { bodyText?: string | null } | null;
  },
  search: string
) {
  const text = normalizeInboxConversationSearch(search);
  if (!text) return true;
  const textMatches = [
    item.protocol,
    item.leadName,
    item.leadPhone,
    item.waId,
    item.waIdCanonical,
    item.id,
    item.lastMessage?.bodyText,
  ].some((value) => normalizeInboxConversationSearch(value).includes(text));
  if (textMatches) return true;
  const phone = normalizeInboxPhoneSearch(search);
  if (phone.length >= 3) {
    if ([item.leadPhone, item.waId, item.waIdCanonical]
      .some((value) => normalizeInboxPhoneSearch(value).includes(phone))) return true;
  }
  const protocol = normalizeInboxProtocolSearch(search);
  return protocol.length >= 3 && normalizeInboxProtocolSearch(item.protocol).includes(protocol);
}

