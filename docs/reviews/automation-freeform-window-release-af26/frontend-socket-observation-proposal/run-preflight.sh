#!/bin/bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
H=/usr/local/libexec/re7/frontend-socket-observer.py
Q=/usr/local/libexec/re7/frontend-socket-observer-policy.json
R=/etc/sudoers.d/re7-frontend-socket-observer
(cd "$P" && sha256sum -c scripts.sha256 >/dev/null)
D=$(mktemp -d "$P/receipts-private/invocation-XXXXXXXX")
chmod 700 "$D"
set +e
timeout --signal=TERM 65s python3 "$P/preflight.py" > "$D/stdout.private.log" 2> "$D/stderr.private.log"
RC=$?
set -e
printf '%s
' "$RC" > "$D/exit-code.private.txt"
chmod 600 "$D"/*
# Print only driver summary; never print privileged JSON, raw stderr or policy.
if test "$RC" = 0; then cat "$D/stdout.private.log"; else printf 'PREFLIGHT_DENY exit=%s private_diagnostic=%s
' "$RC" "$D"; fi
exit "$RC"
