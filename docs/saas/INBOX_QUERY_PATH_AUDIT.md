# Sprint 78O.1 - Inbox Read Query Path Audit

Data: 2026-06-27

Escopo: auditoria do caminho de listagem do Inbox apos o laboratorio de carga v1 identificar `inbox-read` como primeiro gargalo real em `20 VUs`.

Esta sprint nao altera codigo, banco, Prisma, SQL, indices, cache, PM2, Nginx, Postgres tuning, infraestrutura ou regra funcional.

## Resumo Executivo

O `inbox-read` degradou em `20 VUs` porque a listagem do Inbox ainda monta uma visao operacional rica em memoria a partir de multiplas fontes, antes de aplicar o `limit` final. O caminho atual e funcionalmente correto e preserva multitenancy/RBAC, mas tem custo que cresce mais rapido que o numero final de itens retornados.

Causa provavel do p95 `2.085 s`:

1. `GET /app/conversations?limit=20` busca ate `limit * 10 + 1`, ou seja, ate 201 conversas por request.
2. Para cada conversa candidata, executa `loadInboxConversationState(...)`, gerando fan-out por conversa.
3. Depois busca leads, inbound, outbound, usuarios, departments, queues, tenant config e features.
4. Calcula unread, last message, filtros, visibilidade, contadores e ordenacao em memoria.
5. So no final aplica `filteredItems.slice(0, limit)`.

Conclusao: o gargalo inicial e do query/payload assembly path do Inbox, nao da VPS global, Search, Public API, autenticacao, sessoes ou RBAC.

## Evidencia Do Laboratorio

Fonte oficial: `docs/saas/LOAD_TEST_RESULTS.md`, Sprint 78N.3 final-final.

| Cenario | Perfil | Resultado |
| --- | --- | --- |
| `health` | `vu20` | PASS, 0% erro |
| `public-api` | `vu20` | PASS, 0% erro |
| `search` | `vu20` | PASS, 0% erro |
| `inbox-read` | `vu20` | funcional, 0% erro HTTP, p95 `2.085,30 ms` |
| `inbox-detail` | `vu20` | interrompido por regra de parada apos `inbox-read` |

O teste que disparou o gargalo faz apenas:

```text
GET /app/conversations?limit=20
```

Arquivo: `load-tests/k6/inbox-read.js`.

## Rota Auditada

Fluxo logico:

```text
/app/inbox
  -> frontend chama API
GET /app/conversations?limit=20
  -> requireClientAuth
  -> getScopedClientById
  -> loadAppDepartmentAccess
  -> buildConversationListPayload
  -> Prisma
  -> PostgreSQL
  -> serializacao JSON
```

Implementacao auditada:

- `apps/whatsapp-agent/src/http/routes.ts:2649` inicia `GET /app/conversations`.
- `apps/whatsapp-agent/src/http/routes.ts:2692` chama `buildConversationListPayload`.
- `apps/whatsapp-agent/src/http/routes.ts:19744` inicia `buildConversationListPayload`.

## Query Path Atual

### 1. Client/Auth/RBAC

O handler:

- valida `clientAuth`;
- carrega client pelo tenant autenticado;
- bloqueia client inativo;
- carrega escopo de departamento do usuario;
- se o usuario exige departamento e nao possui departamento, retorna lista vazia.

Esse caminho preserva multitenancy e RBAC.

### 2. Conversation

`buildConversationListPayload` calcula:

```text
conversationFetchLimit = min(limit * 10 + 1, 1000)
messageFetchLimit = min(conversationFetchLimit * 2, 2000)
```

Para `limit=20`:

```text
conversationFetchLimit = 201
messageFetchLimit = 402
```

Query principal:

- model: `Conversation`;
- filtro: `clientId`, `deletedAt=null`, `anonymizedAt=null`, `lastInboundAt not null`;
- cursor opcional por `updatedAt`, `waIdCanonical`, `waId`;
- order: `updatedAt desc`, `waIdCanonical asc`, `waId asc`;
- take: ate 201;
- select enxuto de campos operacionais.

Indice existente relevante:

