#!/usr/bin/bash
set -Eeuo pipefail
umask 077
ACTION=${1:-activate}
case "$ACTION" in activate|finalize) ;; *) printf 'FRONTEND_ONLY_ACTION_DENY:%s\n' "$ACTION" >&2; exit 2;; esac

BASELINE_V7_SHA256=931900e7fb7229ffd5983b5bbbf8223191108d3b09110655452a43e42f71e2d4
CONTROL_PLANE=b1689394feb27bb92487896dbee21f34e70b53d5
TARGET=ef3a212862c9a1fd2c46a420df7095327f3c9d7f
RELEASE=immutable-ef3a2128-vps-20261028T001820Z
EXPECTED_PACKAGE=3665323dfbdbd4233fd4a87034b3520f4077c7c3a934506c4aee40981c829af7
EXPECTED_PRODUCER=d248b9128688b429beec37902e78cacb4b45af4a074e287eed253bdf05c8b065
EXPECTED_CONTROL=a8f71a51ea09e3746db75dd952f581650ac2f43a02ceecdff1a6c4ae5c4b40e6
RETURN_RELEASE=immutable-708f018c-vps-20261027T152109Z
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
GENERATION_CONTRACT=${RE7_GENERATION_CONTRACT:?RE7_GENERATION_CONTRACT is required}
GENERATION_CONTRACT_SHA256=${RE7_GENERATION_CONTRACT_SHA256:?RE7_GENERATION_CONTRACT_SHA256 is required}
RETIREMENT_INTENT=${RE7_RETIREMENT_INTENT:?RE7_RETIREMENT_INTENT is required}
RETIREMENT_INTENT_SHA256=${RE7_RETIREMENT_INTENT_SHA256:?RE7_RETIREMENT_INTENT_SHA256 is required}
ROOT_POLICY=${RE7_ROOT_POLICY:?RE7_ROOT_POLICY is required}
ROOT_POLICY_SHA256=${RE7_ROOT_POLICY_SHA256:?RE7_ROOT_POLICY_SHA256 is required}
RETIREMENT_TOOL=${RE7_RETIREMENT_TOOL:-}
RETIREMENT_TOOL_SHA256=${RE7_RETIREMENT_TOOL_SHA256:-}
RETIREMENT_AUTHORIZATION=${RE7_RETIREMENT_AUTHORIZATION:-}
RETIREMENT_AUTHORIZATION_SHA256=${RE7_RETIREMENT_AUTHORIZATION_SHA256:-}
RETIREMENT_OPERATIONAL_STATE=${RE7_RETIREMENT_OPERATIONAL_STATE:-}
RETIREMENT_OPERATIONAL_STATE_SHA256=${RE7_RETIREMENT_OPERATIONAL_STATE_SHA256:-}
RETIREMENT_RECEIPT_ROOT=${RE7_RETIREMENT_RECEIPT_ROOT:-}
RETIREMENT_REVIEW_OUTPUT=${RE7_RETIREMENT_REVIEW_OUTPUT:-}
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
  exec /usr/bin/python3 - "$0" "$LOCK" "$ACTION" "$TX" <<'PY'
import fcntl, json, os, pathlib, stat, sys, time
script, lock, action, tx_raw = sys.argv[1:]
tx = pathlib.Path(tx_raw)
if action == "finalize":
    holder_path = tx / "lock-holder.private.json"
    token_path = tx / "lock-control-token.private.txt"
    for path in (holder_path, token_path):
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            raise SystemExit("LOCK_HOLDER_EVIDENCE_IDENTITY")
    holder = json.loads(holder_path.read_text())
    pid = int(holder["pid"]); expected_ticks = str(holder["startTicks"])
    stat_raw = pathlib.Path(f"/proc/{pid}/stat").read_text()
    ticks = stat_raw.rsplit(") ", 1)[1].split()[19]
    if ticks != expected_ticks or os.readlink(f"/proc/{pid}/fd/9") != lock:
        raise SystemExit("LOCK_HOLDER_IDENTITY")
    fifo = pathlib.Path(holder["controlPath"])
    if not stat.S_ISFIFO(fifo.lstat().st_mode):
        raise SystemExit("LOCK_HOLDER_CONTROL")
    fd_control = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try: os.write(fd_control, token_path.read_bytes())
    finally: os.close(fd_control)
    deadline = time.monotonic() + 5
    while pathlib.Path(f"/proc/{pid}").exists() and time.monotonic() < deadline: time.sleep(.05)
    if pathlib.Path(f"/proc/{pid}").exists():
        raise SystemExit("LOCK_HOLDER_RELEASE_TIMEOUT")
    # The authenticated holder is gone; retire only its private FIFO so a
    # resumed finalization can publish a new authenticated holder if needed.
    fifo.unlink()
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
os.execve("/usr/bin/bash", ["bash", "--noprofile", "--norc", script, action], environment)
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

