#!/usr/bin/env bash
set -euo pipefail

# Canonical NORMAL_RELEASE deploy for the Converta single-VPS/PM2 topology.
# prepare is inert; activate requires an exact-SHA authorization and rolls back
# API/frontend artifacts automatically. Worker, database and credentials are out.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="${WORKDIR:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
RELEASES_DIR="${RELEASES_DIR:-/opt/re7online/releases}"
API_PM2_NAME="${API_PM2_NAME:-re7-whatsapp-agent}"
FRONTEND_PM2_NAME="${FRONTEND_PM2_NAME:-re7-admin-front}"
WORKER_PM2_NAME="${WORKER_PM2_NAME:-re7-whatsapp-web-worker}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/health}"
FRONTEND_HEALTH_URL="${FRONTEND_HEALTH_URL:-http://127.0.0.1:3000/app/login}"
LOCK_FILE="${LOCK_FILE:-/opt/re7online/.deploy-normal-release.lock}"

log() { printf '[normal-release] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

usage() {
  cat >&2 <<'USAGE'
Usage:
  deploy-normal-release.sh plan <base-ref> <target-ref>
  deploy-normal-release.sh prepare <base-ref> <target-ref>
  DEPLOY_APPROVED_SHA=<full-sha> deploy-normal-release.sh activate <release-dir>

NORMAL_RELEASE refuses migrations, dependency/lockfile changes, worker impact and
unknown runtime impact. prepare never touches PM2. activate preserves the worker,
swaps only prepared API/frontend build directories, verifies health, rolls back on
failure, and runs pm2 save once only after both components pass.
USAGE
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

matrix_value() {
  local key="$1" file="$2"
  awk -F': ' -v key="$key" '$1 == key { print $2; found=1; exit } END { if (!found) exit 1 }' "$file"
}

resolve_commit() { git -C "$WORKDIR" rev-parse --verify "$1^{commit}"; }

assert_clean_control_tree() {
  local dirty
  dirty="$(git -C "$WORKDIR" status --porcelain --untracked-files=no)"
  [[ -z "$dirty" ]] || die "tracked control worktree is dirty; deployment refused"
}

classify() {
  local base_sha="$1" target_sha="$2" output="$3"
  DEPLOY_REPO_ROOT="$WORKDIR" "$WORKDIR/scripts/deploy-impact-matrix.sh" "$base_sha" "$target_sha" >"$output" || {
    cat "$output"
    die "impact matrix denied NORMAL_RELEASE"
  }
  cat "$output"
  [[ "$(matrix_value MIGRATION_REVIEW "$output")" == "NO" ]] || die "migration/schema change requires BREAK_GLASS"
  [[ "$(matrix_value UNKNOWN_RUNTIME_IMPACT "$output")" == "NO" ]] || die "unknown runtime impact requires review"
  [[ "$(matrix_value REVIEW_REQUIRED "$output")" == "NO" ]] || die "manual impact review required"
  [[ "$(matrix_value WORKER_BUILD "$output")" == "NO" ]] || die "worker impact is outside NORMAL_RELEASE"
}

pm2_field() {
  local process_name="$1" field="$2"
  pm2 jlist | python3 -c '
import json, sys
name, field = sys.argv[1:]
items = json.load(sys.stdin)
matches = [item for item in items if item.get("name") == name]
if len(matches) != 1:
    raise SystemExit(2)
value = matches[0].get("pm2_env", {}).get(field)
if not isinstance(value, str) or not value.startswith("/"):
    raise SystemExit(3)
print(value)
' "$process_name" "$field"
}

wait_http() {
  local url="$1" attempts="${2:-20}" i
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 3 "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

prepare_release() {
  local base_ref="$1" target_ref="$2"
  require_cmd git; require_cmd npm; require_cmd python3; require_cmd sha256sum
  [[ "$(git -C "$WORKDIR" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] || die "not a git worktree: $WORKDIR"
  assert_clean_control_tree

  local base_sha target_sha matrix release_id release_dir source_dir
  base_sha="$(resolve_commit "$base_ref")"
  target_sha="$(resolve_commit "$target_ref")"
  matrix="$(mktemp)"
  classify "$base_sha" "$target_sha" "$matrix"
  rm -f "$matrix"

  release_id="normal-${target_sha:0:12}"
  release_dir="$RELEASES_DIR/$release_id"
  source_dir="$release_dir/source"
  [[ ! -e "$release_dir" ]] || die "release directory already exists: $release_dir"
  install -d -m 0755 "$release_dir/payload"
  git -C "$WORKDIR" worktree add --detach "$source_dir" "$target_sha"

  matrix="$(mktemp)"
  DEPLOY_REPO_ROOT="$WORKDIR" "$WORKDIR/scripts/deploy-impact-matrix.sh" "$base_sha" "$target_sha" >"$matrix"
  local api_build frontend_build
  api_build="$(matrix_value BACKEND_BUILD "$matrix")"
  frontend_build="$(matrix_value FRONTEND_BUILD "$matrix")"
  rm -f "$matrix"
  [[ "$api_build" == "YES" || "$frontend_build" == "YES" ]] || die "no runtime change to deploy"

  if [[ "$api_build" == "YES" ]]; then
    npm --prefix "$source_dir/apps/whatsapp-agent" ci --include=dev
    npm --prefix "$source_dir/apps/whatsapp-agent" run db:generate
    npm --prefix "$source_dir/apps/whatsapp-agent" run build
    cp -a "$source_dir/apps/whatsapp-agent/dist" "$release_dir/payload/api-dist"
  fi
  if [[ "$frontend_build" == "YES" ]]; then
    npm --prefix "$source_dir" ci
    npm --prefix "$source_dir" run build
    cp -a "$source_dir/.next" "$release_dir/payload/frontend-next"
  fi

  git -C "$WORKDIR" worktree remove --force "$source_dir"

  BASE_SHA="$base_sha" TARGET_SHA="$target_sha" API_BUILD="$api_build" FRONTEND_BUILD="$frontend_build" \
  RELEASE_DIR="$release_dir" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
root = Path(os.environ["RELEASE_DIR"])
def tree_hash(path):
    h = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        rel = item.relative_to(path).as_posix()
        if item.is_symlink(): h.update(f"L {rel} {os.readlink(item)}\n".encode())
        elif item.is_file():
            h.update(f"F {rel} {item.stat().st_size}\n".encode())
            with item.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()
components = {}
for name, enabled, directory in (("api", os.environ["API_BUILD"], "api-dist"), ("frontend", os.environ["FRONTEND_BUILD"], "frontend-next")):
    if enabled == "YES": components[name] = {"treeSha256": tree_hash(root / "payload" / directory)}
manifest = {"schemaVersion": 1, "deploymentClass": "NORMAL_RELEASE", "baseCommit": os.environ["BASE_SHA"], "targetCommit": os.environ["TARGET_SHA"], "components": components, "workerChanged": False, "databaseChanged": False, "credentialsChanged": False}
data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
(root / "manifest.json").write_bytes(data)
(root / "manifest.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY
  chmod -R a-w "$release_dir/payload" "$release_dir/manifest.json" "$release_dir/manifest.sha256"
  log "PREPARED_INERT release=$release_dir target=$target_sha"
  log "No PM2 process, live runtime, database or worker was changed"
}

activate_release() {
  local release_dir="$1"
  [[ -f "$release_dir/manifest.json" && -f "$release_dir/manifest.sha256" ]] || die "invalid release directory"
  require_cmd flock; require_cmd pm2; require_cmd curl; require_cmd python3; require_cmd sha256sum
  local expected_manifest actual_manifest target_sha
  expected_manifest="$(tr -d '[:space:]' < "$release_dir/manifest.sha256")"
  actual_manifest="$(sha256sum "$release_dir/manifest.json" | awk '{print $1}')"
  [[ "$actual_manifest" == "$expected_manifest" ]] || die "manifest hash mismatch"
  target_sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["targetCommit"])' "$release_dir/manifest.json")"
  [[ "${DEPLOY_APPROVED_SHA:-}" == "$target_sha" ]] || die "DEPLOY_APPROVED_SHA must equal target commit $target_sha"
  python3 - "$release_dir" <<'PY' || die "payload integrity mismatch"
import hashlib, json, os, sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
directories = {"api": "api-dist", "frontend": "frontend-next"}
def tree_hash(path):
    h = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        rel = item.relative_to(path).as_posix()
        if item.is_symlink(): h.update(f"L {rel} {os.readlink(item)}\n".encode())
        elif item.is_file():
            h.update(f"F {rel} {item.stat().st_size}\n".encode())
            with item.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()
for name, record in manifest["components"].items():
    path = root / "payload" / directories[name]
    if not path.is_dir() or tree_hash(path) != record["treeSha256"]: raise SystemExit(1)
PY

  exec 9>"$LOCK_FILE"
  flock -n 9 || die "another deployment is running"
  local api_cwd frontend_cwd worker_before rollback_dir
  api_cwd="$(pm2_field "$API_PM2_NAME" pm_cwd)" || die "cannot resolve API cwd from PM2"
  frontend_cwd="$(pm2_field "$FRONTEND_PM2_NAME" pm_cwd)" || die "cannot resolve frontend cwd from PM2"
  worker_before="$(pm2_field "$WORKER_PM2_NAME" pm_cwd)" || die "cannot resolve worker identity from PM2"
  rollback_dir="$release_dir/rollback"
  [[ ! -e "$rollback_dir" ]] || die "release was already activated or consumed"
  install -d -m 0700 "$rollback_dir"
  pm2 jlist > "$rollback_dir/pm2-before.json"
  cp -a "${PM2_HOME:-$HOME/.pm2}/dump.pm2" "$rollback_dir/dump.pm2.before"
  chmod 0600 "$rollback_dir/pm2-before.json" "$rollback_dir/dump.pm2.before"

  local api_changed=false frontend_changed=false
  rollback_all() {
    set +e
    if [[ "$frontend_changed" == true && -d "$rollback_dir/frontend-next" ]]; then
      mv "$frontend_cwd/.next" "$release_dir/failed-frontend-next"
      mv "$rollback_dir/frontend-next" "$frontend_cwd/.next"
      pm2 reload "$FRONTEND_PM2_NAME" --update-env
    fi
    if [[ "$api_changed" == true && -d "$rollback_dir/api-dist" ]]; then
      mv "$api_cwd/dist" "$release_dir/failed-api-dist"
      mv "$rollback_dir/api-dist" "$api_cwd/dist"
      pm2 reload "$API_PM2_NAME" --update-env
    fi
    wait_http "$API_HEALTH_URL" 20
    wait_http "$FRONTEND_HEALTH_URL" 20
    log "ROLLED_BACK target=$target_sha; worker was not touched"
  }
  trap 'status=$?; if [[ $status -ne 0 ]]; then rollback_all; fi; exit $status' EXIT

  if [[ -d "$release_dir/payload/api-dist" ]]; then
    [[ -d "$api_cwd/dist" ]] || die "live API dist not found"
    mv "$api_cwd/dist" "$rollback_dir/api-dist"
    cp -a "$release_dir/payload/api-dist" "$api_cwd/dist"
    api_changed=true
    pm2 reload "$API_PM2_NAME" --update-env
    wait_http "$API_HEALTH_URL" 20 || die "API health failed"
  fi
  if [[ -d "$release_dir/payload/frontend-next" ]]; then
    [[ -d "$frontend_cwd/.next" ]] || die "live frontend .next not found"
    mv "$frontend_cwd/.next" "$rollback_dir/frontend-next"
    cp -a "$release_dir/payload/frontend-next" "$frontend_cwd/.next"
    frontend_changed=true
    pm2 reload "$FRONTEND_PM2_NAME" --update-env
    wait_http "$FRONTEND_HEALTH_URL" 20 || die "frontend health failed"
  fi
  [[ "$(pm2_field "$WORKER_PM2_NAME" pm_cwd)" == "$worker_before" ]] || die "worker identity changed unexpectedly"
  pm2 save
  trap - EXIT
  printf '%s\n' "$target_sha" > "$release_dir/DEPLOYED"
  chmod 0444 "$release_dir/DEPLOYED"
  log "DEPLOYED target=$target_sha; API/frontend healthy; worker preserved; pm2 saved once"
}

[[ $# -ge 1 ]] || { usage; exit 64; }
command_name="$1"; shift
case "$command_name" in
  plan)
    [[ $# -eq 2 ]] || { usage; exit 64; }
    require_cmd git
    matrix="$(mktemp)"; trap 'rm -f "$matrix"' EXIT
    classify "$(resolve_commit "$1")" "$(resolve_commit "$2")" "$matrix"
    log "NORMAL_RELEASE_PLAN_OK"
    ;;
  prepare)
    [[ $# -eq 2 ]] || { usage; exit 64; }
    prepare_release "$1" "$2"
    ;;
  activate)
    [[ $# -eq 1 ]] || { usage; exit 64; }
    activate_release "$1"
    ;;
  *) usage; exit 64 ;;
esac
