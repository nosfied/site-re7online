#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${APP_DIR}/.data"

log() {
  echo "[restore-data] $*"
}

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-file.tar.gz>" >&2
  exit 2
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  log "ERROR: backup file not found: ${BACKUP_FILE}"
  exit 1
fi

log "backup selected: ${BACKUP_FILE}"
log "target: ${DATA_DIR}"
read -r -p "[restore-data] This will overwrite .data. Type RESTORE to continue: " CONFIRM
if [[ "${CONFIRM}" != "RESTORE" ]]; then
  log "aborted"
  exit 1
fi

TMP_DIR="$(mktemp -d "${APP_DIR}/.restore-staging.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

tar -xzf "${BACKUP_FILE}" -C "${TMP_DIR}"

if [[ ! -d "${TMP_DIR}/.data" ]]; then
  log "ERROR: backup does not contain .data directory"
  exit 1
fi

if [[ ! -f "${TMP_DIR}/.data/conversations.json" && ! -f "${TMP_DIR}/.data/whatsapp-events.json" ]]; then
  log "ERROR: backup .data missing required files"
  exit 1
fi

if [[ -d "${DATA_DIR}" ]]; then
  SAFETY_DIR="${APP_DIR}/.data.pre-restore.$(date +%Y%m%d-%H%M%S)"
  mv "${DATA_DIR}" "${SAFETY_DIR}"
  log "previous .data moved to: ${SAFETY_DIR}"
fi

mv -T "${TMP_DIR}/.data" "${DATA_DIR}"
trap - EXIT
rm -rf "${TMP_DIR}"

log "restore completed"
log "recommended: restart PM2 app manually (pm2 reload <id> --update-env)"
