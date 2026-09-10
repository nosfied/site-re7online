# Sprint 78M - Load Test Design

Data: 2026-06-25

Escopo: auditoria e desenho da estrategia de testes de carga do Converta, sem codigo, banco, infraestrutura nova, execucao de carga real ou alteracao funcional.

## Resumo Executivo

Apos as Sprints 78A-78L, o Converta tem a base minima para preparar testes de carga de forma segura:

- logging padronizado;
- runtime metrics internas;
- dashboard operacional `/admin/ops`;
- alert engine interno;
- health com DB;
- backup PostgreSQL verificavel;
- restore validado em banco isolado.

Ainda nao e seguro executar carga pesada diretamente na VPS atual como primeira etapa. O ambiente atual possui 2 vCPU, 1.9 GiB RAM, 0 swap, PostgreSQL local em Docker e PM2 single instance. Portanto, a recomendacao e criar primeiro um plano de carga em ambiente isolado/staging e usar producao apenas para smoke de baixa intensidade e janelas controladas.

Classificacao atual para load test: **ATENDE COM AJUSTE** para desenho e instrumentacao inicial; **NAO ATENDE** para prova de capacidade contratual ate haver ambiente, scripts e relatorio executado.

Atualizacao 78N: os primeiros scripts k6 foram criados e o cenario `health` foi executado de forma controlada em `vu5`, `vu10`, `vu20` e `vu50` por 30s cada. Resultado: 0% erro HTTP, PM2 online e memoria estavel. O teste bem-sucedido rodou localmente na VPS contra `127.0.0.1:3001`, portanto ainda nao mede Nginx/TLS/Cloudflare nem serve como benchmark contratual. Relatorio: `docs/saas/LOAD_TEST_RESULTS.md`.

Atualizacao 78N.1: executada validacao externa leve pelo dominio publico real, passando por Cloudflare/TLS/Nginx. `health`, `search` e `inbox list-only` passaram ate 20 VUs com 0% erro HTTP. `login` e `public-api` acionaram protecoes de taxa/sessao antes de saturacao tecnica. O proximo passo nao e tuning: e criar fixtures autenticadas corretas para login com usuarios distintos, Public API com limite calibrado e Inbox detail/timeline.

Atualizacao 78N.2: criadas fixtures autenticadas para carga: `npm run load-test:fixtures -- prepare|status|cleanup`, usuarios temporarios via `/admin/users`, API keys temporarias via `/app/api-keys`, fixture de Inbox via Webchat runtime e k6 com suporte a listas de usuarios/API keys por VU. Documento: `docs/saas/LOAD_TEST_FIXTURES.md`.

Atualizacao 78N.2B: definido tenant tecnico dedicado `loadtest-prefeitura` para carga, fixtures e benchmark. `demo-prefeitura` fica reservado para demonstracoes, POC e validacao funcional. Documento: `docs/saas/LOAD_TEST_TENANT_DESIGN.md`.

Atualizacao 78N.2C: definido bootstrap idempotente para `loadtest-prefeitura`, com features minimas, quota de usuarios temporarios, departamentos/filas e checklist. Documento: `docs/saas/LOAD_TEST_TENANT_BOOTSTRAP.md`.

Atualizacao 78N.3: executada carga externa autenticada inicial com `loadtest-prefeitura`. `health` e `public-api` passaram em `vu5`, mas `login` falhou com 91,72% de erro HTTP e acionou `runtime:error_rate`; por regra de seguranca, `vu10`, `vu20`, `vu50`, `inbox-read` e `inbox-detail` nao foram executados. A proxima etapa recomendada e endurecer a estrategia de carga autenticada para login, separando setup de sessao do loop principal sem enfraquecer rate limits globais.

Atualizacao 78N.4: a estrategia de autenticacao foi ajustada. `load-test:fixtures prepare` passa a emitir `APP_TOKENS_JSON` temporario para cenarios autenticados; `search`, `inbox-read` e `inbox-detail` reutilizam tokens e nao chamam `/auth/login` durante o loop; o runner bloqueia `login` em perfis `vu5+`; `login` fica restrito a `PROFILE=vu1`/`smoke1` com `SLEEP_SECONDS>=5` e thresholds proprios.

Atualizacao 78N.3 re-run: com login fora do loop principal, `health vu5` e `public-api vu5` passaram com 0% erro pelo caminho externo completo. O cenario `search vu5` falhou com 41,37% de erro por `401 session_replaced` em token de app, acionando `runtime:error_rate`. A proxima etapa nao e tuning de infraestrutura: e endurecer as fixtures de sessao para garantir uma sessao valida por VU antes de medir Search/Inbox em `vu10` e `vu20`.

Atualizacao 78N.5: a estrategia de fixture foi ajustada para respeitar a politica real de sessao exclusiva por usuario. `--users` passa a criar usuarios ADMIN/SUPERVISOR para carga autenticada, `--login-users` cria usuarios AGENT separados para o cenario isolado de login, e os cenarios Search/Inbox falham cedo quando `APP_TOKENS_JSON` tem menos tokens que os VUs do perfil. A proxima repeticao deve validar `search vu5` sem `session_replaced` antes de avancar para Inbox e `vu10/20`.

Atualizacao 78N.3 re-run final: com a 78N.5 validada, `health`, `public-api`, `search` e `inbox-read` passaram em `vu5` com 0% erro. O teste parou em `inbox-detail vu5` por `403 Conversa fora do seu departamento` para 4 de 5 tokens. O bloqueador atual e fixture de ownership/departamento do Inbox Detail, nao Search, Public API, sessao, PM2, RAM ou DB.

Atualizacao 78N.6: a fixture de Inbox Detail foi ajustada para respeitar o modelo real de departamento. O `prepare` resolve o departamento da conversa Webchat, alinha usuarios SUPERVISOR de carga a esse departamento pelo endpoint administrativo e grava `INBOX_DETAIL_CONVERSATIONS_JSON`. O cenario `inbox-detail` usa essa matriz por VU/token. Nao houve bypass de RBAC nem alteracao de ACL.

