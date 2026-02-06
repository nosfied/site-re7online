# Smoke Test — Template Fallback (Policy A)

## Passo a passo
1) Garanta `OUTBOUND_TEMPLATE_FALLBACK=true` no `.env` do agente.
2) Dispare um inbound fora da janela (24h fechada).
3) Verifique os logs:

```bash
pm2 logs re7-whatsapp-agent --lines 300 | \
grep -E "template\.sent|window_closed|needs_template|reply\."
```

## Critérios de aceite
- ✅ `outbound.blocked.window_closed`
- ✅ `outbound.needs_template`
- ✅ `outbound.template.sent`
- ❌ Sem `reply.sending` no mesmo requestId
