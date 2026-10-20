#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
script="$repo_root/scripts/deploy-normal-release.sh"
bash -n "$script"

plan_fixture="$(mktemp -d)"
plan_repo="$plan_fixture/repo"
git init -q "$plan_repo"
git -C "$plan_repo" config user.email deploy-test@example.invalid
git -C "$plan_repo" config user.name 'Deploy Test'
mkdir -p "$plan_repo/apps/whatsapp-agent/src/http" "$plan_repo/src/app/app/crm" "$plan_repo/scripts"
cp "$repo_root/scripts/deploy-impact-matrix.sh" "$plan_repo/scripts/"
chmod +x "$plan_repo/scripts/deploy-impact-matrix.sh"
touch "$plan_repo/.keep"
git -C "$plan_repo" add .
git -C "$plan_repo" commit -qm base
base="$(git -C "$plan_repo" rev-parse HEAD)"
printf 'api\n' > "$plan_repo/apps/whatsapp-agent/src/http/routes.ts"
printf 'frontend\n' > "$plan_repo/src/app/app/crm/page.tsx"
git -C "$plan_repo" add .
git -C "$plan_repo" commit -qm candidate
target="$(git -C "$plan_repo" rev-parse HEAD)"
output="$(WORKDIR="$plan_repo" "$script" plan "$base" "$target")"
grep -q 'BACKEND_BUILD: YES' <<<"$output"
grep -q 'FRONTEND_BUILD: YES' <<<"$output"
grep -q 'WORKER_BUILD: NO' <<<"$output"
grep -q 'MIGRATION_REVIEW: NO' <<<"$output"
grep -q 'NORMAL_RELEASE_PLAN_OK' <<<"$output"

control_worktree="$plan_fixture/control-worktree"
git -C "$plan_repo" worktree add -q --detach "$control_worktree" "$target"
[[ -f "$control_worktree/.git" ]]
output="$(WORKDIR="$control_worktree" "$script" plan "$base" "$target")"
grep -q 'NORMAL_RELEASE_PLAN_OK' <<<"$output"

prepare_bin="$plan_fixture/prepare-bin"
mkdir -p "$prepare_bin"
cat > "$prepare_bin/npm" <<'NPM'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_NPM_LOG"
[[ "$1" == "--prefix" ]]
prefix="$2"
if [[ "${3:-} ${4:-}" == "run build" ]]; then
  if [[ "$prefix" == */apps/whatsapp-agent ]]; then
    mkdir -p "$prefix/dist"
    printf 'api-build\n' > "$prefix/dist/version"
  else
    mkdir -p "$prefix/.next"
    printf 'frontend-build\n' > "$prefix/.next/version"
  fi
fi
NPM
chmod +x "$prepare_bin/npm"
prepare_release="$plan_fixture/releases/normal-${target:0:12}"
output="$(WORKDIR="$control_worktree" RELEASES_DIR="$plan_fixture/releases" \
  TEST_NPM_LOG="$plan_fixture/npm.log" PATH="$prepare_bin:$PATH" \
  "$script" prepare "$base" "$target")"
grep -q 'PREPARED_INERT' <<<"$output"
[[ -f "$prepare_release/manifest.json" ]]
[[ -f "$prepare_release/payload/api-dist/version" ]]
[[ -f "$prepare_release/payload/frontend-next/version" ]]
mapfile -t npm_calls < "$plan_fixture/npm.log"
[[ "${#npm_calls[@]}" -eq 5 ]]
[[ "${npm_calls[0]}" == "--prefix $prepare_release/source/apps/whatsapp-agent ci --include=dev" ]]
[[ "${npm_calls[1]}" == "--prefix $prepare_release/source/apps/whatsapp-agent run db:generate" ]]
[[ "${npm_calls[2]}" == "--prefix $prepare_release/source/apps/whatsapp-agent run build" ]]
[[ "${npm_calls[3]}" == "--prefix $prepare_release/source ci" ]]
[[ "${npm_calls[4]}" == "--prefix $prepare_release/source run build" ]]

set +e
output="$(DEPLOY_APPROVED_SHA=wrong "$script" activate /does/not/exist 2>&1)"
status=$?
set -e
[[ $status -ne 0 ]]
grep -q 'invalid release directory' <<<"$output"
echo 'normal release plan and full preparation tests passed'

fixture="$(mktemp -d)"
home_dir="$fixture/home"
bin_dir="$fixture/bin"
api_cwd="$fixture/live-api"
frontend_cwd="$fixture/live-front"
worker_cwd="$fixture/live-worker"
release_dir="$fixture/release"
mkdir -p "$home_dir/.pm2" "$bin_dir" "$api_cwd/dist" "$frontend_cwd/.next" "$worker_cwd" \
  "$release_dir/payload/api-dist" "$release_dir/payload/frontend-next"
printf 'old-api\n' > "$api_cwd/dist/version"
printf 'old-front\n' > "$frontend_cwd/.next/version"
printf 'new-api\n' > "$release_dir/payload/api-dist/version"
printf 'new-front\n' > "$release_dir/payload/frontend-next/version"
printf '{}\n' > "$home_dir/.pm2/dump.pm2"