Atualizacao 78N.3 final-final: laboratorio estabilizado. `health`, `public-api`, `search`, `inbox-read` e `inbox-detail` passaram em `vu5`; os mesmos cenarios passaram em `vu10`; em `vu20`, `health`, `public-api` e `search` passaram com 0% erro, mas `inbox-read` cruzou threshold de latencia com p95 `2.085 ms`. O primeiro gargalo real medido e a listagem do Inbox, nao autenticacao, RBAC, Search, Public API ou infraestrutura caindo.

Atualizacao 2026-09-01: apos investigacao de CPU em producao, foi removido o
dual-read multichannel do hot path de leitura de runtime.

Commit:

```text
d163c5eff36f6eba0f744dfb9ba5285e65f40dbd
perf(multichannel): remove dual-read from runtime reads
```

Estado validado:

- runtime dual-read removed;
- Meta inbound dual-read preserved;
- Lead/CRM dual-read preserved;
- runtime polling fan-out reduced;
- `multichannel.dual_read` em runtime sampled at 0 pos-deploy.

Ambiente runtime observado:

- Node: `v20.20.0`;
- Prisma package: `6.19.2`;
- generated runtime client: `6.19.3`;
- provider: `prisma-client-js`;
- engine padrao: Node-API `libquery-engine`;
- runtime PrismaClient singleton: YES;
- multiple engine/pool risk: LOW.

CPU observada:

- antes, chegou a aproximadamente 100%+ de um core;
- apos o deploy, caiu progressivamente;
- fora do expediente SECULT foi observada em torno de 17-20%;
- hipotese atual: carga correlacionada ao uso/polling da Inbox.

Importante: a causa raiz de CPU ainda nao esta comprovada. E necessario medir
durante expediente antes de declarar conclusao.

Atualizacao 2026-09-10: apos `d163c5ef`, `b93ad07e` e `12eb83db`, a causa
antiga nao reapareceu como dual-read, runtime fallback ou bridge realtime
quebrada. Em producao no HEAD `52a2d0b8`, uma janela residual mostrou CPU do
backend inicialmente em 67-69% e depois em 60-61%, memoria estavel em
aproximadamente 230-278 MB, health PASS e DB pressure NORMAL. No delta de 60s,
`GET /app/conversations` fez 21 req/min e gerou 246
`inbox.list.query_count`/min, aproximadamente 11.7 queries/request, com
`runtime_state_fallback=0` e `multichannel.dual_read=0`. Classificacao:
residual load e provavelmente custo da listagem da Inbox sob uso real; sem
evidencia de loop, reconnect storm, Hybrid retry, Queue ou Reports como causa
raiz.

### SECULT Inbox / CPU correlation - START/MID/END windows

Primeiro ponto de medicao em producao:

```text
timestamp: 2026-09-02T08:21:14-03:00
production HEAD: 08598293c1cc15360b5cfe02a21a779c8a040dec
status: START WINDOW CAPTURED
```

Estado observado:

- SECULT: CONNECTED;
- Demo: CONNECTED;
- health: PASS;
- SECULT active app users: 7 seen in 5m / 10 active sessions;
- SECULT Inbox presence: 7;
- realtime connections: NOT_OBSERVED;
- `/app/conversations` requests/min: NOT_OBSERVED;
- inbox query count: NOT_OBSERVED;
- runtime fallback count: NOT_OBSERVED;
- backend CPU range: 0-106.7% instant;
- backend CPU average: ~50.6%;
- system load: 3.08 / 3.06 / 2.23 on 2 cores;
- DB pressure: NORMAL;
- dual-read rate: 0;
- timeline incident: NO.

Segundo ponto de medicao em producao:

```text
timestamp: 2026-09-02T12:47:39-03:00
production HEAD: b9bc61eda4a8ec8ef919e1ab6112da119a9729cd
status: MID WINDOW CAPTURED
```

Estado observado:

- SECULT: CONNECTED;
- Demo: CONNECTED;
- health: PASS;
- SECULT active app users: 5 seen in 5m / 10 active sessions;
- SECULT realtime connections: ~3 active observed, fanout up to 5 delivered;
- SECULT Inbox presence: 2 observed;
- `/app/conversations` requests/min: NOT_OBSERVED;
- inbox query count: NOT_OBSERVED;
- runtime fallback count: NOT_OBSERVED;
- backend CPU range: 76.2-76.4%;
- backend CPU average: ~76.3%;
- system load: 2.65 / 2.38 / 2.62 on 2 cores;
- DB pressure: NORMAL;
- dual-read rate: 0;
- timeline incident: NO.

Passada extra antes da janela END:

```text
timestamp: 2026-09-02T14:17:12-03:00 to 2026-09-02T14:18:12-03:00
production HEAD: b9bc61eda4a8ec8ef919e1ab6112da119a9729cd
status: EXTRA WINDOW CAPTURED
```

Estado observado:

- SECULT: CONNECTED;
- Demo: CONNECTED;
- health: PASS;
- SECULT active app users: 6 seen in 5m / 11 active sessions;
- SECULT realtime connections: observed through logs, fanout up to 7 delivered;
- SECULT Inbox presence: NOT_OBSERVED;
- `/app/conversations` requests/min: ~103;
- inbox query count: 1232 in 60s;
- runtime fallback count: 0 in 60s;
- backend CPU range: 63.3-100%;
- backend CPU average: ~87.5%;
- system load: 3.30 / 3.19 / 2.75 on 2 cores;
- DB pressure: NORMAL;
- dual-read rate: 0;
- timeline incident: NO.

Janela END em producao:

```text
timestamp: 2026-09-02T17:27-03:00 approximately
production HEAD: 80376a427d41ba4c34e978f989947054dcb6d8ab
status: END WINDOW CAPTURED
```

