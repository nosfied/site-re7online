import crypto from "node:crypto";
import path from "node:path";

export type BackupManifestEntry = {
  timestamp?: string;
  status?: string;
  event?: string;
  file?: string;
  sizeBytes?: number;
  sha256?: string | null;
  durationMs?: number;
  version?: string;
  mode?: string | null;
  objectCount?: number;
  retentionDays?: number;
  offsiteStatus?: string;
  offsiteTarget?: string | null;
  error?: string | null;
};

export type BackupHealthStatus = "ok" | "warning" | "failed";

export type BackupHealthEvidence = {
  checkedAt: string;
  status: BackupHealthStatus;
  latestBackup: BackupManifestEntry | null;
  ageHours: number | null;
  reasons: string[];
};

export type RestoreDrillEvidenceInput = {
  backupFile: string;
  sha256?: string | null;
  result: "success" | "failed";
  responsible?: string | null;
  observations?: string | null;
  restoredInto?: string | null;
  startedAt?: string;
  finishedAt?: string;
};

export type RestoreDrillEvidence = {
  timestamp: string;
  result: "success" | "failed";
  backupFile: string;
  backupFileName: string;
  sha256: string | null;
  responsible: string | null;
  observations: string | null;
  restoredInto: string | null;
  evidenceId: string;
};

const REDACTED = "[redacted]";

export function parseBackupManifestJsonl(content: string): BackupManifestEntry[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BackupManifestEntry);
}

export function getLatestSuccessfulBackup(entries: BackupManifestEntry[]): BackupManifestEntry | null {
  return entries
    .filter((entry) => entry.status === "success" && entry.event === "backup.success")
    .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""))[0] ?? null;
}

export function evaluateBackupHealth(params: {
  entries: BackupManifestEntry[];
  now?: Date;
  maxAgeHours?: number;
  requireOffsite?: boolean;
}): BackupHealthEvidence {
  const now = params.now ?? new Date();
  const maxAgeHours = params.maxAgeHours ?? 26;
  const latestBackup = getLatestSuccessfulBackup(params.entries);
  const reasons: string[] = [];

  if (!latestBackup) {
    return {
      checkedAt: now.toISOString(),
      status: "failed",
      latestBackup: null,
      ageHours: null,
      reasons: ["backup.missing"],
    };
  }

  const backupTimestamp = Date.parse(latestBackup.timestamp || "");
  const ageHours = Number.isFinite(backupTimestamp)
    ? Number(((now.getTime() - backupTimestamp) / 3_600_000).toFixed(3))
    : null;

  if (ageHours === null || ageHours > maxAgeHours) reasons.push("backup.too_old");
  if (!latestBackup.sha256) reasons.push("backup.checksum_missing");
  if (!latestBackup.sizeBytes || latestBackup.sizeBytes <= 0) reasons.push("backup.too_small");
  if (!latestBackup.objectCount || latestBackup.objectCount <= 0) reasons.push("backup.object_count_missing");
  if (params.requireOffsite && latestBackup.offsiteStatus !== "success") {
    reasons.push("backup.offsite_missing");
  }

  const latestFailure = params.entries
    .filter((entry) => entry.status === "failed")
    .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""))[0];
  if (latestFailure && Date.parse(latestFailure.timestamp || "") > backupTimestamp) {
    reasons.push(latestFailure.event || "backup.failed");
  }

  return {
    checkedAt: now.toISOString(),
    status: reasons.length === 0 ? "ok" : "warning",
    latestBackup,
    ageHours,
    reasons,
  };
}

export function createRestoreDrillEvidence(input: RestoreDrillEvidenceInput): RestoreDrillEvidence {
  const timestamp = input.finishedAt ?? new Date().toISOString();
  const backupFileName = path.basename(input.backupFile);
  const normalizedSha256 = input.sha256?.trim() || null;
  const source = `${timestamp}:${backupFileName}:${normalizedSha256 ?? "no-sha"}:${input.result}`;

  return {
    timestamp,
    result: input.result,
    backupFile: redactSensitiveText(input.backupFile) ?? input.backupFile,
    backupFileName,
    sha256: normalizedSha256,
    responsible: redactSensitiveText(input.responsible ?? null),
    observations: redactSensitiveText(input.observations ?? null),
    restoredInto: redactSensitiveText(input.restoredInto ?? null),
    evidenceId: crypto.createHash("sha256").update(source).digest("hex").slice(0, 24),
  };
}

export function redactSensitiveText(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(
      /\b(token|secret|password|senha|key|credential|credencial)\s*[:=]\s*[^,\s]+/gi,
      (_match, label: string) => `${label}=${REDACTED}`,
    )
    .replace(/\+?\d[\d\s().-]{8,}\d/g, REDACTED);
}
