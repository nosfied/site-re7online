#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/deploy-impact-matrix.sh <base> <head>
  scripts/deploy-impact-matrix.sh <base>..<head>

Prints the runtime build/reload impact for changed files in a Git range.
It does not build, reload, deploy, migrate, or mutate data.
USAGE
}

if [[ $# -eq 1 && "$1" == *..* ]]; then
  base="${1%%..*}"
  head="${1#*..}"
elif [[ $# -eq 2 ]]; then
  base="$1"
  head="$2"
else
  usage
  exit 64
fi

if [[ -z "$base" || -z "$head" ]]; then
  usage
  exit 64
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || {
  echo "ERROR: invalid base commit: $base" >&2
  exit 64
}

git rev-parse --verify --quiet "$head^{commit}" >/dev/null || {
  echo "ERROR: invalid head commit: $head" >&2
  exit 64
}

mapfile -t changed_files < <(git diff --name-only "$base" "$head")

backend_build="NO"
worker_build="NO"
frontend_build="NO"
migration_review="NO"
unknown_runtime_impact="NO"
review_required="NO"
declare -a reasons=()

mark_backend() {
  backend_build="YES"
  reasons+=("backend:$1")
}

mark_worker() {
  worker_build="YES"
  reasons+=("worker:$1")
}

mark_frontend() {
  frontend_build="YES"
  reasons+=("frontend:$1")
}

mark_unknown() {
  backend_build="YES"
  worker_build="YES"
  frontend_build="YES"
  unknown_runtime_impact="YES"
  review_required="YES"
  reasons+=("review_required:$1")
}

for path in "${changed_files[@]}"; do
  case "$path" in
    apps/whatsapp-agent/prisma/schema.prisma)
      mark_backend "$path"
      mark_worker "$path"
      migration_review="YES"
      ;;
    apps/whatsapp-agent/prisma/migrations/*)
      migration_review="YES"
      reasons+=("migration_review:$path")
      ;;
    apps/whatsapp-agent/src/*|apps/whatsapp-agent/src/**/*)
      mark_backend "$path"
      mark_worker "$path"
      ;;
    apps/whatsapp-agent/package.json|apps/whatsapp-agent/package-lock.json|apps/whatsapp-agent/tsconfig.json|apps/whatsapp-agent/tsconfig.*.json|apps/whatsapp-agent/ecosystem.config.cjs)
      mark_backend "$path"
      ;;
    apps/whatsapp-web-worker/src/*|apps/whatsapp-web-worker/src/**/*|apps/whatsapp-web-worker/package.json|apps/whatsapp-web-worker/package-lock.json|apps/whatsapp-web-worker/tsconfig.json|apps/whatsapp-web-worker/tsconfig.*.json)
      mark_worker "$path"
      ;;
    src/*|src/**/*|public/*|public/**/*|next.config.*|postcss.config.*|tailwind.config.*|components.json)
      mark_frontend "$path"
      ;;
    package.json|package-lock.json|tsconfig.json|tsconfig.*.json)
      mark_backend "$path"
      mark_worker "$path"
      mark_frontend "$path"
      ;;
    apps/whatsapp-agent/scripts/*|apps/whatsapp-agent/scripts/**/*|scripts/*|scripts/**/*|.github/*|.github/**/*|docs/*|docs/**/*|README.md|*.md)
      reasons+=("no_runtime:$path")
      ;;
    .env.example|*.example|*.sample)
      reasons+=("config_template_review:$path")
      ;;
    "")
      ;;
    *)
      mark_unknown "$path"
      ;;
  esac
done

backend_reload="$backend_build"
worker_reload="$worker_build"
frontend_reload="$frontend_build"

echo "CHANGED_FILES:"
if [[ ${#changed_files[@]} -eq 0 ]]; then
  echo "  NONE"
else
  printf '  %s\n' "${changed_files[@]}"
fi
echo
echo "BACKEND_BUILD: $backend_build"
echo "WORKER_BUILD: $worker_build"
echo "FRONTEND_BUILD: $frontend_build"
echo "BACKEND_RELOAD: $backend_reload"
echo "WORKER_RELOAD: $worker_reload"
echo "FRONTEND_RELOAD: $frontend_reload"
echo "MIGRATION_REVIEW: $migration_review"
echo "UNKNOWN_RUNTIME_IMPACT: $unknown_runtime_impact"
echo "REVIEW_REQUIRED: $review_required"
echo "REASON:"
if [[ ${#reasons[@]} -eq 0 ]]; then
  echo "  none"
else
  printf '  %s\n' "${reasons[@]}"
fi

if [[ "$review_required" == "YES" ]]; then
  exit 2
fi