Estado observado:

- SECULT: CONNECTED;
- Demo: CONNECTED;
- health: PASS;
- SECULT effective Inbox online: 0;
- `/app/conversations` requests/min: effectively idle / not material;
- backend CPU average: ~8.2%;
- DB pressure: NORMAL;
- dual-read rate: 0;
- timeline incident: NO.

Janela END pos-Phase 2 em producao:

```text
timestamp: 2026-09-03T18:37:25-03:00 to 2026-09-03T18:42:28-03:00
production HEAD: c50fb73c30c6be65a94d468a88b48190112a14ef
status: END WINDOW CAPTURED
```

Estado observado:

- SECULT: CONNECTED;
- Demo: CONNECTED;
- health: PASS;
- SECULT active app users: 0 seen in 5m / 6 active sessions;
- SECULT realtime connections: not observed for SECULT in this window;
- SECULT Inbox presence: 0 observed;
- `/app/conversations` requests/min: 0 observed;
- inbox query count: 0 observed;
- queries/request: not observed;
- runtime fallback count: 0;
- backend CPU range: 11.4-11.7%;
- backend CPU average: ~11.6%;
- system load final: ~0.10 / 0.26 / 0.30;
- DB pressure: NORMAL;
- dual-read rate: 0;
- timeline incident: NO;
- push error storm: NO.

Hipotese de trabalho:

```text
SECULT active Inbox usage may correlate with backend CPU.
NOT PROVEN.
```

Interpretacao apos EXTRA 14:17:

- MID nao confirma correlacao linear simples entre quantidade de usuarios/presenca Inbox e CPU;
- CPU foi maior no MID apesar de menor quantidade observada de usuarios/presencas;
- Inbox ainda pode contribuir por frequencia real de requests, multiplas abas, atividades nao observadas ou custo por request;
- o EXTRA fortalece a hipotese de que a carga base do polling de `/app/conversations` e um contribuidor relevante para CPU;
- runtime fallback = 0 e dual-read = 0 eliminam dois fatores anteriormente suspeitos nessa janela;
- a rota ainda executa aproximadamente 12 queries por request;
- ~103 requests/min resultam em ~1232 queries/min apenas nessa janela;
- DB pressure permaneceu NORMAL, compativel com muitas queries curtas;
- a janela END mostrou CPU baixa quando nao havia uso efetivo de Inbox;
- a janela END pos-Phase 2 de 03/09 tambem mostrou CPU materialmente menor que o MID do mesmo dia quando nao havia uso efetivo de Inbox;
- isso fecha a decisao operacional de Phase 2 para reduzir polling e usar
  WebSocket como sinal primario de invalidacao;
- ainda nao declarar causalidade absoluta: a evidencia operacional apoia a
  decisao de Phase 2, mas a performance permanece parcial porque nao houve uma
  janela EXTRA pos-Phase 2 sob carga alta equivalente;
- otimizacao imediata adicional de queries no backend: NOT YET justificada.

Classificacao atual:

```text
INBOX POLLING AS CPU CONTRIBUTOR:
STRONGLY SUSPECTED / OPERATIONAL SIGNAL CLOSED
```

Comparacao START/MID/END:

| Window | Active users | Inbox presence | /app/conversations req/min | Query count/min | Approx queries/request | Backend CPU avg | DB pressure |
| --- | --- | --- | --- | --- | --- | --- | --- |
| START | 7 seen / 10 sessions | 7 | NOT_OBSERVED | NOT_OBSERVED | NOT_OBSERVED | ~50.6% | NORMAL |
| MID | 5 seen / 10 sessions | 2 | NOT_OBSERVED | NOT_OBSERVED | NOT_OBSERVED | ~76.3% | NORMAL |
| EXTRA 14:17 | 6 seen / 11 sessions | NOT_OBSERVED | ~103 | 1232 | ~12 | ~87.5% | NORMAL |
| END | active sessions possible, effective Inbox online 0 | 0 effective | idle / not material | NOT_OBSERVED | NOT_OBSERVED | ~8.2% | NORMAL |
| END 03/09 | 0 seen / 6 sessions | 0 | 0 observed | 0 observed | not observed | ~11.6% | NORMAL |
| RESIDUAL 10/09 | SECULT real traffic active | not fully measured | 21 | 246 | ~11.7 | ~60-69% | NORMAL |

```text
INBOX / BACKEND PERFORMANCE:
CLOSED FOR PHASE 2 DECISION / RESIDUAL LIST-READ COST WATCH
```

Residual 2026-09-10:

- production HEAD: `52a2d0b8c1ae2c6b53ca66775d25390bef2d1166`;
- CPU samples: 68.5, 68.4, 67.7, 67.8, 67.2, 61.4, 61.0, 60.7, 60.4, 60.4%;
- peak: 68.5%;
- average across collected samples: ~64.9%;
- memory: approximately 230-278 MB RSS;
- DB pressure: NORMAL, with mostly idle Postgres sessions and no wait queue
  signal;
- top current route by delta: `GET /app/conversations`, 21 req/min;
- Inbox list query delta: 246/min;
- approximate queries/request: ~11.7;
- runtime fallback: 0/min;
- dual-read: 0/min;
- top cumulative route: `GET /app/conversations`, 2797 successful requests
  since reload, avg ~3339 ms, p95 ~4178 ms;
- top cumulative Inbox operation cost for SECULT:
  `channel_state_batch`, `last_message_lookup`, `auth_rbac`,
  `runtime_state_lookup`, `tenant_features`.

Interpretacao:

- nao e o mesmo problema do dual-read multichannel de 2026-09-01;
- nao ha evidencia de bug novo em Hybrid, Queue, Reports ou DB;
- Inbox list continua sendo o hotspot residual por volume e custo por poll;
- heartbeat aparece em volume, mas com menor custo agregado que Inbox list;
- antes de otimizar, a proxima frente deve medir query shape e cache seguro em
  `/app/conversations` com janelas comparaveis de expediente.

