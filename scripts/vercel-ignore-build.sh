#!/usr/bin/env bash
set -euo pipefail

# Vercel Ignored Build Step.
#
# Exit 0 = skip deployment build.
# Exit 1 = continue deployment build.
#
# The public Vercel project builds the repository root Next.js app. Keep this
# path list conservative: if a file can affect the Next artifact, build.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

base="${1:-}"
head="${2:-HEAD}"

if [[ -z "$base" ]]; then
  if git rev-parse --verify --quiet HEAD^ >/dev/null; then
    base="HEAD^"
  else
    echo "Vercel ignore: no parent commit available; build."
    exit 1
  fi
fi

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || {
  echo "Vercel ignore: invalid base commit $base; build."
  exit 1
}

git rev-parse --verify --quiet "$head^{commit}" >/dev/null || {
  echo "Vercel ignore: invalid head commit $head; build."
  exit 1
}

mapfile -t changed_files < <(git diff --name-only "$base" "$head")

if [[ ${#changed_files[@]} -eq 0 ]]; then
  echo "Vercel ignore: no changed files; skip."
  exit 0
fi

vercel_relevant=0
declare -a relevant_reasons=()
declare -a ignored_reasons=()

mark_relevant() {
  vercel_relevant=1
  relevant_reasons+=("$1")
}

mark_ignored() {
  ignored_reasons+=("$1")
}

for path in "${changed_files[@]}"; do
  case "$path" in
    src/*|src/**/*)
      mark_relevant "next-root:$path"
      ;;
    public/*|public/**/*)
      mark_relevant "public-asset:$path"
      ;;
    package.json|package-lock.json|next.config.*|postcss.config.*|tailwind.config.*|tsconfig.json|tsconfig.*.json|components.json)
      mark_relevant "root-build-config:$path"
      ;;
    vercel.json|vercel.ts|scripts/vercel-ignore-build.sh|scripts/test-vercel-ignore-build.sh)
      mark_relevant "vercel-build-control:$path"
      ;;
    apps/whatsapp-agent/*|apps/whatsapp-agent/**/*)
      mark_ignored "vps-backend:$path"
      ;;
    apps/whatsapp-web-worker/*|apps/whatsapp-web-worker/**/*)
      mark_ignored "vps-web-session-worker:$path"
      ;;
    docs/*|docs/**/*|README.md|*.md)
      mark_ignored "docs-only:$path"
      ;;
    scripts/*|scripts/**/*)
      mark_ignored "ops-script:$path"
      ;;
    .github/*|.github/**/*)
      mark_ignored "ci-only:$path"
      ;;
    .codex-recovery/*|.codex-recovery/**/*|codex-recovery/*|codex-recovery/**/*|tmp/*|tmp/**/*)
      mark_ignored "local-recovery-or-temp:$path"
      ;;
    .env.example|*.example|*.sample)
      mark_ignored "template-only:$path"
      ;;
    *)
      mark_relevant "unknown-conservative:$path"
      ;;
  esac
done

echo "Vercel ignore: changed files:"
printf '  %s\n' "${changed_files[@]}"

if [[ "$vercel_relevant" -eq 1 ]]; then
  echo "Vercel ignore: build required."
  printf '  %s\n' "${relevant_reasons[@]}"
  exit 1
fi

echo "Vercel ignore: no Vercel-relevant changes; skip build."
if [[ ${#ignored_reasons[@]} -gt 0 ]]; then
  printf '  %s\n' "${ignored_reasons[@]}"
fi
exit 0
