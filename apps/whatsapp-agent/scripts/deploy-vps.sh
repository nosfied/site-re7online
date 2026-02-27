#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-/opt/re7online/site-re7online}"
APP_DIR="${WORKDIR}/apps/whatsapp-agent"
PM2_ID="${PM2_ID:-0}"
PORT="${PORT:-3001}"

log() {
  echo "[deploy-vps] $*"
}

log "Starting deploy"
log "WORKDIR=${WORKDIR}"
log "APP_DIR=${APP_DIR}"
log "PM2_ID=${PM2_ID}"
log "PORT=${PORT}"

if ! command -v pm2 >/dev/null 2>&1; then
  log "ERROR: pm2 not found in PATH"
  exit 1
fi

if [[ ! -d "${WORKDIR}/.git" ]]; then
  log "ERROR: WORKDIR is not a git repository: ${WORKDIR}"
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  log "ERROR: app directory not found: ${APP_DIR}"
  exit 1
fi

log "Step 1/7: git pull --ff-only"
cd "${WORKDIR}"
git pull --ff-only

log "Step 2/7: npm ci --include=dev"
cd "${APP_DIR}"
npm ci --include=dev

log "Step 3/7: npm run db:deploy"
npm run db:deploy

log "Step 4/7: npm run build"
npm run build

log "Step 5/7: pm2 reload/start"
if pm2 describe "${PM2_ID}" >/dev/null 2>&1; then
  pm2 reload "${PM2_ID}" --update-env
elif [[ -f "${APP_DIR}/ecosystem.config.cjs" ]]; then
  pm2 start ecosystem.config.cjs --env production
else
  pm2 start dist/index.js --name re7-whatsapp-agent
fi

log "Step 6/7: pm2 flush ${PM2_ID}"
if pm2 describe "${PM2_ID}" >/dev/null 2>&1; then
  pm2 flush "${PM2_ID}"
else
  pm2 flush re7-whatsapp-agent
fi

log "Step 7/7: health check"
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
  pm2 describe "${PM2_ID}" | sed -n '1,200p' || true
  pm2 logs "${PM2_ID}" --err --lines 200 --nostream || true
  pm2 logs "${PM2_ID}" --out --lines 80 --nostream || true
  exit 1
fi

log "health OK"

log "Deploy finished successfully"
