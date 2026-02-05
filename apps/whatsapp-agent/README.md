# WhatsApp Agent (scaffold)

## Objetivo
Serviço base para receber webhooks, rotear mensagens, acoplar IA/KB e armazenar logs.
Nesta fase, não há integração real com WhatsApp.

## Como rodar local
```bash
npm install
npm run dev
```

## Scripts úteis
- `npm run dev` → start local
- `npm run build` → compilar TypeScript
- `npm run start` → rodar build de produção
- `scripts/outbound-policyB-prod-check.sh` → valida Policy B em produção (janela fechada)
  (requer `DISABLE_DEBUG_COMMANDS=false` no `.env` para usar o comando admin de debug).

## Variáveis de ambiente
Veja `.env.example`.
Debug (desativado por padrão): `DISABLE_DEBUG_COMMANDS=true`.

## Echo (fase 2)
- `WHATSAPP_ECHO_ENABLED` (true/false)
- `WHATSAPP_DEFAULT_REPLY` (texto padrão)
- `WHATSAPP_DEDUP_WINDOW_SECONDS` (janela em segundos)
- `WHATSAPP_SANDBOX` (true/false)
- `WHATSAPP_SANDBOX_TO` (número permitido do sandbox)

## Sandbox vs produção
- `WHATSAPP_SANDBOX=true` → respostas via template (ex.: `hello_world`)
- Produção (`WHATSAPP_SANDBOX=false`) → respostas via texto

## Endpoints atuais
- `GET /` → "whatsapp-agent running"
- `GET /health` → `{ ok: true }`

## Como testar (passo a passo)
1) Preencha o `.env` conforme `.env.example`.
2) Rode `npm run dev` e confirme o serviço na porta configurada.
3) Teste saúde:
   - `curl -s http://localhost:3001/health`
4) Configure o webhook no painel da Meta e valide o verify token.
5) Envie mensagem de teste pelo painel:
   - Sandbox (`WHATSAPP_SANDBOX=true`): resposta deve vir via template `hello_world`.
   - Produção (`WHATSAPP_SANDBOX=false`): resposta deve vir via texto (default reply).
