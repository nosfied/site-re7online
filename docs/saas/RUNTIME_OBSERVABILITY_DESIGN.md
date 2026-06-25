# Sprint 78D - Runtime Observability Design

Data: 2026-06-24

Escopo: desenho tecnico e operacional da observabilidade runtime do Converta, sem codigo, banco, migration, Prometheus, Grafana, OpenTelemetry ou stack externa.

## Resumo Executivo

A Sprint 78D define como evoluir a base criada nas Sprints 78A, 78B e 78C para observabilidade completa:

- logs estruturados e redigidos;
- metricas internas em memoria;
- health com DB status;
- endpoint protegido `/admin/ops/metrics`;
- `requestId`, `correlationId` e `tenantId`;
- eventos de auditoria tenant-scoped.

O Converta ja possui uma fundacao solida para diagnostico controlado. O gap agora e transformar essa fundacao em operacao observavel ponta a ponta:

- ciclo completo de request;
- spans/etapas por dependencia;
- latencia por modulo, rota, canal e provider;
- dashboards operacionais;
- alertas;
- SLO/SLA tecnico;
- exportacao futura para stack externa.

Recomendacao de MVP: evoluir em duas fases.

1. **Runtime Metrics interno ampliado**: manter o modelo leve atual, adicionando dependency timings, readiness/liveness e metricas por modulo sem dependencia externa.
2. **Export padronizado**: preparar primeiro JSON/OTLP bridge, com decisao posterior entre Prometheus scrape e OpenTelemetry/OTLP conforme infraestrutura escolhida.

Classificacao apos 78D: **ATENDE COM AJUSTE**. O desenho esta pronto, mas a implementacao runtime, dashboards e alertas ainda nao existem.

## Confirmacao De Escopo

Esta sprint:

- nao altera codigo;
- nao altera banco;
- nao cria migration;
- nao altera runtime;
- nao adiciona Prometheus;
- nao adiciona Grafana;
- nao adiciona OpenTelemetry;
- nao cria dashboard;
- nao cria alerta;
- nao altera canais, login, IA, chatbot, Public API, Webchat, Telegram, Scheduling ou Search.

## 1. Auditoria Do Que Ja Existe

| Area | Existe hoje | Leitura |
| --- | --- | --- |
| Logs estruturados | Sim | Sprint 78B padronizou envelope, levels, taxonomia e redaction. |
| Request context | Sim | Logger usa `requestId`, `correlationId`, `tenantId` e `AsyncLocalStorage`. |
| Auditoria persistida | Sim | Model `Event` tenant-scoped com eventos de canais, MFA, webhooks, search, audio e scheduling. |
| Health | Sim | `/health` valida DB, uptime e timestamp. |
| Metricas internas | Sim | Sprint 78C criou `metrics.counter/gauge/timing` e snapshot em memoria. |
| Endpoint operacional | Sim | `GET /admin/ops/metrics`, protegido pelo fluxo admin. |
| Request metrics | Sim | `http.requests`, `http.errors`, `http.request.duration` por rota normalizada/modulo/status. |
| Health gauges | Sim | `health.db.status` e `process.uptime.seconds`. |
| Webhook metrics | Parcial | Shadow/dispatch manual contam requests/outcomes/duration. |
| Conversation metrics | Sim | `ConversationMetrics` cobre SLA/atendimento. |
| SLA funcional | Sim | `SLAConfig`, reports e breach logs. |
| Dashboards tecnicos | Nao | Existem dashboards de produto, mas nao NOC/operacao. |
| Alertas | Nao | Operacao ainda depende de consulta manual/PM2/runbooks. |
| Tracing distribuido | Nao | Nao ha spans nem OpenTelemetry. |
| Readiness/liveness | Nao | `/health` combina liveness e readiness basico. |
| Historico tecnico | Nao | Metricas internas sao em memoria e resetam no reload. |

## 2. O Que Precisa Nascer

### Curto Prazo

- health split:
  - `/health/live`;
  - `/health/ready`;
  - `/admin/ops/health`;
- dependency timing leve:
  - DB;
  - provider externo;
  - storage/media;
  - dispatch webhook;
  - STT/audio;
  - Bot API Telegram;
  - Meta Graph API;
