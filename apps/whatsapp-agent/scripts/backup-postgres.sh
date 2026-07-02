#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${POSTGRES_BACKUP_DIR:-${APP_DIR}/backups/postgres}"
MANIFEST_FILE="${POSTGRES_BACKUP_MANIFEST:-${BACKUP_DIR}/manifest.jsonl}"
RETENTION_DAYS="${POSTGRES_BACKUP_RETENTION_DAYS:-14}"
MIN_BYTES="${POSTGRES_BACKUP_MIN_BYTES:-1024}"
MIN_OBJECTS="${POSTGRES_BACKUP_MIN_OBJECTS:-50}"
MODE="${POSTGRES_BACKUP_MODE:-auto}"
OFFSITE_TARGET="${POSTGRES_BACKUP_OFFSITE_TARGET:-}"
DOCKER_CONTAINER="${POSTGRES_BACKUP_DOCKER_CONTAINER:-wa-agent-postgres}"
DB_NAME="${POSTGRES_BACKUP_DB_NAME:-whatsapp_agent}"
DB_USER="${POSTGRES_BACKUP_DB_USER:-wa_agent}"
TS="$(date -u +%Y%m%d-%H%M%S)"
START_EPOCH="$(date +%s)"
BACKUP_FILE="${BACKUP_DIR}/${TS}.dump"
LOCK_FILE="${BACKUP_DIR}/.postgres-backup.lock"
TMP_BACKUP="${BACKUP_FILE}.tmp"
TMP_LIST="${BACKUP_FILE}.list.tmp"

log() {
  printf '[backup-postgres] %s\n' "$*"
}

json_manifest() {
  node -e '
const fs = require("fs");
const entry = {
  timestamp: process.env.MANIFEST_TIMESTAMP,
  status: process.env.MANIFEST_STATUS,
  event: process.env.MANIFEST_EVENT,
  file: process.env.MANIFEST_FILE,
  sizeBytes: Number(process.env.MANIFEST_SIZE_BYTES || 0),
  sha256: process.env.MANIFEST_SHA256 || null,
  durationMs: Number(process.env.MANIFEST_DURATION_MS || 0),
  version: process.env.MANIFEST_VERSION || "78L",
  mode: process.env.MANIFEST_MODE || null,
  objectCount: Number(process.env.MANIFEST_OBJECT_COUNT || 0),
  retentionDays: Number(process.env.MANIFEST_RETENTION_DAYS || 0),
  offsiteStatus: process.env.MANIFEST_OFFSITE_STATUS || "not_configured",
  offsiteTarget: process.env.MANIFEST_OFFSITE_TARGET || null,
  error: process.env.MANIFEST_ERROR || null
};
fs.mkdirSync(require("path").dirname(process.env.MANIFEST_PATH), { recursive: true });
fs.appendFileSync(process.env.MANIFEST_PATH, JSON.stringify(entry) + "\n");
' >/dev/null
}

append_manifest() {
  local status="$1"
  local event="$2"
  local file="$3"
  local size_bytes="${4:-0}"
  local sha256="${5:-}"
  local object_count="${6:-0}"
  local error="${7:-}"
  local end_epoch duration_ms
  end_epoch="$(date +%s)"
  duration_ms=$(( (end_epoch - START_EPOCH) * 1000 ))
  MANIFEST_PATH="${MANIFEST_FILE}" \
  MANIFEST_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  MANIFEST_STATUS="${status}" \
  MANIFEST_EVENT="${event}" \
  MANIFEST_FILE="${file}" \
  MANIFEST_SIZE_BYTES="${size_bytes}" \
  MANIFEST_SHA256="${sha256}" \
  MANIFEST_DURATION_MS="${duration_ms}" \
  MANIFEST_MODE="${RESOLVED_MODE:-unknown}" \
  MANIFEST_OBJECT_COUNT="${object_count}" \
  MANIFEST_RETENTION_DAYS="${RETENTION_DAYS}" \
  MANIFEST_OFFSITE_STATUS="${OFFSITE_STATUS:-not_configured}" \
  MANIFEST_OFFSITE_TARGET="${OFFSITE_TARGET:+configured}" \
  MANIFEST_ERROR="${error}" \
  json_manifest
}

fail_backup() {
  local event="$1"
  local reason="$2"
  local size_bytes="0"
  if [[ -f "${TMP_BACKUP}" ]]; then
    size_bytes="$(wc -c < "${TMP_BACKUP}" | tr -d ' ')"
  fi
  append_manifest "failed" "${event}" "${BACKUP_FILE}" "${size_bytes}" "" "0" "${reason}"
  log "event=${event} status=failed reason=${reason}"
  rm -f "${TMP_BACKUP}" "${TMP_LIST}"
  exit 1
}

resolve_mode() {
  if [[ "${MODE}" == "docker" ]]; then
    RESOLVED_MODE="docker"
    return
  fi
  if [[ "${MODE}" == "local" ]]; then
    RESOLVED_MODE="local"
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx "${DOCKER_CONTAINER}"; then
    RESOLVED_MODE="docker"
    return
  fi
  RESOLVED_MODE="local"
}

