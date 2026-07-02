import crypto from "node:crypto";
import { logger } from "../logger/logger.js";

export type OperationalSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type IncidentStatus = "open" | "monitoring" | "resolved";
export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type AvailabilitySnapshot = {
  id: string;
  tenantId: string | null;
  service: string;
  checkedAt: string;
  ok: boolean;
  dbOk: boolean | null;
  uptimeSeconds: number | null;
  source: string;
};

export type OperationalIncident = {
  id: string;
  tenantId: string | null;
  service: string;
  severity: OperationalSeverity;
  status: IncidentStatus;
  description: string;
  impact: string;
  startedAt: string;
  endedAt: string | null;
  probableCause: string | null;
  actionTaken: string | null;
  customerCommunication: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledMaintenance = {
  id: string;
  tenantId: string | null;
  service: string;
  status: MaintenanceStatus;
  windowStart: string;
  windowEnd: string;
  reason: string;
  expectedImpact: string;
  customerCommunication: string | null;
  createdAt: string;
  updatedAt: string;
};

const availabilitySnapshots: AvailabilitySnapshot[] = [];
const incidents = new Map<string, OperationalIncident>();
const maintenances = new Map<string, ScheduledMaintenance>();
const MAX_AVAILABILITY_SNAPSHOTS = 2_000;

export function recordAvailabilitySnapshot(input: {
  tenantId?: string | null;
  service?: string | null;
  checkedAt?: string | Date | null;
  ok: boolean;
  dbOk?: boolean | null;
  uptimeSeconds?: number | null;
  source?: string | null;
}) {
  const snapshot: AvailabilitySnapshot = {
    id: crypto.randomUUID(),
    tenantId: normalizeTenantId(input.tenantId),
    service: normalizeIdentifier(input.service, "api"),
    checkedAt: normalizeDate(input.checkedAt) ?? new Date().toISOString(),
    ok: input.ok === true,
    dbOk: typeof input.dbOk === "boolean" ? input.dbOk : null,
    uptimeSeconds: Number.isFinite(input.uptimeSeconds) ? Math.max(0, Math.round(Number(input.uptimeSeconds))) : null,
    source: normalizeIdentifier(input.source, "health"),
  };
  availabilitySnapshots.push(snapshot);
  if (availabilitySnapshots.length > MAX_AVAILABILITY_SNAPSHOTS) {
    availabilitySnapshots.splice(0, availabilitySnapshots.length - MAX_AVAILABILITY_SNAPSHOTS);
  }
  return snapshot;
}

export function createOperationalIncident(input: {
  tenantId?: string | null;
  service?: string | null;
  severity?: string | null;
  status?: string | null;
  description?: string | null;
  impact?: string | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
  probableCause?: string | null;
  actionTaken?: string | null;
  customerCommunication?: string | null;
}) {
  const now = new Date().toISOString();
  const incident: OperationalIncident = {
    id: crypto.randomUUID(),
    tenantId: normalizeTenantId(input.tenantId),
    service: normalizeIdentifier(input.service, "api"),
    severity: normalizeSeverity(input.severity),
    status: normalizeIncidentStatus(input.status),
    description: sanitizeOperationalText(input.description, "Operational incident"),
    impact: sanitizeOperationalText(input.impact, "Impact under assessment"),
    startedAt: normalizeDate(input.startedAt) ?? now,
    endedAt: normalizeDate(input.endedAt),
    probableCause: sanitizeOptionalOperationalText(input.probableCause),
    actionTaken: sanitizeOptionalOperationalText(input.actionTaken),
    customerCommunication: sanitizeOptionalOperationalText(input.customerCommunication),
    createdAt: now,
    updatedAt: now,
  };
  incidents.set(incident.id, incident);
  logger.warn({
    event: "ops.incident.created",
    module: "ops",
    incidentId: incident.id,
    tenantId: incident.tenantId,
    service: incident.service,
    severity: incident.severity,
    status: incident.status,
  });
  return incident;
}

export function createScheduledMaintenance(input: {
  tenantId?: string | null;
  service?: string | null;
  status?: string | null;
  windowStart?: string | Date | null;
  windowEnd?: string | Date | null;
  reason?: string | null;
  expectedImpact?: string | null;
  customerCommunication?: string | null;
}) {
  const now = new Date().toISOString();
  const windowStart = normalizeDate(input.windowStart) ?? now;
  const windowEnd = normalizeDate(input.windowEnd) ?? windowStart;
  const maintenance: ScheduledMaintenance = {
    id: crypto.randomUUID(),
    tenantId: normalizeTenantId(input.tenantId),
    service: normalizeIdentifier(input.service, "api"),
    status: normalizeMaintenanceStatus(input.status),
    windowStart,
    windowEnd,
    reason: sanitizeOperationalText(input.reason, "Scheduled maintenance"),
    expectedImpact: sanitizeOperationalText(input.expectedImpact, "No customer impact expected"),
    customerCommunication: sanitizeOptionalOperationalText(input.customerCommunication),
    createdAt: now,
    updatedAt: now,
  };
  maintenances.set(maintenance.id, maintenance);
  logger.info({
    event: "ops.maintenance.scheduled",
    module: "ops",
    maintenanceId: maintenance.id,
    tenantId: maintenance.tenantId,
    service: maintenance.service,
    status: maintenance.status,
  });
  return maintenance;
}

export function listOperationalIncidents(filters: { tenantId?: string | null; month?: string | null } = {}) {
  const range = getMonthRange(filters.month);
  return Array.from(incidents.values())
    .filter((incident) => matchesTenantScope(incident.tenantId, filters.tenantId))
    .filter((incident) => isWithinRange(incident.startedAt, range))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function listScheduledMaintenances(filters: { tenantId?: string | null; month?: string | null } = {}) {
  const range = getMonthRange(filters.month);
  return Array.from(maintenances.values())
    .filter((maintenance) => matchesTenantScope(maintenance.tenantId, filters.tenantId))
    .filter((maintenance) => isWithinRange(maintenance.windowStart, range))
    .sort((a, b) => b.windowStart.localeCompare(a.windowStart));
}

export function getSlaMonthlyEvidence(filters: { tenantId?: string | null; month?: string | null } = {}) {
  const range = getMonthRange(filters.month);
  const snapshots = availabilitySnapshots
    .filter((snapshot) => matchesTenantScope(snapshot.tenantId, filters.tenantId))
    .filter((snapshot) => isWithinRange(snapshot.checkedAt, range));
  const okChecks = snapshots.filter((snapshot) => snapshot.ok).length;
  const totalChecks = snapshots.length;
  const availabilityPercent = totalChecks > 0 ? Number(((okChecks / totalChecks) * 100).toFixed(3)) : null;
  const period = {
    month: range.month,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  };
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantId: filters.tenantId ?? null,
    period,
    availability: {
      totalChecks,
      okChecks,
      failedChecks: totalChecks - okChecks,
      availabilityPercent,
      evidenceSource: "health snapshots in memory",
      snapshots: snapshots.slice(-50),
    },
    incidents: listOperationalIncidents(filters),
    maintenances: listScheduledMaintenances(filters),
    summary: {
      criticalIncidents: listOperationalIncidents(filters).filter((incident) => incident.severity === "CRITICAL").length,
      unresolvedIncidents: listOperationalIncidents(filters).filter((incident) => incident.status !== "resolved").length,
      scheduledMaintenances: listScheduledMaintenances(filters).length,
    },
  };
}

export function resetOperationalSlaEvidenceForTest() {
  availabilitySnapshots.splice(0, availabilitySnapshots.length);
  incidents.clear();
  maintenances.clear();
}

function normalizeTenantId(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeIdentifier(value: string | null | undefined, fallback: string) {
  const text = String(value ?? "").trim().toLowerCase();
  return (text || fallback).replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 80);
}

function normalizeSeverity(value: string | null | undefined): OperationalSeverity {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "INFO" || normalized === "WARNING" || normalized === "ERROR" || normalized === "CRITICAL") {
    return normalized;
  }
  return "WARNING";
}