- snapshot operacional por modulo;
- SLO tecnico minimo;
- matriz de alertas;
- dashboard interno simples ou endpoint JSON suficiente para painel.

### Medio Prazo

- export Prometheus ou OTLP;
- historico de metricas;
- alertas ativos;
- dashboard NOC;
- tracing distribuido ou spans padronizados;
- drill de incidentes;
- capacidade multi-instancia.

### Fora Do Escopo Imediato

- APM comercial;
- tracing completo em todos os metodos;
- coleta de payloads;
- metricas com alta cardinalidade;
- logs com PII;
- dashboards por cidadao/contato.

## 3. Arquitetura Runtime Recomendada

### Request Lifecycle

Fluxo alvo para qualquer request HTTP:

```text
HTTP request
->
requestId/correlationId
->
tenant resolution quando aplicavel
->
route/module classification
->
operation spans internos
->
dependency timings
->
response status
->
metrics + log + audit event quando necessario
```

Campos minimos por request:

| Campo | Origem | Uso |
| --- | --- | --- |
| `requestId` | header ou gerado no middleware | correlacao local. |
| `correlationId` | header, requestId ou fluxo superior | correlacao cross-servico futura. |
| `tenantId` | auth, clientId, channel resolution ou adminAuth | filtro por tenant. |
| `module` | classificador de rota/servico | dashboard e alerta. |
| `route` | rota normalizada | latencia/erro sem alta cardinalidade. |
| `statusCode` | response finish | taxa de erro. |
| `durationMs` | request lifecycle | SLO tecnico. |

### Dependency Timing

Modelo leve recomendado:

```text
observability.span.start(name, labels)
observability.span.end(status)
```

Ou, sem criar abstracao nova de tracing no primeiro passo:

```text
metrics.timing("dependency.duration", durationMs, {
  module,
  dependency,
  operation,
  status,
  tenantId
})
```

Dependencias MVP:

| Dependencia | Operacoes |
| --- | --- |
| `db` | query, transaction, migration status em health admin |
| `meta_graph` | WhatsApp/Messenger/Instagram outbound e media download |
| `telegram_bot_api` | `sendMessage`, webhook setup futuro |
| `webhook_dispatch` | POST externo manual/automatico futuro |
| `openai_stt` | audio transcription controlled runtime |
| `storage` | upload/download/media cleanup |
| `search_index` | query, index record |

### Correlation Entre Camadas

Padrao recomendado:

```text
requestId
  - log entries
  - Event rows
  - InboundMessage/OutboundMessage requestId quando aplicavel
  - provider request metadata redigido
  - metrics labels de baixa cardinalidade
```

Regra: metricas devem evitar `userId`, `contactId`, `messageId`, telefone, e-mail e IDs de provider como labels. Esses dados podem existir em logs/auditoria redigidos quando necessarios, mas nao em labels de metricas.

## 4. Metricas Runtime Alvo

### HTTP/API

| Nome | Tipo | Labels |
| --- | --- | --- |
| `http.requests` | counter | module, route, method, statusCode |
| `http.errors` | counter | module, route, method, status |
| `http.request.duration` | timing | module, route, method, statusCode |
| `http.request.inflight` | gauge | module |

### DB

| Nome | Tipo | Labels |
| --- | --- | --- |
| `db.query.duration` | timing | module, operation, status |
| `db.transaction.duration` | timing | module, status |
| `db.status` | gauge | status |

### Canais

| Nome | Tipo | Labels |
| --- | --- | --- |
| `channel.inbound.received` | counter | channel, status, tenantId |
| `channel.inbound.persisted` | counter | channel, status, tenantId |
| `channel.outbound.sent` | counter | channel, status, tenantId |
| `channel.provider.duration` | timing | channel, provider, operation, status |
| `channel.provider.errors` | counter | channel, provider, operation, status |

### Public API

| Nome | Tipo | Labels |
| --- | --- | --- |
| `public_api.requests` | counter | route, method, statusCode |
| `public_api.denied` | counter | reason |
| `public_api.rate_limited` | counter | route |
| `public_api.duration` | timing | route, method, statusCode |

### Webhooks

| Nome | Tipo | Labels |
| --- | --- | --- |
| `webhook.delivery.created` | counter | event, status |
| `webhook.dispatch.duration` | timing | event, status |
| `webhook.dispatch.failed` | counter | event, reason |
| `webhook.dead_letter` | counter | event |

