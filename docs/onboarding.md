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

### Estado conectado valido

Considere um tenant realmente conectado somente quando todos os pontos abaixo
estiverem coerentes:

- `Client` existe e esta ativo.
- `TenantMetaConfig.businessToken` esta presente quando o tenant usa
  credenciais proprias.
- `TenantMetaConfig.phoneNumberId` aponta para o `phoneNumberId` correto.
- `tenants.json -> metaPhoneNumberId` aponta para o mesmo `phoneNumberId`.
- `WaPhoneNumber.phoneNumberId` existe e esta mapeado para o `Client` do tenant.
- `TenantMetaConfig.wabaId` aponta para a WABA correta quando o numero pertence
  a uma WABA conhecida.
- O `displayPhoneNumber` exibido no console bate com o
  `display_phone_number` retornado pela Graph API para o `phoneNumberId`.
- A WABA esta inscrita no app Meta usado pelo Converta (`subscribed_apps`).
- O webhook WhatsApp publico recebe evento real e grava inbound no inbox.

Nao trate apenas o status visual verde no Business Manager como prova de
inbound operacional. O numero pode estar registrado na Cloud API e ainda assim
nao entregar mensagens ao Converta se a WABA nao estiver inscrita no app ou se
o app/token nao tiver acesso ao ativo correto.

### Meta tenant readiness

Use o readiness somente leitura antes de diagnosticar ou liberar um tenant:

```bash
cd apps/whatsapp-agent
npm run meta:readiness -- --tenant <tenant-key>
```

Estados:

- `OK`: `Client` ativo, `TenantMetaConfig` com token e `phoneNumberId`, e
  `WaPhoneNumber` correspondente ao mesmo tenant.
- `PARTIAL`: token e/ou telefone existem, mas a conexao ainda esta incompleta,
  por exemplo sem WABA confirmada localmente. Pode nao impedir outbound, mas
  exige validacao operacional.
- `WARN`: estado valido com aspecto a revisar, como `businessId` ausente,
  `businessPortfolioId` ausente, `ChannelAccount` WhatsApp inexistente ou
  fallback legado disponivel.
- `WAITING_EXTERNAL`: etapa depende da Meta ou de validacao externa que nao
  esta persistida de forma deterministica no banco.
- `FAIL`: tenant inexistente/inativo, token ausente, `phoneNumberId` ausente,
  `WaPhoneNumber` ausente, ownership cruzado ou configuracao estruturalmente
  inconsistente.

O readiness nao chama Graph API, nao valida subscription WABA em tempo real, nao
mostra token, telefone completo, `rawPayload`, `bodyText` ou IDs externos crus.
`businessId` e `businessPortfolioId` sao metadata recomendada, mas ausencia
deles nao e `FAIL` por si so para WhatsApp no modelo atual.

Para WhatsApp, `ChannelAccount` nao e requisito no modelo atual. A identidade
tecnica principal e `TenantMetaConfig` + `WaPhoneNumber`.

### Troca de numero conectado

Quando um tenant troca de numero, WABA ou Business Portfolio:

1) Ative o modo de troca no console.
2) Informe o novo `phoneNumberId`.
3) Informe o `WABA ID` correto quando conhecido.
4) Use `Processar conexao` ou `Vincular numero conectado`.
5) Confira se a UI atualizou o telefone exibido para o numero novo.
6) Registre o numero na Cloud API quando a Meta mostrar o estado pendente.
7) Valide a inscricao da WABA no app.
8) Envie mensagem real para confirmar inbox.

Se a nova conexao nao retornar WABA ID, a rotina limpa WABA/business antigos da
configuracao local para evitar falso conectado. Nesse caso, preencha o WABA ID
manual conhecido antes de validar o inbound.

Ao trocar de numero, nunca reaproveite como evidencia operacional:

- phoneNumberId antigo;
- WABA antiga;
- displayPhoneNumber antigo;
- status antigo de BM compartilhado;
- mensagem antiga no inbox.

O criterio final e uma mensagem nova recebida pelo endpoint `/webhook` e
persistida no tenant correto.

### Partial bind

Reconheca como partial bind qualquer estado em que parte da identidade Meta foi
persistida, mas o onboarding ainda nao fechou todos os pontos operacionais.
Exemplos:

- token salvo com `phoneNumberId`, mas sem WABA confirmada;
- WABA conhecida, mas subscription nao comprovada;
- onboarding interrompido apos code exchange;
- display name ou revisao externa pendente na Meta;
- metadata de Business/Portfolio ainda incompleta.

Procedimento:

1) Nao repetir Embedded Signup indiscriminadamente.
2) Nao editar banco manualmente.
3) Nao mover numero entre tenants sem diagnostico de ownership.
4) Rodar `npm run meta:readiness -- --tenant <tenant-key>`.
5) Validar no painel Meta se o numero, WABA e app pertencem ao mesmo contexto.
6) Identificar a etapa que falhou: code exchange, enrich, phone mapping, WABA
   subscription ou registro Cloud API.
7) Corrigir pelo console interno ou procedimento oficialmente suportado.

### Recuperacao / rebinding emergencial

Este e um procedimento excepcional de recuperacao operacional, nao uma
funcionalidade normal de troca de numero entre tenants.

Antes de qualquer acao:

