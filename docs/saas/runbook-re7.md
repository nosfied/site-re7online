# Runbook Re7

## Rotacao de token

Rotacione o token administrativo de um tenant somente com `ADMIN_TOKEN` (superadmin). O endpoint resolve o tenant pelo `clientKey` no path e nunca usa `X-Client-Key`.

Exemplo:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
export ADMIN_TOKEN="$(rg --no-line-number '^ADMIN_TOKEN=' .env | tail -n1 | sed -E 's/^ADMIN_TOKEN=\"?([^\"]+)\"?/\1/')"

curl -sS -X POST "http://127.0.0.1:3001/admin/clients/re7online/rotate-token" \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq
```

Guarde o `adminToken` retornado em local seguro. O token antigo deixa de ser valido imediatamente.

## API Contract (Quota + Summary)

Este bloco consolida o contrato operacional para frontend e operacao SaaS do `whatsapp-agent`.

### 1) TenantConfig via `PUT /admin/tenants/:tenantId`

Campos de quota suportados por tenant:

- `quotaMonthlyConversations`: `number` (`>= 0`)
- `quotaWarnAtPct`: `number` (`0..1`)
- `quotaBlockedReplyText`: `string` nao vazia
- `quotaExcludeWaIds`: `string[]` (somente digitos)

Placeholders em `quotaBlockedReplyText`:

- `{tenantName}`
- `{period}`
- `{used}`
- `{limit}`
- `{attendantWaidMasked}`

Semantica de `quotaExcludeWaIds`:

- waIds nessa lista **nao consomem** quota mensal (`used`).
- waIds nessa lista **nao sofrem** hard cap (nao bloqueia).
- Eventos desses waIds logam `quota.excluded` (waId mascarado).

Exemplo de update:

```bash
curl -sS -X PUT "http://127.0.0.1:3001/admin/tenants/re7online" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  --data-binary '{
    "quotaMonthlyConversations": 200,
    "quotaWarnAtPct": 0.8,
    "quotaBlockedReplyText": "Plano em limite ({used}/{limit}) no periodo {period}.",
    "quotaExcludeWaIds": ["558499049614", "558494786787"]
  }'
```

### 2) `GET /admin/tenants/summary?range=1h|24h|7d|30d`

Resposta inclui `quota` por tenant:

```json
{
  "quota": {
    "period": "2026-03",
    "limit": 200,
    "used": 6,
    "pct": 0.03,
    "warnAtPct": 0.8,
    "warning": false
  }
}
```

Regra de calculo de `quota.used` (mes UTC):

- `usedAll = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId`.
- `usedExcluded = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId` onde `waId` esta na uniao de `quotaExcludeWaIds` dos tenants conhecidos.
- `used = max(0, usedAll - usedExcluded)`.

### 3) Checklist Front dev

Endpoints por role:

- **Superadmin (`ADMIN_TOKEN`)**
  - `GET /admin/tenants`
  - `GET /admin/tenants/:tenantId`
  - `PUT /admin/tenants/:tenantId`
  - `GET /admin/tenants/summary`
  - `GET /admin/messages?clientKey=...`
- **Tenant admin (`Client.adminToken`)**
  - tenant-scoped (`/admin/messages`, `/admin/metrics`, etc.)
  - rotas globais (`/admin/tenants`, `/admin/clients`) retornam `403`

Recomendacoes de dashboard:

- Listar tenants com:
  - `tenantId`, `clientKey`, `name`
  - `counts.inbound.received`
  - `counts.outbound.sent_text`, `sent_template`, `failed`
  - `lastMessageAt`
  - `quota.{period,limit,used,pct,warnAtPct,warning}`
- Sempre enviar `clientKey` em endpoints tenant-scoped no front/admin tooling.
