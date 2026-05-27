# Arquitetura Multi-Mode - Fase 0

Objetivo desta fase: introduzir feature flags por tenant sem alterar o
comportamento atual de producao. Nenhum endpoint passa a bloquear modulo nesta
fase.

## Modelo Client

Modelo atual relevante:

- `Client.id`: identificador tenant-scoped.
- `Client.clientKey`: chave operacional usada por rotas, runtime JSON/hybrid,
  campanhas e scripts.
- `Client.name`: nome comercial do tenant.
- `Client.status`: controla tenant ativo/inativo.
- `Client.adminToken`: token tecnico legado/operacional.
- `Client.features`: JSON opcional adicionado nesta fase para flags futuras.

Relacionamentos atuais reutilizaveis:

- `users`
- `departments`
- `queues`
- `campaigns`
- `templates`
- `templateRequests`
- `slaConfig`
- `retentionConfig`
- `conversationMetrics`
- `metaConfig`
- `chatbotFlows`

## Helper de features

Arquivo:

- `apps/whatsapp-agent/src/features/clientFeatures.ts`

Contrato:

```ts
getFeatures(client)
```

Defaults:

```ts
{
  departments: true,
  sla: true,
  reports: true,
  campaigns: true,
  chatbot: true
}
```

Regra de seguranca:

- tenant antigo com `features = null` continua com todos os modulos ativos;
- valores ausentes ou invalidos usam default `true`;
- nesta fase o helper nao deve ser usado para bloquear endpoints.

## RBAC atual

Autenticacao do `/app`:

- `requireClientAuth(req, res)`
- token carrega `userId`, `clientId`, `role`, `email`, `name`.

Roles:

- `AGENT`
- `SUPERVISOR`
- `ADMIN`

Escopo por departamento:

- `loadAppDepartmentAccess(...)`
- agentes/supervisores podem ter acesso limitado ao proprio departamento.
- ADMIN tem visao tenant-wide.

Console interno `/admin`:

- usa autenticacao tecnica/superadmin/tenant admin.
- continua separado de `/app`.

## Endpoints criticos por modulo

### Departments

`/app`:

- `GET /app/departments`
- `POST /app/departments`
- `PATCH /app/departments/:id`

`/admin`:

- `GET /admin/departments`
- `POST /admin/departments`
- `PATCH /admin/departments/:id`
- rotinas de saneamento/merge de setores.

Dependencias:

- `Department`
- `Queue`
- `User.departmentId`
- `Conversation.departmentId`
- `ConversationRuntimeState.departmentId`

### SLA

Backend:

- `SLAConfig`
- `conversationMetrics.ts`
- eventos `sla.first_response_breached` e `sla.resolution_breached`

Consumo:

- relatorios do `/app`;
- relatorios do `/admin`.

### Reports

`/app`:

- `GET /app/reports/conversations`
- `GET /app/reports/conversations/export`

`/admin`:

- `GET /admin/reports/conversations`
- `GET /admin/reports/conversations/export`

Dependencias:

- `ConversationMetrics`
- `SLAConfig`
- `Department`
- estado operacional das conversas.

### Campaigns

`/app`:

- `GET /app/campaigns`
- `GET /app/campaigns/:id`
- `POST /app/campaigns`
- `POST /app/campaigns/:id/run`

`/admin`:

- rotas equivalentes de campanhas por tenant.

Dependencias:

- `Campaign`
- `Template`
- `TemplateRequest`
- `OutboundMessage`
- `Event` para fallback/detalhes de seed.

### Chatbot

`/app`:

- `GET /app/chatbot/flows`
- `POST /app/chatbot/flows`
- `PATCH /app/chatbot/flows/:id`
- `GET/PUT /app/chatbot/settings`

`/admin`:

- rotas de flows/settings por tenant.

Runtime:

- `ChatbotFlow`
- `ConversationRuntimeState.chatbotNodeId`
- `ConversationRuntimeState.chatbotActive`
- executor em `chatbotFlow.ts`
- webhook carrega flow ativo e executa handoff/text/menu.

## Onde adicionar flags com menor impacto

Fase 0:

- apenas schema + helper;
- sem uso em endpoints;
- sem mudanca de UI;
- sem comportamento novo em producao.

Fase 1 segura:

1. Expor `features` no console interno somente para leitura/edicao controlada.
2. Mostrar avisos de modulo desativado no `/app`, sem bloquear backend ainda.
3. Adicionar testes de `getFeatures`.

Fase 2:

1. Aplicar bloqueios backend em pontos de entrada dos modulos.
2. Manter endpoints criticos internos/admin com permissao operacional.
3. Logs estruturados para `feature.disabled`.

Ordem recomendada de bloqueio futuro:

1. `chatbot`: bloqueio de criacao/edicao e execucao automatica.
2. `campaigns`: bloqueio de criacao/execucao, mantendo leitura historica.
3. `reports`: bloqueio UI/API de relatorios.
4. `sla`: bloquear calculos/avisos futuros, preservando metricas ja gravadas.
5. `departments`: ultimo modulo a bloquear, pois afeta RBAC, usuarios, filas e
   inbox.

## Riscos conhecidos

- `departments` e o inbox sao acoplados por RBAC e roteamento operacional.
- `sla` aparece em relatorios e metricas; desligar sem criterio pode confundir
  dashboards.
- `chatbot` tem efeitos no webhook; flag futura precisa impedir execucao sem
  quebrar handoff humano.
- `campaigns` cria outbound e pode inserir conversas no funil operacional.

## Veredito da Fase 0

Pode entrar em producao com risco baixo porque:

- `features` e nullable;
- nenhum endpoint passa a consultar flags;
- `getFeatures` retorna todos os modulos ativos por default;
- tenants antigos continuam com o comportamento atual.
