export function parseProviderStatusTimestamp(timestamp: unknown) {
  if (typeof timestamp !== "string" || timestamp.trim().length === 0) return null;
  const trimmed = timestamp.trim();
  const epochSeconds = Number(trimmed);
  if (Number.isFinite(epochSeconds)) {
    const date = new Date(epochSeconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getProviderStatusTieRank(status: string | null | undefined) {
  switch ((status || "").trim().toLowerCase()) {
    case "read":
      return 3;
    case "delivered":
      return 2;
    case "failed":
      return 1;
    case "sent":
      return 0;
    default:
      return -1;
  }
}

export function shouldApplyProviderStatus(params: {
  currentStatus: string | null;
  currentStatusAt: unknown;
  incomingStatus: string | null;
  incomingStatusAt: unknown;
}) {
  const currentAt = parseProviderStatusTimestamp(params.currentStatusAt);
  const incomingAt = parseProviderStatusTimestamp(params.incomingStatusAt);
  const currentRank = getProviderStatusTieRank(params.currentStatus);
  const incomingRank = getProviderStatusTieRank(params.incomingStatus);
  if (incomingRank < 0) return false;
  if (currentRank < 0) return true;

  if (currentAt && incomingAt) {
    if (incomingAt.getTime() < currentAt.getTime()) return false;
    if (incomingAt.getTime() > currentAt.getTime()) return true;
    return incomingRank >= currentRank;
  }

  if (!incomingAt && currentAt) {
    const current = String(params.currentStatus || "").trim().toLowerCase();
    const incoming = String(params.incomingStatus || "").trim().toLowerCase();
    if (current === "read") return false;
    if (current === "delivered") return incoming === "read";
    if (current === "failed") return incoming === "delivered" || incoming === "read";
    if (current === "sent") return incoming === "failed" || incoming === "delivered" || incoming === "read";
    return false;
  }

  return incomingRank >= currentRank;
}
