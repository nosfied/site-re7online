# Fase 2.1 — Echo outbound (WhatsApp Cloud API)

## Variáveis de ambiente
Preencha no `.env` local ou no painel da Vercel:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION` (ex.: `v24.0`)
- `WHATSAPP_ALLOWLIST` (números separados por vírgula)

## Onde obter os dados
No painel da Meta:
- **Phone Number ID**: WhatsApp > API Setup
- **Access Token**: WhatsApp > API Setup (token temporário ou permanente)

## Como testar
1) Suba o serviço:
   ```bash
   npm run dev
   ```
2) No painel da Meta, use **Teste/Enviar para servidor**.
3) Envie uma mensagem de texto.
4) Esperado: resposta automática com **Echo: <texto>**.

## Logs esperados
- `webhook: message from ***123456`
- `webhook: text "Olá"`
- `outbound: sending echo to ***123456`
- `outbound: success` (ou `outbound: failed`)

## Observações
- Apenas mensagens de texto geram resposta.
- Apenas números na allowlist recebem outbound.
- Sempre retorna 200 para a Meta.
