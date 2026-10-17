#!/usr/bin/env bash
set -euo pipefail

max_errors="${ESLINT_BASELINE_ERRORS:-663}"
max_warnings="${ESLINT_BASELINE_WARNINGS:-246}"
output="$(mktemp)"
trap 'rm -f "$output"' EXIT

set +e
npm run lint 2>&1 | tee "$output"
lint_status=${PIPESTATUS[0]}
set -e

summary="$(grep -E '✖ [0-9]+ problems \([0-9]+ errors, [0-9]+ warnings\)' "$output" | tail -n1 || true)"

if [[ "$lint_status" -eq 0 ]]; then
  echo "ESLINT_BASELINE_OK: clean"
  exit 0
fi

if [[ -z "$summary" ]]; then
  echo "ESLINT_BASELINE_INVALID: lint failed without a recognized summary" >&2
  exit "$lint_status"
fi

errors="$(sed -E 's/.*\(([0-9]+) errors, ([0-9]+) warnings\).*/\1/' <<<"$summary")"
warnings="$(sed -E 's/.*\(([0-9]+) errors, ([0-9]+) warnings\).*/\2/' <<<"$summary")"

if (( errors > max_errors || warnings > max_warnings )); then
  echo "ESLINT_BASELINE_REGRESSION: ${errors} errors/${warnings} warnings; ceiling ${max_errors}/${max_warnings}" >&2
  exit 1
fi

echo "ESLINT_BASELINE_OK: ${errors} errors/${warnings} warnings; no increase above ${max_errors}/${max_warnings}"
