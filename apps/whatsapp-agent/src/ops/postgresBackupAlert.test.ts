import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildPostgresBackupAlertEmail,
  checkPostgresBackupHealthAndAlert,
  notifyPostgresBackupFailureAndAlert,
  sanitizePostgresBackupAlertText,
} from "./postgresBackupAlert.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "postgres-backup-alert-"));
}

function writeManifest(dir: string, lines: string[]) {
  const manifest = path.join(dir, "manifest.jsonl");
  fs.writeFileSync(manifest, `${lines.join("\n")}\n`);
  return manifest;
}

const configuredEnv = {
  SMTP_HOST: "smtp.example.test",
  SMTP_FROM: "ops@example.test",
  POSTGRES_BACKUP_ALERT_EMAILS: "backup@example.test",
};

test("recent verified backup is healthy and does not alert", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-31T03:20:00Z","status":"success","event":"backup.success","file":"20260831.dump","sizeBytes":4096,"sha256":"abc","objectCount":100,"offsiteStatus":"not_configured"}',
  ]);
  const sent: unknown[] = [];

  const result = await checkPostgresBackupHealthAndAlert({
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    now: new Date("2026-08-31T10:00:00Z"),
    env: configuredEnv,
    sender: async (message) => {
      sent.push(message);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.alert, "not_needed");
  assert.equal(sent.length, 0);
});

test("missing success manifest sends stale alert", async () => {
  const dir = tempDir();
  const sent: Array<{ subject: string; text: string }> = [];

  const result = await checkPostgresBackupHealthAndAlert({
    manifestPath: path.join(dir, "manifest.jsonl"),
    statePath: path.join(dir, "state.json"),
    now: new Date("2026-08-31T10:00:00Z"),
    env: configuredEnv,
    sender: async (message) => {
      sent.push(message);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.alert, "sent");
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Backup PostgreSQL/);
  assert.match(sent[0].text, /backup\.missing/);
});

test("old latest success sends stale alert", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-30T03:20:00Z","status":"success","event":"backup.success","file":"20260830.dump","sizeBytes":4096,"sha256":"abc","objectCount":100,"offsiteStatus":"not_configured"}',
  ]);
  let sent = 0;

  const result = await checkPostgresBackupHealthAndAlert({
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    now: new Date("2026-08-31T10:00:00Z"),
    env: configuredEnv,
    sender: async () => {
      sent += 1;
    },
  });

  assert.equal(result.alert, "sent");
  assert.equal(result.evaluation.evidence.reasons.includes("backup.too_old"), true);
  assert.equal(sent, 1);
});

test("same stale state is deduped inside cooldown", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-30T03:20:00Z","status":"success","event":"backup.success","file":"20260830.dump","sizeBytes":4096,"sha256":"abc","objectCount":100,"offsiteStatus":"not_configured"}',
  ]);
  let sent = 0;
  const params = {
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    env: configuredEnv,
    sender: async () => {
      sent += 1;
    },
  };

  assert.equal((await checkPostgresBackupHealthAndAlert({ ...params, now: new Date("2026-08-31T10:00:00Z") })).alert, "sent");
  assert.equal((await checkPostgresBackupHealthAndAlert({ ...params, now: new Date("2026-08-31T12:00:00Z") })).alert, "deduped");
  assert.equal(sent, 1);
});

test("successful backup resets stale dedupe and future stale alerts again", async () => {
  const dir = tempDir();
  const manifest = path.join(dir, "manifest.jsonl");
  const statePath = path.join(dir, "state.json");
  let sent = 0;
  const params = {
    manifestPath: manifest,
    statePath,
    env: configuredEnv,
    sender: async () => {
      sent += 1;
    },
  };

  fs.writeFileSync(
    manifest,
    '{"timestamp":"2026-08-30T03:20:00Z","status":"success","event":"backup.success","file":"old.dump","sizeBytes":4096,"sha256":"abc","objectCount":100}\n',
  );
  assert.equal((await checkPostgresBackupHealthAndAlert({ ...params, now: new Date("2026-08-31T10:00:00Z") })).alert, "sent");

  fs.appendFileSync(
    manifest,
    '{"timestamp":"2026-08-31T11:00:00Z","status":"success","event":"backup.success","file":"new.dump","sizeBytes":4096,"sha256":"def","objectCount":100}\n',
  );
  assert.equal((await checkPostgresBackupHealthAndAlert({ ...params, now: new Date("2026-08-31T12:00:00Z") })).alert, "not_needed");
  assert.equal(fs.existsSync(statePath), false);

  assert.equal((await checkPostgresBackupHealthAndAlert({ ...params, now: new Date("2026-09-01T14:00:00Z") })).alert, "sent");
  assert.equal(sent, 2);
});

test("backup command failure alerts without changing original exit code", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-31T03:20:00Z","status":"failed","event":"backup.failed","error":"pg_dump failed token=secret"}',
  ]);
  const sent: Array<{ text: string }> = [];

  const result = await notifyPostgresBackupFailureAndAlert({
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    exitCode: 7,
    now: new Date("2026-08-31T03:21:00Z"),
    env: configuredEnv,
    sender: async (message) => {
      sent.push(message);
    },
  });

  assert.equal(result.type, "BACKUP_EXECUTION_FAILED");
  assert.equal(result.exitCode, 7);
  assert.equal(result.alert, "sent");
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].text, /secret/);
  assert.match(sent[0].text, /token=\[REDACTED]/);
});

test("backup verification failure is classified separately", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-31T03:20:00Z","status":"failed","event":"backup.invalid","error":"pg_restore --list failed"}',
  ]);

  const result = await notifyPostgresBackupFailureAndAlert({
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    exitCode: 1,
    now: new Date("2026-08-31T03:21:00Z"),
    env: configuredEnv,
    sender: async () => {},
  });

  assert.equal(result.type, "BACKUP_VERIFICATION_FAILED");
  assert.equal(result.alert, "sent");
});

test("alert sender failure is reported without hiding unhealthy backup state", async () => {
  const dir = tempDir();
  const manifest = writeManifest(dir, [
    '{"timestamp":"2026-08-30T03:20:00Z","status":"success","event":"backup.success","file":"old.dump","sizeBytes":4096,"sha256":"abc","objectCount":100}',
  ]);

  const result = await checkPostgresBackupHealthAndAlert({
    manifestPath: manifest,
    statePath: path.join(dir, "state.json"),
    now: new Date("2026-08-31T10:00:00Z"),
    env: configuredEnv,
    sender: async () => {
      throw new Error("smtp token=secret failed");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.alert, "failed");
  assert.equal(result.reason, "smtp token=[REDACTED] failed");
});

test("alert content sanitizes secrets, emails and phones", () => {
  const sanitized = sanitizePostgresBackupAlertText(
    "Bearer abc.def token=secret password=p +55 84 99999-1234 ops@example.com",
  );
  assert.doesNotMatch(sanitized, /abc\.def|secret|99999|ops@example/);

  const email = buildPostgresBackupAlertEmail({
    type: "BACKUP_EXECUTION_FAILED",
    checkedAt: "2026-08-31T03:21:00Z",
    environment: "production",
    manifestPath: "/opt/re7online/site-re7online/apps/whatsapp-agent/backups/postgres/manifest.jsonl",
    safeError: sanitized,
  });
  assert.doesNotMatch(email.text, /abc\.def|secret|99999|ops@example/);
});
