#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
K6_DIR="${ROOT_DIR}/load-tests/k6"
SCENARIO="${1:-health}"
PROFILE="${PROFILE:-vu5}"
API_BASE_URL="${API_BASE_URL:-https://converta.re7online.com/agent-api}"

case "${PROFILE}" in
  smoke5|vu5|vu10|vu20|vu50) ;;
  *)
    echo "[load-test] invalid PROFILE=${PROFILE}; allowed: smoke5, vu5, vu10, vu20, vu50" >&2
    exit 2
    ;;
esac

case "${SCENARIO}" in
  health|login|public-api|search|inbox-read|inbox-detail) ;;
  *)
    echo "[load-test] invalid scenario=${SCENARIO}; allowed: health, login, public-api, search, inbox-read, inbox-detail" >&2
    exit 2
    ;;
esac

if ! command -v k6 >/dev/null 2>&1; then
  echo "[load-test] k6 not found. Install k6 on the load-generator machine before running." >&2
  exit 127
fi

snapshot() {
  local name="$1"
  if [[ -z "${ADMIN_TOKEN:-}" ]]; then
    return 0
  fi
  mkdir -p "${K6_DIR}/results"
  curl -fsS \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" \
    "${API_BASE_URL%/}/admin/ops/metrics" \
    > "${K6_DIR}/results/${name}-${SCENARIO}-${PROFILE}.metrics.json" || true
  curl -fsS \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" \
    "${API_BASE_URL%/}/admin/ops/alerts" \
    > "${K6_DIR}/results/${name}-${SCENARIO}-${PROFILE}.alerts.json" || true
}

mkdir -p "${K6_DIR}/results"
snapshot "before"

echo "[load-test] scenario=${SCENARIO} profile=${PROFILE} apiBase=${API_BASE_URL}"
PROFILE="${PROFILE}" API_BASE_URL="${API_BASE_URL}" k6 run \
  --summary-export "${K6_DIR}/results/${SCENARIO}-${PROFILE}.summary.json" \
  "${K6_DIR}/${SCENARIO}.js"

snapshot "after"
