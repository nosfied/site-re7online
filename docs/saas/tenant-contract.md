# Tenant Contract (Frontend + Ops)

Este documento define o contrato atual de tenant para frontend e operação SaaS do `whatsapp-agent`.

## Identidade do aplicativo Meta

Cada tenant mantém sua identidade Meta em `TenantMetaConfig`. O App ID canônico é
`rawPayload.appId`; `rawPayload.applicationId` é somente compatibilidade legada.
Token, WABA, número e App ID são resolvidos no mesmo escopo e não autorizam outro
tenant.

A escrita exige proveniência `embedded_signup`, comparação otimista e preservação do
payload. Repetir o mesmo valor é idempotente; substituir por valor divergente é
conflito. A auditoria registra ator, proveniência e resultado sem o App ID completo.

## Campos de tenant (fonte legada de migração)

Para WhatsApp Meta, estes campos são materializados em
`TenantOperationalConfig.config.baseConfig`; o JSON abaixo não é autoridade de
runtime e só pode ser consumido por backfill autenticado.

```json
{
  "id": "re7online",
  "name": "Re7Online",
  "metaPhoneNumberId": "1018032104719713",
  "allowlist": ["558494786787"],
  "handoffAttendantWaid": "558499049614",
  "defaultLanguage": "pt_BR",
  "templates": {
    "manualHandoff": "re7_atendente_manual_v1"
  },
  "quotaMonthlyConversations": 1000,
  "quotaWarnAtPct": 0.8,
  "quotaBlockedReplyText": "Atingimos ({used}/{limit}) no periodo {period}.",
  "quotaExcludeWaIds": ["558499049614", "558494786787"]
}
```

### Campos de quota

- `quotaMonthlyConversations` (number): limite mensal de conversas.
- `quotaWarnAtPct` (number 0..1): limiar de alerta.
- `quotaBlockedReplyText` (string, opcional): texto enviado quando hard cap bloqueia conversa nova.
- `quotaExcludeWaIds` (string[], opcional): números excluídos da quota.
  - Não consomem `quota.used`.
  - Não sofrem bloqueio por hard cap.
  - Normalização: somente dígitos (`replace(/\D/g, "")`).

### Placeholders suportados em `quotaBlockedReplyText`

- `{tenantName}`
- `{period}` (YYYY-MM UTC)
- `{used}`
- `{limit}`
- `{attendantWaidMasked}`

## Definição formal de `quota.used` (summary)

- Período: mês calendário UTC atual.
- Base: `COUNT(DISTINCT waId)` de inbound no mês para o `clientId`.
- Exclusão: `waId` presente em `quotaExcludeWaIds` do tenant não entra no `used`.
- Fórmula aplicada no summary:
  - `usedAdjusted = max(0, usedAll - excludedUsedForClient)`

## Exemplo de update por tenant

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

## Exemplo de resposta (`GET /admin/tenants/summary?range=24h`)

```json
{
  "ok": true,
  "range": "24h",
  "tenants": [
    {
      "tenantId": "re7online",
      "clientKey": "re7online",
      "name": "Re7Online",
      "counts": {
        "inbound": { "received": 12 },
        "outbound": { "sent_text": 9, "sent_template": 2, "failed": 0 }
      },
      "lastMessageAt": "2026-03-04T01:24:02.222Z",
      "quota": {
        "period": "2026-03",
        "limit": 200,
        "used": 6,
        "pct": 0.03,
        "warnAtPct": 0.8,
        "warning": false
      }
    }
  ]
}
```
