# WhatsApp Agent (scaffold)

## Objetivo
Serviço base para receber webhooks, rotear mensagens, acoplar IA/KB e armazenar logs.
Nesta fase, não há integração real com WhatsApp.

## Como rodar local
```bash
npm install
npm run dev
```

## Scripts úteis
- `npm run dev` → start local
- `npm run build` → compilar TypeScript
- `npm run start` → rodar build de produção
- `scripts/outbound-policyB-prod-check-wrapper.sh` → valida Policy B em produção (janela fechada)
  (não depende de comandos debug; usa webhook assinado).
Observação: em produção existe um utilitário operacional em `/usr/local/bin/outbound-policyB-prod-check`.
- `npm run db:migrate` → cria migrations (dev)
- `npm run db:deploy` → aplica migrations (prod)
- `npm run db:generate` → gera client Prisma
- `npm run db:seed` → cria client default e mapeia phone_number_id

## Variáveis de ambiente
Veja `.env.example`.
Debug (desativado por padrão): `DISABLE_DEBUG_COMMANDS=true`.
Feature flag (fallback automático fora da janela): `OUTBOUND_TEMPLATE_FALLBACK=true|false`.
DB: `DATABASE_URL` e `ADMIN_TOKEN`.

## Echo (fase 2)
- `WHATSAPP_ECHO_ENABLED` (true/false)
- `WHATSAPP_DEFAULT_REPLY` (texto padrão)
- `WHATSAPP_DEDUP_WINDOW_SECONDS` (janela em segundos)
- `WHATSAPP_SANDBOX` (true/false)
- `WHATSAPP_SANDBOX_TO` (número permitido do sandbox)

## Sandbox vs produção
- `WHATSAPP_SANDBOX=true` → respostas via template (ex.: `hello_world`)
- Produção (`WHATSAPP_SANDBOX=false`) → respostas via texto

## Policy A (fallback automático fora da janela)
Quando `OUTBOUND_TEMPLATE_FALLBACK=true`, o agente envia **template** automaticamente
ao detectar janela 24h fechada (sem enviar texto livre).
Quando `OUTBOUND_TEMPLATE_FALLBACK=false`, apenas loga `outbound.needs_template`.

## Banco de dados (Postgres + Prisma)
Setup local rápido (Docker opcional):
```bash
npm install --include=dev
npm run db:generate
npm run db:migrate
```

Produção:
```bash
npm run db:deploy
```

## Endpoints admin
Autenticação via `ADMIN_TOKEN` (header `X-Admin-Token: <token>`).
Para atualizar o utilitário de produção:
```bash
sudo install -m 0755 apps/whatsapp-agent/scripts/outbound-policyB-prod-check-wrapper.sh /usr/local/bin/outbound-policyB-prod-check
```
- `GET /admin/health`
- `GET /admin/clients`
- `POST /admin/clients` (body: `{ clientKey, name, phone_number_id }`)
- `POST /admin/clients/:id/rotate-token`
- `GET /admin/status`
- `GET /admin/templates`
- `GET /admin/messages?waId=...&limit=50`
- `GET /admin/metrics?range=24h|7d`

Comportamento idempotente do `POST /admin/clients`:
- Se `clientKey` já existir e `phone_number_id` já estiver vinculado ao mesmo client: retorna 200.
- Se `phone_number_id` estiver vinculado a outro client: retorna 409.
- Se criar client e/ou vínculo: retorna 201.

Exemplos (curl):
```bash
curl -s -X POST http://localhost:3001/admin/clients \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientKey":"default","name":"Default","phone_number_id":"1018032104719713"}'

curl -s http://localhost:3001/admin/clients \
  -H "X-Admin-Token: $ADMIN_TOKEN"

curl -s http://localhost:3001/admin/status \
  -H "X-Admin-Token: $ADMIN_TOKEN"

curl -s http://localhost:3001/admin/templates \
  -H "X-Admin-Token: $ADMIN_TOKEN"

curl -s "http://localhost:3001/admin/messages?waId=558494786787&limit=20" \
  -H "X-Admin-Token: $ADMIN_TOKEN"

curl -s "http://localhost:3001/admin/metrics?range=24h" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

## Endpoints atuais
- `GET /` → "whatsapp-agent running"
- `GET /health` → `{ ok: true }`

## Teste local do webhook (assinatura)
O endpoint `/webhook` exige assinatura `X-Hub-Signature-256` mesmo em dev. Para testar:

Script (recomendado):
```bash
META_APP_SECRET=seu_segredo WEBHOOK_URL=http://localhost:3002/webhook npm run dev:webhook
```

Testes com allowlist (ajuste `WHATSAPP_ALLOWLIST` no `.env`):
```bash
# dentro da allowlist
META_APP_SECRET=seu_segredo npm run dev:webhook:allow