cat > "$bin_dir/pm2" <<'PM2'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == jlist ]]; then
  printf '[{"name":"re7-whatsapp-agent","pm2_env":{"pm_cwd":"%s"}},{"name":"re7-admin-front","pm2_env":{"pm_cwd":"%s"}},{"name":"re7-whatsapp-web-worker","pm2_env":{"pm_cwd":"%s"}}]\n' "$TEST_API_CWD" "$TEST_FRONTEND_CWD" "$TEST_WORKER_CWD"
else
  printf '%s\n' "$*" >> "$TEST_PM2_LOG"
fi
PM2
cat > "$bin_dir/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${*: -1}" >> "$TEST_CURL_LOG"
if [[ "${TEST_FAIL_FRONTEND:-false}" == true && "${*: -1}" == *3000* ]]; then exit 22; fi
exit 0
CURL
cat > "$bin_dir/sleep" <<'SLEEP'
#!/usr/bin/env bash
exit 0
SLEEP
chmod +x "$bin_dir/pm2" "$bin_dir/curl" "$bin_dir/sleep"

TARGET_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
RELEASE_DIR="$release_dir" TARGET_SHA="$TARGET_SHA" python3 - <<'PY'
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
            h.update(item.read_bytes())
    return h.hexdigest()
manifest = {"schemaVersion": 1, "deploymentClass": "NORMAL_RELEASE", "baseCommit": "b" * 40, "targetCommit": os.environ["TARGET_SHA"], "components": {"api": {"treeSha256": tree_hash(root / "payload/api-dist")}, "frontend": {"treeSha256": tree_hash(root / "payload/frontend-next")}}, "workerChanged": False, "databaseChanged": False, "credentialsChanged": False}
data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
(root / "manifest.json").write_bytes(data)
(root / "manifest.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

TEST_API_CWD="$api_cwd" TEST_FRONTEND_CWD="$frontend_cwd" TEST_WORKER_CWD="$worker_cwd" \
TEST_PM2_LOG="$fixture/pm2.log" TEST_CURL_LOG="$fixture/curl.log" HOME="$home_dir" PATH="$bin_dir:$PATH" LOCK_FILE="$fixture/lock" \
DEPLOY_APPROVED_SHA="$TARGET_SHA" "$script" activate "$release_dir"
grep -q new-api "$api_cwd/dist/version"
grep -q new-front "$frontend_cwd/.next/version"
grep -q old-api "$release_dir/rollback/api-dist/version"
grep -q old-front "$release_dir/rollback/frontend-next/version"
[[ "$(grep -c '^save$' "$fixture/pm2.log")" -eq 1 ]]
! grep -q re7-whatsapp-web-worker "$fixture/pm2.log"
grep -Fxq 'http://127.0.0.1:3000/app/login' "$fixture/curl.log"
! grep -Fxq 'http://127.0.0.1:3000/login' "$fixture/curl.log"

echo 'normal release activation tests passed'

failed_release="$fixture/failed-release"
mkdir -p "$failed_release/payload/api-dist" "$failed_release/payload/frontend-next"
printf 'bad-api\n' > "$failed_release/payload/api-dist/version"
printf 'bad-front\n' > "$failed_release/payload/frontend-next/version"
FAILED_TARGET=cccccccccccccccccccccccccccccccccccccccc
RELEASE_DIR="$failed_release" TARGET_SHA="$FAILED_TARGET" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
root = Path(os.environ["RELEASE_DIR"])
def tree_hash(path):
    h = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        rel = item.relative_to(path).as_posix()
        if item.is_file():
            h.update(f"F {rel} {item.stat().st_size}\n".encode()); h.update(item.read_bytes())
    return h.hexdigest()
manifest = {"schemaVersion": 1, "deploymentClass": "NORMAL_RELEASE", "baseCommit": "a" * 40, "targetCommit": os.environ["TARGET_SHA"], "components": {"api": {"treeSha256": tree_hash(root / "payload/api-dist")}, "frontend": {"treeSha256": tree_hash(root / "payload/frontend-next")}}, "workerChanged": False, "databaseChanged": False, "credentialsChanged": False}
data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
(root / "manifest.json").write_bytes(data)
(root / "manifest.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY
set +e
TEST_API_CWD="$api_cwd" TEST_FRONTEND_CWD="$frontend_cwd" TEST_WORKER_CWD="$worker_cwd" \
TEST_PM2_LOG="$fixture/pm2.log" TEST_CURL_LOG="$fixture/curl.log" TEST_FAIL_FRONTEND=true HOME="$home_dir" PATH="$bin_dir:$PATH" \
LOCK_FILE="$fixture/lock" DEPLOY_APPROVED_SHA="$FAILED_TARGET" "$script" activate "$failed_release" >/dev/null 2>&1
failed_status=$?
set -e
[[ $failed_status -ne 0 ]]
grep -q new-api "$api_cwd/dist/version"
grep -q new-front "$frontend_cwd/.next/version"
[[ "$(grep -c '^save$' "$fixture/pm2.log")" -eq 1 ]]
echo 'normal release rollback tests passed'
