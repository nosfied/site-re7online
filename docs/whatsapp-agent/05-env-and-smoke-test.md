# Fase 2.1 — ENV + Smoke Test

## Variáveis de ambiente
Preencher no `.env` local ou no painel do deploy:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION` (default `v24.0`)
- `WHATSAPP_ALLOWLIST` (CSV com números E.164 ou IDs)

## Onde pegar no painel da Meta
No painel: **Conectar no WhatsApp → Configuração da API**

- **PHONE_NUMBER_ID**
- **ACCESS_TOKEN**

## Reiniciar após editar .env
Após mudar `.env`, reinicie o serviço:
```bash
npm run dev
```

## Smoke tests

### Health
```bash
curl http://localhost:3001/health
```

### Debug env (somente dev)
```bash
curl http://localhost:3001/debug/env
```

### Verify token (GET)
```bash
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123"
```

### Envio pelo painel da Meta
1) Use **Etapa 2 → Enviar mensagem**.
2) Envie uma mensagem de texto.
3) Esperado: resposta `Echo: <texto>`.

## Logs esperados
- `webhook: message from ***123456`
- `outbound: sending echo to ***123456`
- `outbound: success`
