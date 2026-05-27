#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-/opt/re7online/site-re7online}"
APP_DIR="${WORKDIR}/apps/whatsapp-agent"
PM2_TARGET="${PM2_TARGET:-${PM2_ID:-re7-whatsapp-agent}}"
FRONTEND_PM2_TARGET="${FRONTEND_PM2_TARGET:-re7-admin-front}"
PORT="${PORT:-3001}"

export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

log() {
  echo "[deploy-vps] $*"
}

log "Starting deploy"
log "WORKDIR=${WORKDIR}"
log "APP_DIR=${APP_DIR}"
log "PM2_TARGET=${PM2_TARGET}"
log "FRONTEND_PM2_TARGET=${FRONTEND_PM2_TARGET}"
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

log "Step 1/9: git pull --ff-only"
cd "${WORKDIR}"
git pull --ff-only

log "Step 2/9: npm ci --include=dev (backend)"
cd "${APP_DIR}"
npm ci --include=dev

log "Step 3/9: npm run db:deploy"
npm run db:deploy

log "Step 4/9: npm run build (backend)"
npm run build

log "Step 5/9: npm run build (frontend)"
cd "${WORKDIR}"
npm run build

log "Step 6/9: pm2 reload/start backend"
cd "${APP_DIR}"
if pm2 describe "${PM2_TARGET}" >/dev/null 2>&1; then
  pm2 reload "${PM2_TARGET}" --update-env
elif [[ -f "${APP_DIR}/ecosystem.config.cjs" ]]; then
  pm2 start ecosystem.config.cjs --env production
else
  pm2 start dist/index.js --name re7-whatsapp-agent
fi

log "Step 7/9: pm2 reload frontend"
if pm2 describe "${FRONTEND_PM2_TARGET}" >/dev/null 2>&1; then
  pm2 reload "${FRONTEND_PM2_TARGET}" --update-env
else
  log "WARN: frontend PM2 target not found: ${FRONTEND_PM2_TARGET}"
fi

log "Step 8/9: pm2 flush backend"
if pm2 describe "${PM2_TARGET}" >/dev/null 2>&1; then
  pm2 flush "${PM2_TARGET}"
else
  pm2 flush re7-whatsapp-agent
fi

log "Step 9/9: health check"
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

log "Deploy finished successfully"
