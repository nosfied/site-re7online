export function normalizeWaIdDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function canonicalizeBrazilWaId(input: string): string {
  const digits = normalizeWaIdDigits(input);
  if (!digits.startsWith("55")) {
    return digits;
  }

  const ddd = digits.slice(2, 4);
  if (!/^\d{2}$/.test(ddd)) return digits;
  return digits;
}

export type WaIdLookup = {
  raw: string;
  canonical: string;
  variants: string[];
};

export function buildWaIdLookup(input: string): WaIdLookup {
  const raw = normalizeWaIdDigits(input);
  const canonical = canonicalizeBrazilWaId(raw);
  return {
    raw,
    canonical,
    variants: Array.from(new Set([raw, canonical].filter(Boolean))),
  };
}

type ConversationLookupCandidate = {
  updatedAt?: Date | string | null;
  lastInboundAt?: Date | string | null;
  lastOutboundAt?: Date | string | null;
};

function toTimestamp(value?: Date | string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function compareConversationLookupPriority<T extends ConversationLookupCandidate>(
  left: T,
  right: T
) {
  const updatedDiff = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;

  const inboundDiff = toTimestamp(right.lastInboundAt) - toTimestamp(left.lastInboundAt);
  if (inboundDiff !== 0) return inboundDiff;

  return toTimestamp(right.lastOutboundAt) - toTimestamp(left.lastOutboundAt);
}
