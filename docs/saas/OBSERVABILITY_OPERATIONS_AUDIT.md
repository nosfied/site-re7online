# Sprint 78A - Observability & Operations Audit

Data: 2026-06-24

Escopo: auditoria documental e tecnica da maturidade operacional do Converta para contratos corporativos e governamentais.

Nao houve alteracao de codigo, banco, migration, runtime, canais, login, IA, chatbot, filas, providers ou infraestrutura. Este documento apenas consolida a leitura operacional atual e o roadmap recomendado.

## Resumo Executivo

O Converta ja possui base operacional relevante para contratos B2B/B2G:

- logs JSON estruturados via `src/logger/logger.ts`;
- contexto por `AsyncLocalStorage`;
- `requestId` persistido em mensagens, eventos e varias rotas;
- model `Event` tenant-scoped com indices por `requestId`, `messageId`, `eventName` e `waIdCanonical`;
- health publico com checagem de banco;
- PM2 com autorestart e `max_memory_restart`;
- scripts de deploy, backup/restore, replay, shadow compare, retention, storage report e smoke;
- feature flags por tenant para rollout/rollback;
- redaction recorrente em fluxos sensiveis de tokens, secrets, webhooks, MFA e canais;
- metricas de conversa/SLA e `/admin/metrics` operacional.

A maturidade ainda e **parcial** para contratos maiores porque faltam:

- readiness/liveness separados;
- endpoint de metricas padronizado para scraping;
- dashboards operacionais formais;
- tracing distribuido;
- alertas automatizados;
- RTO/RPO formal com restore testado periodicamente;
- plano HA/capacidade com evidencia de carga;
- observabilidade consolidada por tenant/canal/provider.

Classificacao consolidada: **ATENDE COM AJUSTE**.

Percentual operacional estimado: **72%**.

## Evidencias Auditadas

Arquivos e areas observadas:

- `apps/whatsapp-agent/src/logger/logger.ts`;
- `apps/whatsapp-agent/src/http/health.route.ts`;
- `apps/whatsapp-agent/src/http/routes.ts`;
- `apps/whatsapp-agent/src/metrics/conversationMetrics.ts`;
- `apps/whatsapp-agent/src/features/clientFeatures.ts`;
- `apps/whatsapp-agent/prisma/schema.prisma`;
- `apps/whatsapp-agent/ecosystem.config.cjs`;
- `apps/whatsapp-agent/scripts/deploy-vps.sh`;
- `apps/whatsapp-agent/scripts/backup-data.sh`;
- `apps/whatsapp-agent/scripts/restore-data.sh`;
- scripts de replay/shadow/check/process em `apps/whatsapp-agent/scripts`;
- `docs/RUNBOOK_WHATSAPP_AGENT.md`;
- `docs/onboarding.md`;
- `docs/saas/RELEASE_CHECKLIST.md`;
- `docs/saas/GOVERNMENT_READY_REVIEW.md`;
- `docs/saas/B2G_READINESS_AUDIT.md`.

## Matriz Consolidada

