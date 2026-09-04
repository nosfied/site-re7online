#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-/opt/re7online/site-re7online}"
APP_DIR="${WORKDIR}/apps/whatsapp-agent"
WORKER_DIR="${WORKDIR}/apps/whatsapp-web-worker"
PM2_TARGET="${PM2_TARGET:-${PM2_ID:-re7-whatsapp-agent}}"
WORKER_PM2_TARGET="${WORKER_PM2_TARGET:-re7-whatsapp-web-worker}"
FRONTEND_PM2_TARGET="${FRONTEND_PM2_TARGET:-re7-admin-front}"
PORT="${PORT:-3001}"
DRY_RUN=false
DRY_RUN_TARGET="${DRY_RUN_TARGET:-@{u}}"

export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

log() {
  echo "[deploy-vps] $*"
}

usage() {
  cat <<'USAGE' >&2
Usage:
  deploy-vps.sh [--dry-run [target-ref]]

Without --dry-run, performs a FF-only deploy using git pull --ff-only.
With --dry-run, computes the impact matrix against target-ref, or @{u}.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      if [[ $# -gt 1 && "$2" != --* ]]; then
        DRY_RUN_TARGET="$2"
        shift
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 64
      ;;
  esac
  shift
done

matrix_value() {
  local key="$1"
  local matrix_file="$2"
  awk -F': ' -v key="$key" '$1 == key { print $2; found=1; exit } END { if (!found) exit 1 }' "$matrix_file"
}

run_impact_matrix() {
  local before_head="$1"
  local after_head="$2"
  local matrix_file="$3"
  local script="${WORKDIR}/scripts/deploy-impact-matrix.sh"

  if [[ ! -x "$script" ]]; then
    log "ERROR: impact matrix script not executable: $script"
    exit 1
  fi

  set +e
  "$script" "$before_head" "$after_head" >"$matrix_file"
  local status=$?
  set -e
  cat "$matrix_file"
  if [[ $status -ne 0 ]]; then
    log "ERROR: impact matrix failed with status $status"
    exit "$status"
  fi
}

assert_yes_no() {
  local name="$1"
  local value="$2"
  if [[ "$value" != "YES" && "$value" != "NO" ]]; then
    log "ERROR: invalid matrix value for ${name}: ${value}"
    exit 1
  fi
}

log "Starting deploy"
log "WORKDIR=${WORKDIR}"
log "APP_DIR=${APP_DIR}"
log "WORKER_DIR=${WORKER_DIR}"
log "PM2_TARGET=${PM2_TARGET}"
log "WORKER_PM2_TARGET=${WORKER_PM2_TARGET}"
log "FRONTEND_PM2_TARGET=${FRONTEND_PM2_TARGET}"
log "PORT=${PORT}"

if [[ ! -d "${WORKDIR}/.git" ]]; then
  log "ERROR: WORKDIR is not a git repository: ${WORKDIR}"
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  log "ERROR: app directory not found: ${APP_DIR}"
  exit 1
fi

if [[ ! -d "${WORKER_DIR}" ]]; then
  log "ERROR: worker directory not found: ${WORKER_DIR}"
  exit 1
fi

cd "${WORKDIR}"
BEFORE_HEAD="$(git rev-parse HEAD)"

if [[ "$DRY_RUN" == "true" ]]; then
  AFTER_HEAD="$(git rev-parse --verify "${DRY_RUN_TARGET}^{commit}")"
  matrix_file="$(mktemp)"
  trap 'rm -f "$matrix_file"' EXIT
  log "Dry run: DEPLOY RANGE ${BEFORE_HEAD}..${AFTER_HEAD}"
  run_impact_matrix "$BEFORE_HEAD" "$AFTER_HEAD" "$matrix_file"
  log "Dry run finished; no pull/build/migrate/reload executed"
  exit 0
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "ERROR: pm2 not found in PATH"
  exit 1
fi

log "Step 1/10: git pull --ff-only"
git pull --ff-only
AFTER_HEAD="$(git rev-parse HEAD)"

matrix_file="$(mktemp)"
trap 'rm -f "$matrix_file"' EXIT

log "Step 2/10: deploy impact matrix"
log "DEPLOY RANGE ${BEFORE_HEAD}..${AFTER_HEAD}"
run_impact_matrix "$BEFORE_HEAD" "$AFTER_HEAD" "$matrix_file"

BACKEND_BUILD="$(matrix_value BACKEND_BUILD "$matrix_file")"
WORKER_BUILD="$(matrix_value WORKER_BUILD "$matrix_file")"
FRONTEND_BUILD="$(matrix_value FRONTEND_BUILD "$matrix_file")"
BACKEND_RELOAD="$(matrix_value BACKEND_RELOAD "$matrix_file")"
WORKER_RELOAD="$(matrix_value WORKER_RELOAD "$matrix_file")"
FRONTEND_RELOAD="$(matrix_value FRONTEND_RELOAD "$matrix_file")"
MIGRATION_REVIEW="$(matrix_value MIGRATION_REVIEW "$matrix_file")"
UNKNOWN_RUNTIME_IMPACT="$(matrix_value UNKNOWN_RUNTIME_IMPACT "$matrix_file")"
REVIEW_REQUIRED="$(matrix_value REVIEW_REQUIRED "$matrix_file")"

for item in \
  "BACKEND_BUILD=$BACKEND_BUILD" \
  "WORKER_BUILD=$WORKER_BUILD" \
  "FRONTEND_BUILD=$FRONTEND_BUILD" \
  "BACKEND_RELOAD=$BACKEND_RELOAD" \
  "WORKER_RELOAD=$WORKER_RELOAD" \
  "FRONTEND_RELOAD=$FRONTEND_RELOAD" \
  "MIGRATION_REVIEW=$MIGRATION_REVIEW" \
  "UNKNOWN_RUNTIME_IMPACT=$UNKNOWN_RUNTIME_IMPACT" \
  "REVIEW_REQUIRED=$REVIEW_REQUIRED"; do
  assert_yes_no "${item%%=*}" "${item#*=}"
done

if [[ "$REVIEW_REQUIRED" == "YES" || "$UNKNOWN_RUNTIME_IMPACT" == "YES" ]]; then
  log "ERROR: deployment requires manual impact review; stopping before build/reload"
  exit 1
fi

if [[ "$BACKEND_RELOAD" == "YES" && "$BACKEND_BUILD" != "YES" ]]; then
  log "ERROR: backend reload requested without backend build"
  exit 1
fi
if [[ "$WORKER_RELOAD" == "YES" && "$WORKER_BUILD" != "YES" ]]; then
  log "ERROR: worker reload requested without worker build"
  exit 1
fi
if [[ "$FRONTEND_RELOAD" == "YES" && "$FRONTEND_BUILD" != "YES" ]]; then
  log "ERROR: frontend reload requested without frontend build"
  exit 1
fi

if [[ "$BEFORE_HEAD" == "$AFTER_HEAD" ]]; then
  log "No Git changes detected; skipping builds, migrations, and reloads"
fi

if [[ "$BACKEND_BUILD" == "YES" || "$MIGRATION_REVIEW" == "YES" ]]; then
  log "Step 3/10: npm ci --include=dev (backend)"
  cd "${APP_DIR}"
  npm ci --include=dev
else
  log "Step 3/10: skip backend npm ci"
fi

if [[ "$WORKER_BUILD" == "YES" ]]; then
  log "Step 4/10: npm ci --include=dev (worker)"
  cd "${WORKER_DIR}"
  npm ci --include=dev
else
  log "Step 4/10: skip worker npm ci"
fi

if [[ "$MIGRATION_REVIEW" == "YES" ]]; then
  log "Step 5/10: npm run db:deploy"
  cd "${APP_DIR}"
  npm run db:deploy
else
  log "Step 5/10: skip db:deploy (no migration review)"
fi

if [[ "$BACKEND_BUILD" == "YES" ]]; then
  log "Step 6/10: npm run build (backend)"
  cd "${APP_DIR}"
  npm run build
else
  log "Step 6/10: skip backend build"
fi

if [[ "$WORKER_BUILD" == "YES" ]]; then
  log "Step 7/10: npm run build (worker)"
  cd "${WORKER_DIR}"
  npm run build
else
  log "Step 7/10: skip worker build"
fi

if [[ "$FRONTEND_BUILD" == "YES" ]]; then
  log "Step 8/10: npm run build (frontend)"
  cd "${WORKDIR}"
  npm run build
else
  log "Step 8/10: skip frontend build"
fi

log "Step 9/10: conditional PM2 reloads"
if [[ "$BACKEND_RELOAD" == "YES" ]]; then
  cd "${APP_DIR}"
  if pm2 describe "${PM2_TARGET}" >/dev/null 2>&1; then
    pm2 reload "${PM2_TARGET}" --update-env
  elif [[ -f "${APP_DIR}/ecosystem.config.cjs" ]]; then
    pm2 start ecosystem.config.cjs --env production
  else
    pm2 start dist/index.js --name re7-whatsapp-agent
  fi
fi

if [[ "$WORKER_RELOAD" == "YES" ]]; then
  if pm2 describe "${WORKER_PM2_TARGET}" >/dev/null 2>&1; then
    pm2 reload "${WORKER_PM2_TARGET}" --update-env
  else
    log "WARN: worker PM2 target not found: ${WORKER_PM2_TARGET}"
  fi
fi

if [[ "$FRONTEND_RELOAD" == "YES" ]]; then
  if pm2 describe "${FRONTEND_PM2_TARGET}" >/dev/null 2>&1; then
    pm2 reload "${FRONTEND_PM2_TARGET}" --update-env
  else
    log "WARN: frontend PM2 target not found: ${FRONTEND_PM2_TARGET}"
  fi
fi

if [[ "$BACKEND_RELOAD" == "YES" ]]; then
  if pm2 describe "${PM2_TARGET}" >/dev/null 2>&1; then
    pm2 flush "${PM2_TARGET}"
  else
    pm2 flush re7-whatsapp-agent
  fi
fi

log "Step 10/10: health check"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
HEALTH_OK=false
for i in $(seq 1 20); do
  log "health check try ${i}/20"
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [[ "${HEALTH_OK}" != "true" ]]; then
  log "ERROR: health check failed"
  pm2 status || true
  pm2 describe "${PM2_TARGET}" | sed -n '1,200p' || true
  pm2 logs "${PM2_TARGET}" --err --lines 200 --nostream || true
  pm2 logs "${PM2_TARGET}" --out --lines 80 --nostream || true
  exit 1
fi

log "health OK"
pm2 status

log "Deploy finished successfully"
