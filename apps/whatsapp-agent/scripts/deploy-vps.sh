#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/re7online/site-re7online"
APP_DIR="${REPO_DIR}/apps/whatsapp-agent"
PORT="${PORT:-3001}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "Diretorio nao encontrado: ${APP_DIR}"
  exit 1
fi

cd "${REPO_DIR}"
git fetch --all --prune
git pull --ff-only

cd "${APP_DIR}"

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi

npm run build

if pm2 describe re7-whatsapp-agent >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production
else
  pm2 start ecosystem.config.cjs --env production
fi

pm2 status

curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null
curl -fsS "http://127.0.0.1:${PORT}/webhook?hub.mode=subscribe&hub.verify_token=${WHATSAPP_VERIFY_TOKEN:?WHATSAPP_VERIFY_TOKEN ausente}&hub.challenge=777" >/dev/null

echo "Deploy concluido com sucesso."
