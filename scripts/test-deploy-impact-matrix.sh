#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
script="$repo_root/scripts/deploy-impact-matrix.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

run_case() {
  local name="$1"
  local path="$2"
  local expected_backend="$3"
  local expected_worker="$4"
  local expected_frontend="$5"
  local expected_migration="$6"
  local expected_status="${7:-0}"

  local repo="$tmpdir/$name"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.email "deploy-impact-test@example.invalid"
  git -C "$repo" config user.name "Deploy Impact Test"
  touch "$repo/.keep"
  git -C "$repo" add .keep
  git -C "$repo" commit -q -m "base"
  local base
  base="$(git -C "$repo" rev-parse HEAD)"

  mkdir -p "$repo/$(dirname "$path")"
  printf 'changed\n' > "$repo/$path"
  git -C "$repo" add "$path"
  git -C "$repo" commit -q -m "$name"
  local head
  head="$(git -C "$repo" rev-parse HEAD)"

  local output status
  set +e
  output="$(cd "$repo" && "$script" "$base" "$head" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -ne "$expected_status" ]]; then
    echo "FAIL $name: expected status $expected_status, got $status" >&2
    echo "$output" >&2
    exit 1
  fi

  grep -q "BACKEND_BUILD: $expected_backend" <<<"$output" || {
    echo "FAIL $name: backend impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "WORKER_BUILD: $expected_worker" <<<"$output" || {
    echo "FAIL $name: worker impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "FRONTEND_BUILD: $expected_frontend" <<<"$output" || {
    echo "FAIL $name: frontend impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "MIGRATION_REVIEW: $expected_migration" <<<"$output" || {
    echo "FAIL $name: migration review mismatch" >&2
    echo "$output" >&2
    exit 1
  }
}

run_historical_case() {
  local commit="$1"
  local expected_backend="$2"
  local expected_worker="$3"
  local expected_frontend="$4"
  local expected_migration="$5"
  local output

  output="$("$script" "$commit^" "$commit")"
  grep -q "BACKEND_BUILD: $expected_backend" <<<"$output" || {
    echo "FAIL historical $commit: backend impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "WORKER_BUILD: $expected_worker" <<<"$output" || {
    echo "FAIL historical $commit: worker impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "FRONTEND_BUILD: $expected_frontend" <<<"$output" || {
    echo "FAIL historical $commit: frontend impact mismatch" >&2
    echo "$output" >&2
    exit 1
  }
  grep -q "MIGRATION_REVIEW: $expected_migration" <<<"$output" || {
    echo "FAIL historical $commit: migration review mismatch" >&2
    echo "$output" >&2
    exit 1
  }
}

run_case "backend-only" "apps/whatsapp-agent/src/http/routes.ts" YES NO NO NO
run_case "api-package" "apps/whatsapp-agent/package.json" YES NO NO NO
run_case "api-lockfile" "apps/whatsapp-agent/package-lock.json" YES NO NO NO
run_case "api-tsconfig" "apps/whatsapp-agent/tsconfig.json" YES NO NO NO
run_case "api-tsconfig-variant" "apps/whatsapp-agent/tsconfig.build.json" YES NO NO NO
run_case "api-ecosystem" "apps/whatsapp-agent/ecosystem.config.cjs" YES NO NO NO
run_case "worker-only" "apps/whatsapp-web-worker/src/whatsappWebSessionWorker.ts" NO YES NO NO
run_case "worker-package" "apps/whatsapp-web-worker/package.json" NO YES NO NO
run_case "shared-backend-worker" "apps/whatsapp-agent/src/web-session/webSessionInbound.ts" YES YES NO NO
run_case "frontend-only" "src/app/app/inbox/page.tsx" NO NO YES NO
run_case "docs-only" "docs/saas/runbook-re7.md" NO NO NO NO
run_case "deploy-root-policy" "config/deploy-artifact-roots.json" NO NO NO NO
run_case "legacy-generation-descriptor" "config/legacy-generation-f1602787-v1-preserve.json" NO NO NO NO
run_case "unknown-config" "config/runtime-overrides.json" YES YES YES NO 2
run_case "prisma-schema" "apps/whatsapp-agent/prisma/schema.prisma" YES YES NO YES
run_case "unknown-path" "ops/custom-runtime-hook.sh" YES YES YES NO 2
run_case "root-lockfile" "package-lock.json" YES YES YES NO 2

run_historical_case 40ec4535 YES YES NO NO
run_historical_case 13acec7e YES YES NO NO
run_historical_case 12eb83db YES YES YES NO
run_historical_case c8e552bd NO NO YES NO
run_historical_case 53cd730c NO NO NO NO
run_historical_case 0c0a307a832922443674234ad45a6958e392857a YES NO NO NO

echo "deploy impact matrix tests passed"