- `Conversation(clientId, channel, updatedAt)`;
- `Conversation(clientId, deletedAt)`;
- `Conversation(clientId, waId)`;
- `Conversation(clientId, waIdCanonical)`.

Observacao: a query filtra `deletedAt`, `anonymizedAt` e `lastInboundAt`, mas a ordenacao principal e por `updatedAt`. Nao ha indice composto exatamente para `clientId + deletedAt + anonymizedAt + lastInboundAt + updatedAt`.

### 3. Agrupamento e Cursor

Depois da query:

- agrupa por `waIdCanonical`/`waId`;
- ordena novamente em memoria;
- aplica cursor em memoria;
- define `winners` como todos os candidatos filtrados, ainda antes do `limit` final.

Esse desenho explica por que o trabalho cresce com `conversationFetchLimit`, nao somente com `limit`.

### 4. Lead, Inbound, Outbound

Em paralelo:

- `Lead.findMany` para `waIds/canonicalWaIds`;
- `InboundMessage.findMany` com `take=messageFetchLimit`;
- `OutboundMessage.findMany` com `take=messageFetchLimit`.

Indices existentes relevantes:

- `InboundMessage(clientId, waIdCanonical, createdAt)`;
- `InboundMessage(clientId, channel, provider, channelAccountId, externalUserHash, createdAt)`;
- `OutboundMessage(clientId, waIdCanonical, createdAt)`;
- `OutboundMessage(clientId, channel, provider, channelAccountId, externalUserHash, createdAt)`;
- `Lead(tenantId, waIdCanonical)`.

Ponto de atencao: as queries usam `OR` entre `waIdCanonical in (...)` e `waId in (...)`. Ha indice para `waIdCanonical`, mas nao foi localizado indice equivalente especifico para `InboundMessage(clientId, waId, createdAt)` ou `OutboundMessage(clientId, waId, createdAt)`.

### 5. Runtime State

Trecho critico:

```text
winners.map(...)
  -> loadInboxConversationState(...)
```

`loadInboxConversationState`:

1. tenta `runtimeStorage.getConversation(waId, clientKey)`;
2. se for Webchat e falhar, usa fallback para `ConversationRuntimeState` no banco.

Isso significa:

- ate 201 chamadas de runtime state por request quando `limit=20`;
- em `20 VUs`, pode gerar ate ~4.020 resolucoes de estado em uma janela curta;
- para Webchat, ainda ha caminho de fallback DB quando o storage antigo nao responde.

Classificacao: **N+1 confirmado** no caminho de runtime state da listagem.

### 6. Lookups Operacionais

Apos runtime state:

- busca usuarios atribuidos em lote;
- busca departments/queues em lote;
- carrega read state do usuario;
- carrega tenant config em JSON/DB;
- carrega features do client.

Essas partes sao em lote ou single-query e nao parecem ser o principal N+1.

### 7. Montagem em Memoria

Para cada candidato:

- calcula unread count varrendo inbound messages;
- seleciona lead mais recente;
- seleciona inbound/outbound mais recente;
- extrai status de outbound via `extractMetaStatus(latestOutbound.rawPayload)`;
- calcula `channelOutboundEnabled`;
- monta campos de UI;
- aplica visibilidade;
- aplica filtros;
- calcula `filterCounts`;
- ordena por atividade;
- so entao aplica `slice(0, limit)`.

Ponto de atencao: `OutboundMessage` seleciona `rawPayload` apenas para derivar status de ultima mensagem. Isso pode aumentar payload de DB e custo de serializacao interna mesmo que `rawPayload` nao seja retornado no JSON final.

## Includes / Joins

Nao ha `include` Prisma amplo na query principal. O codigo usa `select` explicito.

O problema nao parece ser `include` excessivo em uma query unica. O custo vem de:

- varias queries por request;
- uma resolucao por conversa candidata;
- processamento em memoria;
- fetch de mensagens potencialmente acima do necessario;
- `rawPayload` em outbound para normalizacao de status.

## Paginacao

Entrada:

```text
limit: 1..100
cursor: opcional
```

Para `limit=20`, a rota busca ate 201 conversas e ate 402 inbound/outbound.

