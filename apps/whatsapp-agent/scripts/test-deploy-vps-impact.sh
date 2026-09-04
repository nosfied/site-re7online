#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
deploy_script="$repo_root/apps/whatsapp-agent/scripts/deploy-vps.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

make_repo() {
  local name="$1"
  local repo="$tmpdir/$name/repo"
  mkdir -p "$repo/apps/whatsapp-agent/scripts" "$repo/apps/whatsapp-web-worker" "$repo/scripts"
  cp "$deploy_script" "$repo/apps/whatsapp-agent/scripts/deploy-vps.sh"
  cp "$repo_root/scripts/deploy-impact-matrix.sh" "$repo/scripts/deploy-impact-matrix.sh"
  chmod +x "$repo/apps/whatsapp-agent/scripts/deploy-vps.sh" "$repo/scripts/deploy-impact-matrix.sh"
  git -C "$repo" init -q
  git -C "$repo" config user.email "deploy-vps-test@example.invalid"
  git -C "$repo" config user.name "Deploy VPS Test"
  touch "$repo/.keep"
  git -C "$repo" add .
  git -C "$repo" commit -q -m "base"
  echo "$repo"
}

commit_change() {
  local repo="$1"
  local path="$2"
  mkdir -p "$repo/$(dirname "$path")"
  printf 'changed\n' > "$repo/$path"
  git -C "$repo" add "$path"
  git -C "$repo" commit -q -m "change $path"
}

dry_run_case() {
  local name="$1"
  local path="$2"
  shift 2
  local repo
  repo="$(make_repo "$name")"
  local base
  base="$(git -C "$repo" rev-parse HEAD)"
  commit_change "$repo" "$path"
  local head
  head="$(git -C "$repo" rev-parse HEAD)"
  git -C "$repo" checkout -q "$base"

  local output
  output="$(WORKDIR="$repo" "$repo/apps/whatsapp-agent/scripts/deploy-vps.sh" --dry-run "$head")"
  for expected in "$@"; do
    grep -q "$expected" <<<"$output" || {
      echo "FAIL $name: missing $expected" >&2
      echo "$output" >&2
      exit 1
    }
  done
  grep -q "no pull/build/migrate/reload executed" <<<"$output" || {
    echo "FAIL $name: dry-run performed actions" >&2
    echo "$output" >&2
    exit 1
  }
  git -C "$repo" rev-parse HEAD >/dev/null
  test -n "$base"
}

unknown_case() {
  local repo
  repo="$(make_repo "unknown")"
  commit_change "$repo" "ops/custom-runtime-hook.sh"
  local head output status
  head="$(git -C "$repo" rev-parse HEAD)"
  git -C "$repo" checkout -q HEAD^
  set +e
  output="$(WORKDIR="$repo" "$repo/apps/whatsapp-agent/scripts/deploy-vps.sh" --dry-run "$head" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "FAIL unknown: expected non-zero status" >&2
    echo "$output" >&2
    exit 1
  fi
  grep -q "REVIEW_REQUIRED: YES" <<<"$output" || {
    echo "FAIL unknown: expected review required" >&2
    echo "$output" >&2
    exit 1
  }
}

make_remote_deploy_repo() {
  local name="$1"
  local fixture="$tmpdir/$name"
  local source="$fixture/source"
  local bare="$fixture/origin.git"
  local work="$fixture/work"

  mkdir -p "$source/apps/whatsapp-agent/scripts" "$source/apps/whatsapp-web-worker" "$source/scripts"
  cp "$deploy_script" "$source/apps/whatsapp-agent/scripts/deploy-vps.sh"
  cp "$repo_root/scripts/deploy-impact-matrix.sh" "$source/scripts/deploy-impact-matrix.sh"
  chmod +x "$source/apps/whatsapp-agent/scripts/deploy-vps.sh" "$source/scripts/deploy-impact-matrix.sh"
  touch "$source/apps/whatsapp-web-worker/.keep"
  git -C "$source" init -q
  git -C "$source" config user.email "deploy-vps-test@example.invalid"
  git -C "$source" config user.name "Deploy VPS Test"
  touch "$source/.keep"
  git -C "$source" add .
  git -C "$source" commit -q -m "base"
  git -C "$source" clone --bare . "$bare" >/dev/null 2>&1
  git clone -q "$bare" "$work"
  git -C "$work" config user.email "deploy-vps-test@example.invalid"
  git -C "$work" config user.name "Deploy VPS Test"
  echo "$fixture"
}

push_remote_change() {
  local fixture="$1"
  local path="$2"
  local source="$fixture/source"
  mkdir -p "$source/$(dirname "$path")"
  printf 'changed\n' > "$source/$path"
  git -C "$source" add "$path"
  git -C "$source" commit -q -m "change $path"
  git -C "$source" push -q "$fixture/origin.git" HEAD:master
}