### `/app/conversations` query-shape audit - 2026-09-10

Rota:

```text
GET /app/conversations
apps/whatsapp-agent/src/http/routes.ts
buildConversationListPayload()
```

Call graph observado:

```text
requireClientAuth()
getScopedClientById()
loadAppDepartmentAccess()
resolveInboxVisibilityPolicy()
buildConversationListPayload()
  loadOptionalDefaultDepartmentAndQueue()
  conversation.findMany()
  optional search conversation.findMany()
  lead.findMany()
  inboundMessage.findMany()
  outboundMessage.findMany()
  loadInboxConversationStatesFromDb()
  optional loadInboxParticipationKeysForUser()
  optional loadActiveChatbotConsentNodeIds()
  optional user.findMany()
  loadConversationOperationalLookups()
  getInboxReadStateForConversations()
  getTenants()
  client.findUnique(features/profile)
  buildInboxWebSessionChannelStateBatch()
  in-memory unread/filter/sort/assembly
jsonWithInboxReadMetrics()
```

Baseline real:

```text
production HEAD: 52a2d0b8c1ae2c6b53ca66775d25390bef2d1166
delta window: 2026-09-10T15:13:03Z to 2026-09-10T15:14:03Z
/app/conversations: 21 req/min
inbox.list.query_count: 246/min
approx queries/request: 11.7
runtime_state_fallback: 0/min
multichannel.dual_read: 0/min
backend CPU during nearby samples: ~60-69%
memory: ~230-278 MB RSS
DB pressure: NORMAL
```

Breakdown reconciliando os ~11-12 queries/request:

| Query group | Purpose | Frequency | Cacheability note |
| --- | --- | --- | --- |
| defaults | default department and queue | fixed, up to 2 reads | tenant invariant, candidate for short tenant-scoped cache |
| base_query | candidate conversations | fixed 1 read | current-state, must remain exact |
| search_query | identity search supplement | only with search | current-state, filter-specific |
| last_message_lookup | leads + inbound preview + outbound preview | fixed 3 reads | partially current-state; preview correctness matters |
| runtime_state_batch | current runtime state for candidates | fixed 1 read | current-state, already batched |
| runtime_state_fallback | legacy/runtime fallback per miss | per row when batch misses | observed 0/min in residual window |
| assigned_user_lookup | assignee labels | fixed 0/1 read | user labels are cacheable with RBAC-safe tenant scope |
| operational_lookups | departments + queues | fixed up to 2 reads | tenant invariant, candidate for short tenant-scoped cache |
| read_state | user read state for candidates | fixed 1 read | user/conversation current-state |
| tenant_features | tenant feature/profile lookup | fixed 1 DB read plus config load | tenant invariant, candidate for short tenant-scoped cache/reuse |
| channel_state_batch | Web Session channel status/switch warning | fixed/batched, query count depends on sources | current operational state, cache only with care |
| counters_unread | in-memory count from fetched inbound/read state | no DB read | CPU only |

N+1 classification:

```text
N+1:
NO dominant current evidence
```

Evidence: `runtime_state_fallback=0/min` in the residual production window, and
the code paths for leads, inbound preview, outbound preview, runtime state,
assignee, departments, queues and channel state are batched. A per-row fallback
still exists for runtime/channel state when a batch cannot answer, but it was
not active in the measured window. Limit-specific production probes
`limit=1/10/25/50` were not executed to avoid creating artificial customer
traffic in the read-only audit.

Cache audit:

- frontend timeline/media caches exist;
- channel account runtime cache exists with 60s TTL for channel account
  resolution/secret paths;
- `/app/conversations` list response itself has no backend response cache;
- tenant config loaded by `getTenants()` has process cache, but DB-backed
  `client.findUnique(features/profile)` still runs per list request;
- current-state fields such as runtime, read state, last message, channel state
  and visibility must not be globally cached without invalidation proof.

Realtime invalidation:

- Phase 2 uses WebSocket as primary invalidation and 30s list polling fallback;
- selected timeline fallback is 60s;
- one realtime event can still call `refreshConversationList()` from multiple
  client-side paths, but broad duplicate fan-out was not proven as the current
  residual root cause in this audit.

Optimization candidates:

| Candidate | Queries saved/request | Evidence | Correctness risk | Size |
| --- | --- | --- | --- | --- |
| request-local/tenant-scoped reuse for defaults + operational lookups | up to 4 | fixed per-request reads | low/medium, tenant-scoped with invalidation or short TTL | small/medium |
| tenant feature/profile short cache or reuse from already loaded client | 1 | fixed per-request DB read | medium, feature toggles must reflect admin changes quickly | small |
| channel state batch optimization | variable | highest cumulative SECULT operation in metrics | medium/high, operational status must remain exact | medium |
| last message preview consolidation | up to 2 | fixed 3 reads for lead/inbound/outbound | medium, must preserve inbound/outbound merge semantics | medium |
| reduce hidden/inactive tab requests | lowers request rate rather than queries/request | prior CPU correlation | medium UX/realtime risk | separate frontend phase |

Patch gate:

```text
CODE CHANGE:
NO
```

No single candidate was both proven materially responsible enough and safe
enough to implement in this audit without a controlled before/after benchmark.
The next implementation, if approved, should target one fixed-cost lookup group
at a time and preserve exact Inbox current-state semantics.

Modelo de escala atual estimado:

```text
Inbox list polling before Phase 2: ~2000ms
Selected timeline refresh before Phase 2: ~10000ms
1 operador: ~30 list polls/min
10 operadores: ~300 list polls/min
30 operadores: ~900 list polls/min
50 operadores: ~1500 list polls/min
GET /app/conversations: ~12-18 Prisma queries por poll, antes de fallbacks
30 agentes: ~10.800-16.200 queries/min somente na lista
```

