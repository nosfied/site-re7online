import { getCampaignStatusUxLabel } from "./appUxLabels";

type CampaignLifecycle = { status: string; scheduledAt?: string | null };

// This is a presentation of the persisted contract, not a new execution state.
export function isImmediateCampaignQueued(campaign: CampaignLifecycle) {
  return campaign.status === "scheduled" && campaign.scheduledAt == null;
}

export function getCampaignListStatus(campaign: CampaignLifecycle) {
  return isImmediateCampaignQueued(campaign) ? "sending" : campaign.status;
}

export function getCampaignPresentationLabel(campaign: CampaignLifecycle) {
  return isImmediateCampaignQueued(campaign) ? "Na fila de envio" : getCampaignStatusUxLabel(campaign.status);
}

export function shouldRefreshCampaign(campaign: CampaignLifecycle) {
  // Future schedules must also be observed when the scheduler starts them.
  return campaign.status === "scheduled" || campaign.status === "sending";
}

// Same generation invalidation used by previews: no cache or operational state.
export function createCampaignReadGeneration() {
  let generation = 0;
  const latest = { list: 0, detail: 0 };
  return {
    invalidate(lane?: keyof typeof latest) {
      if (lane) latest[lane] += 1;
      else generation += 1;
    },
    begin(lane: keyof typeof latest) {
      const captured = generation;
      const request = ++latest[lane];
      return () => generation === captured && latest[lane] === request;
    },
  };
}

// datetime-local shares the browser civil-time contract of formatDateTime.
export function campaignScheduleLocalInput(instant?: string | null) {
  if (!instant) return "";
  const value = new Date(instant);
  if (!Number.isFinite(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

// Only suppress a child when its explicit controller and batch relation are present.
// Incomplete pages retain the child; names and recipient identities are irrelevant.
export function campaignListRepresentatives<T extends { id: string; clientId: string; executionBatch?: { id: string; chunks: Array<{ campaignId: string }> } | null }>(items: T[]) {
  const represented = new Set<string>();
  for (const item of items) {
    const batch = item.executionBatch;
    if (!batch || batch.chunks.some(chunk => chunk.campaignId === item.id)) continue;
    for (const chunk of batch.chunks) {
      const child = items.find(candidate => candidate.id === chunk.campaignId && candidate.clientId === item.clientId);
      if (child && child.id !== item.id) represented.add(child.id);
    }
  }
  return items.filter(item => !represented.has(item.id));
}
