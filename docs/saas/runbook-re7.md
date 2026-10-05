# Runbook Re7

## b9/V4 — retorno de 05/10/2026

[Registro efetivo e limites](../reviews/automation-freeform-window-release-af26/HYBRID_B9_V4_RETURN_2026-10-05.md): b9 não foi liberado ao tráfego. API 879/worker mínimo af26 restaurados, frontend af26 preservado; guarda aberta geração 27, cron/boot/saved/fallback e barreira restaurados. Pacote consumido não pode ser reexecutado. O helper permanece nos bytes d7 autorizados. O comparador de captura exige inventário exato, que mudou durante recuperação de sessões; a conclusão assistida preservou originais e obteve captura atual estável sob a mesma identidade antes do gate root. Antes de outra janela, ensaiar renovação explícita dessa captura, identidade sem depender de R/S e captura privada de stderr das ações root. Não confundir protocolo unfence (saved/fallback) com retirada nft, nem retorno assistido com recuperação automática. Sem bypass, novo start para testar ou restore produtivo.

## Janela af26 de 02/10/2026 — retorno compatível

A tentativa de troca af26 **não implantou o candidato**. O registro sanitizado da contenção, do bloqueio por prova expirada, do retorno `return-partial` e do estado final está em [WINDOW_RETURN_2026-10-02.md](../reviews/automation-freeform-window-release-af26/WINDOW_RETURN_2026-10-02.md). API b66, worker mínimo b66 e frontend ba66 permaneceram como releases efetivas ao encerramento. Guarda, cron e supervisão voltaram ao estado inicial; Inbox e CRM foram conferidos pelo owner.

**Gate para a próxima janela:** corrigir no pacote auditado a identidade de processo baseada em PID/tempo de início (estado Linux `R/S` é transitório) e permitir nova prova expirada por nonce/arquivo novo, sem sobrescrever ou apagar provas anteriores. O reparo de emergência foi restrito ao verificador privado de retorno; não torna o procedimento original de switch apto a nova tentativa. Reconfirmar executor único, releases, tarefas, backup fresco e restauração isolada. Não reutilizar certificados ou marcadores desta janela e não usar espera arbitrária como prova de drain.

A [correção local dos quatro modos](../reviews/automation-freeform-window-release-af26/OPERATIONAL_PROTOCOL_FIX_2026-10-02.md) passou ensaio com relógio controlado e permanece **NOT DEPLOYED**. O procedimento da próxima janela deve usar a versão revisada de `OWNER-STEPS.txt`: cada `record` exige o nonce novo da requisição atual; prova expirada gera arquivo novo após reconferir as pré-condições. Se já existir `stop-start` ou `start-intent`, não renovar a ação para repeti-la; escolher o retorno parcial compatível e comprovar novamente a barreira de saída. O lock de janela serializa comandos no host, mas não substitui confirmação de topologia e executor único. A leitura produtiva agregada da janela anterior não prova ausência de resultados externos incertos.

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

- `usedAll = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId` com `allowlistHit=true`.
- `usedExcluded = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId` com `allowlistHit=true` onde `waId` esta na uniao de `quotaExcludeWaIds` dos tenants conhecidos.
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
