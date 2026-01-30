# WhatsApp Agent (scaffold)

## Objetivo
Serviço base para receber webhooks, rotear mensagens, acoplar IA/KB e armazenar logs.
Nesta fase, não há integração real com WhatsApp.

## Como rodar local
```bash
npm install
npm run dev
```

## Variáveis de ambiente
Veja `.env.example`.

## Echo (fase 2)
- `WHATSAPP_ECHO_ENABLED` (true/false)
- `WHATSAPP_DEFAULT_REPLY` (texto padrão)
- `WHATSAPP_DEDUP_WINDOW_SECONDS` (janela em segundos)

## Endpoints atuais
- `GET /` → "whatsapp-agent running"
- `GET /health` → `{ ok: true }`
