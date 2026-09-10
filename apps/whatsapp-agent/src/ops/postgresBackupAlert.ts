import fs from "node:fs";
import path from "node:path";
import {
  canonicalMailDeliveryError,
  isCanonicalMailConfigured,
  sanitizeMailDeliveryError,
  sendCanonicalMail,
} from "../mail/canonicalMail.js";
import {
  evaluateBackupHealth,
  parseBackupManifestJsonl,
  type BackupHealthEvidence,
  type BackupManifestEntry,
} from "./backupEvidence.js";

export const POSTGRES_BACKUP_STALE_THRESHOLD_HOURS = 26;
export const POSTGRES_BACKUP_ALERT_DEDUPE_HOURS = 24;

export type PostgresBackupAlertType =
  | "BACKUP_EXECUTION_FAILED"
  | "BACKUP_VERIFICATION_FAILED"
  | "BACKUP_STALE";

export type PostgresBackupAlertMessage = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export type PostgresBackupAlertSender = (message: PostgresBackupAlertMessage) => Promise<void>;

export type PostgresBackupAlertState = {
  alerts?: Record<
    string,
    {
      lastAlertAt: string;
      latestSuccessTimestamp: string | null;
    }
  >;
};

export type PostgresBackupAlertEvaluation = {
  healthy: boolean;
  type: PostgresBackupAlertType | null;
  fingerprint: string | null;
  evidence: BackupHealthEvidence;
  latestFailure: BackupManifestEntry | null;
};

type EnvLike = Record<string, string | undefined>;

const REDACTED = "[redacted]";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function splitRecipients(value: string | undefined) {
  return (value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolvePostgresBackupAlertRecipients(env: EnvLike = process.env) {
  return [
    ...splitRecipients(env.POSTGRES_BACKUP_ALERT_EMAILS),
    ...splitRecipients(env.OPERATIONAL_ALERT_EMAILS),
    ...splitRecipients(env.TEMPLATE_REVIEW_NOTIFY_EMAIL),
    ...splitRecipients(env.TEMPLATE_REVIEW_FALLBACK_EMAIL),
  ].filter((email, index, list) => list.indexOf(email) === index);
}

export function isPostgresBackupSmtpConfigured(env: EnvLike = process.env) {
  return isCanonicalMailConfigured(env);
}

export function sanitizePostgresBackupAlertText(value: unknown) {
  return sanitizeMailDeliveryError(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\+?\d[\d\s().-]{8,}\d/g, REDACTED)
    .slice(0, 240);
}

export function readPostgresBackupAlertState(statePath: string): PostgresBackupAlertState {
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as PostgresBackupAlertState;
  } catch {
    return {};
  }
}

export function writePostgresBackupAlertState(statePath: string, state: PostgresBackupAlertState) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function clearPostgresBackupAlertState(statePath: string) {
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
}

function getLatestFailure(entries: BackupManifestEntry[]) {
  return (
    entries
      .filter((entry) => entry.status === "failed")
      .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""))[0] ?? null
  );
}

function classifyFailure(entry: BackupManifestEntry | null): PostgresBackupAlertType {
  if (entry?.event === "backup.invalid") return "BACKUP_VERIFICATION_FAILED";
  return "BACKUP_EXECUTION_FAILED";
}

function buildFingerprint(params: {
  type: PostgresBackupAlertType;
  evidence?: BackupHealthEvidence;
  failure?: BackupManifestEntry | null;
}) {
  if (params.type === "BACKUP_STALE") {
    const reasons = params.evidence?.reasons.slice().sort().join("+") || "unknown";
    return `postgres_backup:stale:${reasons}`;
  }
  const event = params.failure?.event || "backup.failed";
  const error = sanitizePostgresBackupAlertText(params.failure?.error || "unknown");
  return `postgres_backup:failure:${event}:${error}`;
}

export function evaluatePostgresBackupAlert(params: {
  manifestText: string;
  now?: Date;
  maxAgeHours?: number;
  requireOffsite?: boolean;
}): PostgresBackupAlertEvaluation {
  const entries = parseBackupManifestJsonl(params.manifestText);
  const evidence = evaluateBackupHealth({
    entries,
    now: params.now,
    maxAgeHours: params.maxAgeHours ?? POSTGRES_BACKUP_STALE_THRESHOLD_HOURS,
    requireOffsite: params.requireOffsite,
  });
  const latestFailure = getLatestFailure(entries);
  if (evidence.status === "ok") {
    return { healthy: true, type: null, fingerprint: null, evidence, latestFailure };
  }
  return {
    healthy: false,
    type: "BACKUP_STALE",
    fingerprint: buildFingerprint({ type: "BACKUP_STALE", evidence }),
    evidence,
    latestFailure,
  };
}