- registrar estado anterior de forma sanitizada;
- identificar o tenant atual do `WaPhoneNumber`;
- confirmar `TenantMetaConfig` do tenant alvo;
- confirmar WABA/phone no painel Meta;
- verificar conflito de ownership;
- obter autorizacao explicita;
- garantir que nao ha cross-tenant acidental;
- validar readiness depois da recuperacao.

Nao documente nem repita manobras pontuais como padrao de produto. O caminho
normal e onboarding pelo console, vinculo manual suportado ou recuperacao
operacional revisada.

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
- O console tenta inscrever a WABA no app automaticamente quando existe WABA ID
  e token com permissao. Se falhar, o numero pode parecer conectado no BM, mas
  mensagens inbound nao chegam ao inbox.
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

Ao concluir, confirme que o App ID aparece como configurado para esse tenant. O valor
não é exibido novamente. A regularização manual exige superadmin, confirmação de
proveniência `embedded_signup` e nunca substitui um App ID divergente.

O backend:
- troca o `code` com a Meta;
- salva credenciais em `TenantMetaConfig`;
- tenta resolver `phoneNumberId`, `WABA ID`, `Business ID` e `Business Portfolio ID`;
- atualiza `tenants.json -> metaPhoneNumberId`;
- cria/atualiza o mapeamento `WaPhoneNumber -> Client`.
- preserva o `rawPayload` anterior e registra o App ID do aplicativo do fluxo.

Não copie App ID entre tenants com proveniência diferente. Em topologia multi-tenant,
o fallback global permanece desabilitado salvo declaração operacional explícita de
aplicativo único ou compartilhado.

Importante:
- Esse caminho é o correto para número do cliente.
- O tenant passa a usar credenciais próprias quando `businessToken` e `phoneNumberId` estiverem salvos.
- Se a conexão vier parcial, o console mostra aviso para preencher `WABA ID`/dados faltantes.
- Se o numero foi movido de uma WABA para outra, confirme que o token novo
  enxerga a WABA nova e o `phoneNumberId` novo. Tokens antigos podem continuar
  validos para outros ativos, mas nao necessariamente para o numero recadastrado.

### Registro Cloud API do numero

Quando a Meta exibir:

> Registre este numero de telefone usando a API de registro ou entre em contato
> com seu parceiro para registrar o numero de telefone.

Use o bloco `Registrar numero na Cloud API` no console interno.

Regras:

- O tenant precisa ter `phoneNumberId` e token Meta salvos.
- O `phoneNumberId` informado deve bater com o `phoneNumberId` configurado no
  tenant.
- O PIN enviado para `/register` e o PIN de verificacao em duas etapas da Cloud
  API do numero, nao o codigo SMS de posse do numero.
- O codigo SMS pode aparecer durante o Embedded Signup ou verificacao de posse
  do numero, mas ele nao substitui o PIN usado pela API `/register`.
- Se o numero acabou de ser transferido entre WABAs/BMs, aguarde a Meta refletir
  a transferencia e confirme que o token atual acessa o novo ativo.
- Apos registrar, confira `display_phone_number`,
  `code_verification_status=VERIFIED`, `account_mode=LIVE` e
  `quality_rating`.
- Apos registrar, valide tambem `/{WABA_ID}/subscribed_apps`; sem essa inscricao
  a Cloud API pode estar verde, mas o Converta nao recebe inbound.

Erros comuns:

- `Meta rejected phone registration`: PIN incorreto, numero ainda nao elegivel
  para Cloud API, token sem acesso ao phoneNumberId, ou estado Meta ainda
  pendente apos transferencia.
- `A conta nao existe na API de Nuvem`: o numero ainda nao foi registrado na
  Cloud API; use `/register` com o `phoneNumberId` correto e PIN correto.
- Conexao parcial sem WABA ID: preencha WABA ID manualmente e reprocesse/vincule
  para evitar manter WABA antiga.

### Validacao operacional apos onboarding

Checklist minimo antes de liberar o tenant:

1) Health:
```bash
curl -sS https://converta.re7online.com/agent-api/health
```

2) Confirmar dados salvos no console:
- `phoneNumberId`;
- `WABA ID`;
- telefone exibido;
- status da conexao;
- token armazenado quando o tenant usa credenciais proprias.

3) Confirmar subscription da WABA no app pela Graph API:
```bash
GET /<WABA_ID>/subscribed_apps
```

Esperado: lista contendo o app Meta do Converta.

4) Enviar uma mensagem WhatsApp real para o numero do tenant.

5) Conferir logs sem expor PII:
```bash
pm2 logs re7-whatsapp-agent --lines 300 --nostream \
  | grep -E "webhook.signature.valid|webhook.received|webhook.change.received|webhook.inbound|webhook.message.discarded"
```

6) Conferir inbox:
- conversa aparece no tenant correto;
- telefone/contato exibido esta coerente;
- mensagens novas entram em tempo real;
- nao ha `webhook.message.discarded` por `missing_phone_number_id`.

Se nao aparecer `webhook.received`, a Meta nao entregou o evento ao Converta.
Revise callback, campo `messages`, subscription da WABA e permissao do app/token.
Se aparecer `webhook.received`, mas a conversa nao entra no inbox, audite
`metadata.phone_number_id`, mapeamento `WaPhoneNumber -> Client` e logs de
discard.

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