| Area | Classificacao | Evidencia atual | Gap principal | Risco | Prioridade |
| --- | --- | --- | --- | --- | --- |
| Logging estruturado | ATENDE | Sprint 78B padroniza envelope central com `level`, `event`, `requestId`, `correlationId`, `tenantId`, `userId`, `channel`, `module` e `durationMs` | ainda falta adocao gradual em todos os eventos novos e reduzir `console.*` em CLIs quando fizer sentido | Baixo/medio | 78C |
| Redaction/PII | ATENDE COM AJUSTE | Sprint 78B adiciona redaction recursiva para tokens, secrets, ciphertext, cookies, OTP/MFA/recovery codes, raw payload, media URL e transcript; mascara email/phone/waId | ainda falta varredura continua de payloads persistidos em `Event` e relatorios de cliente | Medio | 78C/78E |
| Request correlation | ATENDE COM AJUSTE | `requestId`, `correlationId` e `tenantId` sao normalizados no logger central; `tenantId` cai para `clientId` quando necessario | nem todos os endpoints e CLIs garantem correlacao uniforme com canal/provider/duration | Medio | 78C |
| Auditoria | ATENDE COM AJUSTE | `Event` tenant-scoped, eventos por canais, MFA, webhooks, search, audio, scheduling | falta tela/relatorio formal de auditoria operacional para cliente e operador interno | Medio/alto | 78E |
| Metricas de atendimento/SLA | ATENDE | `ConversationMetrics`, `SLAConfig`, reports/dashboard, breach logs | precisa consolidar visao operacional por tenant/canal/atendente | Medio | 78E |
| Metricas tecnicas | ATENDE COM AJUSTE | Sprint 78C cria `metrics.counter/gauge/timing` e `/admin/ops/metrics`; Sprint 78E amplia snapshot com p95 aproximado, averages, memoria/CPU/uptime, `request_count`, `request_duration`, `module_duration`, `route_duration`, `db_duration` e `dependency_duration`; Sprint 78F cria `/admin/ops` como dashboard interno visual; Sprint 78G desenha alerting, thresholds, ACK, silence e storm protection; Sprint 78H cria AlertManager interno em memoria com snapshot/ACK/resolve | ainda nao ha historico persistente, Prometheus/OpenTelemetry, notificacoes externas ou dashboard NOC externo | Medio/alto | 78I |
| Health check | ATENDE COM AJUSTE | `/health` testa DB e uptime, alimenta gauges internos e agora mede `db_duration`/`dependency_duration` para DB | nao separa liveness/readiness; nao cobre providers, storage, filas, PM2/frontend | Medio | 78F |
| Monitoramento PM2 | ATENDE COM AJUSTE | `ecosystem.config.cjs`, autorestart, max memory 300M, runbooks com `pm2 logs/status` | sem alertas automaticos de memoria/CPU/restart/disk; instancia unica | Alto | 78D/78F |
| Deploy | ATENDE COM AJUSTE | `deploy-vps.sh`, migrate/build/reload/health, checklist e deploy controlado | script padrao roda build frontend/backend; VPS exige builds sequenciais; rollback ainda manual | Medio | 78B |
| Rollback | ATENDE COM AJUSTE | feature flags e runbooks; rollback por flag em modulos sensiveis | rollback de migration/restore nao e exercitado automaticamente; sem playbook por severidade | Medio/alto | 78B/78F |
| Backup/restore | ATENDE COM AJUSTE | `backup-data.sh`, `restore-data.sh`, docs com `pg_dump`; backup `.data` com retencao 14 dias | falta politica formal DB+media, restore drill, RPO/RTO e storage externo | Alto | 78F |
| Feature flags | ATENDE | `Client.features`, defaults conservadores, flags por modulo, rollout por tenant | falta dashboard operacional de flags/riscos por tenant | Baixo/medio | 78E |
| Smoke/replay/shadow | ATENDE | `evaluation:replay`, shadow compares, scripts de smoke, CLIs dry-run/execute | precisa consolidar suite operacional unica por release | Medio | 78B |
| Observabilidade por tenant | ATENDE COM AJUSTE | tenant/clientId em eventos e dados; metrics/admin por clientKey; `/admin/ops` mostra snapshot tecnico interno | sem dashboard historico por tenant/canal/provider | Medio/alto | 78G/78H |
| Tracing distribuido | NAO ATENDE | nao localizado OpenTelemetry/traces/span model | sem spans cross-endpoint/provider/DB | Medio/alto | 78D |
| Alertas | ATENDE COM AJUSTE | Sprint 78G cria o desenho de alerting com fontes, severidade, thresholds, ACK, silence, dedupe, rollback e roadmap; Sprint 78H cria AlertManager interno em memoria com DB offline, health NOK, erro elevado, latencia alta, memoria alta, ACK e resolve automatico | ainda nao ha persistencia, silence, notificacoes reais ou central visual de alertas | Alto | 78I/78J |
| HA/escala | ATENDE COM AJUSTE | app roda em PM2, DB Postgres, scripts e flags | instancia unica, sem balanceamento, sem replica/standby documentado, sem teste 400 usuarios/30 numeros | Alto | 78F |

## 1. Logging

Classificacao: **ATENDE COM AJUSTE**.

O logger central em `src/logger/logger.ts` emite JSON com `timestamp`, `requestId`, contexto e campos do evento. Ele usa `AsyncLocalStorage`, o que permite carregar contexto por request quando o fluxo usa `logger.withContext`/`logger.updateContext`.

