#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" )

now_iso=$(date -Is)
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "(no git)")
head_short=$(git rev-parse --short HEAD 2>/dev/null || echo "(no git)")
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

echo "== Status @ ${now_iso} =="
echo "Repo: ${repo_root}"
echo "HEAD: ${head_short} (dirty=${dirty})"

echo "== PM2 =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 status re7-whatsapp-agent 2>/dev/null | sed -n '1,6p' || echo "PM2: processo não encontrado"
else
  echo "PM2: não encontrado"
fi

echo "== Health =="
health_url="http://127.0.0.1:3001/health"
health_out=$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 2 "$health_url" 2>/dev/null || true)
if [[ -n "$health_out" ]]; then
  echo "${health_url} -> ${health_out}"
else
  echo "Health: indisponível"
fi

echo "== Metrics (1h) =="
metrics_url="http://127.0.0.1:3001/admin/metrics?range=1h"
if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "ADMIN_TOKEN ausente no .env; métricas indisponíveis"
else
  metrics_json=$(curl -sS "$metrics_url" -H "X-Admin-Token: ${ADMIN_TOKEN}" 2>/dev/null || true)
  if [[ -z "$metrics_json" ]]; then
    echo "Métricas: indisponível"
  else
    printf '%s' "$metrics_json" | node -e "const fs=require('fs');const s=fs.readFileSync(0,'utf8');let d;try{d=JSON.parse(s)}catch(e){console.log('Métricas: JSON inválido');process.exit(0)};const get=(p)=>p.split('.').reduce((a,c)=>a&&a[c],d);const out={inbound:get('counts.inbound.received'),sent_text:get('counts.outbound.sent_text'),sent_template:get('counts.outbound.sent_template'),blocked_window_closed:get('counts.outbound.blocked_window_closed'),lead_requested:get('lead.requested'),lead_captured:get('lead.captured'),lead_template_sent:get('lead.template_sent'),delivery_rate:get('kpis.delivery_rate'),template_rate:get('kpis.template_rate'),blocked_rate:get('kpis.blocked_rate')};console.log(JSON.stringify(out,null,2));"
  fi
fi

echo "== Storage (.data) =="
if [[ -d ".data" ]]; then
  du -sh .data
  ls -lah .data | tail -n 10
else
  echo "(no .data)"
fi

echo "== Disk =="
df -h .
