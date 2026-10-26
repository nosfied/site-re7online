export type CampaignLifecycleEvent = {
  eventName: string;
  messageId: string | null;
  createdAt: Date;
};

export function projectCampaignLifecyclePresentation(params: {
  campaignId: string;
  status: string;
  events: CampaignLifecycleEvent[];
  providerAcceptancePersistencePending: boolean;
}) {
  const terminationEvent = params.events
    .filter(event => event.messageId === params.campaignId
      && ["campaign.draft.discarded", "campaign.cancelled"].includes(event.eventName))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  const termination = params.status === "cancelled" ? {
    kind: terminationEvent?.eventName === "campaign.draft.discarded" ? "draft_discarded" as const : "campaign_cancelled" as const,
    evidence: terminationEvent?.eventName === "campaign.draft.discarded"
      ? "campaign.draft.discarded" as const
      : terminationEvent?.eventName === "campaign.cancelled"
        ? "campaign.cancelled" as const
        : "campaign.status.cancelled" as const,
  } : null;
  const operationalAlert = params.providerAcceptancePersistencePending ? {
    predicate: "provider_acceptance_persistence_pending" as const,
    evidence: "campaign.message.provider_accepted_without_matching_outbound" as const,
  } : null;
  return { termination, operationalAlert };
}
