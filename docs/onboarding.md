# Onboarding — WhatsApp Agent (10 minutos)

## Setup rápido
1) Clonar o repo e entrar em `apps/whatsapp-agent`.
2) Criar `.env` a partir de `.env.example`.
3) Ajustar variáveis obrigatórias:
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `META_APP_SECRET`
   - `CLIENT_ID`
4) Instalar e buildar:
   - `npm ci`
   - `npm run build`
5) Rodar com PM2:
   - `pm2 start ecosystem.config.cjs --env production`

## Variáveis obrigatórias
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `CLIENT_ID`

## Como configurar um novo cliente
1) Definir `CLIENT_ID` exclusivo.
2) Configurar templates no `.env`:
   - `OUTBOUND_TEMPLATE_DEFAULT_NAME`
   - `OUTBOUND_TEMPLATE_DEFAULT_LANG`
   - (opcional) `OUTBOUND_TEMPLATES_BY_CLIENT_JSON`
3) Separar `.data/` por instância (recomendado 1 instância por cliente).

## Validação (Policy B / fallback)
- Usar o utilitário operacional:
  - `/usr/local/bin/outbound-policyB-prod-check`
- Alternativamente, validar logs:
  - `pm2 logs re7-whatsapp-agent --lines 300 | grep -E "template\.sent|window_closed|needs_template|reply\."`

## Comandos de logs essenciais
- `pm2 logs re7-whatsapp-agent --lines 200`
- `pm2 logs re7-whatsapp-agent --lines 200 | grep -E "handoff|outbound|template|reply"`