Este modelo e estimativa operacional, nao benchmark contratual.

```text
CURRENT POLLING MODEL:
SCALES LINEARLY WITH ACTIVE INBOX TABS

CRA 30-AGENT SCALE READINESS:
PARTIAL
```

Proxima bateria de observacao real:

```text
NEXT LOAD OBSERVATION:
Tuesday, 2026-09-08
```

Motivo: primeiro dia util apos o feriado de 7 de setembro, com maior chance de
demanda acumulada de atendimento.

Plano:

- START;
- MID;
- EXTRA;
- END.

Cada janela deve coletar:

- active sessions;
- effective Inbox users/presence;
- realtime connections, se observavel;
- `/app/conversations` requests/min;
- `inbox.list.query_count`;
- queries/request;
- backend CPU min/max/avg;
- system load;
- top CPU processes;
- DB pressure;
- runtime fallback;
- dual-read;
- timeline incidents;
- SECULT/Demo health.

Nao pre-julgar resultado. A correlacao atual permanece PARTIAL, a melhoria
operacional da Phase 2 esta documentada, e otimizacao adicional de query shape
nao deve ser reaberta antes dessa bateria ou de evidencia equivalente.

## Confirmacao De Nao Alteracao Funcional

Esta sprint nao:

- altera codigo;
- altera banco;
- cria migration;
- cria infraestrutura;
- instala ferramenta de carga;
- executa carga real;
- altera PM2, Nginx, Postgres ou cron;
- altera runtime de canais, login, IA, chatbot, Public API, Webchat, Telegram, Scheduling, Search, Audio ou MFA.

## Auditoria Obrigatoria

### VPS Oracle Atual

Auditoria em 2026-06-25:

```text
host: re7online-api-01
CPU: 2 vCPU
RAM: 1.9 GiB
swap: 0
disco raiz: 58 GB, 26% usado
PostgreSQL: Docker local wa-agent-postgres, healthy
```

Implicacao: qualquer carga relevante compete com backend, frontend, Postgres, Nginx e processos de build no mesmo host. Build paralelo e teste pesado em producao continuam desaconselhados.

### PM2

Estado observado:

```text
re7-admin-front     fork_mode, 1 instancia
re7-whatsapp-agent  fork_mode, 1 instancia
```

O que pode ser medido:

- processo online/offline;
- consumo aproximado de memoria/CPU via PM2;
- restart manual/automatico;
- health pos-reload.

Gargalo conhecido:

- single instance;
- sem balanceamento;
- reload pode gerar instabilidade curta;
- memoria baixa para build + runtime.

### PostgreSQL

Estado:

- PostgreSQL 16 em container local;
- porta `127.0.0.1:5432`;
- volume Docker local;
- backup PostgreSQL verificavel criado na 78L.

O que ja pode ser medido:

- `health.db.status`;
- `db_duration`;
- `dependency_duration`;
- `prisma migrate status`;
- tamanho de backup;
- restore isolado.

Gaps:

- sem metricas historicas de conexoes, locks, slow queries, cache hit ratio ou I/O;
- sem replica;
- sem PITR;
- sem painel DB dedicado.

### Nginx

Sites enabled observados:

- `api.re7online.com`;
- `admin.re7online.com`;
- `converta.re7online.com`;
- `default`.

Rotas proxy relevantes:

- `converta.re7online.com` para backend na porta 3001 e frontend na porta 3000;
- `/app/realtime` proxy para backend;
- `api.re7online.com` para health/webhook historicos.

Gaps:

- sem metricas Nginx agregadas no dashboard;
- sem rate test por vhost;
- sem blue/green;
- sem load balancer.

### Runtime Metrics

Reaproveitamento:

- `request_count`;
- `request_duration`;
- `route_duration`;
- `module_duration`;
- `db_duration`;
- `dependency_duration`;
- `http.errors`;
- `health.db.status`;
- `process.uptime.seconds`;
- memoria/CPU/uptime no snapshot;
- p95 aproximado em memoria.

Limitacao:

- metricas resetam em reload;
- nao ha p99 persistente;
- nao ha serie historica;
- tenantId pode ficar `unknown` quando o request nao resolve tenant.

### AlertManager

Reaproveitamento:

- alerta DB offline;
- health NOK;
- erro HTTP elevado;
- request p95 alto;
- memoria RSS alta;
- ACK e resolve automatico.

Limitacao:

- estado em memoria;
- sem notificacao externa;
- sem silence;
- sem historico;
- thresholds ainda nao calibrados por carga real.

### Dashboard Operacional

Reaproveitamento:

- `/admin/ops`;
- `/admin/ops/metrics`;
- cards health/DB/uptime/CPU/memoria;
- requests/errors/avg/p95;
- tabela por modulo.

Uso no load test:

- acompanhar comportamento durante smoke/manual;
- coletar snapshot antes/depois;
- nao usar como unica fonte de medicao de SLA por nao ter historico.

### Search

Estado:

- `SearchIndex`;
- busca textual MVP em `/app/search`;
- indexacao manual/shadow;
- audio transcription indexing manual.

O que medir:

- p95/p99 de `/app/search?q=...`;
- impacto de filtros por `entityType`, `channel`, `source`, `language`;
- crescimento de `SearchIndex`;
- consumo DB por ILIKE/full text.

Gargalo provavel:

- consulta textual sobre tabela crescente sem plano/indice revisado por carga;
- paginacao e snippets.

### Public API

Estado:

- API keys tenant-scoped;
- contacts/conversations/messages read-only;
- rate limit basico;
- OpenAPI;
- auditoria;
- webhooks com dispatch manual.

O que medir:

- `GET /public-api/v1/health`;
- contatos/conversas/mensagens;
- 401/403/429;
- throughput por API key/tenant;
- impacto de paginacao.

### Webhooks

Estado:

