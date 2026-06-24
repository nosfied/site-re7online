# Sprint 78C - Metrics Foundation

Data: 2026-06-24

Escopo: fundacao interna de metricas do Converta, sem Prometheus, Grafana, OpenTelemetry ou dependencia externa.

## Auditoria Previa

### O Que Ja Existia

| Area | Evidencia | Leitura |
| --- | --- | --- |
| Dashboard/app reports | `/app/dashboard`, `/app/reports`, reports em `routes.ts` | Reaproveitado como camada de produto, nao substituido. |
| `ConversationMetrics` | `src/metrics/conversationMetrics.ts` | Continua fonte de SLA/atendimento. |
| `SLAConfig` | schema Prisma e reports | Continua fonte de metas de atendimento. |
| `Event` | model tenant-scoped com `requestId` e `eventName` | Continua base de auditoria e contagem historica. |
| `/admin/metrics` | endpoint com KPIs de inbound/outbound/falhas/conversao | Mantido para metricas comerciais/admin. |
| Health | `/health` com check de DB | Reaproveitado e agora alimenta gauge interno. |
| Public API | audit events, rate limit, scopes | Reaproveitado; request metrics agora capturam modulo/rota/status. |
| Webhooks | deliveries/attempts, shadow/dispatch, audit events | Reaproveitado; contadores internos adicionados ao shadow/dispatch. |
| Search | `SearchIndex`, shadow/runtime, eventos | Reaproveitado; request metrics capturam `/app/search`. |
| Audio | `AudioTranscription`, jobs, shadow/process | Reaproveitado; request metrics capturam telas/API de audio. |
| MFA | challenges, shadow/enforcement, audit events | Reaproveitado; request metrics capturam `/auth/*` e `/app/mfa/*`. |

### O Que Foi Reaproveitado

- `ConversationMetrics` para SLA/atendimento;
- `Event` para auditoria persistida;
- `/admin/metrics` para KPIs administrativos;
- `/health` para status DB;
- taxonomia e redaction da Sprint 78B;
- labels tenant-scoped existentes (`clientId`/`tenantId`);
- eventos de Public API, Webhooks, Search, Audio e MFA.

### O Que Nasceu Na 78C

- `src/metrics/internalMetrics.ts`;
- `metrics.counter(name, labels)`;
- `metrics.gauge(name, value, labels)`;
- `metrics.timing(name, durationMs, labels)`;
- sanitizacao/allowlist de labels;
- snapshot JSON em memoria;
- instrumentacao HTTP leve no `server.ts`;
- endpoint protegido `GET /admin/ops/metrics`;
- gauges de health/db;
- contadores/timings de Webhook shadow/dispatch;
- testes focados em `src/metrics/internalMetrics.test.ts`.

### Fora De Escopo

- Prometheus;
- Grafana;
- OpenTelemetry;
- tracing distribuido;
- dashboard visual;
- persistencia historica das metricas internas;
- fila/worker;
- alteracao no modelo `Event`;
- alteracao nos reports de produto.

## Servico Interno

API interna:

```ts
metrics.counter(name, labels)
metrics.gauge(name, value, labels)
metrics.timing(name, durationMs, labels)
```

As metricas ficam em memoria do processo Node.js. Isso e suficiente para diagnostico inicial e smoke operacional, mas nao substitui historico, alertas ou dashboards.

## Endpoint Diagnostico

Endpoint:

```text
GET /admin/ops/metrics
```

Protecao:

- usa o mesmo fluxo protegido de `/admin/*`;
- exige admin token ou token tenant admin valido;
- nao e endpoint publico;
- nao expoe payload bruto, telefone, e-mail, token, cookie ou waId.

Resposta:

```json
{
  "ok": true,
  "generatedAt": "2026-06-24T00:00:00.000Z",
  "counters": [],
  "gauges": [],
  "timings": []
}
```

## Labels Permitidos

Allowlist:

- `tenantId`;
- `module`;
- `route`;
- `method`;
- `status`;
- `statusCode`;
- `channel`;
- `provider`;
- `event`;
- `feature`;
- `source`;
- `type`.

Labels fora da allowlist sao descartados.

Valores com padrao de segredo ou PII sao redigidos/mascarados:

- `Bearer`;
- `token`;
- `secret`;
- `cookie`;
- `authorization`;
- `ciphertext`;
- `password`;
- `otp`;
- `totp`;
- telefones longos;
- e-mails.

## Metricas MVP

| Metrica | Tipo | Origem |
| --- | --- | --- |
| `http.requests` | counter | todo request HTTP no `finish` |
| `http.errors` | counter | respostas 4xx/5xx |
| `http.request.duration` | timing | duracao por rota normalizada/modulo/status |
| `health.db.status` | gauge | `/health` e `/admin/health` |
| `process.uptime.seconds` | gauge | `/health` |
| `ops.metrics.snapshot` | counter | leitura de `/admin/ops/metrics` |
| `webhook.shadow.requests` | counter | shadow delivery |
| `webhook.shadow.outcomes` | counter | shadow delivery por resultado |
| `webhook.dispatch.requests` | counter | dispatch dry-run/execute |
| `webhook.dispatch.outcomes` | counter | dispatch por resultado |
| `webhook.dispatch.duration` | timing | dispatch HTTP controlado |

Cobertura por modulo via rota:

- Public API: `/public-api/*`;
- Webhooks: `/admin/webhooks`, CLI/service shadow/dispatch;
- Search: `/app/search`;
- Audio: `/app/audio-transcriptions`;
- MFA/Auth: `/auth/*`, `/app/mfa/*`;
- Scheduling: `/app/scheduling`;
- Webchat: `/webchat/*`, `/app/webchat`;
- Telegram: `/telegram/*`, `/app/telegram`;
- Campaigns: rotas com `/campaign`.

## Limitacoes Conhecidas

- metricas em memoria resetam no reload do PM2;
- nao ha historico persistente;
- nao ha alertas;
- nao ha coleta multi-instancia;
- nao ha dashboard visual;
- CLIs que rodam fora do processo web registram metricas apenas durante a execucao daquele processo.

Essas limitacoes sao intencionais nesta sprint. A proxima etapa deve decidir persistencia/exportacao/alertas.

## Testes

Arquivo:

- `apps/whatsapp-agent/src/metrics/internalMetrics.test.ts`

Cobertura:

- counter incrementa;
- gauge registra;
- timing agrega count/total/avg/min/max;
- labels sao allowlisted;
- PII/secrets em labels nao aparecem no snapshot;
- rotas com IDs sao normalizadas;
- classificacao de modulo funciona.

## Impacto Operacional

Classificacao apos 78C:

- logging/redaction: fortalecido pela 78B;
- metricas internas: fundacao criada;
- dashboards: ainda nao;
- alertas: ainda nao;
- tracing: ainda nao;
- HA/escala: ainda nao.

Proxima sprint recomendada: **78D - Observability Runtime** ou **78E - Dashboards**, dependendo se a prioridade for diagnostico tecnico ou visibilidade operacional.

## Confirmacao De Escopo

Sprint 78C:

- nao cria banco;
- nao cria migration;
- nao adiciona dependencia externa;
- nao adiciona Prometheus/Grafana/OpenTelemetry;
- nao altera regra de negocio;
- nao altera canais;
- nao altera login;
- nao altera IA/chatbot;
- nao altera reports existentes.
