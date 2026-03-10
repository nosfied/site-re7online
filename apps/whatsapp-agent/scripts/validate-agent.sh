#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/whatsapp-agent"

TENANT="${TENANT:-re7online}"
RANGE="${RANGE:-1h}"
WAID_DEMO="${WAID_DEMO:-}"
WAID_LEAD="${WAID_LEAD:-}"

if [[ -z "$WAID_DEMO" ]]; then
  echo "FAIL: WAID_DEMO nao definido (ex.: export WAID_DEMO=55849...)" >&2
  exit 2
fi

if [[ -z "$WAID_LEAD" ]]; then
  echo "FAIL: WAID_LEAD nao definido (ex.: export WAID_LEAD=55849...)" >&2
  exit 2
fi

step() {
  echo
  echo "[$1/4] $2"
}

run_step() {
  local number="$1"
  local description="$2"
  shift 2

  step "$number" "$description"
  if "$@"; then
    echo "PASS [$number/4] $description"
  else
    echo "FAIL [$number/4] $description" >&2
    exit 1
  fi
}

cd "$ROOT_DIR"

run_step 1 "build whatsapp-agent" \
  npm --prefix apps/whatsapp-agent run build

run_step 2 "quote-site smoke" \
  bash apps/whatsapp-agent/scripts/quote-site-smoke.sh

run_step 3 "e2e demo" \
  bash apps/whatsapp-agent/scripts/e2e-demo.sh \
    --tenant "$TENANT" \
    --waid "$WAID_DEMO" \
    --range "$RANGE"

run_step 4 "e2e lead pricing" \
  bash apps/whatsapp-agent/scripts/e2e-lead-pricing.sh \
    "$WAID_LEAD" \
    --tenant "$TENANT" \
    --temp-allowlist \
    --range "$RANGE"

echo
echo "VALIDATION OK: gate pre-deploy concluido (tenant=${TENANT}, range=${RANGE})"
