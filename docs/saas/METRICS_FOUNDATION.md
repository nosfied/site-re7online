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

## Completed Service Snapshot

Adicionado em 2026-08-31 como projecao historica duravel para relatorios de atendimentos concluidos.

Definicao:

- um atendimento concluido = um ciclo de servico/protocolo fechado;
- contagem por periodo usa `closedAt`;
- atribuicao usa o responsavel final no instante do fechamento;
- transferencias antes do fechamento contam para o atendente/setor final;
- participacao de multiplos atendentes/setores no mesmo ciclo e metrica separada futura;
- fechamentos sem atendente ou setor devem aparecer como `Sem atendente` / `Sem setor`;
- uma mesma Conversation pode gerar multiplos ciclos e, portanto, multiplos atendimentos concluidos.

Fonte canonica:

- o fechamento continua sendo `conversation.protocol.closed`;
- `CompletedServiceSnapshot` e uma projecao de reporting gravada no mesmo ponto de fechamento;
- o snapshot nao substitui o evento de protocolo e nao cria novo motor de fechamento.

Campos preservados:

- `clientId`;
- `conversationId`;
- `cycleId`;
- `protocol`;
- `closedAt`;
- `assignedUserId`;
- `departmentId`;
- `queueId`;
- `closedByUserId`;
- `closeReason`;
- `closeSource`;
- `createdAt`.

Minimizacao:

- nao copia corpo de mensagem;
- nao copia telefone, waId ou nome do contato;
- nao copia dados pessoais de contato/lead;
- guarda apenas IDs operacionais e metadados de fechamento necessarios ao relatorio.

Limite historico:

- nao ha backfill inferido para atribuicao historica;
- relatorios por atendente/setor devem considerar como periodo confiavel o intervalo que possui snapshots capturados;
- a UI futura deve derivar o inicio disponivel pelo menor `closedAt` existente em `CompletedServiceSnapshot` para o tenant, ou exibir aviso quando nao houver snapshot no periodo.

## Relatorios De Atendimentos Concluidos

Adicionado como leitura de produto sobre `CompletedServiceSnapshot`, sem reconstruir atribuicao a partir de estado mutavel de `Conversation`.

Contrato:

- fonte unica: `CompletedServiceSnapshot`;
- periodo: `closedAt`;
- total: quantidade de linhas de snapshot no escopo filtrado;
- por atendente: agrupamento por `assignedUserId`;
- por setor: agrupamento por `departmentId`;
- setor por atendente: agrupamento por `departmentId` + `assignedUserId`;
- serie diaria: agrupamento pelo dia local de `closedAt` no timezone operacional do tenant;
- uma mesma Conversation pode aparecer mais de uma vez se tiver multiplos ciclos/protocolos encerrados;
- alteracoes posteriores em `Conversation`, responsavel ou setor nao reatribuem fechamento historico.

Cutoff:

- a disponibilidade historica e derivada por `MIN(CompletedServiceSnapshot.closedAt)` por tenant;
- se nao houver snapshots, a UI deve informar ausencia de historico disponivel;
- zero snapshots no periodo nao deve ser apresentado como prova de que o historico anterior teve zero atendimentos;
- nao ha backfill neste relatorio.

Resolucao de nomes:

- IDs de usuario e setor sao resolvidos em lote no diretorio atual apenas para rotulo;
- se a entidade foi removida, a contagem permanece no bucket com `Usuario removido` ou `Setor removido`;
- `assignedUserId = null` aparece como `Sem atendente`;
- `departmentId = null` aparece como `Sem setor`.

RBAC:

- `ADMIN` ve o tenant inteiro;
- `SUPERVISOR` ve apenas departamentos autorizados por membership ativo;
- `AGENT` nao acessa relatorios de equipe;
- filtros de supervisor usam `CompletedServiceSnapshot.departmentId`, nao o setor atual da Conversation.

Performance:

- agregacoes devem ser set-based no banco;
- labels devem ser buscados em lote;
- nao usar loop de consultas por atendente, setor ou Conversation.

## Relatorio Operacional De Conversas

Atualizacao em producao:

```text
commit: f84258d7e8dab157fec0cb9dad5d46245d9dd111
message: fix(reports): count current active services in SLA cards
```

Contrato de semantica:

- `Conversas`: metrica de periodo/evento, baseada nas conversas/metricas criadas
  dentro do intervalo selecionado e filtros atuais.
- `Em atendimento agora`: estoque atual, baseado em
  `ConversationRuntimeState.status=IN_PROGRESS` e atribuicao atual. O periodo
  selecionado nao deve esconder conversa atualmente ativa apenas porque ela
  comecou antes da janela.
- `Aguardando agora`: estoque atual de conversas aguardando primeira resposta
  conforme estado runtime.
- `Fechadas agora`: estado atual fechado no read model operacional.
- `Atendimentos concluidos`: metrica de periodo/evento, baseada em
  `CompletedServiceSnapshot.closedAt`.
- `Primeira resposta media`, `Resolucao media` e `Pontos fora do SLA`: metricas
  de periodo/evento derivadas de `ConversationMetrics` e configuracao de SLA.
- `Transferencias humano`: metrica de periodo/evento quando baseada em eventos de
  transferencia.

Validacao SECULT-PE:

- Maria Helena possuia duas conversas legitimas `HUMAN` / `IN_PROGRESS`
  atribuidas (`****6185`, `****8282`);
- antes do fix, filtro `Ultimas 24 horas` + Maria exibia `Em atendimento = 0`
  porque o estoque atual era derivado apenas das metricas de conversas no
  periodo;
- depois do fix, `Em atendimento agora = 2`;
- validacao visual humana ainda pendente.

### Validacao organica SECULT-PE - 2026-09-01

Validado em producao na base:

```text
9881521b712173dbe8cb66e0d55a7ae710a0e903
```

Resultado observado para SECULT-PE:

- `CompletedServiceSnapshot` presente;
- total de snapshots do tenant: 41;
- intervalo observado: `2026-09-01T11:04:44.834Z` a `2026-09-01T20:12:17.209Z`;
- primeiro snapshot organico: protocolo `CVT-87DEB8652B73`, conversa `58390734-e9c6-414b-81e9-08ea88a1adc5`, ciclo `5ccf535c-7665-4fa9-a58b-f88a4af88ed5`;
- agente e ator de fechamento: Jéssica Campelo Bernardo;
- setor/fila: Duvidas Gerais - SECULT / PE;
- `closeSource`: `app_inbox`;
- `closeReason`: `operator_close`.

Consistencias validadas:

- evento `conversation.protocol.closed` coerente com o snapshot;
- atribuicao historica preservada no fechamento;
- relatorio por atendente, setor, setor por atendente e serie diaria reconcilia com o total 41;
- `availableSince` deriva do menor `closedAt`;
- ADMIN ve o tenant inteiro, SUPERVISOR fica limitado aos departamentos autorizados, AGENT nao acessa relatorios de equipe;
- nao houve fechamento artificial, backfill, mutation de snapshot ou mutation de tenant.

Status:

```text
SECULT COMPLETED SERVICE SNAPSHOT:
CLOSED / REAL ORGANIC VALIDATED

SECULT COMPLETED SERVICE REPORTING:
CLOSED / PRODUCTION VALIDATED
```

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
