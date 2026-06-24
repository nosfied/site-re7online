# Sprint 78F - Operational Dashboard MVP

Data: 2026-06-24

Escopo: primeiro dashboard operacional interno do Converta, usando exclusivamente o endpoint protegido `GET /admin/ops/metrics`.

## Resumo Executivo

A Sprint 78F transforma a fundacao de metricas das Sprints 78C/78E em uma tela interna simples:

- rota `/admin/ops`;
- refresh manual;
- sem polling;
- sem websocket;
- sem Grafana;
- sem Prometheus;
- sem OpenTelemetry;
- sem banco;
- sem migration;
- sem API nova.

O dashboard e diagnostico interno. Ele nao substitui dashboards de produto, reports de SLA ou relatorios de atendimento.

## Auditoria Previa

| Item auditado | Existe | Decisao |
| --- | --- | --- |
| `/admin/ops/metrics` | Sim | Reaproveitado como unica fonte de dados. |
| Admin UI | Sim | Reaproveitado `src/app/admin/layout.tsx` e `AdminConsoleProvider`. |
| Auth admin | Sim | Reaproveitado `X-Admin-Token`; sem auth nova. |
| Dashboard produto | Sim | Nao duplicado; `/app/dashboard` continua para tenant/produto. |
| Reports | Sim | Nao duplicado; `/app/reports` e `/admin/reports` seguem para SLA/negocio. |
| Cards/tabelas | Sim | Reaproveitado padrao visual das paginas admin com cards e tabelas simples. |
| Graficos complexos | Nao | Fora do escopo. |
| Stack externa | Nao | Fora do escopo. |

## O Que Foi Reaproveitado

- `AdminConsoleProvider`;
- `AdminConfigPanel` indiretamente pelo gate do layout;
- `requestJson` em `src/lib/whatsappAdminApi.ts`;
- endpoint `GET /admin/ops/metrics`;
- classes visuais do tema admin;
- navegacao do console interno.

## O Que Foi Criado

- rota `/admin/ops`;
- helper `fetchOpsMetrics`;
- tipos `OpsMetricsSnapshot`, counters, gauges, timings e averages;
- link `Ops` na navegacao admin;
- cards de health, DB, uptime, CPU, memoria, requests, errors, avg e p95;
- tabela por modulo:
  - auth;
  - public_api;
  - search;
  - audio;
  - scheduling;
  - webhook;
  - telegram;
  - webchat.

## O Que Nao Foi Duplicado

- nenhum endpoint novo;
- nenhuma tabela;
- nenhum dashboard de produto;
- nenhum relatorio de SLA;
- nenhuma metrica persistida;
- nenhuma stack externa;
- nenhum grafico complexo.

## Seguranca

O acesso depende do mesmo gate do console interno:

- sem conexao admin, a pagina nao renderiza;
- sem `X-Admin-Token`, `/admin/ops/metrics` retorna 401;
- a pagina nao exibe payload bruto;
- a pagina nao exibe PII;
- a pagina nao exibe token;
- a pagina nao exibe transcript;
- a pagina nao exibe mediaUrl;
- a pagina nao exibe rawPayload.

## Dados Exibidos

### Health

- DB status;
- DB p95 pelo timing `db_duration`;
- uptime do processo.

### Processo

- memoria RSS;
- CPU user acumulado;
- contagem de gauges/timings/counters.

### Runtime

- requests;
- errors;
- request average;
- request p95.

### Modulos

- requests;
- errors;
- avg;
- p95.

## Atualizacao

O dashboard usa refresh manual.

Nao ha:

- polling;
- websocket;
- SSE;
- background refresh.

## Limitacoes

- metricas continuam em memoria;
- reload PM2 zera o snapshot;
- p95 e aproximado;
- nao ha historico;
- nao ha alertas;
- nao ha NOC dashboard externo;
- nao ha drill de incidentes embutido.

## Validacoes

Validacoes obrigatorias:

```bash
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm run build
node --import tsx --test src/metrics/internalMetrics.test.ts src/logger/logger.test.ts
npm run evaluation:replay
git diff --check
```

Frontend:

```bash
npm run build
```

## Resultado

Apos a Sprint 78F, o Converta passa a ter:

- dashboard operacional interno;
- visualizacao humana das metricas 78E;
- base demonstravel para editais;
- nenhum aumento de dependencia operacional;
- nenhum impacto funcional em canais, login, IA, chatbot, Public API ou Scheduling.