run_pg_dump() {
  if [[ "${RESOLVED_MODE}" == "docker" ]]; then
    docker exec "${DOCKER_CONTAINER}" pg_dump -U "${DB_USER}" -Fc -d "${DB_NAME}" > "${TMP_BACKUP}"
    return
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    fail_backup "backup.failed" "DATABASE_URL is required for local pg_dump mode"
  fi
  pg_dump -Fc "${DATABASE_URL}" > "${TMP_BACKUP}"
}

run_pg_restore_list() {
  if [[ "${RESOLVED_MODE}" == "docker" ]]; then
    docker exec -i "${DOCKER_CONTAINER}" pg_restore --list < "${TMP_BACKUP}" > "${TMP_LIST}"
    return
  fi
  pg_restore --list "${TMP_BACKUP}" > "${TMP_LIST}"
}

copy_to_offsite() {
  OFFSITE_STATUS="not_configured"
  if [[ -z "${OFFSITE_TARGET}" ]]; then
    return 0
  fi

  OFFSITE_STATUS="failed"
  case "${OFFSITE_TARGET}" in
    file://*|/*|.*)
      local target_dir="${OFFSITE_TARGET#file://}"
      mkdir -p "${target_dir}"
      cp "${BACKUP_FILE}" "${target_dir}/$(basename "${BACKUP_FILE}")"
      cp "${BACKUP_FILE}.sha256" "${target_dir}/$(basename "${BACKUP_FILE}.sha256")"
      ;;
    rclone:*)
      if ! command -v rclone >/dev/null 2>&1; then
        return 1
      fi
      local remote="${OFFSITE_TARGET#rclone:}"
      rclone copyto "${BACKUP_FILE}" "${remote}/$(basename "${BACKUP_FILE}")"
      rclone copyto "${BACKUP_FILE}.sha256" "${remote}/$(basename "${BACKUP_FILE}.sha256")"
      ;;
    scp:*)
      if ! command -v scp >/dev/null 2>&1; then
        return 1
      fi
      local destination="${OFFSITE_TARGET#scp:}"
      scp "${BACKUP_FILE}" "${destination}/$(basename "${BACKUP_FILE}")"
      scp "${BACKUP_FILE}.sha256" "${destination}/$(basename "${BACKUP_FILE}.sha256")"
      ;;
    *)
      log "event=backup.offsite_upload_failed status=failed reason=unsupported_target"
      return 1
      ;;
  esac

  OFFSITE_STATUS="success"
  return 0
}

mkdir -p "${BACKUP_DIR}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "event=backup.skipped status=skipped reason=already_running"
  exit 0
fi

RESOLVED_MODE="unknown"
resolve_mode
log "event=backup.started status=running mode=${RESOLVED_MODE} file=${BACKUP_FILE}"

if ! run_pg_dump; then
  fail_backup "backup.failed" "pg_dump failed"
fi

SIZE_BYTES="$(wc -c < "${TMP_BACKUP}" | tr -d ' ')"
if [[ "${SIZE_BYTES}" -le 0 ]]; then
  fail_backup "backup.invalid" "dump is empty"
fi
if [[ "${SIZE_BYTES}" -lt "${MIN_BYTES}" ]]; then
  fail_backup "backup.invalid" "dump smaller than minimum bytes"
fi

if ! run_pg_restore_list; then
  fail_backup "backup.invalid" "pg_restore --list failed"
fi

OBJECT_COUNT="$(awk 'BEGIN { count = 0 } !/^(;|$)/ { count++ } END { print count }' "${TMP_LIST}")"
if [[ "${OBJECT_COUNT}" -lt "${MIN_OBJECTS}" ]]; then
  fail_backup "backup.invalid" "object count below minimum"
fi

SHA256="$(sha256sum "${TMP_BACKUP}" | awk '{print $1}')"
mv -f "${TMP_BACKUP}" "${BACKUP_FILE}"
printf '%s  %s\n' "${SHA256}" "$(basename "${BACKUP_FILE}")" > "${BACKUP_FILE}.sha256"
rm -f "${TMP_LIST}"

if ! copy_to_offsite; then
  append_manifest "failed" "backup.offsite_upload_failed" "${BACKUP_FILE}" "${SIZE_BYTES}" "${SHA256}" "${OBJECT_COUNT}" "offsite copy failed"
  log "event=backup.offsite_upload_failed status=failed target=configured"
  exit 1
fi

append_manifest "success" "backup.success" "${BACKUP_FILE}" "${SIZE_BYTES}" "${SHA256}" "${OBJECT_COUNT}" ""
log "event=backup.success status=success file=${BACKUP_FILE} sizeBytes=${SIZE_BYTES} objectCount=${OBJECT_COUNT} sha256=${SHA256}"

log "applying retention: ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime "+${RETENTION_DAYS}" -print -delete \
  | sed 's|^|[backup-postgres] removed: |' || true

log "done"
