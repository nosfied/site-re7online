export type CampaignResultVisibilityStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed"
  | "blocked"
  | "cancelled"
  | "failed"
  | string;

export type CampaignResultEvidenceItem = {
  status: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  conversationId?: string | null;
  pricingCategory?: string | null;
  pricingBillable?: boolean | null;
  pricingModel?: string | null;
  nonBillingReason?: string | null;
  error?: string | null;
};

export function isMissingIndividualHistory(item: CampaignResultEvidenceItem) {
  return item.nonBillingReason === "missing_individual_history";
}

export function hasCampaignResultEvidence(
  item: CampaignResultEvidenceItem,
  campaignStatus: CampaignResultVisibilityStatus | null | undefined
) {
  if (isMissingIndividualHistory(item)) {
    return campaignStatus !== "draft" && campaignStatus !== "scheduled";
  }
  return Boolean(
    item.sentAt ||
      item.deliveredAt ||
      item.conversationId ||
      item.pricingCategory ||
      typeof item.pricingBillable === "boolean" ||
      item.pricingModel ||
      item.nonBillingReason === "opt_out" ||
      item.nonBillingReason === "recipient_blocked" ||
      item.nonBillingReason === "failed_or_blocked" ||
      item.nonBillingReason === "status_unconfirmed" ||
      item.status === "delivered" ||
      item.status === "read" ||
      item.status === "sent" ||
      item.status === "blocked" ||
      item.status === "opt_out" ||
      (item.status === "failed" && item.error)
  );
}

export function getCampaignResultEvidenceLabel(item: CampaignResultEvidenceItem) {
  return isMissingIndividualHistory(item) ? "Inconsistência histórica" : null;
}
