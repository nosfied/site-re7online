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