Pontos observados:

- cursor e baseado em `updatedAt` + identidade;
- nao usa `skip` para paginacao principal;
- usa `take`;
- ordenacao acontece no banco e novamente em memoria;
- o `limit` final e aplicado somente apos filtros/visibilidade/contadores.

Conclusao: a paginacao e funcional, mas o overfetch de 10x aumenta custo por request.

## Ownership / Department / RBAC

O escopo de departamento e aplicado no handler antes de chamar o builder:

- `loadAppDepartmentAccess`;
- se AGENT/SUPERVISOR limitado exigir departamento, injeta `departmentId` no filtro.

Porem, o filtro por departamento e aplicado em `conversationMatchesListFilters` sobre o item materializado, depois do fetch inicial e da resolucao de runtime state. Ou seja:

- a regra esta correta;
- nao ha vazamento de dados no retorno;
- mas parte do trabalho pode acontecer antes do descarte por departamento.

Isso ajuda a explicar por que `inbox-read` fica mais caro que Search/Public API.

## Payload

Campos retornados por item incluem:

- identificadores de conversa;
- canal/provider/account;
- lastMessage;
- leadId/status/name/phone/city/service/email/company;
- assignedUser/departamento/fila/status;
- unreadCount;
- timestamps;
- feature de outbound por canal.

O JSON final provavelmente nao e enorme para 20 itens, mas a montagem exige dados que nao aparecem integralmente no payload final, como:

- outbound `rawPayload`;
- mensagens extras usadas para achar ultima mensagem e unread;
- candidatos descartados por filtros antes do `slice(limit)`.

Conclusao: o custo de payload final nao parece ser a causa principal isolada; o custo maior esta no payload intermediario e na montagem.

## Medicoes Por Camada

### Disponivel hoje

Runtime metrics ja registram rota/modulo/duracao agregada. O laboratorio mediu:

- latencia externa completa;
- p95/p99 por cenario;
- erro HTTP;
- PM2/RAM/health/alertas.

### Nao disponivel hoje para `inbox-read`

Nao foi localizada instrumentacao interna na listagem para:

- tempo de `conversation.findMany`;
- tempo de `lead/inbound/outbound`;
- tempo de runtime state;
- tempo de read state;
- tempo de serializacao;
- tamanho do JSON final por request.

Existe `ChannelLatencyProfiler`, mas ele aparece instrumentando detalhe/outbound e nao a listagem do Inbox.

Conclusao: a 78O.2 deve primeiro adicionar instrumentacao temporaria/segura ou metricas internas por etapa antes de otimizar.

## Indices - Diagnostico Apenas

Sem criar migration nesta sprint.

Indices que podem ser avaliados na 78O.2, com `EXPLAIN ANALYZE` antes:

1. `Conversation(clientId, deletedAt, anonymizedAt, lastInboundAt, updatedAt desc)`
   - Motivo: query principal filtra por esses campos e ordena por `updatedAt`.
   - Cuidado: indice parcial pode ser melhor, mas exige decisao SQL especifica.

2. `InboundMessage(clientId, waId, createdAt)`
   - Motivo: query usa `OR waIdCanonical in (...) OR waId in (...)`.
   - Ja existe indice para `waIdCanonical`, mas nao equivalente direto para `waId`.

3. `OutboundMessage(clientId, waId, createdAt)`
   - Mesmo motivo acima.

4. `ConversationRuntimeState(clientId, waIdCanonical)`
   - Ja existe.

5. Caminho alternativo: buscar runtime states em lote por `waIdCanonical/waId` e evitar N+1.
   - Esta e mais uma mudanca de query path que de indice.

## Causa Provavel Do p95

Com base na auditoria:

```text
Inbox Read degrada primeiro porque faz composicao operacional rica:

Conversation candidates
  + Lead
  + InboundMessage
  + OutboundMessage
  + RuntimeState por conversa
  + ReadState
  + Department/Queue/User
  + Tenant features
  + filtros/contadores/ordenacao em memoria
```

O componente mais suspeito e:

```text
N+1 em runtime state + overfetch 10x + filtros em memoria antes do limit final
```