export function shouldSendPostgresBackupAlert(params: {
  state: PostgresBackupAlertState;
  fingerprint: string;
  latestSuccessTimestamp: string | null;
  now: Date;
  dedupeHours?: number;
}) {
  const record = params.state.alerts?.[params.fingerprint];
  if (!record) return true;
  if (record.latestSuccessTimestamp !== params.latestSuccessTimestamp) return true;
  const elapsedHours = (params.now.getTime() - Date.parse(record.lastAlertAt)) / 3_600_000;
  return !Number.isFinite(elapsedHours) || elapsedHours >= (params.dedupeHours ?? POSTGRES_BACKUP_ALERT_DEDUPE_HOURS);
}

export function markPostgresBackupAlertSent(params: {
  state: PostgresBackupAlertState;
  fingerprint: string;
  latestSuccessTimestamp: string | null;
  now: Date;
}) {
  return {
    ...params.state,
    alerts: {
      ...(params.state.alerts ?? {}),
      [params.fingerprint]: {
        lastAlertAt: params.now.toISOString(),
        latestSuccessTimestamp: params.latestSuccessTimestamp,
      },
    },
  };
}

export function buildPostgresBackupAlertEmail(params: {
  type: PostgresBackupAlertType;
  checkedAt: string;
  environment: string;
  manifestPath: string;
  evidence?: BackupHealthEvidence;
  failure?: BackupManifestEntry | null;
  safeError?: string | null;
}) {
  const latest = params.evidence?.latestBackup ?? null;
  const reasons = params.evidence?.reasons ?? [];
  const title =
    params.type === "BACKUP_STALE"
      ? "Backup PostgreSQL ausente ou antigo"
      : params.type === "BACKUP_VERIFICATION_FAILED"
        ? "Verificacao do backup PostgreSQL falhou"
        : "Execucao do backup PostgreSQL falhou";
  const subject = `[Converta] ${title} - ${params.environment}`;
  const rows = [
    ["Tipo", params.type],
    ["Ambiente", params.environment],
    ["Horario detectado", params.checkedAt],
    ["Manifesto", params.manifestPath],
    ["Ultimo sucesso", latest?.timestamp || "nenhum"],
    ["Idade do ultimo sucesso", params.evidence?.ageHours === null || params.evidence?.ageHours === undefined ? "n/a" : `${params.evidence.ageHours}h`],
    ["Razoes", reasons.length ? reasons.join(", ") : "n/a"],
    ["Evento de falha", params.failure?.event || "n/a"],
    ["Erro", params.safeError || sanitizePostgresBackupAlertText(params.failure?.error || "n/a")],
  ];
  const text = [
    title,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Acao recomendada: verificar o log do cron, executar backup manual controlado e validar pg_restore --list/checksum antes de qualquer deploy com migracao.",
    "",
    "E-mail automatico. Nao contem credenciais, tokens, dumps ou dados de tenants.",
  ].join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;color:#475569;">${escapeHtml(label)}</td><td style="padding:6px 10px;font-weight:700;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#10203b;background:#f8fafc;padding:24px;"><h2 style="margin:0 0 12px;">${escapeHtml(title)}</h2><table>${htmlRows}</table><p>Acao recomendada: verificar o log do cron, executar backup manual controlado e validar pg_restore --list/checksum antes de qualquer deploy com migracao.</p><p style="color:#64748b;font-size:12px;">E-mail automatico. Nao contem credenciais, tokens, dumps ou dados de tenants.</p></body></html>`;
  return { subject, text, html };
}

async function defaultSender(message: PostgresBackupAlertMessage) {
  const result = await sendCanonicalMail({ message });
  if (result.status !== "DELIVERED") throw canonicalMailDeliveryError(result);
}

