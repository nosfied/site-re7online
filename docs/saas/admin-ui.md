# Admin UI - WhatsApp Agent

## Rotas do frontend

- `/admin/tenants`
- `/admin/tenants/[tenantId]`
- `/admin/tenants/[tenantId]/inbox`
- `/admin/tenants/[tenantId]/campaigns`
- `/admin/tenants/[tenantId]/channels`
- `/admin/tenants/[tenantId]/chatbot`

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

## Chatbot Settings DB-backed

Desde `69bedc38396b8f837a236b0af4a5446397919403`,
`/admin/chatbot/settings` suporta tenants modernos existentes em `Client` mesmo
sem entrada legada em `.data/tenants.json`. A rota usa `Client` para identidade,
`TenantOperationalConfig`/defaults para settings migrados e preserva
`tenants.json` apenas como fallback de compatibilidade.

Validacao CRA-PR em producao:

- settings: `200`;
- resources: 6 departamentos / 6 filas;
- flows: 1;
- `.data/tenants.json`: ausente, sem entrada artificial `cra-pr`.

A pagina `/admin/tenants/:tenantId/chatbot` deve hidratar flows e resources
mesmo quando settings falhar parcialmente. A badge de automacao nao deve
permanecer como "Carregando" apos o fim do loading; quando settings estiver
indisponivel, a UI deve mostrar estado de erro verdadeiro.

## CRA active flow tenant visibility

Auditoria iniciada em 2026-09-15 por relato do owner: o flow ativo de producao
do CRA executa corretamente, mas nao aparece para admins do tenant em
`/app/chatbot`.

Contrato de seguranca: nao recriar, clonar, desativar, reativar, trocar
`entryPoint`, alterar ownership ou mudar `ChatbotFlow.definition` do flow ativo
antes de provar a causa exata.

Achado de codigo atual: `GET /app/chatbot/flows` e
`GET /admin/chatbot/flows?clientKey=cra-pr` listam flows pelo mesmo predicado de
tenant `clientId`; a rota app adiciona gates de feature `chatbot` e papel
ADMIN/SUPERVISOR. Portanto, se o usuario CRA ADMIN estiver autenticado com o
`clientId` correto e feature `chatbot` habilitada, o flow deveria ser retornado.
Evidencia de producao/API ainda precisa ser coletada; a tentativa de SSH em
2026-09-15 falhou por timeout/rede.

## Users Management 2.0

Estado deployed / owner-approved / production non-destructive validated:
`/app/users` lista usuarios ativos e inativos administrativamente, com filtros
`Todos/Ativos/Inativos`, uma linha expansiva por vez e contador de assentos
ativos vindo da mesma fonte do enforcement backend/admin. A regiao de filtros
tem agrupamento visual proprio; cada linha tem header resumido com botao
explicito expandir/recolher em coluna direita fixa e corpo expandido em tom
separado para edicao. O botao Salvar usa estilo primario preenchido.

Contrato de edicao: expandir uma linha inicializa `userDrafts` a partir do
estado persistido em `users`; recolher, trocar para outra linha ou alterar
filtros descarta todos os campos nao salvos. Filtros, visibilidade de linha,
contador e disponibilidade de assentos derivam somente de estado persistido, nao
de draft local. Apenas Save atualiza a lista canonica e entao altera filtros e
contadores.

Desativacao de usuario, 2026-09-14: tentativa de inativar usuario com
atendimentos HUMAN ativos atribuidos deve ser bloqueada por backend com
`user_has_active_conversations`. A UI mostra mensagem acionavel para transferir
ou encerrar os atendimentos antes de continuar, sem marcar o usuario como
inativo localmente, sem alterar filtros e sem reduzir contador de assentos. O
predicado backend usa `ConversationRuntimeState` do mesmo tenant,
`assignedUserId`, `closedAt=null`, `status IN (WAITING, IN_PROGRESS)` e exclui
`mode=BOT`. Status: closed / deployed / owner approved / production
non-destructive validated. A regra de seguranca e backend-authoritative; o frontend apenas
apresenta feedback. A desativacao nunca transfere, encerra, remove atribuicao,
troca fila ou altera lifecycle de conversa silenciosamente.

## Departments Management UX 2.0

Estado deployed / owner-approved / production non-destructive validated:
`/app/settings/departments` usa a
mesma linguagem de linhas expansivas aprovada em Users Management 2.0 e Guided
Builder. Cada setor possui header compacto com resumo persistido e botao
circular explicito expandir/recolher; o corpo expandido usa tom separado e
mantem os controles existentes de nome, status, horario regular, excecoes e
Salvar. O header expansivo compartilhado com Users usa coluna direita fixa para
o controle, permitindo quebra do resumo sem deslocar o botao para baixo.

Contrato de edicao: expandir uma linha inicializa `drafts` a partir do estado
persistido em `departments`; recolher, abrir outro setor ou alterar filtros
descarta alteracoes nao salvas e fecha editores internos de horario/excecao.
Filtros, badges e resumo do header derivam somente do estado persistido. Esta
frente nao altera filas, roteamento, autoassign, capacidade, presenca, Inbox
visibility, RBAC, horarios de runtime, schema ou migracao.

## Padrao compartilhado de linhas expansivas

Guided Builder, Users e Departments usam o padrao administrativo aprovado quando
a tela exige edicao em linha: linha fechada compacta, corpo de detalhe expansivo,
controle circular de expandir/recolher, coluna direita fixa para a acao, conteudo
esquerdo podendo quebrar linha sem derrubar o controle, header distinto do corpo,
uma linha aberta por vez onde aplicavel, recolher/trocar/filtro descartando draft
local nao salvo, e filtros/contadores globais baseados apenas em estado
persistido. Esse padrao nao deve ser aplicado automaticamente a telas sem
justificativa de produto.

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

Para ativacao operacional repetivel de novos tenants privados, usar tambem:

- `docs/saas/PRIVATE_TENANT_ONBOARDING_PLAYBOOK.md`

### Instagram

Estado tecnico validado para `re7online`:

- `channelAccountId`: `17841470790766048`
- alias de webhook/message_edit: `17841402386330293`
- `instagramBusinessLoginId`: `26979723628382383`
- `businessLoginUsername`: `re7online`
- `facebookPageId`: `388765477658592`
- `source`: `instagram_business_login`

Apos a aprovacao Meta de `instagram_business_basic` e `instagram_business_manage_messages`, o Connect/Reconnect Instagram Business deve ser iniciado pelo console interno `/admin/tenants/:tenantKey/channels`.

A rota `/app/settings/channels/instagram` permanece apenas como legacy/fallback temporario para validacao direta e nao deve aparecer no menu do app do cliente. O `/app` deve permanecer focado na operacao: inbox, atendimento, usuarios e relatorios.

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
