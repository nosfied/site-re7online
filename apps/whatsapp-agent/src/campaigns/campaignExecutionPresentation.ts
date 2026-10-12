/** Read-only projection of tenant-scoped jobs. Never reads the global ledger. */
export type CampaignExecutionState = "processing" | "queued" | "user_pause_requested" | "user_paused" | "operational_suspension" | "uncertain" | "cancelled" | "terminal" | "unconfirmed" | "not_started";
export type CampaignExecutionPresentation = { state: CampaignExecutionState };
type JobObservation = { status: string; failureReason?: string | null; leaseToken?: string | null; leaseOwner?: string | null; leaseExpiresAt?: Date | null; leaseConfirmed?: boolean };
export function projectCampaignJobExecution(job: JobObservation, batchStatus?: string | null, now = new Date()): CampaignExecutionPresentation {
  if (job.status === "needs_review" || batchStatus === "needs_review") return { state: "uncertain" };
  const hasLease = Boolean(job.leaseToken || job.leaseOwner || job.leaseExpiresAt);
  const validLease = Boolean(job.leaseToken && job.leaseOwner && job.leaseExpiresAt && job.leaseExpiresAt > now && job.leaseConfirmed === true);
  if (job.status === "running") return { state: !validLease ? "uncertain" : batchStatus === "paused" ? "user_pause_requested" : "processing" };
  if (["queued", "paused"].includes(job.status) && hasLease) return { state: "uncertain" };
  if (job.status === "queued" && job.failureReason === "operational_suspension") return { state: "operational_suspension" };
  if (job.status === "paused" || batchStatus === "paused") return { state: "user_paused" };
  if (job.status === "queued") return { state: "queued" };
  if (job.status === "cancelled") return { state: hasLease ? "uncertain" : "cancelled" };
  if (["completed", "failed", "blocked"].includes(job.status)) return { state: "terminal" };
  return { state: "unconfirmed" };
}
export function aggregateCampaignExecution(presentations: CampaignExecutionPresentation[], status: string): CampaignExecutionPresentation {
  const states = presentations.map(item => item.state);
  if (status === "needs_review") return { state: "uncertain" };
  for (const state of ["uncertain", "user_pause_requested", "processing", "operational_suspension", "unconfirmed", "user_paused", "queued"] as const) if (states.includes(state)) return { state };
  if (status === "cancelled") return { state: states.length ? "cancelled" : "uncertain" };
  if (status === "paused") return { state: "user_paused" };
  if (["completed", "failed", "blocked"].includes(status)) return { state: "terminal" };
  return { state: states.length ? "terminal" : status === "draft" ? "not_started" : status === "scheduled" ? "queued" : "unconfirmed" };
}