export async function checkPostgresBackupHealthAndAlert(params: {
  manifestPath: string;
  statePath: string;
  now?: Date;
  maxAgeHours?: number;
  dedupeHours?: number;
  requireOffsite?: boolean;
  environment?: string;
  sender?: PostgresBackupAlertSender;
  env?: EnvLike;
}) {
  const now = params.now ?? new Date();
  const manifestText = fs.existsSync(params.manifestPath) ? fs.readFileSync(params.manifestPath, "utf8") : "";
  const evaluation = evaluatePostgresBackupAlert({
    manifestText,
    now,
    maxAgeHours: params.maxAgeHours,
    requireOffsite: params.requireOffsite,
  });
  if (evaluation.healthy) {
    clearPostgresBackupAlertState(params.statePath);
    return { ok: true as const, alert: "not_needed" as const, evaluation };
  }

  const recipients = resolvePostgresBackupAlertRecipients(params.env);
  if (recipients.length === 0) {
    return { ok: false as const, alert: "not_sent" as const, reason: "no_recipients" as const, evaluation };
  }
  if (!isPostgresBackupSmtpConfigured(params.env)) {
    return { ok: false as const, alert: "not_sent" as const, reason: "smtp_not_configured" as const, evaluation };
  }

  const fingerprint = evaluation.fingerprint!;
  const state = readPostgresBackupAlertState(params.statePath);
  const latestSuccessTimestamp = evaluation.evidence.latestBackup?.timestamp ?? null;
  if (
    !shouldSendPostgresBackupAlert({
      state,
      fingerprint,
      latestSuccessTimestamp,
      now,
      dedupeHours: params.dedupeHours,
    })
  ) {
    return { ok: false as const, alert: "deduped" as const, evaluation };
  }

  const message = buildPostgresBackupAlertEmail({
    type: evaluation.type!,
    checkedAt: evaluation.evidence.checkedAt,
    environment: params.environment ?? process.env.ENV ?? process.env.NODE_ENV ?? "production",
    manifestPath: params.manifestPath,
    evidence: evaluation.evidence,
    failure: evaluation.latestFailure,
  });
  try {
    await (params.sender ?? defaultSender)({ to: recipients, ...message });
    writePostgresBackupAlertState(
      params.statePath,
      markPostgresBackupAlertSent({ state, fingerprint, latestSuccessTimestamp, now }),
    );
    return { ok: false as const, alert: "sent" as const, recipients: recipients.length, evaluation };
  } catch (error) {
    return {
      ok: false as const,
      alert: "failed" as const,
      reason: sanitizePostgresBackupAlertText(error),
      evaluation,
    };
  }
}

export async function notifyPostgresBackupFailureAndAlert(params: {
  manifestPath: string;
  statePath: string;
  exitCode: number;
  now?: Date;
  dedupeHours?: number;
  environment?: string;
  sender?: PostgresBackupAlertSender;
  env?: EnvLike;
  fallbackError?: string | null;
}) {
  const now = params.now ?? new Date();
  const manifestText = fs.existsSync(params.manifestPath) ? fs.readFileSync(params.manifestPath, "utf8") : "";
  const entries = parseBackupManifestJsonl(manifestText);
  const latestFailure = getLatestFailure(entries);
  const type = classifyFailure(latestFailure);
  const fingerprint = buildFingerprint({ type, failure: latestFailure });
  const latestSuccessTimestamp = entries
    .filter((entry) => entry.status === "success" && entry.event === "backup.success")
    .sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""))[0]?.timestamp ?? null;

  const recipients = resolvePostgresBackupAlertRecipients(params.env);
  const base = {
    ok: false as const,
    exitCode: params.exitCode,
    type,
    failure: latestFailure,
  };
  if (recipients.length === 0) return { ...base, alert: "not_sent" as const, reason: "no_recipients" as const };
  if (!isPostgresBackupSmtpConfigured(params.env)) {
    return { ...base, alert: "not_sent" as const, reason: "smtp_not_configured" as const };
  }

  const state = readPostgresBackupAlertState(params.statePath);
  if (
    !shouldSendPostgresBackupAlert({
      state,
      fingerprint,
      latestSuccessTimestamp,
      now,
      dedupeHours: params.dedupeHours,
    })
  ) {
    return { ...base, alert: "deduped" as const };
  }

  const message = buildPostgresBackupAlertEmail({
    type,
    checkedAt: now.toISOString(),
    environment: params.environment ?? process.env.ENV ?? process.env.NODE_ENV ?? "production",
    manifestPath: params.manifestPath,
    failure: latestFailure,
    safeError: sanitizePostgresBackupAlertText(latestFailure?.error || params.fallbackError || "backup command failed"),
  });
  try {
    await (params.sender ?? defaultSender)({ to: recipients, ...message });
    writePostgresBackupAlertState(
      params.statePath,
      markPostgresBackupAlertSent({ state, fingerprint, latestSuccessTimestamp, now }),
    );
    return { ...base, alert: "sent" as const, recipients: recipients.length };
  } catch (error) {
    return { ...base, alert: "failed" as const, reason: sanitizePostgresBackupAlertText(error) };
  }
}