### Search

| Nome | Tipo | Labels |
| --- | --- | --- |
| `search.query.count` | counter | source, status |
| `search.query.duration` | timing | source, status |
| `search.index.records` | counter | source, status |
| `search.index.freshness.seconds` | gauge | source |

### Audio

| Nome | Tipo | Labels |
| --- | --- | --- |
| `audio.transcription.jobs` | counter | provider, status |
| `audio.transcription.duration` | timing | provider, status |
| `audio.transcription.cost_units` | gauge/counter | provider |
| `audio.media.cleanup.failed` | counter | provider |

### MFA/Auth

| Nome | Tipo | Labels |
| --- | --- | --- |
| `auth.login.count` | counter | status, role |
| `mfa.challenge.created` | counter | role, status |
| `mfa.challenge.verified` | counter | role, status |
| `mfa.challenge.failed` | counter | role, reason |
| `mfa.recovery.used` | counter | role, status |

### Scheduling

| Nome | Tipo | Labels |
| --- | --- | --- |
| `scheduling.appointments.created` | counter | status |
| `scheduling.reminders.eligible` | counter | channel, status |
| `scheduling.reminders.sent` | counter | channel, status |
| `scheduling.reminders.duration` | timing | channel, status |

## 5. Dashboards Futuros

### Dashboard API

Objetivo: saude tecnica do backend.

Cards:

- requests por minuto;
- taxa 4xx/5xx;
- p50/p95/p99 de latencia;
- rotas mais lentas;
- DB status;
- uptime;
- top modulos por erro.

### Dashboard Canais

Objetivo: operacao multicanal.

Cards:

- inbound/outbound por canal;
- falhas por provider;
- latencia provider;
- status de ChannelAccount;
- fallback/blocked events;
- conversas novas por canal.

### Dashboard Filas/Atendimento

Objetivo: SLA operacional.

Cards:

- first response;
- resolution;
- conversas abertas;
- conversas por fila/departamento;
- breaches;
- aging de conversas.

### Dashboard Search

Objetivo: saude da busca.

Cards:

- consultas por periodo;
- p95 de busca;
- resultados vazios;
- index records por source;
- freshness por source;
- erros de indexacao.

### Dashboard Audio

Objetivo: custo e qualidade de transcricao.

Cards:

- jobs por status;
- duracao media;
- falhas por provider;
- custo estimado;
- cleanup failures;
- transcript completed/failed/skipped.

### Dashboard MFA/Auth

Objetivo: seguranca de acesso.

Cards:

- logins bem sucedidos/falhos;
- MFA required;
- challenges criados/verificados/falhos;
- lockouts;
- recovery codes usados;
- tenants com enforcement ativo.

### Dashboard Webhooks/Public API

Objetivo: integracoes.

Cards:

- API requests por endpoint;
- denied/rate limited;
- webhook deliveries;
- dispatch success/failure;
- dead letter;
- latencia de endpoint externo.

### Dashboard Scheduling

Objetivo: agenda e lembretes.

Cards:

- compromissos criados/cancelados;
- reminders elegiveis/enviados/falhos;
- taxa de confirmacao futura;
- no-show futuro;
- falha provider por canal.

## 6. Alertas

### Alertas Criticos

| Alerta | Condicao sugerida | Acao |
| --- | --- | --- |
| Health down | `/health` 5xx por 2 checagens | reinicio/triagem imediata. |
| DB down | `db.status=0` por 1-2 min | verificar Postgres/rede/disco. |
| Error rate alto | 5xx > 5% por 5 min | revisar logs e ultimo deploy. |
| Latencia alta | p95 HTTP > 2s por 10 min | identificar modulo/rota. |
| PM2 restart loop | restarts > 3 em 10 min | rollback ou aumentar memoria. |
| Disco alto | uso > 85% | limpar logs/temp, validar backup/media. |
| Provider failure | falha Meta/Telegram/OpenAI > limite | acionar plano por provider. |

### Alertas Degradados

