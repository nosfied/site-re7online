#!/usr/bin/bash
set -Eeuo pipefail
umask 077

BASELINE_V7_SHA256=931900e7fb7229ffd5983b5bbbf8223191108d3b09110655452a43e42f71e2d4
CONTROL_PLANE=b1689394feb27bb92487896dbee21f34e70b53d5
TARGET=d436239e13764b65642b37a4310082acd3a6a485
RELEASE=immutable-d436239e-vps-20261026T131821Z
EXPECTED_PACKAGE=ed02ba8057cb5ef14f98cd715b81e2daf18e21a2826d7d4f8888f25a00e3d36b
EXPECTED_PRODUCER=d248b9128688b429beec37902e78cacb4b45af4a074e287eed253bdf05c8b065
EXPECTED_CONTROL=abf89d491b4dd9150dac4b092dff3a5249a43e083c42d393442128eb39fbb552
RETURN_RELEASE=immutable-a959129e-vps-20261026T023100Z
PACKAGE=${RE7_PACKAGE:-/opt/re7online/build-output/${RELEASE}-producer/${RELEASE}.tar.xz}
FINAL=${RE7_RELEASE_ROOT:-/opt/re7online/releases/$RELEASE}
RETURN=${RE7_RETURN_ROOT:-/opt/re7online/releases/$RETURN_RELEASE}
LOCK=${RE7_DEPLOYMENT_LOCK:-/opt/re7online/backups/converta-persistent/.deployment-window.lock}
PM2=${RE7_PM2:-/home/deploy/.npm-global/bin/pm2}
TX=${RE7_TRANSACTION_ROOT:?RE7_TRANSACTION_ROOT is required}
CURRENT=${RE7_CURRENT_ROOT:-/opt/re7online/current}
GUARD=${RE7_CAMPAIGN_GUARD:-/var/lib/re7/campaign-operations/state.json}
DUMP=${RE7_PM2_DUMP:-/home/deploy/.pm2/dump.pm2}
CONTROL_ROOT=${RE7_CONTROL_ROOT:?RE7_CONTROL_ROOT is required}
PRODUCER_SOURCE=$CONTROL_ROOT/scripts/converta-release.py
CONTROL_SOURCE=$CONTROL_ROOT/scripts/pm2-definition-control.py
API_LOCAL_HEALTH=${RE7_API_LOCAL_HEALTH:-http://127.0.0.1:3001/health}
API_PUBLIC_HEALTH=${RE7_API_PUBLIC_HEALTH:-https://converta.re7online.com/agent-api/health}
FRONTEND_LOCAL_BASE=${RE7_FRONTEND_LOCAL_BASE:-http://127.0.0.1:3000}
FRONTEND_PUBLIC_BASE=${RE7_FRONTEND_PUBLIC_BASE:-https://admin.re7online.com}


PRODUCER_AUTH=$TX/converta-release.authenticated.py
CONTROL_AUTH=$TX/pm2-definition-control.authenticated.py

# The canonical lock must already exist.  Python supplies O_NOFOLLOW and passes the
# same authenticated open-file description as fd 9 to this script before any
# package, process, guard or runtime revalidation.
if [ "${RE7_DEPLOYMENT_LOCK_HELD:-}" != 1 ]; then
  exec /usr/bin/python3 - "$0" "$LOCK" <<'PY'
import fcntl, os, stat, sys
script, lock = sys.argv[1:]
before = os.lstat(lock)
if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
    raise SystemExit("LOCK_NOT_REGULAR")
if before.st_uid != os.getuid() or stat.S_IMODE(before.st_mode) != 0o600:
    raise SystemExit("LOCK_OWNER_OR_MODE")
fd = os.open(lock, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
opened = os.fstat(fd)
if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
    raise SystemExit("LOCK_IDENTITY_CHANGED")
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit("LOCK_BUSY")
if fd != 9:
    os.dup2(fd, 9, inheritable=True)
    os.close(fd)
else:
    os.set_inheritable(fd, True)
environment = dict(os.environ)
environment["RE7_DEPLOYMENT_LOCK_HELD"] = "1"
os.execve("/usr/bin/bash", ["bash", "--noprofile", "--norc", script], environment)
PY
fi

MUTATED_FRONTEND=0
INTENT_FRONTEND=0
LOCK_KEEPER=""
LOCK_KEEPER_TICKS=""
CURRENT_STEP=bootstrap
CONTROLLER_PID=$BASHPID
FAILURE_HANDLING=0
worker_pid=""
worker_ticks=""
worker_restarts=""
api_pid=""
api_ticks=""
api_restarts=""
api_cwd=""
api_script=""
worker_cwd=""
worker_script=""
guard_sha=""
guard_generation=""
dump_sha=""
FRONTEND_LEXICAL_CWD=""
FRONTEND_LEXICAL_SCRIPT=""
RETURN_BUILD_ID=""
EXPECTED_BUILD_ID=""
RETURN_FRONTEND_ENTRY=""
EXPECTED_FRONTEND_ENTRY=""
READINESS_REASON=""
FRONTEND_LINK_DEVICE=""
FRONTEND_LINK_INODE=""
FRONTEND_LINK_TEXT=""
FRONTEND_LINK_RESOLVED=""
CURRENT_PARENT_DEVICE=""
CURRENT_PARENT_INODE=""

json_write() {
  local destination=$1
  shift
  local temporary previous previous_sha directory
  temporary="${destination}.${BASHPID}.partial"
  directory=$(/usr/bin/dirname "$destination") || return 1
  test ! -e "$temporary" || return 1
  if ! /usr/bin/jq -n -c "$@" >"$temporary"; then
    /usr/bin/chmod 600 "$temporary" 2>/dev/null || true
    return 1
  fi
  /usr/bin/chmod 600 "$temporary" || return 1
  /usr/bin/sync -f "$temporary" || return 1
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    test -f "$destination" || return 1
    test ! -L "$destination" || return 1
    previous_sha=$(/usr/bin/sha256sum "$destination" | /usr/bin/awk '{print $1}') || return 1
    previous="${destination}.previous.${previous_sha}"
    if [ -e "$previous" ] || [ -L "$previous" ]; then
      test -f "$previous" || return 1
      test ! -L "$previous" || return 1
      test "$(/usr/bin/sha256sum "$previous" | /usr/bin/awk '{print $1}')" = "$previous_sha" || return 1
    else
      /usr/bin/ln "$destination" "$previous" || return 1
      /usr/bin/sync -f "$directory" || return 1
    fi
  fi
  /usr/bin/mv -T "$temporary" "$destination" || return 1
  /usr/bin/sync -f "$directory" || return 1
}

pm2_row() {
  "$PM2" jlist | /usr/bin/jq -c --arg name "$1" '.[] | select(.name==$name) | {name,pid,pm_id,status:.pm2_env.status,restarts:.pm2_env.restart_time,cwd:.pm2_env.pm_cwd,script:.pm2_env.pm_exec_path,mode:.pm2_env.exec_mode,instances:.pm2_env.instances}'
}

pid_for() { pm2_row "$1" | /usr/bin/jq -er '.pid'; }
restart_for() { pm2_row "$1" | /usr/bin/jq -er '.restarts'; }

start_ticks() {
  /usr/bin/python3 - "$1" <<'PY'
import pathlib, sys
raw = pathlib.Path(f"/proc/{sys.argv[1]}/stat").read_text()
print(raw.rsplit(") ", 1)[1].split()[19])
PY
}

selected_env_hash() {
  /usr/bin/python3 - "$1" "$2" <<'PY'
import hashlib, pathlib, sys
pid, component = sys.argv[1:]
allowed = {
  "api": {"DATABASE_URL","APP_AUTH_SECRET","ADMIN_TOKEN","TEMPLATE_MEDIA_ROOT","CAMPAIGN_OPERATIONS_FILE","META_APP_ID","NODE_ENV","PORT","HOST"},
  "frontend": {"NODE_ENV","PORT","HOST","NEXT_PUBLIC_WHATSAPP_AGENT_API_BASE_URL"},
}[component]
rows=[]
for item in pathlib.Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
    if b"=" not in item: continue
    key, value = item.split(b"=",1)
    if key.decode(errors="ignore") in allowed: rows.append(key+b"="+value)
print(hashlib.sha256(b"\0".join(sorted(rows))).hexdigest())
PY
}

capture_frontend_link() {
  local expected=$1
  test -L "$CURRENT/frontend" || return 1
  FRONTEND_LINK_TEXT=$(/usr/bin/readlink "$CURRENT/frontend") || return 1
  FRONTEND_LINK_RESOLVED=$(/usr/bin/readlink -f "$CURRENT/frontend") || return 1
  test "$FRONTEND_LINK_RESOLVED" = "$expected" || return 1
  read -r FRONTEND_LINK_DEVICE FRONTEND_LINK_INODE < <(/usr/bin/stat -c '%d %i' "$CURRENT/frontend") || return 1
  read -r CURRENT_PARENT_DEVICE CURRENT_PARENT_INODE < <(/usr/bin/stat -Lc '%d %i' "$CURRENT") || return 1
}

atomic_select() {
  local target=$1
  /usr/bin/python3 - "$CURRENT/frontend" "$target" \
    "$FRONTEND_LINK_DEVICE" "$FRONTEND_LINK_INODE" "$FRONTEND_LINK_TEXT" "$FRONTEND_LINK_RESOLVED" \
    "$CURRENT_PARENT_DEVICE" "$CURRENT_PARENT_INODE" <<'PY'
import os, pathlib, stat, sys
stable, target = map(pathlib.Path, sys.argv[1:3])
expected_dev, expected_inode = map(int, sys.argv[3:5])
expected_text, expected_resolved = sys.argv[5:7]
parent_dev, parent_inode = map(int, sys.argv[7:9])
def check():
    parent = stable.parent.stat()
    current = stable.lstat()
    if not stat.S_ISDIR(parent.st_mode) or (parent.st_dev, parent.st_ino) != (parent_dev, parent_inode):
        raise RuntimeError("stable_parent_identity")
    if not stat.S_ISLNK(current.st_mode):
        raise RuntimeError("stable_path_not_symlink")
    if (current.st_dev, current.st_ino) != (expected_dev, expected_inode):
        raise RuntimeError("stable_link_identity")
    if os.readlink(stable) != expected_text or str(stable.resolve(strict=True)) != expected_resolved:
        raise RuntimeError("stable_link_target")
check()
resolved_target = target.resolve(strict=True)
temporary = stable.parent / f".{stable.name}.{os.getpid()}.partial"
if temporary.exists() or temporary.is_symlink():
    raise RuntimeError("stable_temporary_exists")
os.symlink(resolved_target, temporary)
try:
    check()
    os.replace(temporary, stable)
    directory = os.open(stable.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(directory)
    finally: os.close(directory)
finally:
    try: temporary.unlink()
    except FileNotFoundError: pass
PY
}

safe_health() {
  local url=$1 output=$2
  local code
  code=$(/usr/bin/curl -sS -L --max-redirs 3 --connect-timeout 5 --max-time 10 -o "$output" -w '%{http_code}' "$url")
  test "$code" = 200
  /usr/bin/jq -e 'type=="object" and .ok==true and .db=="ok"' "$output" >/dev/null
}

safe_page() {
  local url=$1 output=$2 code
  code=$(/usr/bin/curl -sS -L --max-redirs 3 --connect-timeout 5 --max-time 12 -o "$output" -w '%{http_code}' "$url")
  test "$code" = 200
  test -s "$output"
}

copy_authenticated_tool() {
  local source=$1 destination=$2 expected=$3
  test -f "$source" || return 1
  test ! -L "$source" || return 1
  test -r "$source" || return 1
  test "$(/usr/bin/sha256sum "$source" | /usr/bin/awk '{print $1}')" = "$expected" || return 1
  /usr/bin/install -m 600 "$source" "$destination" || return 1
  test "$(/usr/bin/sha256sum "$destination" | /usr/bin/awk '{print $1}')" = "$expected" || return 1
  test "$(/usr/bin/sha256sum "$source" | /usr/bin/awk '{print $1}')" = "$expected" || return 1
  /usr/bin/sync -f "$destination" || return 1
  /usr/bin/sync -f "$(/usr/bin/dirname "$destination")" || return 1
}

run_readiness() {
  local label=$1 role=$2 release_root=$3 build_id entry_sha release_id
  local report stdout_file stderr_file rc result reason
  if [ "$role" = candidate ]; then
    build_id=$EXPECTED_BUILD_ID
    entry_sha=$EXPECTED_FRONTEND_ENTRY
    release_id=$RELEASE
  else
    build_id=$RETURN_BUILD_ID
    entry_sha=$RETURN_FRONTEND_ENTRY
    release_id=$RETURN_RELEASE
  fi
  report="$TX/$label.report.private.json"
  stdout_file="$TX/$label.stdout.private.txt"
  stderr_file="$TX/$label.stderr.private.txt"
  if [ -e "$report" ] || [ -L "$report" ]; then
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_destination_exists"
    return 1
  fi
  set +e
  /usr/bin/timeout --signal=TERM --kill-after=5s 45s \
    /usr/bin/python3 "$CONTROL_AUTH" wait-existing-readiness \
      --component frontend --process-name re7-admin-front \
      --expected-cwd "$FRONTEND_LEXICAL_CWD" \
      --expected-script "$FRONTEND_LEXICAL_SCRIPT" \
      --expected-interpreter /usr/bin/node \
      --release-id "$release_id" \
      --entry-sha256 "$entry_sha" --build-id "$build_id" \
      --pm2 "$PM2" --stable-path "$CURRENT/frontend" \
      --release-root "$release_root" --port 3000 \
      --local-health "$FRONTEND_LOCAL_BASE/app/login" \
      --public-health "$FRONTEND_PUBLIC_BASE/app/login" \
      --deadline-seconds 30 --poll-seconds 0.5 --report "$report" \
      >"$stdout_file" 2>"$stderr_file"
  rc=$?
  set -e
  /usr/bin/chmod 600 "$stdout_file" "$stderr_file" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:artifact_chmod_failed:exit_${rc}"; return 1; }
  /usr/bin/sync -f "$stdout_file" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:stdout_fsync_failed:exit_${rc}"; return 1; }
  /usr/bin/sync -f "$stderr_file" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:stderr_fsync_failed:exit_${rc}"; return 1; }
  if [ ! -f "$report" ] || [ -L "$report" ]; then
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_missing:exit_${rc}"; return 1
  fi
  /usr/bin/chmod 600 "$report" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_chmod_failed:exit_${rc}"; return 1; }
  /usr/bin/sync -f "$report" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_fsync_failed:exit_${rc}"; return 1; }
  /usr/bin/sync -f "$TX" || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:evidence_directory_fsync_failed:exit_${rc}"; return 1; }
  if ! /usr/bin/jq -e 'type=="object" and (.sampleCount|type)=="number" and (.samples|type)=="array"' "$report" >/dev/null; then
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_invalid:exit_${rc}"; return 1
  fi
  result=$(/usr/bin/jq -r '.result' "$report") || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:result_unreadable:exit_${rc}"; return 1; }
  if [ "$rc" -eq 0 ]; then
    if [ "$result" != READINESS_PASS ] || ! /usr/bin/jq -e --arg release "$release_id" \
      '.component=="frontend" and .port==3000 and .releaseId==$release and .observationMode=="existing_pm2_registration" and .stableSamples>=3' "$report" >/dev/null; then
      READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:report_mismatch"; return 1
    fi
    return 0
  fi
  if [ "$result" != READINESS_DENY ]; then
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:result_mismatch:exit_${rc}"; return 1
  fi
  reason=$(/usr/bin/jq -er '.reason|select(type=="string" and length>0)' "$report") || {
    READINESS_REASON="READINESS_OBSERVABILITY_DEFECT:${label}:reason_missing:exit_${rc}"; return 1; }
  READINESS_REASON=$reason
  return 1
}
wait_component() {
  local component=$1 name=$2 port=$3 expected_root=$4 identity=$5 before_restarts=$6
  local expected_cwd=$7 expected_script=$8
  local deadline=$(( $(/usr/bin/date +%s) + 30 )) stable=0 previous="" samples=0
  while (( $(/usr/bin/date +%s) < deadline )); do
    local row pid ticks restarts resolved listener_count socket_line sample loaded_cwd loaded_script physical_cwd physical_script node_exe
    row=$(pm2_row "$name") || { /usr/bin/sleep 0.5; continue; }
    pid=$(/usr/bin/jq -er '.pid' <<<"$row") || { /usr/bin/sleep 0.5; continue; }
    test "$pid" -gt 0 || { /usr/bin/sleep 0.5; continue; }
    test "$(/usr/bin/jq -r '.status' <<<"$row")" = online || { /usr/bin/sleep 0.5; continue; }
    restarts=$(/usr/bin/jq -er '.restarts' <<<"$row")
    test "$restarts" -eq $((before_restarts + 1)) || { /usr/bin/sleep 0.5; continue; }
    ticks=$(start_ticks "$pid") || { /usr/bin/sleep 0.5; continue; }
    loaded_cwd=$(/usr/bin/jq -er '.cwd' <<<"$row") || return 1
    loaded_script=$(/usr/bin/jq -er '.script' <<<"$row") || return 1
    test "$loaded_cwd" = "$expected_cwd" || return 1
    test "$loaded_script" = "$expected_script" || return 1
    resolved=$(/usr/bin/readlink -f "$CURRENT/$component")
    test "$resolved" = "$expected_root" || { /usr/bin/sleep 0.5; continue; }
    physical_cwd=$(/usr/bin/readlink -f "/proc/$pid/cwd") || return 1
    physical_script=$(/usr/bin/readlink -f "$loaded_script") || return 1
    node_exe=$(/usr/bin/readlink -f "/proc/$pid/exe") || return 1
    test "$physical_cwd" = "$expected_root" || return 1
    test "$node_exe" = "$(/usr/bin/readlink -f /usr/bin/node)" || return 1
    /usr/bin/python3 - "$expected_root" "$physical_script" <<'PY' || return 1
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve(strict=True)
script=Path(sys.argv[2]).resolve(strict=True)
if script != root and root not in script.parents:
    raise SystemExit(1)
PY
    if [ "$component" = api ]; then
      test "$physical_script" = "$expected_root/dist/index.js" || return 1
      test "$(/usr/bin/sha256sum "$expected_root/dist/index.js" | /usr/bin/awk '{print $1}')" = "$identity" || return 1
    else
      test "$(/usr/bin/tr -d '\n' <"$expected_root/.next/BUILD_ID")" = "$identity" || return 1
    fi
    socket_line=$(/usr/bin/ss -H -ltnp "sport = :$port" 2>/dev/null || true)
    listener_count=$(printf '%s\n' "$socket_line" | /usr/bin/sed '/^$/d' | /usr/bin/wc -l)
    test "$listener_count" -eq 1 || { stable=0; previous=""; /usr/bin/sleep 0.5; continue; }
    /usr/bin/grep -Fq "pid=$pid," <<<"$socket_line" || { stable=0; previous=""; /usr/bin/sleep 0.5; continue; }
    sample="$pid:$ticks:$restarts:$resolved:$physical_cwd:$physical_script:$node_exe"
    samples=$((samples+1))
    if [ "$sample" = "$previous" ]; then stable=$((stable+1)); else stable=1; previous=$sample; fi
    if [ "$stable" -ge 3 ]; then
      printf '%s\n' "$sample samples=$samples stable=$stable"
      return 0
    fi
    /usr/bin/sleep 0.5
  done
  return 1
}

handoff_lock() {
  local state=$1 control token holder holder_ticks fd_target
  control="$TX/lock-control.private.fifo"
  token="RELEASE_LOCK:$TARGET:$RELEASE:$state"
  test ! -e "$control" || return 1
  /usr/bin/mkfifo -m 600 "$control" || return 1
  printf '%s\n' "$token" >"$TX/lock-control-token.private.txt" || return 1
  /usr/bin/chmod 600 "$TX/lock-control-token.private.txt" || return 1
  /usr/bin/bash --noprofile --norc -c 'while :; do if IFS= read -r observed <"$1"; then test "$observed" = "$2" && exit 0; fi; done' _ "$control" "$token" </dev/null >/dev/null 2>&1 9>&9 &
  holder=$!
  /usr/bin/sleep 0.1
  /usr/bin/kill -0 "$holder" || return 1
  fd_target=$(/usr/bin/readlink "/proc/$holder/fd/9") || return 1
  test "$fd_target" = "$LOCK" || return 1
  holder_ticks=$(start_ticks "$holder") || return 1
  LOCK_KEEPER=$holder
  LOCK_KEEPER_TICKS=$holder_ticks
  json_write "$TX/lock-holder.private.json" --argjson pid "$holder" --arg startTicks "$holder_ticks" --arg lock "$LOCK" --arg control "$control" --arg state "$state" '{pid:$pid,startTicks:$startTicks,lockPath:$lock,controlPath:$control,state:$state,deadline:null,releaseProtocol:"write the exact private control token once"}' || return 1
}

lock_keeper_holds() {
  local fd_target observed_ticks
  test -n "$LOCK_KEEPER" || return 1
  test -n "$LOCK_KEEPER_TICKS" || return 1
  /usr/bin/kill -0 "$LOCK_KEEPER" || return 1
  observed_ticks=$(start_ticks "$LOCK_KEEPER") || return 1
  test "$observed_ticks" = "$LOCK_KEEPER_TICKS" || return 1
  fd_target=$(/usr/bin/readlink "/proc/$LOCK_KEEPER/fd/9") || return 1
  test "$fd_target" = "$LOCK" || return 1
}

hold_controller_lock_after_handoff_failure() {
  trap - ERR
  printf 'ROLLBACK_INCOMPLETE_LOCK_HANDOFF_FAILED:controller=%s\n' "$CONTROLLER_PID" >&2
  while :; do
    /usr/bin/sleep 3600
  done
}

rollback() {
  local reason=$1 frontend_observed failed=false state
  trap - ERR
  set +e
  frontend_observed=$(/usr/bin/readlink -f "$CURRENT/frontend" 2>/dev/null || true)

  # The observed stable path is authoritative. A failure after os.replace()
  # but before MUTATED_FRONTEND=1 must still restore the return release.
  if [ "$MUTATED_FRONTEND" -eq 0 ] && [ "$frontend_observed" = "$RETURN/frontend-runtime" ]; then
    local unchanged=true
    test "$frontend_observed" = "$RETURN/frontend-runtime" || unchanged=false
    if [ -n "$api_pid" ]; then
      test "$(pid_for re7-whatsapp-agent 2>/dev/null)" = "$api_pid" || unchanged=false
      test "$(start_ticks "$api_pid" 2>/dev/null)" = "$api_ticks" || unchanged=false
      test "$(restart_for re7-whatsapp-agent 2>/dev/null)" = "$api_restarts" || unchanged=false
      test "$(pm2_row re7-whatsapp-agent 2>/dev/null | /usr/bin/jq -r '.cwd')" = "$api_cwd" || unchanged=false
      test "$(pm2_row re7-whatsapp-agent 2>/dev/null | /usr/bin/jq -r '.script')" = "$api_script" || unchanged=false
    fi
    if [ -n "$worker_pid" ]; then
      test "$(pid_for re7-whatsapp-web-worker 2>/dev/null)" = "$worker_pid" || unchanged=false
      test "$(start_ticks "$worker_pid" 2>/dev/null)" = "$worker_ticks" || unchanged=false
      test "$(restart_for re7-whatsapp-web-worker 2>/dev/null)" = "$worker_restarts" || unchanged=false
      test "$(pm2_row re7-whatsapp-web-worker 2>/dev/null | /usr/bin/jq -r '.cwd')" = "$worker_cwd" || unchanged=false
      test "$(pm2_row re7-whatsapp-web-worker 2>/dev/null | /usr/bin/jq -r '.script')" = "$worker_script" || unchanged=false
    fi
    if [ -n "$guard_sha" ]; then test "$(/usr/bin/sha256sum "$GUARD" 2>/dev/null | /usr/bin/awk '{print $1}')" = "$guard_sha" || unchanged=false; fi
    if [ -n "$dump_sha" ]; then test "$(/usr/bin/sha256sum "$DUMP" 2>/dev/null | /usr/bin/awk '{print $1}')" = "$dump_sha" || unchanged=false; fi
    json_write "$TX/window-state.private.json" --arg state DENIED_BEFORE_MUTATION --arg reason "$reason" --argjson unchanged "$unchanged" --argjson frontendIntent "$INTENT_FRONTEND" '{state:$state,failurePredicate:$reason,productionUnchanged:$unchanged,intent:{frontend:$frontendIntent},saveCount:0,automaticRetry:false}' || exit 2
    printf 'DENIED_BEFORE_MUTATION:%s:productionUnchanged=%s\n' "$reason" "$unchanged"
    exit 1
  fi

  if [ "$frontend_observed" != "$RETURN/frontend-runtime" ]; then
    capture_frontend_link "$FINAL/frontend-runtime" || failed=true
    if [ "$failed" = false ]; then atomic_select "$RETURN/frontend-runtime" || failed=true; fi
    "$PM2" restart re7-admin-front >"$TX/rollback-frontend.pm2.private.log" 2>&1 || failed=true
    if [ "$failed" = false ]; then
      capture_frontend_link "$RETURN/frontend-runtime" || failed=true
      run_readiness rollback-readiness rollback "$RETURN/frontend-runtime" || failed=true
    fi
  fi

  test "$(/usr/bin/readlink -f "$CURRENT/frontend" 2>/dev/null)" = "$RETURN/frontend-runtime" || failed=true
  safe_health "$API_LOCAL_HEALTH" "$TX/rollback-health.private.json" || failed=true
  safe_health "$API_PUBLIC_HEALTH" "$TX/rollback-public-health.private.json" || failed=true
  test "$(pid_for re7-whatsapp-agent 2>/dev/null)" = "$api_pid" || failed=true
  test "$(start_ticks "$api_pid" 2>/dev/null)" = "$api_ticks" || failed=true
  test "$(restart_for re7-whatsapp-agent 2>/dev/null)" = "$api_restarts" || failed=true
  test "$(pm2_row re7-whatsapp-agent 2>/dev/null | /usr/bin/jq -r '.cwd')" = "$api_cwd" || failed=true
  test "$(pm2_row re7-whatsapp-agent 2>/dev/null | /usr/bin/jq -r '.script')" = "$api_script" || failed=true
  test "$(pid_for re7-whatsapp-web-worker 2>/dev/null)" = "$worker_pid" || failed=true
  test "$(start_ticks "$worker_pid" 2>/dev/null)" = "$worker_ticks" || failed=true
  test "$(restart_for re7-whatsapp-web-worker 2>/dev/null)" = "$worker_restarts" || failed=true
  test "$(pm2_row re7-whatsapp-web-worker 2>/dev/null | /usr/bin/jq -r '.cwd')" = "$worker_cwd" || failed=true
  test "$(pm2_row re7-whatsapp-web-worker 2>/dev/null | /usr/bin/jq -r '.script')" = "$worker_script" || failed=true
  test "$(/usr/bin/sha256sum "$GUARD" 2>/dev/null | /usr/bin/awk '{print $1}')" = "$guard_sha" || failed=true
  test "$(/usr/bin/sha256sum "$DUMP" 2>/dev/null | /usr/bin/awk '{print $1}')" = "$dump_sha" || failed=true

  if [ "$failed" = false ]; then
    state=ROLLED_BACK
    if ! json_write "$TX/window-state.private.json" --arg state "$state" --arg reason "$reason" '{state:$state,failurePredicate:$reason,restored:true,saveCount:0,automaticRetry:false}'; then
      local handoff_ok=true
      handoff_lock ROLLED_BACK_RECEIPT_WRITE_FAILED || handoff_ok=false
      if ! lock_keeper_holds; then
        hold_controller_lock_after_handoff_failure
      fi
      if [ "$handoff_ok" != true ]; then
        printf 'ROLLED_BACK_RECEIPT_AND_LOCK_METADATA_FAILED:%s:lockHolder=%s\n' "$reason" "$LOCK_KEEPER" >&2
        exit 2
      fi
      printf 'ROLLED_BACK_RECEIPT_WRITE_FAILED:%s:lockHolder=%s\n' "$reason" "$LOCK_KEEPER" >&2
      exit 2
    fi
    printf 'ROLLED_BACK:%s:restored=true\n' "$reason"
    exit 1
  fi
  state=ROLLBACK_INCOMPLETE
  local handoff_ok=true receipt_ok=true
  handoff_lock "$state" || handoff_ok=false
  if ! lock_keeper_holds; then
    hold_controller_lock_after_handoff_failure
  fi
  json_write "$TX/window-state.private.json" --arg state "$state" --arg reason "$reason" --argjson lockHandoffMetadataComplete "$handoff_ok" '{state:$state,failurePredicate:$reason,restored:false,saveCount:0,automaticRetry:false,lockHandoffMetadataComplete:$lockHandoffMetadataComplete}' || receipt_ok=false
  if [ "$receipt_ok" != true ]; then
    printf 'ROLLBACK_INCOMPLETE_RECEIPT_WRITE_FAILED:%s:lockHolder=%s\n' "$reason" "$LOCK_KEEPER" >&2
    exit 2
  fi
  if [ "$handoff_ok" != true ]; then
    printf 'ROLLBACK_INCOMPLETE_LOCK_METADATA_FAILED:%s:lockHolder=%s\n' "$reason" "$LOCK_KEEPER" >&2
    exit 2
  fi
  printf 'ROLLBACK_INCOMPLETE:%s:lockHolder=%s\n' "$reason" "$LOCK_KEEPER"
  exit 2
}

on_error() {
  local rc=$1 line=$2
  if [ "$BASHPID" -ne "$CONTROLLER_PID" ]; then
    exit "$rc"
  fi
  if [ "$FAILURE_HANDLING" -ne 0 ]; then
    exit "$rc"
  fi
  FAILURE_HANDLING=1
  rollback "${CURRENT_STEP}:line_${line}:exit_${rc}"
}

test ! -e "$TX"
/usr/bin/install -d -m 700 "$TX"
test "$(/usr/bin/readlink /proc/$$/fd/9)" = "$LOCK"
printf '%s\n' "$$" >"$TX/window-owner.private.txt"
/usr/bin/chmod 600 "$TX/window-owner.private.txt"
/usr/bin/sync -f "$TX/window-owner.private.txt"
/usr/bin/sync -f "$TX"
trap 'on_error "$?" "$LINENO"' ERR

CURRENT_STEP=preflight_control_plane
test "$(/usr/bin/git -C "$CONTROL_ROOT" rev-parse HEAD)" = "$CONTROL_PLANE"
test -z "$(/usr/bin/git -C "$CONTROL_ROOT" status --porcelain)"
copy_authenticated_tool "$PRODUCER_SOURCE" "$PRODUCER_AUTH" "$EXPECTED_PRODUCER"
copy_authenticated_tool "$CONTROL_SOURCE" "$CONTROL_AUTH" "$EXPECTED_CONTROL"

CURRENT_STEP=preflight_package_and_release
test "$(/usr/bin/sha256sum "$PACKAGE" | /usr/bin/awk '{print $1}')" = "$EXPECTED_PACKAGE"
/usr/bin/python3 "$PRODUCER_AUTH" verify --package "$PACKAGE" --target "$TARGET" --release-id "$RELEASE" --components api,frontend >"$TX/package-verify.private.json" 2>"$TX/package-verify.private.err"
/usr/bin/python3 "$PRODUCER_AUTH" verify --release-root "$FINAL" --target "$TARGET" --release-id "$RELEASE" --components api,frontend >"$TX/release-verify.private.json" 2>"$TX/release-verify.private.err"
for evidence in "$TX/package-verify.private.json" "$TX/package-verify.private.err" "$TX/release-verify.private.json" "$TX/release-verify.private.err"; do
  /usr/bin/chmod 600 "$evidence"
  /usr/bin/sync -f "$evidence"
done
test -d "$FINAL/frontend-runtime"
test -d "$RETURN/frontend-runtime"
EXPECTED_BUILD_ID=$(/usr/bin/tr -d '\n' <"$FINAL/frontend-runtime/.next/BUILD_ID")
RETURN_BUILD_ID=$(/usr/bin/tr -d '\n' <"$RETURN/frontend-runtime/.next/BUILD_ID")
test -n "$EXPECTED_BUILD_ID"
test -n "$RETURN_BUILD_ID"
EXPECTED_FRONTEND_ENTRY=$(/usr/bin/sha256sum "$FINAL/frontend-runtime/node_modules/next/dist/bin/next" | /usr/bin/awk '{print $1}')
RETURN_FRONTEND_ENTRY=$(/usr/bin/sha256sum "$RETURN/frontend-runtime/node_modules/next/dist/bin/next" | /usr/bin/awk '{print $1}')
test ! -e "$FINAL/DEPLOYED"

CURRENT_STEP=preflight_runtime
test -x "$PM2"
test "$("$PM2" --version)" = 6.0.14
worker_row=$(pm2_row re7-whatsapp-web-worker)
worker_pid=$(/usr/bin/jq -er '.pid' <<<"$worker_row")
worker_ticks=$(start_ticks "$worker_pid")
worker_restarts=$(/usr/bin/jq -er '.restarts' <<<"$worker_row")
worker_cwd=$(/usr/bin/jq -er '.cwd' <<<"$worker_row")
worker_script=$(/usr/bin/jq -er '.script' <<<"$worker_row")
api_baseline_row=$(pm2_row re7-whatsapp-agent)
api_pid=$(/usr/bin/jq -er '.pid' <<<"$api_baseline_row")
api_ticks=$(start_ticks "$api_pid")
api_restarts=$(/usr/bin/jq -er '.restarts' <<<"$api_baseline_row")
api_cwd=$(/usr/bin/jq -er '.cwd' <<<"$api_baseline_row")
api_script=$(/usr/bin/jq -er '.script' <<<"$api_baseline_row")
frontend_baseline_row=$(pm2_row re7-admin-front)
FRONTEND_LEXICAL_CWD=$(/usr/bin/jq -er '.cwd' <<<"$frontend_baseline_row")
FRONTEND_LEXICAL_SCRIPT=$(/usr/bin/jq -er '.script' <<<"$frontend_baseline_row")
test "$FRONTEND_LEXICAL_CWD" = "$CURRENT/frontend"
test "$FRONTEND_LEXICAL_SCRIPT" = "$CURRENT/frontend/node_modules/next/dist/bin/next"
frontend_before=$(restart_for re7-admin-front)
frontend_old_pid=$(pid_for re7-admin-front)
frontend_env_before=$(selected_env_hash "$frontend_old_pid" frontend)
guard_sha=$(/usr/bin/sha256sum "$GUARD" | /usr/bin/awk '{print $1}')
dump_sha=$(/usr/bin/sha256sum "$DUMP" | /usr/bin/awk '{print $1}')
guard_generation=$(/usr/bin/jq -er '.generation|select(type=="number" and floor==.)' "$GUARD")
/usr/bin/jq -e '.version==1 and .open==true and (.tasks|type)=="object" and (.tasks|length)==0 and (.audit|type)=="array"' "$GUARD" >/dev/null
test ! -e "$GUARD.uncertain"
test -f "$DUMP"
test ! -L "$DUMP"
capture_frontend_link "$RETURN/frontend-runtime"
safe_health "$API_LOCAL_HEALTH" "$TX/pre-api-health.private.json"
safe_health "$API_PUBLIC_HEALTH" "$TX/pre-api-public-health.private.json"

"$PM2" jlist >"$TX/pre-activation-jlist.private.json"
/usr/bin/cp --reflink=auto --preserve=mode,timestamps "$DUMP" "$TX/rollback.dump.pm2"
/usr/bin/chmod 600 "$TX/pre-activation-jlist.private.json" "$TX/rollback.dump.pm2"
/usr/bin/sha256sum "$DUMP" >"$TX/dump-before.sha256.private.txt"
for evidence in "$TX/pre-activation-jlist.private.json" "$TX/rollback.dump.pm2" "$TX/dump-before.sha256.private.txt"; do /usr/bin/sync -f "$evidence"; done

CURRENT_STEP=frontend_selection_intent
INTENT_FRONTEND=1
json_write "$TX/selection-intent.private.json" --arg frontend candidate --arg expectedCurrent "$RETURN/frontend-runtime" --arg target "$FINAL/frontend-runtime" '{frontend:$frontend,expectedCurrent:$expectedCurrent,target:$target}'
CURRENT_STEP=frontend_selection
atomic_select "$FINAL/frontend-runtime"
test "$(/usr/bin/readlink -f "$CURRENT/frontend")" = "$FINAL/frontend-runtime"
capture_frontend_link "$FINAL/frontend-runtime"
MUTATED_FRONTEND=1

CURRENT_STEP=frontend_restart
"$PM2" restart re7-admin-front >"$TX/frontend-activate-pm2.private.log" 2>&1
/usr/bin/chmod 600 "$TX/frontend-activate-pm2.private.log"
/usr/bin/sync -f "$TX/frontend-activate-pm2.private.log"
CURRENT_STEP=frontend_readiness
if ! run_readiness candidate-readiness candidate "$FINAL/frontend-runtime"; then
  CURRENT_STEP=$READINESS_REASON
  false
fi
test "$(restart_for re7-admin-front)" -eq $((frontend_before + 1))
frontend_new_pid=$(pid_for re7-admin-front)
test "$(selected_env_hash "$frontend_new_pid" frontend)" = "$frontend_env_before"

CURRENT_STEP=frontend_smoke
safe_page "$FRONTEND_LOCAL_BASE/app/login" "$TX/login-local.private.html"
safe_page "$FRONTEND_PUBLIC_BASE/app/login" "$TX/login-public.private.html"
safe_page "$FRONTEND_PUBLIC_BASE/app/inbox" "$TX/inbox-public.private.html"
safe_page "$FRONTEND_PUBLIC_BASE/app/crm" "$TX/crm-public.private.html"
asset=$(/usr/bin/grep -oE '/_next/static/[^" ]+\.(js|css)' "$TX/login-local.private.html" | /usr/bin/head -1)
test -n "$asset"
safe_page "$FRONTEND_LOCAL_BASE$asset" "$TX/asset-local.private.bin"
safe_page "$FRONTEND_PUBLIC_BASE$asset" "$TX/asset-public.private.bin"

CURRENT_STEP=final_preservation
safe_health "$API_LOCAL_HEALTH" "$TX/final-api-health.private.json"
safe_health "$API_PUBLIC_HEALTH" "$TX/final-api-public-health.private.json"
test "$(pid_for re7-whatsapp-agent)" = "$api_pid"
test "$(start_ticks "$api_pid")" = "$api_ticks"
test "$(restart_for re7-whatsapp-agent)" = "$api_restarts"
test "$(pm2_row re7-whatsapp-agent | /usr/bin/jq -r '.cwd')" = "$api_cwd"
test "$(pm2_row re7-whatsapp-agent | /usr/bin/jq -r '.script')" = "$api_script"
test "$(pid_for re7-whatsapp-web-worker)" = "$worker_pid"
test "$(start_ticks "$worker_pid")" = "$worker_ticks"
test "$(restart_for re7-whatsapp-web-worker)" = "$worker_restarts"
test "$(pm2_row re7-whatsapp-web-worker | /usr/bin/jq -r '.cwd')" = "$worker_cwd"
test "$(pm2_row re7-whatsapp-web-worker | /usr/bin/jq -r '.script')" = "$worker_script"
test "$(/usr/bin/sha256sum "$GUARD" | /usr/bin/awk '{print $1}')" = "$guard_sha"
test "$(/usr/bin/jq -er '.generation' "$GUARD")" = "$guard_generation"
test "$(/usr/bin/jq -r '.open' "$GUARD")" = true
test "$(/usr/bin/jq -r '.tasks|length' "$GUARD")" = 0
test ! -e "$GUARD.uncertain"
test "$(/usr/bin/sha256sum "$DUMP" | /usr/bin/awk '{print $1}')" = "$dump_sha"
test ! -e "$FINAL/DEPLOYED"
test ! -e "$TX/technical-acceptance.private.json"

"$PM2" jlist >"$TX/awaiting-acceptance-jlist.private.json"
/usr/bin/chmod 600 "$TX/awaiting-acceptance-jlist.private.json"
/usr/bin/sync -f "$TX/awaiting-acceptance-jlist.private.json"
frontend_pid=$(pid_for re7-admin-front)
frontend_ticks=$(start_ticks "$frontend_pid")
available=$(/usr/bin/df -B1 --output=avail "$CURRENT" | /usr/bin/tail -1 | /usr/bin/tr -d ' ')
json_write "$TX/window-state.private.json" --arg state AWAITING_ACCEPTANCE --arg target "$TARGET" --arg release "$RELEASE" --arg buildId "$EXPECTED_BUILD_ID" --argjson apiPid "$api_pid" --arg apiTicks "$api_ticks" --argjson frontendPid "$frontend_pid" --arg frontendTicks "$frontend_ticks" --argjson workerPid "$worker_pid" --arg workerTicks "$worker_ticks" --argjson availableBytes "$available" --argjson guardGeneration "$guard_generation" '{state:$state,target:$target,release:$release,buildId:$buildId,api:{pid:$apiPid,startTicks:$apiTicks,preserved:true},frontend:{pid:$frontendPid,startTicks:$frontendTicks},worker:{pid:$workerPid,startTicks:$workerTicks,preserved:true},availableBytes:$availableBytes,guard:{open:true,generation:$guardGeneration,tasks:0,fault:null,preserved:true},saveCount:0,acceptance:false,deployedMarker:false}'

CURRENT_STEP=lock_handoff
handoff_lock AWAITING_ACCEPTANCE
/usr/bin/sync -f "$TX"
trap - ERR
printf 'AWAITING_ACCEPTANCE\nTX=%s\nLOCK_HOLDER=%s\n' "$TX" "$LOCK_KEEPER"