O segundo suspeito e:

```text
queries inbound/outbound com OR por waIdCanonical/waId e take alto
```

O terceiro suspeito e:

```text
rawPayload de OutboundMessage selecionado para normalizar status
```

## O Que Nao Foi Confirmado

- Nao foi confirmado `EXPLAIN ANALYZE` remoto nesta execucao porque a resolucao DNS do SSH para `admin.re7online.com` falhou temporariamente durante a tentativa de consulta read-only.
- Nao foi medido tamanho real do JSON final para evitar extrair tokens/fixtures do ambiente.
- Nao foi medida serializacao interna por etapa porque o endpoint nao possui instrumentacao de camada no estado atual.

## Recomendacao Para 78O.2

Ordem cirurgica sugerida:

1. Adicionar metricas internas temporarias/seguras para a listagem:
   - `inbox.list.conversation_query`;
   - `inbox.list.message_query`;
   - `inbox.list.runtime_state`;
   - `inbox.list.assembly`;
   - `inbox.list.response_bytes`.
2. Repetir somente `inbox-read vu5/vu10/vu20`.
3. Se runtime state dominar:
   - substituir N+1 por busca em lote em `ConversationRuntimeState`.
4. Se query principal dominar:
   - avaliar indice ou filtro mais seletivo no banco.
5. Se message query dominar:
   - revisar `waId` index, `rawPayload` e estrategia de ultima mensagem.
6. Se assembly dominar:
   - reduzir trabalho antes do `slice(limit)` ou materializar campos de resumo.

## Atualizacao 78O.2 - Performance Hardening

Implementado no codigo:

- instrumentacao interna de `GET /app/conversations` usando `metrics.timing` e `metrics.counter`;
- medicao de:
  - `auth_rbac`;
  - `defaults`;
  - `base_query`;
  - `last_message_lookup`;
  - `runtime_state_lookup`;
  - `assigned_user_lookup`;
  - `operational_lookups`;
  - `read_state`;
  - `tenant_features`;
  - `counters_unread`;
  - `assembly`;
  - `filtering_sorting`;
  - `serialization_payload`;
- gauge `inbox.list.response_bytes`;
- contador aproximado `inbox.list.query_count`;
- batch de `ConversationRuntimeState` para candidatos Webchat da listagem;
- fallback individual preservado quando nao houver estado Webchat no batch.

Decisao sobre overfetch:

- `conversationFetchLimit = limit * 10 + 1` foi mantido nesta sprint;
- o `slice(limit)` continua no final;
- reduzir antes do `slice` pode alterar `filterCounts`, cursor, visibilidade por `historyVisibleAfter`, filtros de departamento/status e ordenacao final;
- portanto, a reducao do overfetch fica para uma proxima mudanca, guiada pelos timings internos coletados apos pre-release.

Decisao sobre indices:

- nenhum indice foi criado;
- nenhum migration foi criado;
- indices continuam apenas como diagnostico ate haver `EXPLAIN ANALYZE`/timings internos suficientes.

Metrica antes/depois:

- baseline externo conhecido: `inbox-read vu20` p95 `2.085,30 ms`, 0% erro HTTP;
- baseline interno por etapa nao existia antes da 78O.2;
- os timings internos passam a existir apos deploy/pre-release desta sprint;
- a comparacao numerica de p95 antes/depois deve ser feita na VPS com `inbox-read vu5 -> vu10 -> vu20`, sem login no loop principal.

Resultado do pre-release VPS:

| Perfil | Requests | Erro HTTP | Avg | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `vu5` | 115 | 0% | 348,39 ms | 549,89 ms | 625,26 ms | 631,40 ms |
| `vu10` | 193 | 0% | 556,24 ms | 952,54 ms | 1.216,57 ms | 1.316,93 ms |
| `vu20` | 343 | 0% | 762,46 ms | 1.272,26 ms | 1.293,26 ms | 1.301,25 ms |

Comparacao:

```text
78N.3 final-final: inbox-read vu20 p95 2.085,30 ms
78O.2 pre-release: inbox-read vu20 p95 1.272,26 ms
ganho aproximado: 39,0%
```

