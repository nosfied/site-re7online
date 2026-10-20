#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
set +e
output="$("$root/scripts/deploy-normal-release.sh" plan HEAD HEAD 2>&1)"
status=$?
set -e
[[ $status -eq 78 ]]
grep -q 'historical and must not be used' <<<"$output"
echo 'historical normal-release executor is blocked'
