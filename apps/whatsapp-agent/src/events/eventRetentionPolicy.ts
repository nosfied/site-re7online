export type EventRetentionCategory = "CRITICAL" | "OPERATIONAL" | "NOISE";

const CRITICAL_EXACT_EVENTS = new Set([
  // Import admission/row receipts are execution controls, not compactable CRM telemetry.
  // Deleting them would permit replay or erase proof of partial commits.
  "crm.contact.import.started",
  "crm.contact.import.classified",
  "crm.contact.import.row",
  "crm.contact.import.finished",
  "crm.contact.import.uncertain",
  "conversation.deleted",
  "conversation.anonymized",
  "conversation.assigned",
  "conversation.released",
  "conversation.released_to_general",
  "conversation.transferred",
  "conversation.department.transferred",
  "conversation.status_changed",
  "conversation.reactivated_after_retention",
  "retention.executed",
  "ai.orchestrator.handoff_activated",
]);

const CRITICAL_PREFIXES = [
  "privacy.",
  "retention.",
  "events.retention.",
  "handoff.",
  "assignment.",
  "auth.",
  "security.",
  "login.",
  "quota.",
  "billing.",
];

const OPERATIONAL_PREFIXES = [
  "ai.",
  "flow.",
  "followup.",
  "crm.",
  "orchestrator.",
  "campaign.",
  "template.",
  "lead.",
  "conversation.",
  "outbound.",
  "inbox.",
  "feature.",
];

const NOISE_EXACT_EVENTS = new Set([
  "websocket.ping",
  "websocket.pong",
  "heartbeat",
]);

const NOISE_PREFIXES = [
  "webhook.status.",
  "webhook.status",
  "polling.",
  "realtime.",
  "typing.",
  "delivery.",
  "read.",
  "duplicate.",
  "state.json.write_skipped",
  "allowlist.check",
];

export function classifyEventRetentionPolicy(eventName: string): EventRetentionCategory {
  const normalized = eventName.trim();
  if (!normalized) return "OPERATIONAL";

  if (CRITICAL_EXACT_EVENTS.has(normalized)) return "CRITICAL";
  if (CRITICAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return "CRITICAL";

  if (NOISE_EXACT_EVENTS.has(normalized)) return "NOISE";
  if (NOISE_PREFIXES.some((prefix) => normalized === prefix.replace(/\.$/, "") || normalized.startsWith(prefix))) {
    return "NOISE";
  }
  if (normalized.includes("ping") || normalized.includes("pong") || normalized.includes("heartbeat")) {
    return "NOISE";
  }

  if (OPERATIONAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return "OPERATIONAL";

  return "OPERATIONAL";
}

export const EVENT_RETENTION_CATEGORIES: EventRetentionCategory[] = ["CRITICAL", "OPERATIONAL", "NOISE"];
