#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d)"
trap 'chmod -R u+rwx "${ROOT}" 2>/dev/null || true; rm -rf "${ROOT}"' EXIT

BIN="${ROOT}/bin"
BACKUP_ROOT="${ROOT}/backup"
CONTENT="${ROOT}/content"
mkdir -p "${BIN}" "${BACKUP_ROOT}/snapshots" "${CONTENT}/training" "${CONTENT}/support" "${CONTENT}/media"
printf 'training\n' > "${CONTENT}/training/item.txt"
printf 'support\n' > "${CONTENT}/support/item.txt"
printf 'media\n' > "${CONTENT}/media/item.txt"

cat > "${BIN}/docker" <<'SH'
#!/usr/bin/env bash
set -eu
if [[ "$1" == "inspect" ]]; then exit 0; fi
shift
if [[ "${1:-}" == "-i" ]]; then shift; fi
shift
case "${1:-}" in
  pg_dump) printf 'fixture-dump\n' ;;
  pg_restore) printf '1; 0 0 TABLE public fixture owner\n' ;;
  *) exit 2 ;;
esac
SH

cat > "${BIN}/rsync" <<'SH'
#!/usr/bin/env bash
set -eu
args=("$@")
count=${#args[@]}
source=${args[$((count - 2))]}
dest=${args[$((count - 1))]}
cp -a "${source}/." "${dest}/"
SH

cat > "${BIN}/stat" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-Lc" && "${2:-}" == "%u:%g:%a:%h" ]]; then
  printf '0:0:750:1\n'
else
  exec /usr/bin/stat "$@"
fi
SH

cat > "${BIN}/alert-helper" <<SH
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${ROOT}/alert-calls"
SH
chmod 0755 "${BIN}/docker" "${BIN}/rsync" "${BIN}/stat" "${BIN}/alert-helper"

cat > "${BIN}/protected-observer" <<'SH'
#!/usr/bin/env bash
printf '%s\n' '{"authorityVersion":"P1-20261121","checksumsSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","contractPath":"/etc/re7online/backup-retention-protected.v1.json","contractSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","decision":"RETAIN_REQUIRED","identity":{"device":64769,"gid":0,"inode":788249,"mode":"0750","nlink":4,"uid":0},"integrity":"SHA256SUMS_PASS","kind":"CONVERTA_BACKUP_RETENTION_PROTECTION_ATTESTATION","manifestSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","mechanism":{"device":1,"gid":0,"inode":2,"mode":"0500","path":"/usr/local/libexec/re7online/backup-retention-protected-observer.py","sha256":"08ef7300267bc8c3049b01f662fecc830f2ac372f1fd35638e449f6401bce79c","uid":0},"path":"/opt/re7online/backups/converta-persistent/snapshots/20260812T011558Z","reason":"UNIQUE_TRAINING_CONTENT_ONLY_COPY","schemaVersion":1,"snapshotId":"20260812T011558Z","state":"VERIFIED"}'
SH
chmod 0755 "${BIN}/protected-observer"

run_backup() {
  env \
    PATH="${BIN}:/usr/bin:/bin" \
    BACKUP_ROOT="${BACKUP_ROOT}" \
    MIN_FREE_MB=1 \
    KEEP_DAILY=1 \
    KEEP_WEEKLY=1 \
    KEEP_MONTHLY=1 \
    TRAINING_CONTENT_ROOT="${CONTENT}/training" \
    SUPPORT_ATTACHMENT_ROOT="${CONTENT}/support" \
    WEB_SESSION_MEDIA_ROOT="${CONTENT}/media" \
    BACKUP_ALERT_HELPER="${BIN}/alert-helper" \
    bash "$(dirname "$0")/re7-converta-backup"
}

marker_probe="${BACKUP_ROOT}/.keep-probe"
: > "${marker_probe}"
exec 8>"${BACKUP_ROOT}/backup.lock"
flock -n 8
set +e
lock_output="$(run_backup 2>&1)"
lock_status=$?
set -e
[[ "${lock_status}" -ne 0 ]]
grep -q 'another backup is already running' <<<"${lock_output}"
[[ -f "${marker_probe}" ]]
flock -u 8
exec 8>&-
rm -f "${marker_probe}" "${ROOT}/alert-calls"

blocked="${BACKUP_ROOT}/snapshots/20260812T011558Z"
mkdir -p "${blocked}/database" "${blocked}/content"
printf 'protected\n' > "${blocked}/database/database.dump"
chmod 000 "${blocked}"

set +e
first_output="$(run_backup 2>&1)"
first_status=$?
set -e
[[ "${first_status}" -ne 0 ]]
[[ -d "${blocked}" ]]
grep -q 'retention_failed snapshot=20260812T011558Z reason=protected_authority_unavailable' <<<"${first_output}"
grep -q 'backup_terminal status=failed .* phase=retention exit_code=1' <<<"${first_output}"
! grep -q 'backup_success' <<<"${first_output}"
grep -q -- '--event BACKUP_EXECUTION_FAILED .*--phase retention --exit-code 1' "${ROOT}/alert-calls"
! find "${BACKUP_ROOT}" -maxdepth 1 -name '.keep-*' | grep -q .
find "${BACKUP_ROOT}/snapshots" -mindepth 1 -maxdepth 1 -type d ! -name 20260812T011558Z | grep -q .

chmod 0700 "${blocked}"
common="${BACKUP_ROOT}/snapshots/20260101T000000Z"
mkdir -p "${common}"
printf 'ordinary\n' > "${common}/ordinary.txt"
sleep 1
export BACKUP_RETENTION_PROTECTED_OBSERVER_TEST_COMMAND="${BIN}/protected-observer"
second_output="$(run_backup 2>&1)"
grep -q 'retention_preserved snapshot=20260812T011558Z decision=RETAIN_REQUIRED' <<<"${second_output}"
grep -q 'retention_removed snapshot=20260101T000000Z' <<<"${second_output}"
grep -q 'backup_success' <<<"${second_output}"
grep -q 'backup_terminal status=success .* phase=complete exit_code=0' <<<"${second_output}"
[[ -d "${blocked}" ]]
[[ ! -e "${common}" ]]
[[ -L "${BACKUP_ROOT}/latest" ]]
latest="$(readlink -f "${BACKUP_ROOT}/latest")"
(cd "${latest}" && sha256sum -c SHA256SUMS >/dev/null)
! find "${BACKUP_ROOT}" -maxdepth 1 -name '.keep-*' | grep -q .

cat > "${BIN}/tampered-observer" <<'SH'
#!/usr/bin/env bash
printf '%s\n' '{"authorityVersion":"P1-20261121","checksumsSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","contractPath":"/etc/re7online/backup-retention-protected.v1.json","contractSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","decision":"RETAIN_REQUIRED","identity":{"device":64769,"gid":0,"inode":788249,"mode":"0750","nlink":4,"uid":0},"integrity":"SHA256SUMS_PASS","kind":"CONVERTA_BACKUP_RETENTION_PROTECTION_ATTESTATION","manifestSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","mechanism":{"device":1,"gid":0,"inode":2,"mode":"0500","path":"/usr/local/libexec/re7online/backup-retention-protected-observer.py","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","uid":0},"path":"/opt/re7online/backups/converta-persistent/snapshots/20260812T011558Z","reason":"UNIQUE_TRAINING_CONTENT_ONLY_COPY","schemaVersion":1,"snapshotId":"20260812T011558Z","state":"VERIFIED"}'
SH
chmod 0755 "${BIN}/tampered-observer"
export BACKUP_RETENTION_PROTECTED_OBSERVER_TEST_COMMAND="${BIN}/tampered-observer"
sleep 1
set +e
tampered_output="$(run_backup 2>&1)"
tampered_status=$?
set -e
[[ "${tampered_status}" -ne 0 ]]
grep -q 'retention_failed snapshot=20260812T011558Z reason=protected_authority_unavailable' <<<"${tampered_output}"
! grep -q 'backup_success' <<<"${tampered_output}"
[[ -d "${blocked}" ]]

printf 'PASS retention-deny-preserved protected-authority-preserved common-removed tampered-attestation-denied terminal-coherent alert-once checksums-valid\n'
