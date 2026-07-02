export type ConversationReportRangeKey = "1d" | "7d" | "30d" | "month";

export type ConversationReportPeriod =
  | { key: ConversationReportRangeKey; since: Date; until: Date | null }
  | { key: "custom"; since: Date; until: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildPreviousClosedMonthPeriod(now = new Date()) {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const previousMonthStart = new Date(
    Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );
  return {
    key: "month" as const,
    since: previousMonthStart,
    until: new Date(currentMonthStart.getTime() - 1),
  };
}

export function parseConversationReportRange(rawValue: string | undefined, now = new Date()): ConversationReportPeriod | null {
  switch (String(rawValue ?? "").trim()) {
    case "1d":
      return { key: "1d", since: new Date(now.getTime() - DAY_MS), until: null };
    case "30d":
      return { key: "30d", since: new Date(now.getTime() - 30 * DAY_MS), until: null };
    case "month":
      return buildPreviousClosedMonthPeriod(now);
    case "7d":
    case "":
      return { key: "7d", since: new Date(now.getTime() - 7 * DAY_MS), until: null };
    default:
      return null;
  }
}

export function parseConversationReportDate(rawValue: unknown) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

export function parseConversationReportPeriod(
  query: Record<string, string>,
  now = new Date()
): ConversationReportPeriod | null {
  const from = parseConversationReportDate(query.from);
  const to = parseConversationReportDate(query.to);
  if (from || to) {
    const since = from ?? new Date(0);
    const until = to ?? null;
    if (until && until.getTime() < since.getTime()) return null;
    return { key: "custom", since, until };
  }
  return parseConversationReportRange(query.range, now);
}
