export type InboxWindowState = {
  channel?: string | null;
  windowIsOpen?: boolean | null;
  windowExpiresAt?: string | null;
};

export function isInboxFreeformWindowOpen(
  item: InboxWindowState | null | undefined,
  nowMs = Date.now()
) {
  if (!item || item.channel !== "whatsapp") return true;
  if (item.windowIsOpen !== true) return false;
  if (!item.windowExpiresAt) return false;
  const expiresAt = Date.parse(item.windowExpiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return nowMs < expiresAt;
}
