# Sprint 78H - Runtime Alerting MVP

Data: 2026-06-24

Escopo: implementacao do primeiro mecanismo interno de alerting do Converta, sem provider externo, sem banco, sem migration, sem Prometheus, sem Grafana, sem OpenTelemetry, sem Slack, sem e-mail, sem WhatsApp e sem webhook.

## Resumo Executivo

A Sprint 78H cria o Alert Engine interno em memoria para detectar condicoes operacionais basicas a partir do snapshot ja existente de metricas.

O MVP cobre:

- DB offline;
- health NOK;
- erro HTTP elevado;
- latencia p95 acima do limite;
- memoria RSS acima do limite;
- deduplicacao por fingerprint;
- ACK manual;
- resolucao automatica quando a condicao desaparece;
- snapshot protegido por rota admin.

Nao ha persistencia. Os alertas reiniciam no reload do backend.

## Auditoria De Reaproveitamento

| Area | Reaproveitado | Criado | Nao duplicado |
| --- | --- | --- | --- |
| `internalMetrics` | `getMetricsSnapshot`, counters, gauges, timings, p95 e process diagnostics | avaliacao de thresholds sobre o snapshot | nao foi criado novo sistema de metricas |
| Runtime Dashboard | `/admin/ops/metrics` continua sendo a fonte operacional | novo snapshot `/admin/ops/alerts` | nao foi criada nova API de metricas |
| Logging | logger central com redaction e envelope padronizado | eventos `alert.created`, `alert.acknowledged`, `alert.resolved` | nao foi criado logger paralelo |
| Health | gauges `health.db.status`, `db_duration`, `dependency_duration` | alertas `health:nok` e `db:offline` | nao foi alterado o endpoint de health |
| Alerting Design | severidade, thresholds, ACK e resolve definidos na 78G | `internalAlertManager.ts` | sem notificacoes externas |

## Implementacao

Arquivo criado:

- `apps/whatsapp-agent/src/metrics/internalAlertManager.ts`

Rotas criadas:

- `GET /admin/ops/alerts`
- `POST /admin/ops/alerts/:id/ack`

Testes criados:

- `apps/whatsapp-agent/src/metrics/internalAlertManager.test.ts`

## Modelo De Alerta

Campos:

- `id`
- `fingerprint`
- `severity`
- `source`
- `status`
- `message`
- `firstSeen`
- `lastSeen`
- `occurrences`
- `acknowledged`
- `acknowledgedAt`
- `resolved`
- `resolvedAt`
- `metadata`

Tudo fica em memoria.

## Thresholds MVP

Valores iniciais:

| Alerta | Condicao |
| --- | --- |
| DB offline | `health.db.status <= 0` |
| Health NOK | snapshot nao OK ou DB offline |
| Error rate elevada | `http.errors >= ALERT_ERROR_COUNT_THRESHOLD` |
| Latencia alta | p95 de `request_duration`, `http.request.duration` ou `route_duration` >= `ALERT_REQUEST_P95_MS_THRESHOLD` |
| Memoria alta | `process.memory.rss.bytes >= ALERT_MEMORY_RSS_BYTES_THRESHOLD` |

Configuracao por env:

- `ALERT_ERROR_COUNT_THRESHOLD`
- `ALERT_REQUEST_P95_MS_THRESHOLD`
- `ALERT_MEMORY_RSS_BYTES_THRESHOLD`

Se ausentes, usa defaults conservadores.

## Dedupe

O alerta usa `fingerprint` estavel.

Se a mesma condicao continuar:

- nao cria duplicata;
- incrementa `occurrences`;
- atualiza `lastSeen`;
- preserva ACK enquanto o alerta segue ativo.

## ACK

`POST /admin/ops/alerts/:id/ack`:

- exige acesso admin;
- marca `acknowledged=true`;
- grava `acknowledgedAt`;
- registra `alert.acknowledged`.

ACK nao resolve o alerta.

## Resolve

Na avaliacao seguinte:

- se a condicao desapareceu, o alerta vira `resolved`;
- grava `resolvedAt`;
- registra `alert.resolved`.

## Snapshot

`GET /admin/ops/alerts` retorna:

- `active`;
- `resolved`;
- `acknowledged`;
- `counts`;
- `generatedAt`.

Nao retorna PII, secrets, tokens, payload bruto, transcript, telefone, e-mail, waId ou media URL.

## Fora Do Escopo

Nao implementado nesta sprint:

- persistencia de alertas;
- silence;
- notification providers;
- Slack;
- e-mail;
- WhatsApp;
- webhook;
- cron;
- worker;
- Prometheus;
- Grafana;
- OpenTelemetry;
- dashboard visual de alertas.

## Rollback

Rollback funcional:

- reverter commit/redeploy.

Como o estado e em memoria, reload limpa alertas ativos. O mecanismo nao e dependencia de canais, login, IA, chatbot, Public API, Webchat, Telegram, Scheduling, Search ou Audio.

## Result Report

- Auditoria de reaproveitamento concluida.
- `internalMetrics` foi reaproveitado.
- Logger central foi reaproveitado.
- Health existente foi reaproveitado.
- `AlertManager` interno criado.
- Snapshot interno criado.
- ACK criado.
- Resolve automatico criado.
- Sem dependencia externa.
- Sem banco/migration.
- Sem runtime funcional alterado.
