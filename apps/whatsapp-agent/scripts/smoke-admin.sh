#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="http://127.0.0.1:${PORT}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi

# tenta usar um waId conhecido do allowlist; se não existir, deixa vazio
ALLOWLIST=$(grep -E '^WHATSAPP_ALLOWLIST=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
WAID="${ALLOWLIST%%,*}"

wait_for_http() {
  local url="$1"
  local timeout_sec="${2:-20}"
  local sleep_ms="${3:-200}"
  local start_ms end_ms now_ms http_code elapsed_ms

  start_ms=$(date +%s%3N)
  end_ms=$((start_ms + timeout_sec * 1000))

  while true; do
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 "$url" || true)
    if [[ "$http_code" =~ ^2 ]]; then
      now_ms=$(date +%s%3N)
      elapsed_ms=$((now_ms - start_ms))
      echo "OK: ${url} (${elapsed_ms}ms)"
      return 0
    fi
    now_ms=$(date +%s%3N)
    if (( now_ms >= end_ms )); then
      echo "FAIL: ${url} after ${timeout_sec}s" >&2
      return 1
    fi
    sleep "0.${sleep_ms}"
  done
}

wait_for_http "${BASE_URL}/admin/health"

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

if [[ -n "$WAID" ]]; then
  call_endpoint "/admin/messages?waId=${WAID}&limit=10" "messages"
else
  call_endpoint "/admin/messages?limit=10" "messages"
fi
