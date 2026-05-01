# Onboarding — WhatsApp Agent (10 minutos)

Documento canonical: `/docs/onboarding.md` (raiz do repo).

Regra de ouro:
```bash
git rev-parse --show-toplevel
```
`/apps/whatsapp-agent/` **não** é a raiz do repositório.

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
   - `npm install --include=dev`
   - `npm run build`
5) Rodar com PM2:
   - `pm2 start ecosystem.config.cjs --env production`

## Variáveis obrigatórias
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `CLIENT_ID`

## Templates (default e fallback)
- `OUTBOUND_TEMPLATE_DEFAULT_NAME` / `OUTBOUND_TEMPLATE_DEFAULT_LANG` → template principal.
- `OUTBOUND_TEMPLATE_FALLBACK_NAME` / `OUTBOUND_TEMPLATE_FALLBACK_LANG` → plano B recomendado (ex.: `hello_world` / `en_US`).
- Exemplo:
  - `OUTBOUND_TEMPLATE_DEFAULT_NAME=re7_pricing_v1`
  - `OUTBOUND_TEMPLATE_DEFAULT_LANG=pt_BR`
  - `OUTBOUND_TEMPLATE_FALLBACK_NAME=hello_world`
  - `OUTBOUND_TEMPLATE_FALLBACK_LANG=en_US`

## Como configurar um novo cliente
1) Definir `CLIENT_ID` exclusivo.
2) Configurar templates no `.env`:
   - `OUTBOUND_TEMPLATE_DEFAULT_NAME`
   - `OUTBOUND_TEMPLATE_DEFAULT_LANG`
   - (opcional) `OUTBOUND_TEMPLATES_BY_CLIENT_JSON`
3) Separar `.data/` por instância (recomendado 1 instância por cliente).

## Onboarding pelo console interno

O console interno suporta dois caminhos de ativação do WhatsApp por tenant.

### Cenário A — número/WABA já está no portfólio da Re7/Reset

Use quando o número já aparece como conectado no nosso Business Portfolio/WABA e o token global da operação tem acesso a esse `phoneNumberId`.

Fluxo:
1) Abrir `/admin/tenants`.
2) Abrir o tenant desejado.
3) Entrar em `Conexao Meta e onboarding`.
4) Informar:
   - `phoneNumberId` obrigatório;
   - `Telefone exibido`, se disponível;
   - `WABA ID do tenant`, se conhecido;
   - `Business ID` e `Business Portfolio ID`, se disponíveis.
5) Clicar em `Vincular numero conectado`.

O backend grava:
- `TenantMetaConfig.phoneNumberId`;
- `tenants.json -> metaPhoneNumberId`;
- mapeamento `WaPhoneNumber -> Client`.

Importante:
- Não há troca de `code`.
- Não salva token próprio do tenant.
- O envio outbound usa o token global/env da operação.
- Só funciona se o token global tiver permissão sobre o número informado.
- A WABA precisa estar inscrita no app para entregar webhooks. Se `subscribed_apps`
  estiver vazio, inscreva a WABA no app antes de validar inbound.
- Novos tenants nascem com automação desligada; ative somente depois de criar o
  fluxo configurável ou definir outra política de atendimento.
- No bootstrap operacional, apenas `Atendimento Geral` fica ativo por padrão.
  Setores modelo como `Saúde`, `Educação` e `Assistência Social` são criados
  inativos e podem ser ativados depois pelo admin do tenant, quando fizer sentido.

### Cenário B — número/WABA pertence ao portfólio do cliente

Use quando o cliente precisa conectar o próprio Business Portfolio/WABA e autorizar a aplicação via Embedded Signup.

Fluxo:
1) Abrir `/admin/tenants`.
2) Abrir o tenant desejado.
3) Entrar em `Conexao Meta e onboarding`.
4) Clicar em `Iniciar conexao`.
5) Concluir o Embedded Signup da Meta.
6) Confirmar que o campo `Code` foi capturado.
7) Clicar em `Processar conexao`.

O backend:
- troca o `code` com a Meta;
- salva credenciais em `TenantMetaConfig`;
- tenta resolver `phoneNumberId`, `WABA ID`, `Business ID` e `Business Portfolio ID`;
- atualiza `tenants.json -> metaPhoneNumberId`;
- cria/atualiza o mapeamento `WaPhoneNumber -> Client`.

Importante:
- Esse caminho é o correto para número do cliente.
- O tenant passa a usar credenciais próprias quando `businessToken` e `phoneNumberId` estiverem salvos.
- Se a conexão vier parcial, o console mostra aviso para preencher `WABA ID`/dados faltantes.