| Alerta | Condicao sugerida | Acao |
| --- | --- | --- |
| Public API 429 alto | taxa 429 acima do normal | revisar cliente/integracao. |
| Webhook dead letter | qualquer dead letter em tenant piloto | investigar endpoint externo. |
| Search zero results alto | aumento anormal | revisar index freshness. |
| Audio failed alto | falha STT/cleanup | pausar runtime e investigar provider. |
| MFA failed alto | falhas por usuario/tenant | investigar brute force ou suporte. |

### Canais De Alerta Futuros

Ordem recomendada:

1. log/console e runbook;
2. e-mail interno;
3. WhatsApp/Telegram interno de operacao;
4. ferramenta externa de monitoramento;
5. NOC formal para contratos grandes.

## 7. Operacao: MTTR, MTBF, SLA E SLO

### MTTR

Metrica alvo:

```text
incident.resolvedAt - incident.detectedAt
```

Na primeira fase, pode ser manual em runbook. Futuro: model/tabela ou ferramenta externa.

Meta inicial:

- POC: MTTR documentado manualmente;
- contrato pequeno: MTTR alvo 4h em horario comercial;
- contrato critico: MTTR alvo 1h ou conforme edital.

### MTBF

Metrica alvo:

```text
tempo entre incidentes P1/P2
```

Depende de catalogo de incidentes e alertas.

### SLA Tecnico

Separar:

- SLA de atendimento: first response/resolution, ja existe;
- SLA tecnico: disponibilidade, latencia e erro;
- SLA provider: Meta/Telegram/OpenAI/webhooks externos.

### SLO Inicial Recomendado

| SLO | Meta inicial |
| --- | --- |
| API uptime mensal | 99.5% para contratos pequenos; 99.9% apenas com HA. |
| HTTP 5xx | < 1% em janela de 10 min. |
| p95 `/app` APIs | < 1500 ms. |
| p95 webhooks inbound | < 1000 ms ate resposta HTTP. |
| DB health | 100% exceto manutencao. |
| PM2 restart inesperado | 0 por dia, investigacao se > 1. |

## 8. Export Strategy

### Opcoes

| Opcao | Vantagens | Riscos/limites | Fit |
| --- | --- | --- | --- |
| JSON interno | Simples, ja existe em `/admin/ops/metrics`, sem dependencia | sem historico, sem alerta, sem scraping padrao | MVP imediato |
| Prometheus | Padrao simples para metricas, bom para scrape e alertas | exige endpoint/infra/retencao, cuidado com labels | bom para VPS/infra propria |
| OpenTelemetry/OTLP | Padrao moderno para traces/metrics/logs, vendor neutral | maior complexidade inicial | melhor para stack madura |
| Grafana/Cloud stack | dashboards e alertas prontos | custo, operacao, credenciais, dependencia externa | fase posterior |

### Recomendacao

MVP recomendado:

1. manter JSON interno como fonte diagnostica imediata;
2. criar em 78E/78F um formato exportavel estavel:
   - `/admin/ops/metrics` JSON versionado;
   - opcional `/admin/ops/metrics/prometheus` somente se aprovado;
3. adotar OpenTelemetry/OTLP apenas depois de:
   - readiness/liveness;
   - dependency timings;
   - dashboards internos;
   - politica de labels e cardinalidade validada.

Motivo: o Converta ainda roda em VPS pequena e tem alto ritmo de mudancas. Prometheus/Grafana/OTel devem entrar depois que o modelo interno estiver estabilizado, para evitar retrabalho e cardinalidade perigosa.

## 9. Seguranca E Redaction

Regras permanentes:

- labels nunca devem conter telefone, e-mail, waId, contactId, messageId, provider IDs sensiveis, token, secret, cookie, Authorization, transcript, mediaUrl ou rawPayload;
- logs podem conter identificadores internos apenas quando redigidos e necessarios;
- metricas devem usar baixa cardinalidade;
- tenantId e permitido, mas dashboards externos devem avaliar anonimizacao/alias quando houver exigencia contratual;
- snapshots operacionais nao devem expor payload nem PII.

Campos proibidos em labels:

- `phone`;
- `email`;
- `waId`;
- `token`;
- `secret`;
- `authorization`;
- `cookie`;
- `ciphertext`;
- `rawPayload`;
- `mediaUrl`;
- `transcript`;
- `messageId`;
- `contactId`;
- `externalUserRef`;
- `providerUserId`.

## 10. Roadmap

### 78E - Runtime Metrics

