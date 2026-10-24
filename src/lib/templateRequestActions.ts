const ADMIN_TEMPLATE_REQUEST_SUBMITTABLE_STATUSES = new Set(["internal_approved"]);
const ADMIN_TEMPLATE_REQUEST_SYNCABLE_STATUSES = new Set([
  "submitted_to_meta",
  "meta_pending",
  "approved_meta",
  "meta_approved",
  "rejected_meta",
  "meta_rejected",
  "submission_unknown",
]);

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}

export function isAdminTemplateRequestSubmittable(status: string) {
  return ADMIN_TEMPLATE_REQUEST_SUBMITTABLE_STATUSES.has(normalizeStatus(status));
}

export function isAdminTemplateRequestSyncable(status: string) {
  return ADMIN_TEMPLATE_REQUEST_SYNCABLE_STATUSES.has(normalizeStatus(status));
}

export function getAdminTemplateRequestActionState(status: string, busy: boolean) {
  return {
    submitDisabled: busy || !isAdminTemplateRequestSubmittable(status),
    syncDisabled: busy || !isAdminTemplateRequestSyncable(status),
  };
}