Pontos fortes:

- logs estruturados em JSON;
- niveis `info`, `warn` e `error`;
- redaction basica para chaves que contenham `token` ou `authorization`;
- muitos fluxos recentes registram eventos redigidos;
- logs de erro e auditoria normalmente carregam `requestId`.

Gaps:

- nao ha nivel `debug` formal;
- redaction central ainda nao cobre termos como `secret`, `ciphertext`, `password`, `code`, `cpf`, `email`, `phone`, `mediaUrl`, `rawPayload`;
- nem todo `console.*` legado esta necessariamente encapsulado no logger;
- nao ha contrato de schema de log por evento;
- nao ha amostragem/sampling central para logs de alta frequencia;
- nao ha destino externo padronizado de logs.

Risco: medio. O risco sobe para alto em incidentes com payloads sensiveis ou quando o volume de logs aumenta.

## 2. Metricas

Classificacao: **ATENDE COM AJUSTE**.

Evidencias:

- `ConversationMetrics` e `SLAConfig`;
- `/admin/metrics` com contadores de inbound/outbound, falhas, bloqueios e conversoes;
- scripts de resumo como `channel-latency:summary`;
- eventos persistidos para auditoria e contagem;
- metricas por modulos recentes via shadow/dry-run.

Cobertura por modulo:

| Modulo | Status | Observacao |
| --- | --- | --- |
| Login/MFA | PARCIAL | eventos e shadow/enforcement existem; falta dashboard de taxa/falha/lockout. |
| Canais | PARCIAL | eventos por WhatsApp/Messenger/Instagram/Webchat/Telegram; falta painel tecnico por canal/provider. |
| Webhooks/API publica | PARCIAL | audit events, deliveries/attempts e rate limit basico; falta painel de latencia/erro por endpoint. |
| Fila/jobs | NAO ATENDE | nao ha fila duravel central; CLIs e shadows sao manuais. |
| Campanhas | PARCIAL | counts/status existem; falta monitoramento tecnico de throughput/falha por provider. |
| Scheduling | PARCIAL | reminders/send/shadow registram eventos; falta dashboard operacional. |
| Search | PARCIAL | shadow/index events existem; falta metrica de query latency/index freshness. |
| Audio | PARCIAL | jobs/transcriptions existem; falta custo, duracao, provider latency e dashboard. |
| MFA | PARCIAL | eventos existem; falta relatorio de administracao/risco. |

Gaps:

- sem endpoint `/metrics` Prometheus-style;
- sem series historicas tecnicas formais;
- sem agregacao de latencia por rota/provider;
- sem alertas por taxa de erro;
- sem SLO operacional configurado.

## 3. Health Checks

Classificacao: **ATENDE COM AJUSTE**.

O endpoint `/health` retorna:

- `ok`;
- status do DB por `SELECT 1`;
- uptime;
- timestamp.

Pontos fortes:

- simples, rapido e util para smoke;
- retorna 503 quando DB falha;
- ja foi usado nos deploys controlados.

Gaps:

- nao ha separacao entre liveness e readiness;
- nao valida storage, disco, providers Meta/Telegram/OpenAI, webhooks, SMTP, VAPID, PM2/frontend;
- nao reporta versao/commit/migration status;
- nao retorna degradacao parcial por dependencia;
- nao existe health autenticado mais rico para operacao B2G.

Recomendacao: criar em 78C:

- `/health/live`;
- `/health/ready`;
- `/admin/operations/health`;
- dependencia DB, storage, disk, migrations, outbound providers e queue/job status quando existirem.

## 4. Monitoramento

Classificacao: **ATENDE COM AJUSTE**.

Evidencias:

- PM2 com `autorestart`;
- `max_memory_restart: "300M"`;
- runbooks com `pm2 status`, `pm2 logs`, `pm2 reload --update-env`;
- deploy script valida health pos-reload;
- experiencia operacional recente registrou regra pratica: build sequencial na VPS por memoria.

Gaps:

- sem alerta automatico de restart loop;
- sem alerta de CPU/memoria/disco;
- sem dashboard de PM2;
- sem coleta centralizada de logs;
- instancia unica do backend;
- sem monitoramento externo de uptime documentado.