finalize_frontend_only() {
  local state_file="$TX/window-state.private.json" acceptance="$TX/technical-acceptance.private.json"
  local save_intent="$TX/pm2-save-intent.private.json" save_execution="$TX/pm2-save-execution.private.json"
  local dump_validation="$TX/pm2-dump-validation.private.json" marker="$FINAL/DEPLOYED"
  local retirement_stdout="$TX/generation-retirement.stdout.private.txt"
  local retirement_stderr="$TX/generation-retirement.stderr.private.txt"
  local retirement_state retirement_receipt_sha dump_after_sha live_file final_state
  test -d "$TX"; test ! -L "$TX"
  test -f "$state_file"; test ! -L "$state_file"
  /usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" \
    '((.state=="AWAITING_ACCEPTANCE" and .saveCount==0) or
      (.state=="FINALIZATION_INCOMPLETE" and .saveCount==1)) and
     ((.target==$target and .release==$release) or .state=="FINALIZATION_INCOMPLETE")' "$state_file" >/dev/null
  test -f "$acceptance"; test ! -L "$acceptance"; test "$(/usr/bin/stat -Lc '%a' "$acceptance")" = 600
  /usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" \
    '.accepted==true and .target==$target and .release==$release' "$acceptance" >/dev/null
  for value in "$RETIREMENT_TOOL" "$RETIREMENT_TOOL_SHA256" "$RETIREMENT_AUTHORIZATION" \
    "$RETIREMENT_AUTHORIZATION_SHA256" "$RETIREMENT_OPERATIONAL_STATE" \
    "$RETIREMENT_OPERATIONAL_STATE_SHA256" "$RETIREMENT_RECEIPT_ROOT" "$RETIREMENT_REVIEW_OUTPUT"; do
    test -n "$value"
  done
  for binding in "$RETIREMENT_TOOL" "$RETIREMENT_AUTHORIZATION" "$RETIREMENT_OPERATIONAL_STATE"; do
    test -f "$binding"; test ! -L "$binding"; test "$(/usr/bin/stat -Lc '%a' "$binding")" = 600
  done
  test -f "$ROOT_POLICY"; test ! -L "$ROOT_POLICY"; case "$(/usr/bin/stat -Lc '%a' "$ROOT_POLICY")" in 600|644) ;; *) false;; esac
  test "$(/usr/bin/sha256sum "$RETIREMENT_TOOL" | /usr/bin/awk '{print $1}')" = "$RETIREMENT_TOOL_SHA256"
  test "$(/usr/bin/sha256sum "$RETIREMENT_AUTHORIZATION" | /usr/bin/awk '{print $1}')" = "$RETIREMENT_AUTHORIZATION_SHA256"
  test "$(/usr/bin/sha256sum "$RETIREMENT_OPERATIONAL_STATE" | /usr/bin/awk '{print $1}')" = "$RETIREMENT_OPERATIONAL_STATE_SHA256"
  test "$(/usr/bin/sha256sum "$ROOT_POLICY" | /usr/bin/awk '{print $1}')" = "$ROOT_POLICY_SHA256"
  /usr/bin/python3 - "$RETIREMENT_RECEIPT_ROOT" "$RETIREMENT_REVIEW_OUTPUT" <<'PY'
