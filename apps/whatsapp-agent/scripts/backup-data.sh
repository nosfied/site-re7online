#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${APP_DIR}/.data"
BACKUP_DIR="${APP_DIR}/.backups"
KEEP=20
DO_RELOAD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)
      KEEP="$2"
      shift 2
      ;;
    --dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --reload)
      DO_RELOAD=true
      shift 1
      ;;
    *)
      echo "Uso: $0 [--keep N] [--dir path] [--reload]" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$DATA_DIR" ]]; then
  echo "FAIL: .data não encontrado em ${DATA_DIR}" >&2
  exit 1
fi

if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [[ "$KEEP" -lt 1 ]]; then
  echo "FAIL: --keep deve ser inteiro >= 1" >&2
  exit 1
fi

if $DO_RELOAD; then
  if command -v pm2 >/dev/null 2>&1; then
    pm2 reload re7-whatsapp-agent --update-env >/dev/null
  else
    echo "WARN: pm2 não encontrado; ignorando --reload" >&2
  fi
fi

mkdir -p "$BACKUP_DIR"

TMP_DIR=$(mktemp -d "${BACKUP_DIR}/.tmp.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

copied_any=false

copy_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cp -a "$file" "$TMP_DIR/"
    copied_any=true
  else
    echo "WARN: arquivo ausente: $file" >&2
  fi
}

copy_file "$DATA_DIR/whatsapp-events.json"
copy_file "$DATA_DIR/conversations.json"

if ! $copied_any; then
  echo "FAIL: nenhum arquivo encontrado para backup" >&2
  exit 1
fi

TS=$(date -u +%Y%m%d-%H%M%SZ)
GIT_HASH=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")

manifest="$TMP_DIR/manifest.json"
{
  echo "{"
  echo "  \"timestamp\": \"${TS}\","
  echo "  \"git\": \"${GIT_HASH}\","
  echo "  \"files\": ["
  first=true
  for f in "$TMP_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    size=$(stat -c%s "$f" 2>/dev/null || wc -c <"$f")
    sha=$(sha256sum "$f" | awk '{print $1}')
    name=$(basename "$f")
    if ! $first; then
      echo "    ,"
    fi
    first=false
    echo "    { \"name\": \"${name}\", \"size\": ${size}, \"sha256\": \"${sha}\" }"
  done
  echo "  ]"
  echo "}"
} > "$manifest"

final_name="whatsapp-agent-data-${TS}.tar.gz"
final_path="$BACKUP_DIR/$final_name"
final_tmp="$final_path.tmp"

tar -czf "$final_tmp" -C "$TMP_DIR" .
mv -f "$final_tmp" "$final_path"

rm -rf "$TMP_DIR"
trap - EXIT

# rotation
mapfile -t backups < <(ls -1 "$BACKUP_DIR"/whatsapp-agent-data-*.tar.gz 2>/dev/null | sort)
count=${#backups[@]}
if (( count > KEEP )); then
  remove_count=$((count - KEEP))
  for ((i=0; i<remove_count; i++)); do
    rm -f "${backups[$i]}"
  done
fi

size=$(du -h "$final_path" | awk '{print $1}')
remaining=$(ls -1 "$BACKUP_DIR"/whatsapp-agent-data-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')

echo "Backup criado: ${final_name} (${size})"
echo "Mantidos: ${remaining} (keep=${KEEP})"
