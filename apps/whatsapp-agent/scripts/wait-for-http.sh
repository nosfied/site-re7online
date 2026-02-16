#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
TIMEOUT_SEC="${2:-20}"
SLEEP_MS="${3:-200}"

if [[ -z "$URL" ]]; then
  echo "Uso: $0 <url> [timeout_sec] [sleep_ms]" >&2
  exit 1
fi

start_ms=$(date +%s%3N)
end_ms=$((start_ms + TIMEOUT_SEC * 1000))

while true; do
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || true)
  if [[ "$http_code" =~ ^2 ]]; then
    now_ms=$(date +%s%3N)
    elapsed_ms=$((now_ms - start_ms))
    echo "OK: ${URL} (${elapsed_ms}ms)"
    exit 0
  fi
  now_ms=$(date +%s%3N)
  if (( now_ms >= end_ms )); then
    echo "FAIL: ${URL} after ${TIMEOUT_SEC}s" >&2
    exit 1
  fi
  sleep "0.${SLEEP_MS}"
done
