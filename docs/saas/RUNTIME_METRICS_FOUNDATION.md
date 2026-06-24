# Sprint 78E - Runtime Metrics MVP

Data: 2026-06-24

Escopo: ampliacao da fundacao interna de metricas runtime do Converta, sem Prometheus, Grafana, OpenTelemetry, banco, migration ou dependencia externa.

## Resumo Executivo

A Sprint 78E amplia a Sprint 78C mantendo o mesmo principio:

- metricas internas em memoria;
- endpoint protegido;
- labels com allowlist;
- sem PII/secrets;
- sem stack externa;
- sem alterar comportamento funcional.

O objetivo nao e substituir os reports de produto, `ConversationMetrics`, `Event` ou dashboards existentes. O objetivo e criar visibilidade tecnica runtime para diagnostico operacional.

## Auditoria Previa

| Area auditada | O que existe | Decisao 78E |
| --- | --- | --- |
| `internalMetrics.ts` | `counter`, `gauge`, `timing`, snapshot, label allowlist, route/module classification | Reaproveitado e ampliado com p95 aproximado, processo/uptime/memoria/CPU e metricas canonicas. |
| Logger | Envelope padrao, redaction, `requestId`, `correlationId`, `tenantId` | Reaproveitado; nao duplicar logs como metricas. |
| `/health` | DB check, uptime, gauges de DB/processo | Ampliado com `db_duration` e `dependency_duration` para DB. |
| `/admin/ops/metrics` | Snapshot protegido por auth admin | Reaproveitado; resposta ampliada sem alterar protecao. |
| Dashboard atual | `/app/dashboard/overview` e KPIs operacionais | Nao duplicado; continua camada de produto. |
| Reports | `/app/reports`, `/admin/reports`, exportacoes | Nao duplicado; continuam relatorios de negocio/SLA. |
| `ConversationMetrics` | SLA/first response/resolution/total messages | Nao duplicado; permanece fonte de metricas de atendimento. |
| `Event` | Auditoria tenant-scoped com eventos persistidos | Nao duplicado; metricas runtime continuam em memoria. |
| SLA existente | `SLAConfig`, breach logs, reports | Nao duplicado; runtime metrics medem saude tecnica. |

## Reaproveitado

- `metrics.counter/gauge/timing`;
- sanitizacao de labels da 78C;
- `/admin/ops/metrics`;
- `/health` e `/admin/health`;
- classificacao de modulo por rota;
- logger/redaction da 78B;
- `ConversationMetrics`, `Event`, dashboard e reports como fontes separadas.

## Ampliado

### Timing Records

Cada timing agora inclui:

- `count`;
- `totalMs`;
- `avgMs`;
- `p95Ms` aproximado;
- `minMs`;
- `maxMs`;
- `lastMs`.

O p95 e aproximado com amostra em memoria limitada. Ele serve para diagnostico local, nao para SLA contratual historico.

### Snapshot Operacional

`GET /admin/ops/metrics` passa a retornar tambem:

- `process.uptimeSeconds`;
- `process.memory`;
- `process.cpu`;
- `averages`;
- gauges de memoria e CPU.

### Metricas Canonicas

Foram adicionados nomes canonicos sem remover os nomes anteriores:

| Nome | Tipo | Origem |
| --- | --- | --- |
| `request_count` | counter | middleware HTTP |
| `request_duration` | timing | middleware HTTP |
| `route_duration` | timing | middleware HTTP |
| `module_duration` | timing | middleware HTTP |
| `db_duration` | timing | `/health` e `/admin/health` |
| `dependency_duration` | timing | DB health como primeira dependencia |
| `http.request.inflight` | gauge | middleware HTTP |

Os nomes da 78C continuam existindo:

- `http.requests`;
- `http.errors`;
- `http.request.duration`;
- `health.db.status`;
- `process.uptime.seconds`;
- metricas de webhook shadow/dispatch.

## Modulos Cobertos No MVP

Cobertura por classificacao de rota:

| Modulo | Como entra |
| --- | --- |
| `auth`/`mfa` | `/auth/*`, `/app/mfa/*` |
| `public_api` | `/public-api/*` |
| `webhook` | `/webhook*`, `/admin/webhooks*` |
| `scheduling` | rotas com `/scheduling` |
| `search` | rotas com `/search` |
| `audio` | rotas com `/audio-transcriptions` |
| `telegram` | rotas com `/telegram` |
| `webchat` | rotas com `/webchat` |
| `campaign` | rotas com `/campaign` |
| `health` | `/health` |
| `admin` | `/admin/*` |

Na 78E, a cobertura vem do middleware HTTP e de pontos seguros existentes. Nao ha instrumentacao profunda em cada service.

## Labels

Labels permitidos:

- `tenantId`;
- `module`;
- `route`;
- `method`;
- `status`;
- `statusCode`;
- `channel`;
- `provider`;
- `dependency`;
- `operation`;
- `event`;
- `feature`;
- `source`;
- `type`.

Regras:

- labels fora da allowlist sao descartados;
- valores com segredo sao redigidos;
- telefones longos sao mascarados;
- e-mails sao redigidos;
- IDs de usuario/contato/mensagem nao entram como labels.

## Seguranca

O endpoint continua protegido por `/admin/*`.

Nao devem aparecer no snapshot:

- token;
- secret;
- cookie;
- Authorization;
- ciphertext;
- telefone;
- e-mail;
- waId;
- transcript;
- mediaUrl;
- rawPayload;
- provider payload.

## O Que Nao Foi Duplicado

- `ConversationMetrics` nao foi reimplementado;
- reports e dashboards de produto nao foram substituidos;
- `Event` nao virou storage de metricas tecnicas;
- nao foi criada tabela de series temporais;
- nao foi criado endpoint publico;
- nao foi criada dependencia externa;
- nao foi criado Prometheus/Grafana/OpenTelemetry.

## Limitacoes

- metricas continuam em memoria;
- resetam em reload/restart PM2;
- p95 e aproximado;
- nao ha historico;
- nao ha alertas;
- nao ha dashboard visual;
- tenantId em middleware HTTP fica `unknown` quando o tenant nao foi resolvido no request lifecycle.

Essas limitacoes sao intencionais para manter o recorte seguro.

## Validacao

Validacoes obrigatorias:

```bash
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm run build
node --import tsx --test src/metrics/internalMetrics.test.ts src/logger/logger.test.ts
npm run evaluation:replay
git diff --check
```

## Resultado Esperado

Apos a 78E:

- operacao consegue ver contadores, gauges, timings, medias e p95 aproximado;
- health registra duracao de DB;
- requests tem metricas canonicas;
- processo expoe memoria/CPU/uptime;
- endpoint continua protegido;
- sem dependencia externa;
- sem banco/migration;
- sem alteracao funcional.
