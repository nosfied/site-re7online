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
- historicamente, a proxima otimizacao sugerida era investigar por que parte
  das conversas nao entra no batch; apos os hardenings e revert de 2026-09-10,
  esse ponto fica em WATCH e nao em execucao ativa;
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

Resultado do pre-release VPS:

| Perfil | Requests | Erro HTTP | Avg | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `vu5` | 122 | 0% | 253,09 ms | 366,56 ms | 555,18 ms | 670,70 ms |
| `vu10` | 240 | 0% | 267,32 ms | 393,31 ms | 636,83 ms | 709,96 ms |
| `vu20` | 463 | 0% | 309,47 ms | 584,93 ms | 789,37 ms | 972,28 ms |

Comparacao:

```text
78N.3 final-final: inbox-read vu20 p95 2.085,30 ms
78O.2 pre-release: inbox-read vu20 p95 1.272,26 ms
78O.3 pre-release: inbox-read vu20 p95 584,93 ms
```

Metricas internas pos-78O.3:

| Metrica | Resultado |
| --- | --- |
| `runtime_state_batch_candidates` | 21.849 |
| `runtime_state_batch_hits` | 21.849 |
| `runtime_state_fallback_count` | 0 mensuravel no snapshot |
| `runtime_state_fallback_reason` | nenhum motivo registrado |
| `runtime_state_lookup` p95 maximo | 34 ms |
| `inbox.list.duration total` p95 maximo | 182 ms |

Leitura:

- a causa do fallback alto foi confirmada como cobertura incompleta do batch;
- a ampliacao do batch para todos os canais removeu o fallback mensuravel nesta rodada;
- o `runtime_state_lookup` deixou de ser gargalo dominante;
- `inbox-read vu20` ficou abaixo da meta de `1.2s` com ampla margem;
- nao ha justificativa tecnica para continuar otimizando Inbox antes da fase de empacotamento/licitacao, salvo novo achado de carga.

## Atualizacao 2026-09-10 - Last Message E Runtime Residuals

Auditoria read-only posterior, em producao no HEAD
`1aae26b55907adb37b2472d31fbd58a42dace1f8`, registrou novo achado de carga
apos a melhoria de `channel_state_batch`.

Janela comparavel:

```text
GET /app/conversations: 88 requests em ~5m10s, ~17 req/min
SECULT list builds: 78
queries/request: ~10.7
runtime_state_fallback: 0
multichannel.dual_read: 0
backend CPU avg: ~14.0%, peak isolado 69.0%
DB pressure: NORMAL
```

Timings residuais:

| Stage | Avg intervalo | Avg cumulativo | p95 cumulativo | Leitura |
| --- | ---: | ---: | ---: | --- |
| `last_message_lookup` | ~275 ms | ~295 ms | ~629 ms | hotspot residual dominante por media |
| `runtime_state_lookup` | ~128 ms | ~140 ms | ~528 ms | batched, sem fallback mensuravel |
| `channel_state_batch` | ~189 ms | ~250 ms | ~692 ms | melhorado, watch |

Probes estruturais read-only para SECULT:

| Limit | Winners | Inbound historico matched | Outbound historico matched | Inbound retornado | Outbound retornado | Runtime retornado |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 11 | 225 | 277 | 22 | 22 | 11 |
| 10 | 101 | 1927 | 2313 | 202 | 202 | 101 |
| 25 | 251 | 4552 | 5191 | 502 | 502 | 251 |
| 50 | 255 | 4607 | 5253 | 1002 | 1002 | 255 |

Conclusao atual:

- `runtime_state_lookup` continua correto como leitura batched de estado atual e
  nao e o root cause atual;
- `last_message_lookup` e o candidato principal de otimizacao, por overfetch e
  materializacao historica de inbound/outbound para resolver preview;
- nenhum patch foi aplicado nesta auditoria porque uma reescrita ingenua para
  "ultima linha por identidade" pode quebrar semantica existente.

Contrato que o proximo patch deve preservar:

- supressao de mensagens `management_only`;
- corte por `historyVisibleAfter`;
- merge cronologico entre inbound e outbound;
- metadados usados no preview a partir de `rawPayload`;
- escopo tenant/RBAC/departamento existente;
- ausencia de fallback individual de runtime em producao.

## Atualizacao Entregue - Bounded Outbound Preview

Data: 2026-09-10

Status:

```text
CODE DEPLOYED
COMMIT: 94882d765b476e12a46eabd39c2bd21bb99bef13
DEPLOY: PASS
PRODUCTION MUTATION: NO
SEMANTIC ORACLE: PASS
FULL FOCUSED GATE: PASS WITH EXPLICIT STORAGE_MODE=hybrid
BACKEND BUILD: PASS
WORKER BUILD: PASS
MIGRATIONS: 58 / UP TO DATE
```