Classificacao para contratos pequenos: **ATENDE COM AJUSTE**.

Classificacao para contratos com SLA alto/HA: **NAO ATENDE** ate haver alertas e redundancia.

## 5. Observabilidade

Classificacao: **ATENDE COM AJUSTE**.

Pontos fortes:

- requestId e Event ajudam rastreabilidade;
- eventos recentes sao redigidos e tenant-scoped;
- scripts de shadow e replay permitem comparar comportamento;
- modulos sensiveis foram introduzidos com dry-run, shadow, execute explicito e flags.

Gaps:

- sem tracing distribuido;
- sem span de provider externo;
- sem dashboard tecnico por tenant;
- sem correlacao padronizada `requestId` -> DB event -> provider call -> UI;
- sem cardinalidade/convencao central de campos.

Recomendacao: 78D deve introduzir runtime observability sem reescrever modulos: middleware de request, helper de span leve, agregacao de duration, eventos padronizados e export opcional.

## 6. Operacao

Classificacao: **ATENDE COM AJUSTE**.

O processo operacional evoluiu bastante:

- deploy controlado por sprint;
- `prisma validate/generate/migrate status/deploy`;
- builds sequenciais quando necessario;
- replay obrigatorio;
- shadow compares;
- smoke funcional;
- PM2 reload com rollback por flag;
- scripts de backup/restore `.data`;
- runbooks.

Gaps:

- backup DB e media precisam virar rotina versionada e agendada;
- restore drill nao esta evidenciado como rotina;
- rollback de migration ainda exige decisao manual;
- checklist por severidade/incidente ainda nao esta formalizado;
- deploy script generico pode nao refletir a cautela atual de builds sequenciais em VPS pequena.

## 7. SLA

Classificacao: **ATENDE COM AJUSTE**.

Evidencias:

- `SLAConfig`;
- `ConversationMetrics`;
- first response/resolution;
- logs `sla.first_response_breached`;
- reports/dashboard.

Gaps:

- disponibilidade, MTTR e MTBF nao estao medidos automaticamente;
- SLO por tenant/canal nao formalizado;
- alertas de breach ou provider outage nao existem;
- nao ha relatorio executivo de SLA contratual completo por periodo.

## 8. Seguranca Operacional

Classificacao: **ATENDE COM AJUSTE**.

Pontos fortes:

- secrets sensiveis migrados para DB criptografado onde aplicavel;
- rotacao em webhooks/MFA/Telegram/ChannelAccount;
- hash-only para API keys, webhooks e recovery codes conforme contexto;
- redaction foi maturada nas sprints de ChannelAccount, AI, Webhooks, MFA e Audio;
- retention/LGPD existe.

Gaps:

- inventario formal de secrets por ambiente ainda nao esta centralizado no runbook;
- falta politica de rotacao periodica por classe de segredo;
- redaction central precisa ser ampliada;
- auditoria de acesso a dados sensiveis ainda nao tem tela/relatorio formal;
- falta check automatizado de env vars obrigatorias por modulo antes de enable.

## 9. Escalabilidade

Classificacao: **ATENDE COM AJUSTE**.

Pontos fortes:

- tenant isolation no DB;
- indices relevantes em mensagens/eventos/conversas;
- features novas entram desligadas;
- trabalhos pesados recentes usam CLI/dry-run/execute, evitando cron automatico;
- SearchIndex e AudioTranscription foram introduzidos sem runtime automatico.

Gaps:

- sem fila duravel central para jobs;
- sem worker separado;
- sem benchmark formal de 400 usuarios simultaneos;
- sem prova de 30 numeros WhatsApp/5 Instagrams;
- storage 600 GB ainda requer arquitetura e custo;
- SearchIndex precisa politica de tamanho/retencao/index freshness;
- upload/midia precisa plano de storage externo e cleanup.

## Aderencia Operacional Por Contrato

