const SAFE_HANDOFF_CONFIRMATION_OUTBOUND_ERRORS = new Set([
  "late_reply_dropped",
  "window_unavailable",
  "window_invalid",
  "window_closed",
  "whatsapp_transport_unavailable",
  "tenant_reactive_outbound_not_ready",
  "tenant_db_config_incomplete",
  "tenant_channel_disabled",
  "tenant_runtime_disabled",
  "tenant_reactive_automation_disabled",
  "tenant_reactive_outbound_disabled",
  "tenant_outbound_credentials_missing",
  "meta_account_unproven",
  "reactive_client_unavailable",
  "reactive_transport_changed",
  "reactive_account_changed",
  "meta_send_failed",
  "web_session_send_failed",
  "usage_limit_reached",
]);

export function sanitizeHandoffConfirmationOutboundError(value: unknown) {
  const error = typeof value === "string" ? value.trim() : "";
  return SAFE_HANDOFF_CONFIRMATION_OUTBOUND_ERRORS.has(error)
    ? error
    : "handoff_confirmation_outbound_failed";
}
