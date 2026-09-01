import path from "node:path";
import dotenv from "dotenv";
import {
  checkPostgresBackupHealthAndAlert,
  notifyPostgresBackupFailureAndAlert,
} from "../src/ops/postgresBackupAlert.js";

dotenv.config({ path: ".env", override: false });

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = "check", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return { command, args };
}

function getString(args: Args, key: string, fallback?: string) {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function getNumber(args: Args, key: string, fallback: number) {
  const raw = getString(args, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const { command, args } = parseArgs(process.argv.slice(2));
const defaultManifest = path.resolve(process.env.POSTGRES_BACKUP_MANIFEST || "backups/postgres/manifest.jsonl");
const manifestPath = path.resolve(getString(args, "manifest", defaultManifest)!);
const statePath = path.resolve(
  getString(
    args,
    "state",
    process.env.POSTGRES_BACKUP_ALERT_STATE || path.join(path.dirname(manifestPath), ".postgres-backup-alert-state.json"),
  )!,
);

function logSafe(event: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }));
}

if (command === "check") {
  const result = await checkPostgresBackupHealthAndAlert({
    manifestPath,
    statePath,
    maxAgeHours: getNumber(args, "max-age-hours", Number(process.env.POSTGRES_BACKUP_STALE_HOURS || 26)),
    dedupeHours: getNumber(args, "dedupe-hours", Number(process.env.POSTGRES_BACKUP_ALERT_DEDUPE_HOURS || 24)),
    requireOffsite: Boolean(args["require-offsite"] || process.env.POSTGRES_BACKUP_REQUIRE_OFFSITE === "true"),
    environment: process.env.ENV || process.env.NODE_ENV || "production",
  });
  logSafe("postgres_backup.alert.check", {
    ok: result.ok,
    alert: result.alert,
    reason: "reason" in result ? result.reason : undefined,
    status: result.evaluation.evidence.status,
    latestBackup: result.evaluation.evidence.latestBackup?.timestamp ?? null,
    ageHours: result.evaluation.evidence.ageHours,
    reasons: result.evaluation.evidence.reasons,
  });
  process.exit(result.ok ? 0 : 1);
} else if (command === "notify-failure") {
  const originalExitCode = getNumber(args, "exit-code", 1);
  const result = await notifyPostgresBackupFailureAndAlert({
    manifestPath,
    statePath,
    exitCode: originalExitCode,
    dedupeHours: getNumber(args, "dedupe-hours", Number(process.env.POSTGRES_BACKUP_ALERT_DEDUPE_HOURS || 24)),
    environment: process.env.ENV || process.env.NODE_ENV || "production",
    fallbackError: getString(args, "error", null as unknown as string),
  });
  logSafe("postgres_backup.alert.failure", {
    alert: result.alert,
    type: result.type,
    reason: "reason" in result ? result.reason : undefined,
    originalExitCode,
  });
  process.exit(originalExitCode);
} else {
  console.error("Usage: postgres-backup-alert <check|notify-failure>");
  process.exit(2);
}