function normalizeIncidentStatus(value: string | null | undefined): IncidentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "open" || normalized === "monitoring" || normalized === "resolved") return normalized;
  return "open";
}

function normalizeMaintenanceStatus(value: string | null | undefined): MaintenanceStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "scheduled" || normalized === "in_progress" || normalized === "completed" || normalized === "cancelled") {
    return normalized;
  }
  return "scheduled";
}

function sanitizeOperationalText(value: string | null | undefined, fallback: string) {
  return redactSensitiveText(String(value ?? "").trim() || fallback).slice(0, 1_000);
}

function sanitizeOptionalOperationalText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? redactSensitiveText(text).slice(0, 1_000) : null;
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:bearer|token|secret|cookie|authorization|password|otp|totp)\b[^\s,;]*/gi, "[redacted-secret]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[masked-phone]");
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getMonthRange(month?: string | null) {
  const now = new Date();
  const match = String(month ?? "").match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return {
    month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end,
  };
}

function isWithinRange(value: string, range: { start: Date; end: Date }) {
  const timestamp = new Date(value).getTime();
  return timestamp >= range.start.getTime() && timestamp < range.end.getTime();
}

function matchesTenantScope(recordTenantId: string | null, requestedTenantId: string | null | undefined) {
  if (!requestedTenantId) return true;
  return recordTenantId === null || recordTenantId === requestedTenantId;
}