Foi entregue um patch conservador que limita somente a leitura de preview
outbound. A leitura inbound permanece igual porque hoje tambem alimenta
`unreadCount`; reduzir inbound no mesmo patch mudaria a superficie funcional da
lista.

Contrato preservado pelo desenho local:

- tenant scope por `clientId`;
- agrupamento por `waId`/`waIdCanonical`;
- exclusao de outbound `management_only`;
- corte por `historyVisibleAfter`;
- metadata de status/template via `rawPayload`;
- merge final inbound/outbound em aplicacao;
- tie-break existente que favorece inbound quando `createdAt` e igual;
- RBAC, filtros, ordenacao da lista, runtime state e channel state sem mudanca.

Forma entregue:

- `OutboundMessage` usa SQL parametrizado com `jsonb_to_recordset` para a lista
  de identidades vencedoras e `JOIN LATERAL` para buscar a ultima mensagem
  outbound humana visivel por identidade;
- query count permanece igual no stage `last_message_lookup`;
- materializacao outbound fica limitada a uma linha por identidade vencedora;
- sem schema, migration, indice, cache global ou read model novo.

Efeito esperado com base na probe SECULT `limit=25`:

```text
old outbound returned rows: up to 502
new outbound returned rows: <= 251
inbound returned rows: unchanged at up to 502
historical inbound/outbound matched rows: unchanged until index/read-model work
```

Validacao:

- a maquina local foi restaurada com um Postgres temporario isolado em
  `127.0.0.1:5432`;
- as 58 migrations oficiais foram aplicadas em banco local novo;
- o oraculo DB-backed de equivalencia semantica do bounded outbound preview
  passou, cobrindo latest inbound/outbound, `management_only`,
  `historyVisibleAfter`, media, location, template, metadata de protocolo/ciclo,
  identidade HYBRID, ausencia de mensagem, tie-break e acesso ADMIN a conversa
  fechada;
- a falha unica do gate amplo foi classificada como nao causada pelo bounded
  preview: o mesmo teste `meta inbound clears active chatbot runtime when
  persisted flow is inactive` falha em base limpa de producao quando o storage
  usa o default local `json`, porque o teste espera observar a limpeza em
  `ConversationRuntimeState` no Postgres;
- com `STORAGE_MODE=hybrid`, o mesmo teste passa repetidamente e a bateria
  focada completa passa 126/126 em banco local limpo quando executada
  serialmente;
- com `STORAGE_MODE=postgres`, a bateria historica de rotas nao e atualmente um
  gate adequado sem ajuste de fixtures, porque diversos casos criam estado JSON
  parcial e depois leem estritamente de Postgres. Isso aparece como
  `state.postgres.read_missing`/`postgres_conversation_state_invalid`, fora do
  caminho do bounded preview.
- deploy de producao foi fast-forward only, com backup PostgreSQL fresco antes
  do pull; apenas `re7-whatsapp-agent` e `re7-whatsapp-web-worker` foram
  recarregados; `re7-admin-front` permaneceu intocado.
- validacao operacional inicial pos-deploy: PM2 online, health PASS, schema com
  58 migrations up to date e `.data/` do Web Session preservado.

Regra de seguranca:

```text
The final delivery gate for this bounded preview patch uses explicit
STORAGE_MODE=hybrid and serial test execution for the DB-backed route suite.
Storage-mode-sensitive tests must not rely on implicit default json mode.
```

Resultado pos-deploy:

```text
PERFORMANCE RESULT: REAL REGRESSION
RUNTIME DECISION: REVERT 94882d QUERY SHAPE
SEMANTIC RESULT: PASS
ROOT CAUSE: PostgreSQL plan regression from JOIN LATERAL/cardinality
```

Revert aplicado:

```text
4bc8befdffbf03fe9e1a2b13be6f77564ac0f1e2
perf(inbox): revert bounded outbound preview lookup
```

Estado atual: `48c206fa` e `1aae26b5` permanecem REAL VALIDATED; o desenho
lateral de `94882d76` foi REVERTED por regressao real de performance em
producao. A frente de performance da Inbox esta congelada em WATCH. O
`last_message_lookup` e KNOWN RESIDUAL HOTSPOT, mas nao ha patch ativo aprovado;
nova medicao deve ocorrer somente em janela SECULT representativa ou diante de
novo incidente.

