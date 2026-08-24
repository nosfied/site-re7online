export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "completed",
  "blocked",
  "failed",
  "cancelled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TERMINAL_STATUSES = ["completed", "blocked", "failed", "cancelled"] as const;

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled", "sending", "cancelled"],
  scheduled: ["draft", "sending", "cancelled"],
  sending: ["paused", "completed", "blocked", "failed", "cancelled"],
  paused: ["sending", "cancelled"],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: [],
};

export function isCampaignStatus(value: string | null | undefined): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}

export function isCampaignTerminalStatus(value: string | null | undefined) {
  return CAMPAIGN_TERMINAL_STATUSES.includes(value as (typeof CAMPAIGN_TERMINAL_STATUSES)[number]);
}

export function canTransitionCampaignStatus(from: string, to: CampaignStatus) {
  if (!isCampaignStatus(from)) return false;
  return TRANSITIONS[from].includes(to);
}

export function assertCampaignTransition(from: string, to: CampaignStatus) {
  if (!canTransitionCampaignStatus(from, to)) {
    throw new Error(`Invalid campaign status transition: ${from} -> ${to}`);
  }
}

export function normalizeScheduledAt(input: unknown, now = new Date()) {
  if (input === null || input === undefined || input === "") return null;
  const date = new Date(String(input));
  if (!Number.isFinite(date.getTime())) return "invalid" as const;
  if (date.getTime() <= now.getTime()) return "past" as const;
  return date;
}
