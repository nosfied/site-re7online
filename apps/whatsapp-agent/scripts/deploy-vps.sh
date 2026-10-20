#!/usr/bin/env bash
set -euo pipefail

# Compatibility entrypoint. The former implementation pulled and built directly
# in the live checkout and had no complete rollback. Live mutation is retired.

WORKDIR="${WORKDIR:-/opt/re7online/site-re7online}"
canonical="$WORKDIR/scripts/deploy-normal-release.sh"

if [[ "${1:-}" == "--dry-run" ]]; then
  target="${2:-@{u}}"
  exec "$canonical" plan HEAD "$target"
fi

cat >&2 <<'EOF'
[deploy-vps] RETIRED: in-place pull/build/reload is no longer a production path.
Use the canonical two-command flow:
  scripts/deploy-normal-release.sh prepare <base-ref> <target-ref>
  DEPLOY_APPROVED_SHA=<full-sha> scripts/deploy-normal-release.sh activate <release-dir>
EOF
exit 64