Timings internos pos-pre-release:

| Operacao | p95 maximo observado | Diagnostico |
| --- | ---: | --- |
| `runtime_state_lookup` | 616 ms | principal gargalo remanescente |
| `auth_rbac` | 433 ms | custo relevante em um dos tenants medidos |
| `defaults` | 369 ms | custo relevante de preparacao |
| `last_message_lookup` | 126 ms | custo medio ainda visivel |
| `base_query` | 104 ms | nao dominou a latencia |
| `assembly` | 5 ms | nao dominou a latencia |
| `filtering_sorting` | 3 ms | nao dominou a latencia |
| `serialization_payload` | 3 ms | nao dominou a latencia |

Contadores relevantes:

- `runtime_state_batch`: 651 chamadas;
- `runtime_state_fallback`: 53.251 chamadas;
- `last_message_lookup`: 3.507 chamadas;
- `inbox.list.response_bytes`: ate ~79 KiB por resposta.

Leitura:

- o batching de `ConversationRuntimeState` reduziu significativamente o p95 externo;
- ainda ha caminho individual de fallback em volume alto;
- a proxima otimizacao deve investigar por que parte das conversas nao entra no batch, antes de mexer em overfetch, payload ou indices;
- `assembly`, `filtering_sorting` e `serialization_payload` nao sao os gargalos dominantes nesta medicao.

Risco preservado:

- RBAC/departamento nao foi relaxado;
- multitenancy nao foi alterado;
- payload publico foi mantido;
- nenhum cache, Redis, PM2/Nginx/Postgres tuning, HA ou infra foi introduzido.

## Atualizacao 78O.3 - Runtime State Fallback Reduction

Auditoria:

- a 78O.2 criou batch apenas para candidatos `webchat`;
- a listagem do Inbox contem candidatos de multiplos canais;
- os candidatos nao-Webchat continuavam chamando `loadInboxConversationState` individualmente;
- por isso o contador `runtime_state_fallback` continuava alto mesmo apos o ganho de batching inicial;
- a chave segura para batch e `clientId + (waId/waIdCanonical)`, usando `getWaIdGroupKey` para mapear o retorno.

Mudanca aplicada:

- o batch de `ConversationRuntimeState` passou a cobrir todos os candidatos da listagem;
- a consulta usa `clientId` e `OR` por `waId`/`waIdCanonical`;
- o mapa interno registra:
  - `getWaIdGroupKey(state.waId, state.waIdCanonical)`;
  - `state.waId`;
  - `state.waIdCanonical`, quando existir;
- o fallback individual permanece ativo para casos legados ou estado realmente ausente.

Metricas adicionadas:

- `inbox.list.runtime_state_batch_candidates`;
- `inbox.list.runtime_state_batch_hits`;
- `inbox.list.runtime_state_fallback_count`;
- `inbox.list.runtime_state_fallback_reason`.

Motivos de fallback:

| Motivo | Significado |
| --- | --- |
| `legacy_runtime_storage` | batch DB nao encontrou, mas fallback individual encontrou estado legado/runtimeStorage |
| `legacy_no_runtime_state` | batch DB e fallback individual nao encontraram estado operacional |

Decisoes preservadas:

- nenhum indice criado;
- nenhuma migration criada;
- nenhum cache/Redis;
- nenhuma alteracao de RBAC, departamento, ownership, payload publico ou isolamento multitenant;
- fallback individual nao foi removido.

Medicao antes/depois esperada:

```text
78O.2:
inbox-read vu20 p95 = 1.272,26 ms
runtime_state_fallback = 53.251 no snapshot pos-teste

78O.3:
medir novamente em pre-release VPS com inbox-read vu5/vu10/vu20
```

## Confirmacao De Nao Alteracao Funcional

A 78O.1/78O.2/78O.3 nao:

- altera regra de negocio;
- altera banco;
- cria migration;
- cria indice;
- altera schema Prisma;
- cria cache;
- altera Inbox funcional;
- altera Search;
- altera PM2/Nginx/Postgres;
- altera multitenancy/RBAC/ownership;
- executa tuning ou carga.
