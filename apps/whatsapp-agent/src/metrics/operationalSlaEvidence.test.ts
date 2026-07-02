import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalIncident,
  createScheduledMaintenance,
  getSlaMonthlyEvidence,
  listOperationalIncidents,
  listScheduledMaintenances,
  recordAvailabilitySnapshot,
  resetOperationalSlaEvidenceForTest,
} from "./operationalSlaEvidence.js";

test("monthly SLA evidence summarizes availability snapshots", () => {
  resetOperationalSlaEvidenceForTest();

  recordAvailabilitySnapshot({
    tenantId: "tenant-a",
    checkedAt: "2026-07-01T10:00:00.000Z",
    ok: true,
    dbOk: true,
    uptimeSeconds: 120,
  });
  recordAvailabilitySnapshot({
    tenantId: "tenant-a",
    checkedAt: "2026-07-01T10:05:00.000Z",
    ok: false,
    dbOk: false,
    uptimeSeconds: 125,
  });
  recordAvailabilitySnapshot({
    tenantId: "tenant-b",
    checkedAt: "2026-07-01T10:10:00.000Z",
    ok: true,
    dbOk: true,
    uptimeSeconds: 130,
  });
  recordAvailabilitySnapshot({
    checkedAt: "2026-07-01T10:15:00.000Z",
    ok: true,
    dbOk: true,
    uptimeSeconds: 135,
  });

  const evidence = getSlaMonthlyEvidence({ tenantId: "tenant-a", month: "2026-07" });

  assert.equal(evidence.availability.totalChecks, 3);
  assert.equal(evidence.availability.okChecks, 2);
  assert.equal(evidence.availability.failedChecks, 1);
  assert.equal(evidence.availability.availabilityPercent, 66.667);
  assert.equal(evidence.period.month, "2026-07");
});

test("incident and maintenance records are tenant scoped and redacted", () => {
  resetOperationalSlaEvidenceForTest();

  const incident = createOperationalIncident({
    tenantId: "tenant-a",
    service: "api",
    severity: "CRITICAL",
    status: "monitoring",
    description: "Falha reportada por fiscal@example.com com token=abc",
    impact: "Indisponibilidade parcial para +55 49 99999-9999",
    startedAt: "2026-07-02T12:00:00.000Z",
    probableCause: "DB connection pool saturated",
    actionTaken: "PM2 reload executado",
    customerCommunication: "Comunicado enviado ao fiscal@example.com",
  });
  createOperationalIncident({
    tenantId: "tenant-b",
    service: "api",
    severity: "WARNING",
    description: "Tenant B",
    impact: "Sem impacto",
    startedAt: "2026-07-02T12:10:00.000Z",
  });
  const maintenance = createScheduledMaintenance({
    tenantId: "tenant-a",
    service: "api",
    windowStart: "2026-07-03T01:00:00.000Z",
    windowEnd: "2026-07-03T01:30:00.000Z",
    reason: "Atualizacao programada",
    expectedImpact: "Janela de instabilidade de ate 5 minutos",
    customerCommunication: "Aviso previo enviado",
  });

  const incidents = listOperationalIncidents({ tenantId: "tenant-a", month: "2026-07" });
  const maintenances = listScheduledMaintenances({ tenantId: "tenant-a", month: "2026-07" });
  const serialized = JSON.stringify({ incident, maintenance, incidents, maintenances });

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, incident.id);
  assert.equal(maintenances.length, 1);
  assert.equal(maintenances[0].id, maintenance.id);
  assert.equal(serialized.includes("fiscal@example.com"), false);
  assert.equal(serialized.includes("99999-9999"), false);
  assert.equal(serialized.includes("token=abc"), false);
  assert.equal(incident.severity, "CRITICAL");
  assert.equal(incident.status, "monitoring");
  assert.equal(maintenance.status, "scheduled");
});
