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