install_mocks() {
  local fixture="$1"
  local mock_bin="$fixture/home/.npm-global/bin"
  mkdir -p "$mock_bin"
  cat > "$mock_bin/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
set -euo pipefail
echo "npm:$PWD:$*" >> "$DEPLOY_TEST_LOG"
if [[ "${DEPLOY_TEST_FAIL_NPM_BUILD:-}" == "backend" && "$PWD" == */apps/whatsapp-agent && "$*" == "run build" ]]; then
  exit 42
fi
if [[ "${DEPLOY_TEST_FAIL_NPM_BUILD:-}" == "worker" && "$PWD" == */apps/whatsapp-web-worker && "$*" == "run build" ]]; then
  exit 43
fi
MOCK_NPM
  cat > "$mock_bin/pm2" <<'MOCK_PM2'
#!/usr/bin/env bash
set -euo pipefail
echo "pm2:$*" >> "$DEPLOY_TEST_LOG"
if [[ "$1" == "describe" ]]; then
  exit 0
fi
MOCK_PM2
  cat > "$mock_bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail
echo "curl:$*" >> "$DEPLOY_TEST_LOG"
MOCK_CURL
  chmod +x "$mock_bin/npm" "$mock_bin/pm2" "$mock_bin/curl"
}

deploy_case() {
  local name="$1"
  local path="$2"
  local expected="$3"
  local fixture
  fixture="$(make_remote_deploy_repo "$name")"
  install_mocks "$fixture"
  push_remote_change "$fixture" "$path"
  local log="$fixture/actions.log" output status
  set +e
  output="$(DEPLOY_TEST_LOG="$log" HOME="$fixture/home" WORKDIR="$fixture/work" "$fixture/work/apps/whatsapp-agent/scripts/deploy-vps.sh" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "FAIL deploy $name: deploy script exited $status" >&2
    echo "$output" >&2
    [[ -f "$log" ]] && cat "$log" >&2
    exit 1
  fi
  grep -q "$expected" "$log" || {
    echo "FAIL deploy $name: missing $expected" >&2
    cat "$log" >&2
    exit 1
  }
}

failed_backend_build_case() {
  local fixture
  fixture="$(make_remote_deploy_repo "failed-backend-build")"
  install_mocks "$fixture"
  push_remote_change "$fixture" "apps/whatsapp-agent/src/web-session/webSessionInbound.ts"
  local log="$fixture/actions.log" status
  set +e
  DEPLOY_TEST_LOG="$log" DEPLOY_TEST_FAIL_NPM_BUILD="backend" HOME="$fixture/home" WORKDIR="$fixture/work" "$fixture/work/apps/whatsapp-agent/scripts/deploy-vps.sh" >/dev/null 2>&1
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "FAIL failed-backend-build: expected non-zero status" >&2
    cat "$log" >&2
    exit 1
  fi
  if grep -q "pm2:reload" "$log"; then
    echo "FAIL failed-backend-build: reload happened after failed build" >&2
    cat "$log" >&2
    exit 1
  fi
}

dry_run_case "shared" "apps/whatsapp-agent/src/web-session/webSessionInbound.ts" \
  "BACKEND_BUILD: YES" "WORKER_BUILD: YES" "FRONTEND_BUILD: NO" \
  "BACKEND_RELOAD: YES" "WORKER_RELOAD: YES"

dry_run_case "frontend" "src/app/app/inbox/page.tsx" \
  "BACKEND_BUILD: NO" "WORKER_BUILD: NO" "FRONTEND_BUILD: YES" \
  "FRONTEND_RELOAD: YES"

dry_run_case "docs" "docs/saas/runbook-re7.md" \
  "BACKEND_BUILD: NO" "WORKER_BUILD: NO" "FRONTEND_BUILD: NO" \
  "BACKEND_RELOAD: NO" "WORKER_RELOAD: NO" "FRONTEND_RELOAD: NO"

dry_run_case "prisma" "apps/whatsapp-agent/prisma/schema.prisma" \
  "BACKEND_BUILD: YES" "WORKER_BUILD: YES" "MIGRATION_REVIEW: YES"

unknown_case
deploy_case "deploy-shared" "apps/whatsapp-agent/src/web-session/webSessionInbound.ts" "pm2:reload re7-whatsapp-web-worker --update-env"
deploy_case "deploy-frontend" "src/app/app/inbox/page.tsx" "pm2:reload re7-admin-front --update-env"
failed_backend_build_case

echo "deploy-vps impact integration tests passed"
