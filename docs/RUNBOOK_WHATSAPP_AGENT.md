# RUNBOOK OPERACIONAL — WhatsApp Agent

## 1) Visao geral
Runbook operacional consolidado do `apps/whatsapp-agent` para deploy, validacao e operacao em producao.

Fontes usadas neste documento:
- `apps/whatsapp-agent/scripts/deploy-vps.sh`
- `apps/whatsapp-agent/scripts/validate-agent.sh`
- `apps/whatsapp-agent/scripts/smoke-admin.sh`
- `apps/whatsapp-agent/scripts/prod-status.sh`
- `apps/whatsapp-agent/scripts/onboard-tenant.ts`
- `apps/whatsapp-agent/README.md`
- `docs/onboarding.md`
- `docs/saas/go-live-checklist.md`
- `docs/saas/runbook-re7.md`

## 2) Arquitetura resumida
Pipeline operacional atual (webhook):
1. `runFlowExecutor(...)` (pre-demo)
2. `runMidDemoFlowExecutor(...)` (mid-demo)
3. `runPostDemoFlowExecutor(...)` (post-demo/lead)
4. `decideOutboundPolicy(...)` (policy/outbound)

Evidencia: `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`.

## 3) Pre-requisitos
- Repositorio em `/opt/re7online/site-re7online`
- Node + npm instalados
- PM2 instalado e processo do agent ativo
- `.env` configurado em `apps/whatsapp-agent/.env`
- Banco acessivel (`DATABASE_URL`)

## 4) Deploy padrao
Comando canonico (script versionado):

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
bash scripts/deploy-vps.sh
```

O script executa:
1. `git pull --ff-only` (na raiz)
2. `npm ci --include=dev`
3. `npm run db:deploy`
4. `npm run build`
5. `pm2 reload "${PM2_ID:-0}" --update-env` (ou start fallback)
6. `pm2 flush`
7. health check em `http://127.0.0.1:${PORT:-3001}/health`

## 5) Gate obrigatorio pre-deploy
Script oficial:

```bash
bash apps/whatsapp-agent/scripts/validate-agent.sh
```

Ordem interna do gate:
1. build (`npm --prefix apps/whatsapp-agent run build`)
2. `quote-site-smoke.sh`
3. `e2e-demo.sh`
4. `e2e-lead-pricing.sh`

## 6) Variaveis necessarias do gate
Obrigatorias:

```bash
export WAID_DEMO=<waid_homologado_demo>
export WAID_LEAD=<waid_homologado_lead>
```

Opcionais:

```bash
export TENANT=re7online
export RANGE=1h
```

Regras do gate:
- Falha se `WAID_DEMO` ou `WAID_LEAD` nao forem definidos.
- Falha se `WAID_DEMO == WAID_LEAD`.

## 7) Checks pos-deploy
Checks minimos:

```bash
# health publico (readiness operacional)
curl -sS http://127.0.0.1:3001/health

# status operacional
cd /opt/re7online/site-re7online/apps/whatsapp-agent
bash scripts/prod-status.sh

# smoke admin
bash scripts/smoke-admin.sh <WAID>

# gate completo (quando aplicavel)
cd /opt/re7online/site-re7online
bash apps/whatsapp-agent/scripts/validate-agent.sh
```

## 8) Diagnostico rapido
1. PM2

```bash
pm2 status
pm2 logs re7-whatsapp-agent --lines 200
```

2. Health e admin health

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:3001/admin/health -H "X-Admin-Token: $ADMIN_TOKEN"
```

3. Metricas/messages tenant-scoped

```bash
curl -sS "http://127.0.0.1:3001/admin/metrics?range=1h&clientKey=re7online" \
  -H "X-Admin-Token: $ADMIN_TOKEN"

curl -sS "http://127.0.0.1:3001/admin/messages?waId=<WAID>&limit=20&clientKey=re7online" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

## 9) Rollback
Rollback minimo e seguro:
1. voltar para commit/tag anterior na VPS
2. rebuild
3. reload do processo
4. revalidar `/health` e smoke admin

Exemplo:

```bash
cd /opt/re7online/site-re7online
git log --oneline -n 10
# git checkout <commit_anterior>

cd apps/whatsapp-agent
npm ci --include=dev
npm run db:deploy
npm run build
pm2 reload 0 --update-env
curl -sS http://127.0.0.1:3001/health
```

## 10) Onboarding de tenant
Fluxo recomendado via script:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
./scripts/onboard-tenant.ts \
  --tenant <tenantId> \
  --name "<Nome Cliente>" \
  --client-key <clientKey> \
  --allowlist <waid1,waid2> \
  --handoff-attendant-waid <waid_atendente> \
  --manual-handoff-template <template_aprovado>
```

O script usa `ADMIN_TOKEN` e `DATABASE_URL` do `.env` e atualiza tenant config + client no DB.

## 11) WAIDs homologados
Padrao operacional do gate:
- `WAID_DEMO`: waId homologado para cenario demo E2E
- `WAID_LEAD`: waId homologado para cenario lead E2E

Observacoes com evidencia no repo:
- O gate exige ambos e exige que sejam distintos (`validate-agent.sh`).
- Exemplos recorrentes de operacao/smoke usam `558494786787` em scripts/docs.
- O waId de atendente no exemplo de producao aparece como `5584999049614` no README.

## 12) Evidencias minimas de go-live
Antes de liberar tenant:
- Tenant configurado e acessivel via admin
- Mapeamento `WaPhoneNumber -> Client` estavel apos reload
- `tenant.resolved` correto nos inbounds
- Policy B validada no tenant correto
- Evidencia forte em `/admin/messages` (outbound esperado com `requestId`/`metaMessageId`)
- Sem contaminacao de estado entre tenants

Referencia: `docs/saas/go-live-checklist.md`.