from pathlib import Path
import sys
for raw in sys.argv[1:]:
    path=Path(raw)
    if not path.is_absolute() or path.is_symlink(): raise SystemExit("RETIREMENT_DESTINATION")
PY
  if [ -e "$marker" ] || [ -L "$marker" ]; then
    test -f "$marker"; test ! -L "$marker"; test "$(/usr/bin/stat -Lc '%a' "$marker")" = 600
    /usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" \
      '.state=="DEPLOYED" and .target==$target and .release==$release and .saveCount==1' "$marker" >/dev/null
  fi
  test "$(/usr/bin/readlink -f "$CURRENT/frontend")" = "$FINAL/frontend-runtime"
  test "$(/usr/bin/tr -d '\n' <"$FINAL/frontend-runtime/.next/BUILD_ID")" = "$EXPECTED_BUILD_ID"
  expected_frontend_pid=$(/usr/bin/jq -er '.frontend.pid' "$state_file")
  expected_frontend_ticks=$(/usr/bin/jq -er '.frontend.startTicks' "$state_file")
  expected_frontend_restarts=$(/usr/bin/jq -er '.frontend.restartCount' "$state_file")
  test "$(pid_for re7-admin-front)" = "$expected_frontend_pid"
  test "$(start_ticks "$expected_frontend_pid")" = "$expected_frontend_ticks"
  test "$(restart_for re7-admin-front)" = "$expected_frontend_restarts"
  for preserved_name in re7-whatsapp-agent re7-whatsapp-web-worker; do
    if [ "$preserved_name" = re7-whatsapp-agent ]; then preserved_key=api; else preserved_key=worker; fi
    expected_pid=$(/usr/bin/jq -er --arg key "$preserved_key" '.[$key].pid' "$state_file")
    expected_ticks=$(/usr/bin/jq -er --arg key "$preserved_key" '.[$key].startTicks' "$state_file")
    expected_restarts=$(/usr/bin/jq -er --arg key "$preserved_key" '.[$key].restartCount' "$state_file")
    test "$(pid_for "$preserved_name")" = "$expected_pid"
    test "$(start_ticks "$expected_pid")" = "$expected_ticks"
    test "$(restart_for "$preserved_name")" = "$expected_restarts"
  done
  safe_health "$API_LOCAL_HEALTH" "$TX/finalize-api-health.private.json"
  safe_health "$API_PUBLIC_HEALTH" "$TX/finalize-api-public-health.private.json"
  /usr/bin/jq -e --argjson generation "$guard_generation" \
    '.version==1 and .open==true and .generation==$generation and (.tasks|length)==0' "$GUARD" >/dev/null
  test ! -e "$GUARD.uncertain"

  if [ ! -e "$save_execution" ]; then
    test ! -L "$save_intent"
    if [ ! -e "$save_intent" ]; then
      json_write "$save_intent" --arg target "$TARGET" --arg release "$RELEASE" \
        '{state:"PM2_SAVE_INTENT",target:$target,release:$release,saveCountBefore:0}'
    fi
    set +e
    "$PM2" save >"$TX/pm2-save.stdout.private.txt" 2>"$TX/pm2-save.stderr.private.txt"
    save_rc=$?
    set -e
    /usr/bin/chmod 600 "$TX/pm2-save.stdout.private.txt" "$TX/pm2-save.stderr.private.txt"
    /usr/bin/sync -f "$TX/pm2-save.stdout.private.txt"; /usr/bin/sync -f "$TX/pm2-save.stderr.private.txt"
    dump_after_sha=$(/usr/bin/sha256sum "$DUMP" | /usr/bin/awk '{print $1}')
    json_write "$save_execution" --argjson exitCode "$save_rc" --arg dumpSha256 "$dump_after_sha" \
      '{state:"PM2_SAVE_EXECUTED",exitCode:$exitCode,dumpSha256:$dumpSha256,saveCount:1}'
    test "$save_rc" -eq 0
  else
    test -f "$save_execution"; test ! -L "$save_execution"; test "$(/usr/bin/stat -Lc '%a' "$save_execution")" = 600
    /usr/bin/jq -e '.state=="PM2_SAVE_EXECUTED" and .exitCode==0 and .saveCount==1' "$save_execution" >/dev/null
    dump_after_sha=$(/usr/bin/jq -er '.dumpSha256' "$save_execution")
    test "$(/usr/bin/sha256sum "$DUMP" | /usr/bin/awk '{print $1}')" = "$dump_after_sha"
  fi

  live_file="$TX/finalize-jlist.private.json"
  "$PM2" jlist >"$live_file"; /usr/bin/chmod 600 "$live_file"; /usr/bin/sync -f "$live_file"
  if [ ! -e "$dump_validation" ]; then
    /usr/bin/python3 - "$live_file" "$DUMP" "$dump_validation" <<'PY'