## Onboarding via script
Caminho oficial para criar tenant novo (DB + `tenants.json`) sem editar arquivo manualmente:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
./scripts/onboard-tenant.ts \
  --tenant cliente-demo \
  --name "Cliente Demo" \
  --client-key cliente-demo \
  --allowlist 558494786787 \
  --handoff-attendant-waid 558499049614 \
  --manual-handoff-template re7_atendente_manual_v1 \
  --first-user-name "Operador Demo" \
  --first-user-email "operador@cliente-demo.com" \
  --first-user-role AGENT
```

Observações:
- usa `ADMIN_TOKEN` e `DATABASE_URL` do `.env`
- cria/atualiza `Client` no DB
- gera `adminToken` quando necessário
- atualiza `tenants.json` via `PUT /admin/tenants/:tenantId`
- cria o primeiro usuario do tenant quando `--first-user-name` e `--first-user-email` sao informados
- preserva backup/atomic write/logs do caminho já validado
- se o tenant já existir, exige `--force`
- `metaPhoneNumberId` só muda com `--force --force-phone-id`

## Validação (Policy B / fallback)
- Usar o utilitário operacional:
  - `/usr/local/bin/outbound-policyB-prod-check`
- Alternativamente, validar logs:
  - `pm2 logs re7-whatsapp-agent --lines 300 | grep -E "template\.sent|window_closed|needs_template|reply\."`

## Production snapshot
- host: re7online-api-01
- app: apps/whatsapp-agent
- pm2: re7-whatsapp-agent (id 0)
- HEAD(prod): 4e73be4
- env:
  - CLIENT_ID=default
  - OUTBOUND_TEMPLATE_FALLBACK=true
  - OUTBOUND_TEMPLATE_DEFAULT_NAME=hello_world
  - OUTBOUND_TEMPLATE_DEFAULT_LANG=en_US
  - OUTBOUND_TEMPLATE_INTENT_MAP_JSON=(vazio)

## Validation commands
- `pm2 env 0 | grep -E "CLIENT_ID|OUTBOUND_TEMPLATE_"`
- `sudo -E /usr/local/bin/outbound-policyB-prod-check --to 558494786787 --intent pricing --range 1h --tenant re7online`
- Atualizar binário:
- `sudo install -m 0755 apps/whatsapp-agent/scripts/outbound-policyB-prod-check-wrapper.sh /usr/local/bin/outbound-policyB-prod-check`
- `REQ="<requestId>" && tail -n 20000 /home/deploy/.pm2/logs/re7-whatsapp-agent-out.log | grep "$REQ"`

## E2E (estabilidade e reset)
- O E2E usa reset local e, quando habilitado, reset via admin debug.
- Para habilitar reset via admin (temporário):
  - `DISABLE_DEBUG_COMMANDS=false`
  - `ALLOW_ADMIN_DEBUG_IN_PROD=true`
  - `pm2 reload 0 --update-env`
- Para desabilitar após testes:
  - `DISABLE_DEBUG_COMMANDS=true`
  - `ALLOW_ADMIN_DEBUG_IN_PROD=false`
  - `pm2 reload 0 --update-env`

## Como confirmar env carregada no PM2
- `pm2 env 0 | grep -E "DISABLE_DEBUG_COMMANDS|ALLOW_ADMIN_DEBUG_IN_PROD|NODE_ENV"`
- Se o `.env` mudou e o PM2 não refletiu:
  - `set -a; source .env; set +a`
  - `pm2 reload 0 --update-env`

## Troubleshooting
- Erro #132001 (template/language inexistente): usar defaults `hello_world` + `en_US`.
- Erro `TS2688: Cannot find type definition file for 'node'` (NODE_ENV=production + omit=dev):
  - `NODE_ENV=development npm ci` ou `npm ci --include=dev`.

## Evidência (requestId real)
```
{"event":"outbound.template.sending","requestId":"d0802cc8-8e8e-4c65-be0c-258e3d56ced7","language":"en_US"}
{"event":"outbound.template.sent","requestId":"d0802cc8-8e8e-4c65-be0c-258e3d56ced7","language":"en_US"}
```

## Onde ficam as docs
- `/docs/onboarding.md`
- `/docs/whatsapp-agent/*` (produto)
- `/docs/whatsapp-agent/ops/*` (operacional)
- `/apps/whatsapp-agent/docs/README.md` (ponteiro)

## Comandos de logs essenciais
- `pm2 logs re7-whatsapp-agent --lines 200`
- `pm2 logs re7-whatsapp-agent --lines 200 | grep -E "handoff|outbound|template|reply"`
