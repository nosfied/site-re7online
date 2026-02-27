#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${APP_DIR}/.data"
BACKUP_DIR="${APP_DIR}/.backups"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${TS}.tar.gz"
LOCK_FILE="${BACKUP_DIR}/.backup.lock"

log() {
  echo "[backup-data] $*"
}

if [[ ! -d "${DATA_DIR}" ]]; then
  log "ERROR: directory not found: ${DATA_DIR}"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "already running"
  exit 0
fi

log "creating backup: ${BACKUP_FILE}"
TMP_BACKUP="${BACKUP_FILE}.tmp"
tar -czf "${TMP_BACKUP}" -C "${APP_DIR}" .data
mv -f "${TMP_BACKUP}" "${BACKUP_FILE}"

log "applying retention: 14 days"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.tar.gz' -mtime +14 -print -delete \
  | sed 's|^|[backup-data] removed: |' || true

log "done"
