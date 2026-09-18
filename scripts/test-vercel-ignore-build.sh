#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
script="$repo_root/scripts/vercel-ignore-build.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

run_case() {
  local name="$1"
  local path="$2"
  local expected_status="$3"

  local repo="$tmpdir/$name"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.email "vercel-ignore-test@example.invalid"
  git -C "$repo" config user.name "Vercel Ignore Test"
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

  local status output
  set +e
  output="$(cd "$repo" && "$script" "$base" "$head" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -ne "$expected_status" ]]; then
    echo "FAIL $name: expected status $expected_status, got $status" >&2
    echo "$output" >&2
    exit 1
  fi
}

run_case "docs-only" "docs/saas/runbook-re7.md" 0
run_case "ops-repair-script" "apps/whatsapp-agent/scripts/demo-9614-identity-repair-execute.ts" 0
run_case "backend-test" "apps/whatsapp-agent/src/identity/demo9614RepairPlanner.test.ts" 0
run_case "web-session-worker" "apps/whatsapp-web-worker/src/whatsappWebSessionWorker.ts" 0
run_case "public-page" "src/app/page.tsx" 1
run_case "operational-next-route" "src/app/app/inbox/page.tsx" 1
run_case "public-asset" "public/images/converta-logo-light.png" 1
run_case "root-dependency" "package-lock.json" 1
run_case "next-config" "next.config.ts" 1
run_case "vercel-config" "vercel.json" 1
run_case "unknown-path" "ops/custom-runtime-hook.sh" 1

echo "vercel ignore build tests passed"