import json, os, pathlib, stat, sys
import hashlib
live_path, dump_path, output_path = map(pathlib.Path, sys.argv[1:])
live=json.loads(live_path.read_text()); dump=json.loads(dump_path.read_text())
names={"re7-whatsapp-agent","re7-admin-front","re7-whatsapp-web-worker"}
def rows(value):
    if not isinstance(value,list): raise SystemExit("DUMP_SHAPE")
    result={}
    for row in value:
        env=row.get("pm2_env",{}) if isinstance(row,dict) else {}
        name=row.get("name",env.get("name")) if isinstance(row,dict) else None
        if name in names:
            if name in result: raise SystemExit("DUMP_DUPLICATE")
            result[name]=row
    if set(result)!=names: raise SystemExit("DUMP_PROCESS_SET")
    return result
def field(row,key):
    env=row.get("pm2_env",{}) if isinstance(row.get("pm2_env"),dict) else {}
    return row.get(key,env.get(key))
l=rows(live); d=rows(dump); compared={}
for name in sorted(names):
    for key in ("pm_cwd","pm_exec_path","args","node_args","namespace","out_file","error_file","exec_mode"):
        if field(l[name],key)!=field(d[name],key): raise SystemExit(f"DUMP_FIELD:{name}:{key}")
    li,di=field(l[name],"instances"),field(d[name],"instances")
    if li!=di and not (li==1 and di is None and field(l[name],"exec_mode") in {"fork","fork_mode"}):
        raise SystemExit(f"DUMP_INSTANCES:{name}")
    allowed={"NODE_ENV","PORT","HOST","DATABASE_URL","APP_AUTH_SECRET","ADMIN_TOKEN","TEMPLATE_MEDIA_ROOT","CAMPAIGN_OPERATIONS_FILE","META_APP_ID","NEXT_PUBLIC_WHATSAPP_AGENT_API_BASE_URL"}
    def environment_value(row,key):
        env=row.get("pm2_env",{}) if isinstance(row.get("pm2_env"),dict) else {}
        if key in row:
            return True,row[key]
        if key in env:
            return True,env[key]
        return False,None
    def env_hash(row):
        selected={}
        for key in sorted(allowed):
            present,value=environment_value(row,key)
            if present:
                selected[key]=value
        return hashlib.sha256(json.dumps(selected,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    lh,dh=env_hash(l[name]),env_hash(d[name])
    if lh!=dh: raise SystemExit(f"DUMP_ENVIRONMENT:{name}")
    compared[name]={"liveInstances":li,"dumpInstances":di,"comparedInstances":1 if li==1 and di is None else li,"allowedEnvironmentSha256":lh}
raw=(json.dumps({"result":"PM2_DUMP_VALID","processes":compared},sort_keys=True,separators=(",",":"))+"\n").encode()
fd=os.open(output_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
try: os.write(fd,raw); os.fsync(fd)
finally: os.close(fd)
directory=os.open(output_path.parent,os.O_RDONLY|os.O_DIRECTORY)
try: os.fsync(directory)
finally: os.close(directory)
PY
  else
    test -f "$dump_validation"; test ! -L "$dump_validation"; test "$(/usr/bin/stat -Lc '%a' "$dump_validation")" = 600
    /usr/bin/jq -e '.result=="PM2_DUMP_VALID"' "$dump_validation" >/dev/null
  fi

  if [ ! -e "$marker" ]; then
    json_write "$marker" --arg target "$TARGET" --arg release "$RELEASE" --arg dumpSha256 "$dump_after_sha" \
      '{state:"DEPLOYED",target:$target,release:$release,dumpSha256:$dumpSha256,saveCount:1}'
  else
    test -f "$marker"; test ! -L "$marker"
    /usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" --arg dumpSha256 "$dump_after_sha" \
      '.state=="DEPLOYED" and .target==$target and .release==$release and .dumpSha256==$dumpSha256 and .saveCount==1' "$marker" >/dev/null
  fi

  final_operational="$TX/generation-operational.final.private.json"
  final_operational_hash_file="$TX/generation-operational.final.sha256.private.txt"
  if [ ! -e "$final_operational" ]; then
    /usr/bin/python3 - "$RETIREMENT_OPERATIONAL_STATE" "$live_file" "$DUMP" "$final_operational" \
      "$TX/generation-release-graph.final.private.json" "$RELEASE" "$RETURN_RELEASE" <<'PY'
import hashlib,json,os,pathlib,sys
source,live_path,dump_path,output,graph_path=map(pathlib.Path,sys.argv[1:6]);release,previous=sys.argv[6:]
value=json.loads(source.read_text());live=json.loads(live_path.read_text());dump=json.loads(dump_path.read_text())
def canonical(v): return (json.dumps(v,sort_keys=True,separators=(",",":"))+"\n").encode()
links=[];current=[]
for item in value["observations"]["currentLinks"]:
    path=pathlib.Path(item["path"]);target=path.resolve(strict=True)
    if not path.is_symlink(): raise SystemExit("FINAL_OPERATIONAL_CURRENT")
    links.append({"path":str(path),"target":str(target)});current.append(str(target))
def paths(rows):
    result=[]
    for row in rows:
        env=row.get("pm2_env",{}) if isinstance(row.get("pm2_env"),dict) else {}
        for key in ("pm_cwd","pm_exec_path"):
            candidate=row.get(key,env.get(key))
            if isinstance(candidate,str) and candidate: result.append(candidate)
    return sorted(set(result))
projected=[]
for row in live:
    env=row.get("pm2_env",{}) if isinstance(row.get("pm2_env"),dict) else {}
    projected.append({key:row.get(key,env.get(key)) for key in
      ("name","pid","status","restart_time","pm_cwd","pm_exec_path","exec_mode","instances","args","node_args","namespace","out_file","error_file")})
fingerprint=hashlib.sha256(canonical(sorted(projected,key=lambda item:str(item.get("name"))))).hexdigest()
active=set(value["activeReleases"]);active.discard(previous);active.add(release)
rollback=set(value["rollbackReleases"]);rollback.add(previous)
immediate=value.get("immediateRollbackReleases")
if immediate is not None:
    if set(immediate)!={"api","frontend"} or any(not isinstance(v,str) or not v for v in immediate.values()):
        raise SystemExit("FINAL_OPERATIONAL_IMMEDIATE_ROLLBACK")
    immediate=dict(immediate);immediate["frontend"]=previous
candidates=set(value["candidateReleases"]);candidates.discard(release)
installed=set(value["installedVerifiedReleases"]);installed.add(release)
value.update(currentPaths=sorted(set(current)),pm2LivePaths=paths(live),pm2DumpPaths=paths(dump),
 activeReleases=sorted(active),rollbackReleases=sorted(rollback),candidateReleases=sorted(candidates),
 installedVerifiedReleases=sorted(installed),deploymentState={"state":"DEPLOYED"})
if immediate is not None:value["immediateRollbackReleases"]=immediate
graph={key:value[key] for key in ("activeReleases","rollbackReleases","transitiveReturnReleases","candidateReleases","installedVerifiedReleases","supersededCandidates")}
if immediate is not None:graph["immediateRollbackReleases"]=immediate
def exclusive(path,raw):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        offset=0
        while offset<len(raw):
            count=os.write(fd,raw[offset:])
            if count<=0: raise OSError("short_write")
            offset+=count
        os.fsync(fd)
    finally: os.close(fd)
exclusive(graph_path,canonical(graph))
value["observations"]["currentLinks"]=links
value["observations"]["pm2"]["fingerprintSha256"]=fingerprint
dump_raw=dump_path.read_bytes();value["observations"]["dump"]={"path":str(dump_path),"sha256":hashlib.sha256(dump_raw).hexdigest()}
value["observations"]["releaseGraph"]={"path":str(graph_path),"sha256":hashlib.sha256(graph_path.read_bytes()).hexdigest()}
exclusive(output,canonical(value))
directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)
try: os.fsync(directory)
finally: os.close(directory)
PY
    final_operational_sha=$(/usr/bin/sha256sum "$final_operational" | /usr/bin/awk '{print $1}')
    printf '%s\n' "$final_operational_sha" >"$final_operational_hash_file"
    /usr/bin/chmod 600 "$final_operational_hash_file"; /usr/bin/sync -f "$final_operational_hash_file"; /usr/bin/sync -f "$TX"
  else
    test -f "$final_operational"; test ! -L "$final_operational"; test "$(/usr/bin/stat -Lc '%a' "$final_operational")" = 600
    final_operational_sha=$(/usr/bin/head -1 "$final_operational_hash_file")
    test "$(/usr/bin/sha256sum "$final_operational" | /usr/bin/awk '{print $1}')" = "$final_operational_sha"
  fi

  if [ -f "$RETIREMENT_RECEIPT_ROOT/execution-receipt.private.json" ]; then
    retirement_state=$(/usr/bin/jq -er --arg intent "$RETIREMENT_INTENT_SHA256" \
      'select(.intentSha256==$intent)|.state|select(.=="DEPLOYED_SANITIZED" or .=="DEPLOYED_RETENTION_INCOMPLETE")' \
      "$RETIREMENT_RECEIPT_ROOT/execution-receipt.private.json")
    retirement_receipt_sha=$(/usr/bin/sha256sum "$RETIREMENT_RECEIPT_ROOT/execution-receipt.private.json" | /usr/bin/awk '{print $1}')
  else
    if /usr/bin/python3 "$RETIREMENT_TOOL" execute --intent "$RETIREMENT_INTENT" --intent-sha256 "$RETIREMENT_INTENT_SHA256" \
      --authorization "$RETIREMENT_AUTHORIZATION" --authorization-sha256 "$RETIREMENT_AUTHORIZATION_SHA256" \
      --operational-state "$final_operational" --operational-state-sha256 "$final_operational_sha" \
      --root-policy "$ROOT_POLICY" --root-policy-sha256 "$ROOT_POLICY_SHA256" --deployment-lock "$LOCK" \
      --deployment-lock-fd 9 \
      --receipt-root "$RETIREMENT_RECEIPT_ROOT" --review-output "$RETIREMENT_REVIEW_OUTPUT" \
      >"$retirement_stdout" 2>"$retirement_stderr"; then retirement_rc=0; else retirement_rc=$?; fi
    /usr/bin/chmod 600 "$retirement_stdout" "$retirement_stderr"; /usr/bin/sync -f "$retirement_stdout"; /usr/bin/sync -f "$retirement_stderr"
    if [ "$retirement_rc" -eq 0 ]; then
      retirement_state=$(/usr/bin/jq -er '.result' "$retirement_stdout")
    else
      retirement_state=DEPLOYED_RETENTION_INCOMPLETE
    fi
    if [ -f "$RETIREMENT_RECEIPT_ROOT/execution-receipt.private.json" ]; then
      retirement_receipt_sha=$(/usr/bin/sha256sum "$RETIREMENT_RECEIPT_ROOT/execution-receipt.private.json" | /usr/bin/awk '{print $1}')
    else
      retirement_receipt_sha=null
    fi
  fi
  case "$retirement_state" in DEPLOYED_SANITIZED|DEPLOYED_RETENTION_INCOMPLETE) ;; *) retirement_state=DEPLOYED_RETENTION_INCOMPLETE;; esac
  final_state=$retirement_state
  if [ "${RE7_TEST_FAIL_AFTER_RETENTION:-0}" = 1 ]; then false; fi
  json_write "$TX/frontend-finalization-receipt.private.json" --arg state "$final_state" --arg dumpSha256 "$dump_after_sha" \
    --arg retirementReceiptSha256 "$retirement_receipt_sha" \
    '{state:$state,saveCount:1,dumpSha256:$dumpSha256,retirementReceiptSha256:$retirementReceiptSha256,restartCountDuringFinalize:0}'
  json_write "$state_file" --arg state "$final_state" --arg dumpSha256 "$dump_after_sha" \
    --arg retirementReceiptSha256 "$retirement_receipt_sha" \
    '{state:$state,saveCount:1,acceptance:true,deployedMarker:true,dumpSha256:$dumpSha256,retirementReceiptSha256:$retirementReceiptSha256,restartCountDuringFinalize:0}'
  /usr/bin/sync -f "$TX"
  printf '%s\n' "$final_state"
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

