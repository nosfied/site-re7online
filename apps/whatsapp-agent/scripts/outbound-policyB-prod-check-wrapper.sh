#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
RID="${RID:-$(date +%s)$RANDOM}"
PAST_TS="${PAST_TS:-$(date -d '48 hours ago' +%s)}"
INTENT="pricing"
TARGET_WAID=""
RANGE="1h"
CLIENT_KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)
      TARGET_WAID="$2"
      shift 2
      ;;
    --intent)
      INTENT="$2"
      shift 2
      ;;
    --range)
      RANGE="$2"
      shift 2
      ;;
    --client-key)
      CLIENT_KEY="$2"
      shift 2
      ;;
    *)
      echo "Uso: $0 --to <waId> [--intent pricing] [--range 1h|24h|7d|30d] [--client-key <clientKey>]" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erro: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PHONE_NUMBER_ID=$(grep -E '^WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Erro: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi
if [[ -z "$META_APP_SECRET" ]]; then
  echo "Erro: META_APP_SECRET ausente no .env" >&2
  exit 1
fi
if [[ -z "$PHONE_NUMBER_ID" ]]; then
  echo "Erro: WHATSAPP_PHONE_NUMBER_ID ausente no .env" >&2
  exit 1
fi

if [[ -z "$CLIENT_KEY" ]]; then
  TENANTS_FILE="${APP_DIR}/.data/tenants.json"
  if [[ -f "$TENANTS_FILE" && -x "$(command -v jq)" ]]; then
    CLIENT_KEY="$(
      jq -r --arg phone "$PHONE_NUMBER_ID" '
        to_entries[]
        | select((.value.metaPhoneNumberId // "") == $phone)
        | .key
      ' "$TENANTS_FILE" 2>/dev/null | head -n1
    )"
  fi
fi

if [[ -z "$CLIENT_KEY" ]]; then
  CLIENT_KEY=$(grep -E '^CLIENT_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi

if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: --to <waId> é obrigatório" >&2
  exit 2
fi
TARGET_WAID="${TARGET_WAID//[^0-9]/}"
if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: waId inválido" >&2
  exit 2
fi

wait_ready() {
  local timeout_s=12
  local start_ts
  start_ts=$(date +%s)
  while true; do
    local code="000"
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 1 "${BASE_URL}/health" 2>/dev/null || true)
    if [[ "$code" =~ ^2 ]]; then
      return 0
    fi
    if (( $(date +%s) - start_ts >= timeout_s )); then
      echo "FAIL: server not ready at ${BASE_URL} (health code=${code})" >&2
      return 1
    fi
    sleep 0.2
  done
}

post_webhook() {
  local payload="$1"
  local signature
  signature=$(printf "%s" "$payload" | META_APP_SECRET="$META_APP_SECRET" node -e "const crypto=require('crypto');const fs=require('fs');const secret=process.env.META_APP_SECRET;const body=fs.readFileSync(0);process.stdout.write('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));" )
  curl -s -i -H "Content-Type: application/json" -H "X-Hub-Signature-256: ${signature}" \
    -d "$payload" "${BASE_URL}/webhook" >/dev/null
}

metrics_json() {
  local url="${BASE_URL}/admin/metrics?range=${RANGE}"
  if [[ -n "$CLIENT_KEY" ]]; then
    url="${url}&clientKey=${CLIENT_KEY}"
  fi
  curl -sS "$url" -H "X-Admin-Token: ${ADMIN_TOKEN}"
}

metrics_count() {
  local field="$1"
  local payload
  payload="$(metrics_json)"

  # valida JSON e ok:true (falha com mensagem clara)
  if ! printf '%s' "$payload" | node -e "
    const fs=require('fs');
    const s=fs.readFileSync(0,'utf8');
    let data;
    try { data=JSON.parse(s); } catch(e) { process.exit(2); }
    if (!data || data.ok !== true) process.exit(1);
  " >/dev/null 2>&1; then
    echo "FAIL: /admin/metrics retornou erro, unauthorized ou JSON inválido" >&2
    echo "Dica: verifique ADMIN_TOKEN e header X-Admin-Token" >&2
    exit 1
  fi

  printf '%s' "$payload" | node -e "
    const fs=require('fs');
    const data=JSON.parse(fs.readFileSync(0,'utf8'));
    const path='${field}'.split('.');
    let v=data;
    for (const p of path) v = v?.[p];
    process.stdout.write(String(v ?? 0));
  "
}

messages_json() {
  local url="${BASE_URL}/admin/messages?waId=${TARGET_WAID}&status=SENT&type=TEMPLATE&limit=50&order=desc"
  if [[ -n "$CLIENT_KEY" ]]; then
    url="${url}&clientKey=${CLIENT_KEY}"
  fi
  curl -sS "$url" -H "X-Admin-Token: ${ADMIN_TOKEN}"
}

messages_confirm_template() {
  local payload
  payload="$(messages_json)"
  printf '%s' "$payload" | node -e "
    const fs=require('fs');
    const data=JSON.parse(fs.readFileSync(0,'utf8'));
    const rid='wamid.policyb.${RID}';
    const ok=Array.isArray(data.items) && data.items.some((item)=>
      item &&
      item.direction==='OUTBOUND' &&
      item.type==='TEMPLATE' &&
      item.status==='SENT' &&
      item.messageId===rid
    );
    process.stdout.write(ok ? '1' : '0');
  "
}

logs_confirm_template() {
  if pm2 logs 0 --lines 4000 --nostream 2>/dev/null | rg -q "\"event\":\"outbound\\.template\\.sent\".*\"rid\":\"wamid\\.policyb\\.${RID}\""; then
    printf '1'
  else
    printf '0'
  fi
}

echo "== Policy B prod check (RID=${RID}, clientKey=${CLIENT_KEY:-<empty>}) =="
wait_ready

before_template=$(metrics_count "counts.outbound.sent_template")
before_lead_template=$(metrics_count "lead.template_sent")

payload_inbound=$(
  cat <<JSON
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "${RID}",
      "changes": [
        {
          "value": {
            "metadata": {
              "phone_number_id": "${PHONE_NUMBER_ID}"
            },
            "messages": [
              {
                "id": "wamid.policyb.${RID}",
                "from": "${TARGET_WAID}",
                "timestamp": "${PAST_TS}",
                "type": "text",
                "text": { "body": "quero orçamento ${INTENT}" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
JSON
)

post_webhook "$payload_inbound"

messages_hit=0
logs_hit=0
for _ in 1 2 3 4 5; do
  messages_hit=$(messages_confirm_template)
  if [[ "$messages_hit" -eq 1 ]]; then
    break
  fi
  logs_hit=$(logs_confirm_template)
  if [[ "$logs_hit" -eq 1 ]]; then
    break
  fi
  sleep 1
done

if [[ "$messages_hit" -ne 1 && "$logs_hit" -ne 1 ]]; then
  echo "FAIL: nem /admin/messages nem os logs confirmaram outbound.template.sent para o RID=${RID}" >&2
  exit 1
fi

after_template=$(metrics_count "counts.outbound.sent_template")
after_lead_template=$(metrics_count "lead.template_sent")
if [[ "$after_template" -le "$before_template" ]]; then
  echo "WARN: sent_template não incrementou (before=${before_template}, after=${after_template})" >&2
fi
if [[ "$after_lead_template" -le "$before_lead_template" ]]; then
  echo "WARN: lead.template_sent não incrementou (before=${before_lead_template}, after=${after_lead_template})" >&2
fi

echo "OK: Policy B (window closed) -> template confirmado por evidência forte (messages/logs)"
