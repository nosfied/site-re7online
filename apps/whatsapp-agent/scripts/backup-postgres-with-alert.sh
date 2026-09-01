#!/usr/bin/env bash
set -uo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

bash scripts/backup-postgres.sh
status=$?

if [ "$status" -ne 0 ]; then
  node --import tsx scripts/postgres-backup-alert.ts notify-failure --exit-code "$status" || true
fi

exit "$status"