- cadastro;
- segredo criptografado;
- shadow;
- dispatch HTTP manual;
- sem eventos automaticos.

O que medir:

- CLI/dispatch controlado contra endpoint de teste;
- latencia de endpoint externo controlado;
- failed/dead_letter em resposta 4xx/5xx/timeout.

Fora do MVP de carga:

- dispatch automatico em massa, porque ainda nao existe runtime automatico.

### Scheduling

Estado:

- CRUD;
- reminders manuais;
- shadow scheduler;
- envio controlado por CLI;
- sem cron automatico.

O que medir:

- listagem/criacao/edicao no `/app/scheduling`;
- CLI shadow/send em limites baixos;
- sem carga de envio real em lote ate scheduler automatico existir.

## O Que Ja Pode Ser Medido

| Area | Metricas disponiveis | Fonte |
| --- | --- | --- |
| HTTP geral | requests, errors, duration, route/module duration | runtime metrics |
| Health/DB | status DB, DB duration, dependency duration | `/health`, `/admin/ops/metrics` |
| Processo | uptime, memoria, CPU | `/admin/ops/metrics`, PM2 |
| Modulos | auth, public_api, webhook, scheduling, search, audio, mfa, telegram, webchat | classificacao de rotas |
| Alertas | DB, health, erro, latencia, memoria | `/admin/ops/alerts` |
| Backup | dump, checksum, manifest | `npm run backup:postgres` |
| Restore | restore isolado validado | 78K |

## Pontos Que Precisam Instrumentacao Adicional

| Gap | Impacto no load test |
| --- | --- |
| p99 historico | necessario para relatorio contratual. |
| conexoes/locks/slow query DB | necessario para diagnosticar gargalo real. |
| metricas Nginx | necessario para separar proxy/app. |
| metricas de realtime/WebSocket | necessario para Inbox em escala. |
| metricas por tenant historicas | necessario para B2G multi-tenant. |
| disco/I/O | necessario para media, logs, backups e SearchIndex. |
| fila/worker | ainda nao existe fila central para stress de jobs. |
| dataset padronizado | necessario para repetir teste com mesmo volume. |

## Objetivos Dos Testes

1. Definir baseline real da VPS atual.
2. Medir ate onde a arquitetura single-node suporta carga controlada.
3. Identificar gargalos por modulo antes de prometer capacidade em edital.
4. Validar se os alertas internos disparam sob degradacao controlada.
5. Gerar evidencias para capacity planning.
6. Separar limites de produto de limites de infraestrutura.

## Cenarios

| Cenario | Objetivo | Observacao |
| --- | --- | --- |
| Health | baseline de disponibilidade e DB | baixa carga, seguro para producao. |
| Login | auth/session/JWT/MFA shadow/enforcement | precisa usuarios de teste. |
| Inbox | abrir lista, abrir conversa, alternar timeline | principal fluxo humano. |
| Public API | health, contacts, conversations, messages | usar API key de tenant teste. |
| Search | busca textual com filtros e paginacao | usar `SearchIndex` populado. |
| Webhooks | dispatch manual contra endpoint controlado | sem acoplar eventos reais. |
| Scheduling | CRUD/listagem e shadow/send dry-run | sem envio real em massa. |
| Dashboard | `/admin/ops/metrics`, `/admin/ops/alerts`, `/admin/ops` | mede observabilidade sob carga. |

## Perfis De Carga

### Carga Nominal

Objetivo: simular uso normal de tenant medio.

Valores iniciais:

```text
usuarios simultaneos: 20-50
requests/min totais: 300-600
Public API req/min: 60-120
Search req/min: 20-60
mensagens inbound simuladas/min: 30-60
webhooks/min controlados: 10-30
duracao: 15-30 min
```

### Pico

Objetivo: validar comportamento em janelas curtas.

```text
usuarios simultaneos: 100
requests/min totais: 1000-1500
duracao: 10-15 min
```

### Stress

Objetivo: encontrar limite de saturacao.

```text
usuarios simultaneos: 200-400
requests/min: aumentar gradualmente ate erro/p95 romper criterio
duracao: ate 30 min ou ate criterio de parada
```

Executar apenas em ambiente isolado/staging.

### Soak

Objetivo: vazamento de memoria, conexoes ou degradacao lenta.

```text
usuarios simultaneos: 50-100
duracao: 2-6h no MVP; 24h futuramente
```

### Spike

Objetivo: pico abrupto.

```text
de 0 para 100 usuarios em 30s
retorno para nominal apos 5 min
```

## Usuarios E Throughput Iniciais

| Nivel | Usuarios simultaneos | Requests/min | Mensagens/min | Webhooks/min |
| --- | ---: | ---: | ---: | ---: |
| Smoke | 5-10 | 60-120 | 5-10 | 1-5 |
| Nominal | 20-50 | 300-600 | 30-60 | 10-30 |
| Pico | 100 | 1000-1500 | 100-150 | 50 |
| Stress | 200-400 | ate saturar | ate saturar | ate saturar |

Estes valores sao ponto de partida. Nao devem ser usados como promessa comercial sem execucao e relatorio.

## Metricas A Coletar

### Aplicacao

- p50/p95/p99 por rota;
- throughput;
- error rate;
- status codes;
- timeout;
- request duration;
- module duration;
- route duration.

### Sistema

- CPU;
- memoria RSS;
- load average;
- disco livre;
- I/O;
- conexoes;
- PM2 restarts.

### Banco

- DB health;
- DB duration;
- conexoes ativas;
- locks;
- slow queries;
- tamanho de tabelas relevantes;
- latencia de queries Search/Public API.

### Modulos

| Modulo | Medir |
| --- | --- |
| Login | sucesso/falha, latencia, lockout/MFA. |
| Inbox | lista, detalhe, timeline, envio humano controlado. |
| Public API | 200/401/403/429, paginacao, latencia. |
| Search | q/filtros/cursor, p95, erro. |
| Webhooks | dispatch manual, timeout, failed/dead letter. |
| Scheduling | CRUD/listagem, shadow/send dry-run. |
| Dashboard | overhead de snapshots. |
| Health | DB status e duration. |