Audit refresh 2026-09-13: classificacao mantida como INBOX PERFORMANCE =
IMPROVED / WATCH; CPU = WATCH; ACTIVE PERFORMANCE DEVELOPMENT = NO. Nao
repriorizar performance acima de gaps P1/P2 sem novo incidente representativo.

A medicao comparavel de 2026-09-10, entre 19:49:48Z e 19:54:52Z, capturou
42 requests HTTP para `/app/conversations` em 5,07 minutos. O delta de metricas
mostrou `last_message_lookup` com media de janela em torno de 5.895ms e
`/app/conversations` com media em torno de 5.826ms. Isso nao e comparavel com o
objetivo de melhora e fica muito acima do baseline pre-change de
`last_message_lookup` em torno de 275ms.

O `EXPLAIN` sem `ANALYZE` em producao mostrou que, para SECULT com 251
identidades vencedoras e cerca de 5.201 outbound candidatos, o plano anterior
tinha custo estimado em torno de 1.632, usando `Limit -> Sort -> Seq Scan`,
enquanto a query bounded lateral apresentou custo estimado em torno de 150.454
com `Nested Loop`, `Function Scan`, `Limit`, `Sort` e `Seq Scan` dentro da parte
lateral. Nenhum indice foi usado no plano lateral de SECULT. A reducao de linhas
retornadas, portanto, aumentou o trabalho estimado do banco.

Nao houve evidencia de lock/contencao explicando a regressao: `pg_stat_activity`
mostrou sessoes majoritariamente idle/client read e locks concedidos. Houve
timeouts de pool Prisma logo apos o deploy, compatíveis com queries lentas
ocupando conexoes, mas a janela posterior mostrou CPU mais baixa. A classificacao
correta e regressao real de plano/cardinalidade, nao bug semantico.

## Design Semantico Do Preview De Ultima Mensagem - 2026-09-10

Contrato atual do preview:

| Propriedade | Regra atual |
| --- | --- |
| Direcao | escolhe a mensagem mais recente entre inbound e outbound |
| Ordenacao temporal | `createdAt`; timestamp de provider nao participa |
| Ordenacao da lista | `Conversation.updatedAt desc`, identidade canonica como tie-breaker |
| Eventos ocultos | exclui `rawPayload.inboxVisibility = "management_only"` |
| Corte de historico | aplica `historyVisibleAfter` por conversa vencedora |
| Midia/unsupported | depende de `type`, `bodyText`, `templateName` e `rawPayload` |
| Status de outbound | deriva de `rawPayload.metaStatus` ou `rawPayload.webSessionStatus` com fallback para `status` |
| Protocolo/ciclo | deriva de `rawPayload.serviceCycle` |
| HYBRID | depende de dedupe/canonicalizacao ja persistidos; preview agrupa por identidade canonica |

Origem do cap global:

```text
conversationFetchLimit = min(limit * 10 + 1, 1000)
messageFetchLimit = min(conversationFetchLimit * 2, 2000)
limit=25 => 251 candidates => 502 inbound + 502 outbound
```

Esse cap pode nao garantir preview perfeito por identidade em cenarios extremos:
muitas mensagens novas de outras identidades, ou muitas linhas
`management_only` mais novas que a ultima mensagem humana visivel de uma
identidade, podem consumir o cap global antes da linha correta.

Candidatos avaliados:

| Candidato | Seguranca semantica | Reducao de linhas | Necessita indice/schema | Decisao |
| --- | --- | ---: | --- | --- |
| `DISTINCT ON` por identidade | baixa se nao filtrar `management_only` exatamente | alta | nao inicialmente, mas predicate JSON pode limitar | nao aplicar sozinho |
| `ROW_NUMBER()` por identidade | baixa/media pelo mesmo motivo | alta | nao inicialmente | nao aplicar sozinho |
| lateral join por identidade com oversampling | media/alta se app-side confirmar visibilidade | alta e controlada | nao inicialmente | rejeitado na forma testada por regressao real de plano |
| query por identidade em loop | correta, mas recria fan-out | alta | nao | rejeitado para hot path |
| union inbound/outbound + rank | melhor modelo conceitual | alta | possivel melhoria futura | design longo |
| query atual com pre-filtro leve | segura, menor ganho | baixa/media | nao | fallback se lateral for complexo |

Patch gate para a proxima etapa:

- testes de equivalencia entre preview antigo e novo;
- casos com newest `management_only`;
- visible row behind control row;
- `historyVisibleAfter`;
- inbound/outbound no mesmo instante;
- media/location/template/status;
- protocolo/CSAT;
- HYBRID Meta/Web duplicate;
- conversa sem mensagem visivel.

Sem esses testes, a otimizacao deve permanecer em DESIGN READY, nao em
implementacao.

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
