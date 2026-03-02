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