## Criterios De Sucesso

### Smoke

- erro 5xx: 0%;
- p95 health < 300 ms;
- p95 Public API read < 800 ms;
- p95 Search MVP < 1200 ms;
- p95 Inbox APIs < 1000 ms;
- CPU < 70%;
- memoria livre > 20%;
- sem restart PM2.

### Nominal

- erro 5xx < 1%;
- p95 API read < 1000 ms;
- p95 Search < 1500 ms;
- p95 Inbox < 1500 ms;
- p99 registrado, mesmo que nao seja criterio inicial;
- AlertManager sem CRITICAL;
- DB health sempre OK.

### Stress

Sucesso nao significa "nao falhar"; significa:

- identificar ponto de saturacao;
- manter falhas controladas;
- sem corrupcao de dados;
- sem perda de backup/restore;
- sem travar VPS permanentemente;
- rollback/stop claro.

## Ferramentas Comparadas

| Ferramenta | Pros | Contras | Veredito |
| --- | --- | --- | --- |
| k6 | simples, script JS, boa medicao HTTP, threshold nativo, baixo overhead | menos natural para fluxos browser reais | recomendado para MVP. |
| Artillery | bom para HTTP/WebSocket, YAML/JS, rapido para cenarios | pode ficar mais pesado/menos preciso para thresholds simples | alternativa para WebSocket/realtime futuro. |
| Locust | Python, usuarios virtuais flexiveis, UI boa | mais infraestrutura, processo extra, mais pesado para MVP | bom para fase posterior. |

Recomendacao MVP: **k6**.

Motivos:

- baixo atrito;
- facil versionar cenarios;
- thresholds claros;
- roda fora da VPS;
- adequado para Public API, Search, Health, Login e APIs do Inbox.

## Ambiente Recomendado

### Nao recomendado como primeira etapa

Producao com carga real pesada.

Motivos:

- VPS unica;
- sem swap;
- Postgres local;
- PM2 single instance;
- usuarios reais podem ser afetados.

### Recomendado

1. Ambiente isolado/staging com copia sanitizada.
2. Rodar k6 a partir de maquina externa, nao da VPS alvo.
3. Dataset controlado:
- tenant tecnico `loadtest-prefeitura`;
   - usuarios teste;
   - conversas/mensagens seedadas;
   - SearchIndex populado;
   - API keys especificas.
4. Producao apenas para smoke de baixa intensidade em janela curta.

## Capacity Planning

### Capacidade Atual Esperada

Com 2 vCPU, 1.9 GiB RAM, 0 swap e Postgres local, a capacidade deve ser tratada como:

- adequada para operacao controlada;
- inadequada para promessa de 400 usuarios simultaneos sem prova;
- vulneravel a build paralelo e picos de DB;
- limitada para requisitos de 600 GB de midia.

### Gargalos Provaveis

| Gargalo | Motivo | Mitigacao |
| --- | --- | --- |
| RAM | 1.9 GiB sem swap | 78N Capacity/Swap Hardening. |
| CPU | app, frontend, DB e Nginx no mesmo host | separar build/runtime e considerar upgrade. |
| DB local | sem replica e concorrendo com app | Postgres gerenciado/replica futura. |
| Search | consultas textuais em tabela crescente | indices/planos/limites/paginacao. |
| Inbox | timeline e realtime/polling | cache, paginação e metricas de rota. |
| Webhooks | dispatch HTTP externo | limites por tenant e retries controlados. |
| Disco | backups, logs, media e DB | offsite/object storage/retencao. |

### Upgrade Minimo Antes De Stress

Recomendado antes de stress em staging:

- 4 vCPU;
- 8 GiB RAM;
- swap configurado ou memoria suficiente;
- Postgres separado ou gerenciado;
- dataset sanitizado;
- backups validados;
- gerador de carga fora do host.

## Plano De Execucao Futuro

### 78N - Capacity & Swap Hardening

- configurar swap ou validar alternativa;
- formalizar build sequencial;
- medir memoria antes/depois de build;
- definir limite minimo de VPS;
- sem load test pesado ainda.

### 78N - Load Test MVP

- scripts k6;
- Health, Login, Public API, Search e Inbox read;
- primeira execucao controlada ate 50 VUs;
- relatorio de p95/p99/erro/CPU/memoria.

Status: executado parcialmente na Sprint 78N. `health` foi medido; Login/Public API/Search/Inbox ficaram preparados em script, mas dependem de credenciais/tokens de teste explicitos para execucao segura.

Atualizacao 78N.1: caminho publico validado externamente ate 20 VUs. `health`, `search` e `inbox list-only` ficaram sem erro HTTP; `login` e `public-api` bateram protecoes funcionais. Resultado detalhado em `docs/saas/LOAD_TEST_RESULTS.md`.

### 78N.2 - Authenticated Load Test Fixtures

- criar usuarios de carga no tenant tecnico pelo fluxo da aplicacao;
- evitar login repetido com o mesmo usuario;
- criar API keys dedicadas ou calibrar rate limit sem desligar protecoes;
- garantir conversa visivel para list/detail/timeline;
- documentar credenciais temporarias e cleanup.

Status: implementado em `apps/whatsapp-agent/scripts/load-test-fixtures.mjs` e documentado em `docs/saas/LOAD_TEST_FIXTURES.md`.

### 78O - Authenticated Load Test MVP

- usar fixtures da 78N.2;
- cenarios Login, Public API, Search e Inbox read/detail/timeline com tenant tecnico;
- executar contra staging;
- coletar `/admin/ops/metrics` antes/depois;
- gerar relatorio com p95/p99/erro/CPU/memoria.

