# Admin UI - WhatsApp Agent

## Rotas do frontend

- `/admin/tenants`
- `/admin/tenants/[tenantId]`
- `/admin/tenants/[tenantId]/inbox`
- `/admin/tenants/[tenantId]/campaigns`
- `/admin/tenants/[tenantId]/channels`

## Conexao

- Base URL padrao na VPS: `http://127.0.0.1:3001`
- Token: `X-Admin-Token`
- Persistencia do token: por padrao em `sessionStorage`; habilite \"Lembrar token\" para salvar em `localStorage`.

Obter token na VPS:

```bash
pm2 env 0 | awk -F': ' '/^ADMIN_TOKEN:/{print $2; exit}'
```

## Deploy do frontend admin

O frontend admin e servido pelo processo PM2 `re7-admin-front` e o build roda na raiz do repo na VPS:

```bash
cd /opt/re7online/site-re7online
npm ci
npm run build
pm2 restart re7-admin-front
```

Checks rapidos:

```bash
pm2 list
curl -I http://127.0.0.1:3000
```

## Contrato de quota (resumo)

Desde a Sprint 61, `planName`, `messagesLimit` e `quota*` sao DB-first em
`TenantOperationalConfig.config.planLimits`, com fallback para `tenants.json`.
O console interno continua recebendo e enviando os mesmos campos no contrato
HTTP para preservar a UI existente.

`quota.used` em `/admin/tenants/summary`:

- `range` afeta os counts e `lastMessageAt`, mas `quota` sempre representa o mes UTC corrente.
- mes UTC corrente
- `COUNT(DISTINCT waId)` com `allowlistHit=true`
- menos `quotaExcludeWaIds`

Formula:

- `used = max(0, usedAllAllowlisted - usedExcludedAllowlisted)`

## Semantica de bloqueio (webhook hard cap)

Hard cap so roda quando:

- `allowlistHit=true`
- `quotaMonthlyConversations` eh numero `>= 0`
- waId nao esta em `quotaExcludeWaIds`

Quando waId esta em `quotaExcludeWaIds`:

- nao consome `quota.used`
- nao bloqueia hard cap
- loga evento `quota.excluded`

## Erros esperados no front admin

- `400`: baseUrl invalida ou token ausente
- `401`: token invalido
- `403`: sem permissao
- `5xx`: erro no servidor
- timeout: sem resposta no tempo limite

## Placeholders de `quotaBlockedReplyText`

- `{tenantName}`
- `{period}`
- `{used}`
- `{limit}`
- `{attendantWaidMasked}`

## Checklist rapido

```bash
curl -sS "http://127.0.0.1:3001/admin/tenants/summary?range=24h" -H "X-Admin-Token: $ADMIN_TOKEN" | jq '.tenants[] | {tenantId, quota, lastMessageAt}'
curl -sS "http://127.0.0.1:3001/admin/tenants/re7online" -H "X-Admin-Token: $ADMIN_TOKEN" | jq '.tenant'
```

Na UI:

1. Abrir `/admin/tenants`
2. Informar Base URL e Token
3. Testar conexao (botao usa `GET /admin/health`, esperado `{ \"ok\": true }`)
4. Trocar range e validar `quota/lastMessageAt`
5. Abrir `Edit` e salvar alteracoes do tenant
6. Abrir `Inbox`
7. Abrir `Campanhas`

## Console interno de canais

Rota: `/admin/tenants/:tenantKey/channels`.

Esse console e a fonte tecnica da Re7online para configurar, auditar e dar suporte aos canais de um tenant. Ele deve ser usado para:

- cadastrar `channelAccountId` e aliases;
- conferir IDs tecnicos de Page, Instagram, webhook e Business Login;
- ativar ou desativar flags (`enabled`, `runtimeEnabled`, `inboundPersistenceEnabled`, `outboundEnabled`);
- auditar `tokenStatus` sem expor token;
- preparar novos tenants e validar smokes de canal.

Tokens nunca devem ser exibidos pela API ou pela UI. Campos de token no console servem apenas para substituicao segura; depois de salvo, o valor deve retornar redigido/ausente.

### Instagram

Estado tecnico validado para `re7online`:

- `channelAccountId`: `17841470790766048`
- alias de webhook/message_edit: `17841402386330293`
- `instagramBusinessLoginId`: `26979723628382383`
- `businessLoginUsername`: `re7online`
- `facebookPageId`: `388765477658592`
- `source`: `instagram_business_login`

Enquanto o App Review Meta estiver em andamento, a rota `/app/settings/channels/instagram` continua existindo como fluxo temporario de conexao/demonstracao para review. No console interno ela deve aparecer como `Temporary Meta Review connection flow`.

Depois da aprovacao Meta, o plano e mover o Connect/Reconnect Instagram Business para o console interno `/admin` e ocultar/remover essa rota do `/app`, mantendo o `/app` focado na operacao do cliente.

### Governanca de flags

- WhatsApp: canal operacional principal; alterar flags com cuidado porque afeta runtime de atendimento.
- Messenger/Facebook: human-only por padrao. Manter `aiEnabled`, `automationEnabled` e `handoffEnabled` desligados salvo decisao explicita.
- Instagram: human-only por padrao. Manter IA, automacao e handoff automatico desligados. Outbound manual so deve ficar ligado apos smoke real.
- `outboundEnabled=true` exige token valido e teste de envio manual.
- `tokenStatus=configured` sem token material deve ser tratado como pendencia operacional.

### Processo recomendado para novo tenant

1. Cadastrar `channelAccount`.
2. Conectar/autenticar a conta do canal.
3. Validar token e identidade.
4. Validar webhook/subscription.
5. Testar inbound real.
6. Testar outbound manual, se aplicavel.
7. Ativar flags minimas: `enabled`, `runtimeEnabled`, `inboundPersistenceEnabled`.
8. Ativar `outboundEnabled` somente apos smoke outbound.
9. Manter `aiEnabled`, `handoffEnabled` e `automationEnabled` desligados por padrao em Messenger/Instagram.
10. Registrar validacao segura sem token, texto privado ou IDs sensiveis.
