# Policy C — Prod check

## Objetivo
Validar envio de mensagem **text** quando a janela 24h está aberta.

## Comando
```bash
bash apps/whatsapp-agent/scripts/outbound-policyC-prod-check.sh
```

## Logs esperados
- `outbound.text.sending`
- `outbound.text.sent`

## Observações
- O script usa um inbound com timestamp atual, logo a janela fica aberta.
- Em caso de falha, verifique `outbound.text.failed` no log do PM2.