Status 78N.3: iniciado em producao com escopo curto e abortado em `vu5` por erro alto no `login`. Antes de repetir 78O/78N.3 completo, ajustar a estrategia de autenticacao:

- fazer login em fase de setup quando o objetivo for medir Search/Inbox/Public API autenticados;
- limitar repeticao de `/auth/login` para um cenario proprio de seguranca;
- nao desabilitar rate limit global;
- manter usuarios/API keys distribuidos;
- registrar 401/429/lockout como resultado esperado quando o teste for de protecao.

Status 78N.4: estrategia ajustada. A proxima repeticao deve:

- rodar `login` separadamente com `PROFILE=vu1 DURATION=30s SLEEP_SECONDS=5`;
- rodar `public-api`, `search`, `inbox-read` e `inbox-detail` com `vu5/10/20`, usando `APP_TOKENS_JSON`;
- abortar somente se as rotas autenticadas falharem sem relacao com login/rate limit;
- manter rate limits globais intactos.

Status 78N.3 re-run: executado novamente apos a 78N.4. `health` e `public-api` passaram em `vu5`, mas `search` parou o teste por `401 session_replaced` em parte dos tokens da fixture. Antes de repetir a carga completa:

- garantir tokens/sessoes suficientes para todos os VUs;
- evitar reutilizar usuario em sessoes concorrentes quando a politica invalida sessao anterior;
- manter `/auth/login` fora do loop principal;
- validar `search vu5` com 0% erro de autenticacao antes de `vu10/20`;
- nao alterar regra de sessao, rate limit ou MFA para acomodar teste.

Status 78N.5: fixture corrigida para separar usuarios de login e usuarios de carga app. Antes da nova 78N.3, executar smoke de sessao:

- `npm run load-test:fixtures -- prepare --tenant loadtest-prefeitura --users 20 --login-users 2`;
- confirmar `appTokenCount >= 20`;
- rodar `login vu1` sem invalidar tokens de app;
- rodar `search vu5`, `inbox-read vu5`, `inbox-detail vu5` com 0% `401`;
- so entao avancar para `vu10` e `vu20`.

Status 78N.3 re-run final: `search vu5` e `inbox-read vu5` passaram, mas `inbox-detail vu5` falhou por RBAC/departamento. Antes da proxima carga:

- alinhar usuarios de carga ao departamento da conversa fixture, ou criar conversas distribuidas por departamento;
- preservar RBAC real, sem bypass;
- validar `inbox-detail vu5` com 0% `403`;
- somente depois avancar para `vu10` e `vu20`.

Status 78N.6: fixture ajustada pelo caminho de alinhamento de departamento. Antes da 78N.3 final-final:

- rodar `prepare` novamente;
- confirmar `inboxDetail` no manifest/status;
- confirmar `INBOX_DETAIL_CONVERSATIONS_JSON` no `fixtures.env`;
- rodar `inbox-detail vu1` e `inbox-detail vu5`;
- exigir 0% erro, 0 `session_replaced` e 0 `Conversa fora do seu departamento`.

Status 78N.3 final-final: executado. A metodologia do laboratorio de carga v1 esta estabilizada. Proximos passos:

- nao executar `vu50` neste ciclo;
- abrir 78O para Capacity & Swap Hardening preventivo;
- abrir investigacao tecnica para `inbox-read`/query path antes de declarar capacidade contratual acima de `vu10`;
- manter fixtures congeladas salvo mudanca funcional relevante no produto.

Status 2026-09-01: antes de avancar a declaracao de escala CRA 30 agentes, medir
durante expediente SECULT em janelas START, MID e END:

- active app users;
- realtime connections;
- inbox presence;
- `/app/conversations` requests/min;
- query counts;
- runtime fallbacks;
- backend CPU;
- DB pressure.

Objetivo: confirmar ou rejeitar a hipotese `active Inbox use <-> backend CPU`.

### 78P - HA Runtime

- usar resultados do load test para decidir:
  - app node maior;
  - segundo backend;
  - Postgres gerenciado;
  - object storage;
  - fila/worker.

## Roadmap Tecnico

| Sprint | Objetivo | Observacao |
| --- | --- | --- |
| 78N | Capacity & Swap Hardening | reduzir risco operacional imediato da VPS. |
| 78O | Authenticated Load Test MVP | k6, staging, Public API/Search/Inbox/Login com credenciais de teste. |
| 78P | HA Runtime Plan/Implementation | orientado por dados do 78O. |
| 78Q | DB/Query Profiling | se Search/Inbox/Public API saturarem no DB. |
| 78R | WebSocket/Realtime Load | somente quando houver estrategia multi-node/realtime. |

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| derrubar producao durante carga | Alto | usar staging; producao somente smoke curto. |
| dataset irreal | Medio/alto | seed controlado e representativo. |
| metricas em memoria resetarem | Medio | exportar snapshots antes/depois. |
| confundir gargalo de VPS com gargalo de produto | Alto | separar teste em VPS atual e infra alvo. |
| vazamento de PII em carga | Alto | usar dados sanitizados. |
| custos de provider | Medio | desabilitar envios reais; mocks/controlado. |

## Producao: Regra De Segurança

Em producao, antes de qualquer teste:

1. confirmar backup PostgreSQL atual e valido;
2. confirmar restore procedure conhecido;
3. confirmar PM2 e health saudaveis;
4. definir janela curta;
5. limitar RPS;
6. ter comando de parada;
7. nao testar envio real em massa;
8. coletar metricas antes/depois;
9. abortar se p95, erro, CPU ou memoria ultrapassarem limite.

## Result Report

- Auditoria de capacidade concluida.
- Cenarios de carga definidos.
- Metricas e criterios de sucesso definidos.
- k6 recomendado como ferramenta MVP.
- Staging/ambiente isolado recomendado para carga real.
- Producao limitada a smoke controlado.
- Roadmap 78N-78P definido.
- Nenhuma alteracao funcional foi realizada.