# fora da allowlist
META_APP_SECRET=seu_segredo npm run dev:webhook:block
```

Overrides por CLI:
```bash
META_APP_SECRET=seu_segredo node scripts/send-signed-webhook.mjs \\
  --from 5511999999999 \\
  --text \"mensagem de teste\" \\
  --phone-number-id 1018032104719713
```

Com payload de arquivo:
```bash
META_APP_SECRET=seu_segredo WEBHOOK_URL=http://localhost:3002/webhook npm run dev:webhook:file
```

Exemplo com curl + openssl:
```bash
RAW='{"object":"whatsapp_business_account","entry":[{"id":"entry-1","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"1018032104719713"},"messages":[{"id":"wamid.dev.curl","from":"5511999999999","timestamp":"1700000000","type":"text","text":{"body":"teste webhook"}}]}}]}]}'
SIG=$(printf '%s' "$RAW" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | awk '{print $2}')
curl -s -X POST http://localhost:3002/webhook \\
  -H "Content-Type: application/json" \\
  -H "X-Hub-Signature-256: sha256=$SIG" \\
  -d "$RAW"
```

Observação: se `WHATSAPP_ALLOWLIST` estiver ativo e o `from` não estiver permitido, o status será `ignored`.

## Como testar (passo a passo)
1) Preencha o `.env` conforme `.env.example`.
2) Rode `npm run dev` e confirme o serviço na porta configurada.
3) Teste saúde:
   - `curl -s http://localhost:3001/health`
4) Configure o webhook no painel da Meta e valide o verify token.
5) Envie mensagem de teste pelo painel:
   - Sandbox (`WHATSAPP_SANDBOX=true`): resposta deve vir via template `hello_world`.
   - Produção (`WHATSAPP_SANDBOX=false`): resposta deve vir via texto (default reply).

## Smoke Admin (com wait-for-health)
Após restart do PM2:
```bash
pm2 restart re7-whatsapp-agent --update-env
./scripts/wait-for-http.sh http://127.0.0.1:3001/admin/health
```

Depois:
```bash
curl -s http://127.0.0.1:3001/admin/status -H "X-Admin-Token: $ADMIN_TOKEN"
curl -s http://127.0.0.1:3001/admin/templates -H "X-Admin-Token: $ADMIN_TOKEN"
curl -s "http://127.0.0.1:3001/admin/metrics?range=24h" -H "X-Admin-Token: $ADMIN_TOKEN"
curl -s "http://127.0.0.1:3001/admin/messages?waId=558494786787&limit=20" -H "X-Admin-Token: $ADMIN_TOKEN"
```

Smoke automático:
```bash
PORT=3001 ./scripts/smoke-admin.sh 558494786787
```
Readiness usa `/health` público.

## E2E Lead Pricing
```bash
./scripts/e2e-lead-pricing.sh 558494786787
```
Funciona com `DISABLE_DEBUG_COMMANDS=true` e usa o wrapper versionado no repo.

## Operação em Produção (Runbook)
Path: `/opt/re7online/site-re7online/apps/whatsapp-agent`  
PM2: `re7-whatsapp-agent` (porta 3001)

Health check:
```bash
curl -s http://127.0.0.1:3001/health
```

PM2 status e logs:
```bash
pm2 status
pm2 logs re7-whatsapp-agent --lines 200
pm2 flush
```

Deploy padrão:
```bash
cd /opt/re7online/site-re7online
git pull --ff-only
cd apps/whatsapp-agent
npm ci --include=dev
npm run build
pm2 reload re7-whatsapp-agent --update-env
```

ADMIN_TOKEN (sem imprimir o valor):
```bash
ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' .env | head -n1 | cut -d= -f2-)
export ADMIN_TOKEN
```

Consultar métricas:
```bash
curl -s "http://127.0.0.1:3001/admin/metrics?range=1h" -H "X-Admin-Token: $ADMIN_TOKEN"
```

Smoke prod (Policy B wrapper + E2E):
```bash
./scripts/outbound-policyB-prod-check-wrapper.sh --to 558494786787 --intent pricing --range 1h
./scripts/e2e-lead-pricing.sh 558494786787 --range 1h
```

Status completo:
```bash
./scripts/prod-status.sh
```

Backup:
```bash
./scripts/backup-data.sh --keep 20
```
Recomendações: rodar antes de deploys e após incidentes. Os backups ficam em `.backups/` e não são versionados.

Diagnóstico rápido do storage:
```bash
ls -lah .data
du -h .data
pm2 flush
pm2 logs re7-whatsapp-agent --lines 200 | grep -E "ENOENT|rename|whatsapp-events"
```
