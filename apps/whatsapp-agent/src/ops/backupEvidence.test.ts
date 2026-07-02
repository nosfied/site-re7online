import assert from "node:assert/strict";
import test from "node:test";
import {
  createRestoreDrillEvidence,
  evaluateBackupHealth,
  parseBackupManifestJsonl,
} from "./backupEvidence.js";

test("evaluateBackupHealth accepts recent backup with checksum and offsite", () => {
  const entries = parseBackupManifestJsonl(`
{"timestamp":"2026-07-02T01:00:00Z","status":"success","event":"backup.success","file":"backups/postgres/20260702.dump","sizeBytes":4096,"sha256":"abc","objectCount":100,"offsiteStatus":"success"}
`);

  const evidence = evaluateBackupHealth({
    entries,
    now: new Date("2026-07-02T10:00:00Z"),
    requireOffsite: true,
  });

  assert.equal(evidence.status, "ok");
  assert.deepEqual(evidence.reasons, []);
  assert.equal(evidence.ageHours, 9);
});

test("evaluateBackupHealth flags stale backup and missing offsite", () => {
  const entries = parseBackupManifestJsonl(`
{"timestamp":"2026-07-01T01:00:00Z","status":"success","event":"backup.success","file":"backups/postgres/20260701.dump","sizeBytes":4096,"sha256":"abc","objectCount":100,"offsiteStatus":"not_configured"}
`);

  const evidence = evaluateBackupHealth({
    entries,
    now: new Date("2026-07-02T10:00:00Z"),
    maxAgeHours: 26,
    requireOffsite: true,
  });

  assert.equal(evidence.status, "warning");
  assert.ok(evidence.reasons.includes("backup.too_old"));
  assert.ok(evidence.reasons.includes("backup.offsite_missing"));
});

test("createRestoreDrillEvidence redacts sensitive operational notes", () => {
  const evidence = createRestoreDrillEvidence({
    backupFile: "/secure/backups/20260702.dump",
    sha256: "abc123",
    result: "success",
    responsible: "ops@example.com",
    observations: "Validado por +55 49 99999-9999 com token=secret-value",
    restoredInto: "restore_validation_83e",
    finishedAt: "2026-07-02T11:00:00Z",
  });

  assert.equal(evidence.backupFileName, "20260702.dump");
  assert.equal(evidence.sha256, "abc123");
  assert.match(evidence.evidenceId, /^[a-f0-9]{24}$/);
  assert.equal(evidence.responsible, "[redacted]");
  assert.equal(evidence.observations, "Validado por [redacted] com token=[redacted]");
});