| Cenario | Classificacao | Leitura |
| --- | --- | --- |
| POC municipal controlada | ATENDE | Health, PM2, replay, smoke, flags e runbooks bastam para demonstracao. |
| Contrato pequeno WhatsApp-first | ATENDE COM AJUSTE | Operavel com monitoramento manual e runbooks; faltam alertas/dashboards formais. |
| Contrato multicanal medio | ATENDE COM AJUSTE | Produto tem cobertura funcional; operacao precisa dashboards, metricas e health enriquecido. |
| Contrato grande com SLA forte | NAO ATENDE | Falta HA, alertas, RTO/RPO formal, restore drill e prova de carga. |
| Edital com exigencia de NOC/observabilidade | NAO ATENDE | Falta stack de observabilidade e evidencias formais. |

## Principais Riscos Operacionais

| Risco | Severidade | Motivo | Mitigacao |
| --- | --- | --- | --- |
| Falha silenciosa de provider | Alta | Sem alerta automatizado por Meta/Telegram/OpenAI/Webhook | 78C/78D metricas e alertas. |
| Exaustao de disco/storage | Alta | Midia, logs e backups crescem; sem alerta formal | 78C health disk + 78F storage externo. |
| Restart loop PM2 | Alta | PM2 reinicia, mas sem alerta externo | 78D monitoramento/alerta. |
| Vazamento em log | Alta | Redaction central ainda curta | 78B ampliar redaction e testes. |
| Restore nao testado | Alta | Backup existe, mas restore drill formal nao evidenciado | 78F runbook RTO/RPO e drill. |
| Latencia sem diagnostico | Media/alta | Profiling existe em alguns pontos, mas nao como plataforma | 78C/78D tracing leve e metrics. |
| Crescimento de SearchIndex/Event | Media | Sem politica operacional de retencao/tamanho por modulo | 78C/78F retencao e storage. |
| Deploy em VPS limitada | Media | Build paralelo ja gerou instabilidade historica | Atualizar runbook/deploy para build sequencial. |

## Roadmap Recomendado

### 78B - Logging Hardening

Objetivo:

- ampliar redaction central;
- padronizar campos obrigatorios;
- criar helper de evento operacional;
- reduzir `console.*` direto;
- adicionar testes de nao vazamento para tokens/secrets/codes/mediaUrl/rawPayload;
- documentar schema minimo de log.

Resultado esperado:

- logs mais seguros;
- menor risco LGPD;
- base melhor para metrics/tracing.

Status: implementado como hardening interno. O logger central foi reaproveitado, ganhou `debug`, envelope padrao, `correlationId`, `tenantId` derivado de `clientId`, redaction recursiva e testes focados em vazamento de PII/secrets. Documento oficial: `docs/saas/LOGGING_AUDIT_STANDARD.md`.

### 78C - Metrics Foundation

Objetivo:

- criar health/readiness/liveness separados;
- criar metricas internas padronizadas por rota/modulo/provider;
- expor endpoint admin de operacao;
- registrar latencia/erro por tenant/canal/provider;
- incluir checks de DB/disk/storage/env.

Resultado esperado:

- capacidade de diagnostico sem depender apenas de logs manuais.

Status: implementado como fundacao interna em memoria. Foram criados `metrics.counter`, `metrics.gauge`, `metrics.timing`, sanitizacao de labels, endpoint protegido `GET /admin/ops/metrics`, instrumentacao HTTP por rota/modulo/status/duracao, gauges de health/db e contadores de webhook shadow/dispatch. Documento oficial: `docs/saas/METRICS_FOUNDATION.md`.

### 78D - Observability Runtime

Objetivo:

- desenhar request lifecycle, correlation, dependency timings e tracing futuro;
- definir dashboards de API, canais, filas, Search, Audio, MFA, Webhooks, Public API e Scheduling;
- projetar alertas de erro, latencia, fila, memoria, CPU, disco e banco;
- definir MTTR, MTBF, SLA tecnico e SLO inicial;
- comparar JSON interno, Prometheus, OpenTelemetry/OTLP e export externo;
- separar roadmap 78E-78H.

Resultado esperado:

- incidentes passam a ter arquitetura de rastreabilidade ponta a ponta antes da implementacao runtime.

Status: concluido como design documental. A Sprint 78D criou `docs/saas/RUNTIME_OBSERVABILITY_DESIGN.md`, recomendando manter JSON interno como MVP, evoluir primeiro runtime metrics/readiness/dependency timing e deixar Prometheus/OpenTelemetry/Grafana para etapa posterior. Nao houve alteracao funcional.