Objetivo:

- health split live/ready/admin;
- dependency timings;
- inflight gauge;
- metricas especificas por Public API, canais, Search, Audio, MFA e Scheduling;
- testes de redaction/cardinalidade;
- sem stack externa ainda.

Resultado esperado:

- diagnostico runtime mais completo;
- p95 por modulo;
- visao de dependencias lentas/falhas.

Status: implementado como MVP interno na Sprint 78E. Foram adicionados nomes canonicos (`request_count`, `request_duration`, `route_duration`, `module_duration`, `db_duration`, `dependency_duration`), p95 aproximado em timings, memoria/CPU/uptime no snapshot e gauges de processo. O health split live/ready ainda fica para uma sprint posterior.

### 78F - Dashboards

Objetivo:

- dashboard interno operacional;
- consolidar `/admin/ops/metrics` em visualizacao;
- paineis por API, canais, Search, Audio, MFA, Webhooks, Scheduling;
- sem Prometheus/Grafana se ainda nao aprovado.

Resultado esperado:

- operacao visual para contratos pequenos/medios;
- material demonstravel para editais.

Status: implementado como MVP interno na Sprint 78F. A rota `/admin/ops` exibe health, DB, uptime, CPU, memoria, requests, errors, avg, p95 e tabela por modulo. Ainda nao ha historico, alertas, NOC externo ou graficos complexos.

### 78G - Alerting

Objetivo:

- desenhar regras de alerta;
- definir severidade, thresholds, ACK, silence e storm protection;
- mapear alertas de health, DB, 5xx, latencia, disco, PM2 restart e provider;
- definir rollback por flag antes de qualquer envio real.

Resultado esperado:

- arquitetura pronta para reduzir tempo de deteccao;
- proxima sprint apta a implementar runtime alerting controlado.

Status: design concluido na Sprint 78G em `docs/saas/ALERTING_NOTIFICATIONS_DESIGN.md`. A Sprint 78H implementa o avaliador runtime interno em memoria, com `GET /admin/ops/alerts` e `POST /admin/ops/alerts/:id/ack`. Ainda nao ha envio externo, Slack, e-mail, WhatsApp, cron, worker, persistencia, silence ou central visual de alertas.

### 78H - HA/Scale

Objetivo:

- plano de 400 usuarios simultaneos;
- 30 numeros WhatsApp;
- 5 Instagrams;
- storage 600 GB;
- backup externo;
- restore drill;
- RTO/RPO;
- load test;
- opcao de balanceamento/standby.

Resultado esperado:

- readiness para Aripuana/Rio Preto e contratos com SLA forte.

## 11. Criterios Para Proxima Implementacao

A Sprint 78E so deve implementar runtime metrics se:

- preservar compatibilidade do endpoint `/admin/ops/metrics`;
- manter labels com allowlist;
- nao criar dependencia externa;
- nao expor PII;
- adicionar testes para cardinalidade/redaction;
- nao aumentar latencia perceptivel no caminho quente;
- permitir rollback por remocao de uso sem alterar negocio.

## 12. Impacto Em Editais

| Exigencia | Estado apos 78D | Impacto |
| --- | --- | --- |
| Health/monitoramento | Design completo; implementacao parcial | Ajuda a provar roadmap, mas ainda requer 78E/78G. |
| SLA tecnico | SLO inicial definido | Ainda precisa coleta/historico. |
| Dashboards operacionais | Design definido | Ainda precisa 78F para demonstracao visual. |
| Alertas | Politica desenhada | Ainda precisa 78G para atender contratos com NOC. |
| HA/escala | Roadmap separado | Ainda precisa 78H e prova de carga. |
| LGPD/logs | Regras reforcadas | Continua forte pela 78B/78C. |

## 13. Result Report

Entregue:

- auditoria do que ja existe;
- arquitetura runtime;
- request lifecycle;
- dependency timing;
- dashboards futuros;
- alertas;
- SLO/MTTR/MTBF;
- estrategia de export;
- roadmap 78E-78H;
- atualizacao de documentos de readiness.

Nao entregue por decisao de escopo:

- codigo;
- migration;
- banco;
- Prometheus;
- Grafana;
- OpenTelemetry;
- alertas reais;
- dashboard real;
- alteracao funcional.