on_finalize_error() {
  local rc=$1 line=$2
  trap - ERR
  if [ -f "$TX/pm2-save-execution.private.json" ]; then
    handoff_lock FINALIZATION_INCOMPLETE || hold_controller_lock_after_handoff_failure
    json_write "$TX/window-state.private.json" --slurpfile previous "$TX/window-state.private.json" \
      --arg reason "finalize:line_${line}:exit_${rc}" --argjson holder "$LOCK_KEEPER" \
      '$previous[0]+{state:"FINALIZATION_INCOMPLETE",failurePredicate:$reason,saveCount:1,automaticRetry:false,lockHolderPid:$holder}' || true
  fi
  exit "$rc"
}

if [ "$ACTION" = finalize ]; then
  EXPECTED_BUILD_ID=$(/usr/bin/tr -d '\n' <"$FINAL/frontend-runtime/.next/BUILD_ID")
  guard_generation=$(/usr/bin/jq -er '.generation|select(type=="number" and floor==.)' "$GUARD")
  trap 'on_finalize_error "$?" "$LINENO"' ERR
  finalize_frontend_only
  trap - ERR
  exit 0
fi

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

CURRENT_STEP=preflight_generation_retirement
for binding in "$GENERATION_CONTRACT" "$RETIREMENT_INTENT"; do
  test -f "$binding"
  test ! -L "$binding"
  test "$(/usr/bin/stat -Lc '%a' "$binding")" = 600
  test "$(/usr/bin/stat -Lc '%u' "$binding")" -eq "$EUID"