### 78E - Runtime Metrics

Objetivo:

- ampliar metricas canonicas de request, rota, modulo, DB e dependencia;
- adicionar p95 aproximado em timings;
- expor uptime, memoria e CPU no snapshot protegido;
- manter endpoint admin e labels redigidos;
- nao criar dependencia externa.

Resultado esperado:

- diagnostico runtime mais completo sem Prometheus/Grafana/OpenTelemetry.

Status: implementado como MVP interno. Documento oficial: `docs/saas/RUNTIME_METRICS_FOUNDATION.md`.

### 78F - Dashboards

Objetivo:

- dashboard operacional interno por tenant;
- paineis de canais, provider errors, API publica, webhooks, MFA, search, audio, scheduling;
- painel de auditoria/eventos para cliente quando aplicavel.

Resultado esperado:

- evidencias comerciais e operacionais para editais.

Status: implementado como MVP interno na Sprint 78F. A rota `/admin/ops` consome apenas `GET /admin/ops/metrics`, sem API nova, sem polling, sem stack externa e sem persistencia historica. Documento oficial: `docs/saas/OPERATIONAL_DASHBOARD.md`.

### 78G - Alerting

Objetivo:

- regras de alerta para health, DB, erro, latencia, disco, memoria, CPU, PM2 restart e provider;
- canal de notificacao interno;
- runbooks por severidade.

Resultado esperado:

- reduzir tempo de deteccao e iniciar MTTR real.

### 78H - HA / Scale

Objetivo:

- plano de 400 usuarios simultaneos;
- 30 WhatsApps e 5 Instagrams;
- storage 600 GB;
- backups externos;
- restore drill;
- RTO/RPO;
- opcao de replica/standby/load balancer;
- teste de carga e relatorio.

Resultado esperado:

- contratos maiores deixam de depender de promessa operacional.

## Ordem Otima

1. **78B Logging Hardening**: reduz risco imediato de LGPD/secrets.
2. **78C Metrics Foundation**: implementada com metricas internas e endpoint diagnostico protegido.
3. **78D Runtime Observability Design**: concluida como arquitetura, export strategy, dashboards e alertas.
4. **78E Runtime Metrics**: implementada como MVP interno com p95 aproximado, process metrics e dependency timing DB.
5. **78F Dashboards**: implementada como dashboard operacional interno inicial.
6. **78G Alerting**: reduz tempo de deteccao com regras e runbooks.
7. **78H HA / Scale**: prepara Aripuana/Rio Preto e contratos grandes.

## Impacto Em Editais

| Item de edital | Estado apos 78A | Impacto |
| --- | --- | --- |
| SLA de atendimento | ATENDE COM AJUSTE | SLA funcional existe; disponibilidade/MTTR/MTBF ainda precisam metricas. |
| Relatorios operacionais | ATENDE COM AJUSTE | Reports existem; dashboard NOC/auditoria ainda parcial. |
| Seguranca/LGPD | ATENDE COM AJUSTE | Boa base de secrets/redaction; precisa hardening central de logs. |
| Alta disponibilidade | NAO ATENDE | Falta arquitetura/infra HA formal. |
| Backup/restore | ATENDE COM AJUSTE | Scripts existem; falta RPO/RTO e restore drill. |
| Monitoramento 24x7 | NAO ATENDE | Sem alertas externos/NOC documentado. |
| Escalabilidade | ATENDE COM AJUSTE | Base DB/flags boa; falta prova de carga e sizing. |

## Criterio De Sucesso Para Fechar 78A

- auditoria completa de logging, metricas, health, monitoramento, operacao, SLA, seguranca e escala;
- classificacao ATENDE/ATENDE COM AJUSTE/NAO ATENDE;
- riscos operacionais identificados;
- roadmap 78B-78F definido;
- documentos de readiness atualizados;
- nenhuma alteracao funcional realizada.

## Confirmacao De Escopo

Sprint 78A:

- nao altera codigo;
- nao altera banco;
- nao cria migration;
- nao altera runtime;
- nao altera canais;
- nao altera login;
- nao altera IA/chatbot;
- nao altera infraestrutura.

Resultado: auditoria operacional concluida e pronta para orientar hardening incremental.
