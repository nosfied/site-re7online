import { campaignTask, CampaignOperationsClosed } from "../campaigns/campaignOperations.js";

// Admit before the first file/SQL write and retain the task until persistence
// finishes. A preflight GET is only a hint; it never grants upload authority.
export function withCampaignMediaAdmission<T>(purpose: string, persist: () => Promise<T>): Promise<T> {
  if (purpose !== "CAMPAIGN") return persist();
  // Only synchronous admission errors are normalized. A rejected persistence
  // promise keeps its actual error and cannot be misreported as a gate denial.
  try { return campaignTask("campaign-media-upload", persist); }
  catch { throw new CampaignOperationsClosed(); }
}
