#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="http://127.0.0.1:${PORT}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

WAID="${1:-}"
if [[ -z "$WAID" ]]; then
  echo "Uso: $0 <waId>" >&2
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi

"${ROOT_DIR}/scripts/wait-for-http.sh" "${BASE_URL}/admin/health"

call_endpoint() {
  local endpoint="$1"
  local safe_name="$2"
  local out_file="/tmp/re7-whatsapp-agent-admin-${safe_name}.json"
  local body
  local http_code

  http_code=$(curl -s -o "$out_file" -w "%{http_code}" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" \
    "${BASE_URL}${endpoint}")

  if [[ ! "$http_code" =~ ^2 ]]; then
    echo "FAIL ${endpoint} status=${http_code}" >&2
    cat "$out_file" >&2 || true
    exit 1
  fi

  body=$(cat "$out_file" | wc -c | tr -d ' ')
  echo "OK ${endpoint} bytes=${body}"
}

call_endpoint "/admin/status" "status"
call_endpoint "/admin/templates" "templates"
call_endpoint "/admin/metrics?range=1h" "metrics-1h"
call_endpoint "/admin/metrics?range=24h" "metrics-24h"
call_endpoint "/admin/metrics?range=7d" "metrics-7d"
call_endpoint "/admin/metrics?range=30d" "metrics-30d"
call_endpoint "/admin/messages?waId=${WAID}&limit=10" "messages"