done
test "$(/usr/bin/sha256sum "$GENERATION_CONTRACT" | /usr/bin/awk '{print $1}')" = "$GENERATION_CONTRACT_SHA256"
test "$(/usr/bin/sha256sum "$RETIREMENT_INTENT" | /usr/bin/awk '{print $1}')" = "$RETIREMENT_INTENT_SHA256"
/usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" \
  '.schemaVersion==1 and .targetCommit==$target and .releaseId==$release and (.artifacts|type)=="array"' \
  "$GENERATION_CONTRACT" >/dev/null
/usr/bin/jq -e --arg target "$TARGET" --arg release "$RELEASE" --arg contract "$GENERATION_CONTRACT_SHA256" --arg policy "$ROOT_POLICY_SHA256" \
  '.schemaVersion==3 and .state=="SEALED_FOR_EXPLICIT_AUTHORIZATION" and .authorizationGranted==false and
   .targetCommit==$target and .releaseId==$release and .contractSha256==$contract and .rootPolicySha256==$policy and
   (.commands|type)=="array" and (.executionContract.stopOnFirstFailure==true) and
   (.executionContract.automaticRetry==false)' "$RETIREMENT_INTENT" >/dev/null
test -f "$ROOT_POLICY"; test ! -L "$ROOT_POLICY"; case "$(/usr/bin/stat -Lc '%a' "$ROOT_POLICY")" in 600|644) ;; *) false;; esac
test "$(/usr/bin/sha256sum "$ROOT_POLICY" | /usr/bin/awk '{print $1}')" = "$ROOT_POLICY_SHA256"
/usr/bin/install -m 600 "$GENERATION_CONTRACT" "$TX/generation-artifacts.authenticated.private.json"
/usr/bin/install -m 600 "$RETIREMENT_INTENT" "$TX/generation-retirement-intent.authenticated.private.json"
/usr/bin/install -m 600 "$ROOT_POLICY" "$TX/deploy-artifact-roots.authenticated.private.json"
/usr/bin/sync -f "$TX/generation-artifacts.authenticated.private.json"
/usr/bin/sync -f "$TX/generation-retirement-intent.authenticated.private.json"
/usr/bin/sync -f "$TX/deploy-artifact-roots.authenticated.private.json"

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
test -f "$RETIREMENT_OPERATIONAL_STATE"
test ! -L "$RETIREMENT_OPERATIONAL_STATE"
test "$(/usr/bin/stat -Lc '%a' "$RETIREMENT_OPERATIONAL_STATE")" = 600
test "$(/usr/bin/sha256sum "$RETIREMENT_OPERATIONAL_STATE" | /usr/bin/awk '{print $1}')" = "$RETIREMENT_OPERATIONAL_STATE_SHA256"
/usr/bin/jq -e '
  if has("immediateRollbackReleases") then
    (.immediateRollbackReleases|type)=="object" and
    (.immediateRollbackReleases|keys|sort)==["api","frontend"] and
    ([.immediateRollbackReleases.api,.immediateRollbackReleases.frontend]|unique|sort)==(.rollbackReleases|unique|sort)
  else true end' "$RETIREMENT_OPERATIONAL_STATE" >/dev/null || {
    printf 'ROLLBACK_ROLE_RECONCILIATION_REQUIRED\n' >&2; exit 2; }
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
json_write "$TX/window-state.private.json" --arg state AWAITING_ACCEPTANCE --arg target "$TARGET" --arg release "$RELEASE" --arg buildId "$EXPECTED_BUILD_ID" --arg contractSha256 "$GENERATION_CONTRACT_SHA256" --arg retirementIntentSha256 "$RETIREMENT_INTENT_SHA256" --argjson apiPid "$api_pid" --arg apiTicks "$api_ticks" --argjson apiRestarts "$api_restarts" --argjson frontendPid "$frontend_pid" --arg frontendTicks "$frontend_ticks" --argjson frontendRestarts "$((frontend_before + 1))" --argjson workerPid "$worker_pid" --arg workerTicks "$worker_ticks" --argjson workerRestarts "$worker_restarts" --argjson availableBytes "$available" --argjson guardGeneration "$guard_generation" '{state:$state,target:$target,release:$release,buildId:$buildId,api:{pid:$apiPid,startTicks:$apiTicks,restartCount:$apiRestarts,preserved:true},frontend:{pid:$frontendPid,startTicks:$frontendTicks,restartCount:$frontendRestarts},worker:{pid:$workerPid,startTicks:$workerTicks,restartCount:$workerRestarts,preserved:true},availableBytes:$availableBytes,guard:{open:true,generation:$guardGeneration,tasks:0,fault:null,preserved:true},retirement:{contractSha256:$contractSha256,intentSha256:$retirementIntentSha256,executeOnlyAfterDeployed:true},saveCount:0,acceptance:false,deployedMarker:false}'

CURRENT_STEP=lock_handoff
handoff_lock AWAITING_ACCEPTANCE
/usr/bin/sync -f "$TX"
trap - ERR
printf 'AWAITING_ACCEPTANCE\nTX=%s\nLOCK_HOLDER=%s\n' "$TX" "$LOCK_KEEPER"
