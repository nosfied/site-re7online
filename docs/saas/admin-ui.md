# Admin UI - WhatsApp Agent

## Rotas do frontend

- `/admin/tenants`
- `/admin/tenants/[tenantId]`
- `/admin/tenants/[tenantId]/inbox`
- `/admin/tenants/[tenantId]/campaigns`

## Conexao

- Base URL padrao na VPS: `http://127.0.0.1:3001`
- Token: `X-Admin-Token`
- Persistencia do token: por padrao em `sessionStorage`; habilite \"Lembrar token\" para salvar em `localStorage`.

Obter token na VPS:

```bash
pm2 env 0 | awk -F': ' '/^ADMIN_TOKEN:/{print $2; exit}'
```

## Deploy do frontend admin

O frontend admin e servido pelo processo PM2 `re7-admin-front` e o build roda na raiz do repo na VPS:

```bash
cd /opt/re7online/site-re7online
npm ci
npm run build
pm2 restart re7-admin-front
```

Checks rapidos:

```bash
pm2 list
curl -I http://127.0.0.1:3000
```

## Contrato de quota (resumo)

`quota.used` em `/admin/tenants/summary`:

- `range` afeta os counts e `lastMessageAt`, mas `quota` sempre representa o mes UTC corrente.
- mes UTC corrente
- `COUNT(DISTINCT waId)` com `allowlistHit=true`
- menos `quotaExcludeWaIds`

Formula:

- `used = max(0, usedAllAllowlisted - usedExcludedAllowlisted)`

## Semantica de bloqueio (webhook hard cap)

Hard cap so roda quando:

- `allowlistHit=true`
- `quotaMonthlyConversations` eh numero `>= 0`
- waId nao esta em `quotaExcludeWaIds`

Quando waId esta em `quotaExcludeWaIds`:

- nao consome `quota.used`
- nao bloqueia hard cap
- loga evento `quota.excluded`

## Erros esperados no front admin

- `400`: baseUrl invalida ou token ausente
- `401`: token invalido
- `403`: sem permissao
- `5xx`: erro no servidor
- timeout: sem resposta no tempo limite

## Placeholders de `quotaBlockedReplyText`

- `{tenantName}`
- `{period}`
- `{used}`
- `{limit}`
- `{attendantWaidMasked}`

## Checklist rapido

```bash
curl -sS "http://127.0.0.1:3001/admin/tenants/summary?range=24h" -H "X-Admin-Token: $ADMIN_TOKEN" | jq '.tenants[] | {tenantId, quota, lastMessageAt}'
curl -sS "http://127.0.0.1:3001/admin/tenants/re7online" -H "X-Admin-Token: $ADMIN_TOKEN" | jq '.tenant'
```

Na UI:

1. Abrir `/admin/tenants`
2. Informar Base URL e Token
3. Testar conexao (botao usa `GET /admin/health`, esperado `{ \"ok\": true }`)
4. Trocar range e validar `quota/lastMessageAt`
5. Abrir `Edit` e salvar alteracoes do tenant
6. Abrir `Inbox`
7. Abrir `Campanhas`
