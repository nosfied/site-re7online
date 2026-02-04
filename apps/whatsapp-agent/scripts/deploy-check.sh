#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [[ -z "$VERIFY_TOKEN" && -f "$ENV_FILE" ]]; then
  VERIFY_TOKEN=$(grep -E '^WHATSAPP_VERIFY_TOKEN=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "$VERIFY_TOKEN" ]]; then
  echo "WHATSAPP_VERIFY_TOKEN ausente (env ou .env)."
  exit 1
fi

echo "== Health check =="
HEALTH_CODE=$(curl -s -o /tmp/re7_health.out -w "%{http_code}" "${BASE_URL}/health")
echo "GET /health -> HTTP ${HEALTH_CODE}"
cat /tmp/re7_health.out
echo

echo "== Verify check =="
VERIFY_CODE=$(curl -s -o /tmp/re7_verify.out -w "%{http_code}" \
  "${BASE_URL}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345")
echo "GET /webhook verify -> HTTP ${VERIFY_CODE}"
cat /tmp/re7_verify.out
echo

if [[ "$HEALTH_CODE" == "200" && "$VERIFY_CODE" == "200" ]]; then
  echo "Deploy check OK"
else
  echo "Deploy check FAILED"
  exit 1
fi
