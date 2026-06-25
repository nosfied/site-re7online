# Sprint 78G - Alerting & Notifications Design

Data: 2026-06-24

Escopo: desenho tecnico e operacional da arquitetura de alertas do Converta, sem codigo, banco, migration, cron, worker, envio real, Slack, e-mail, WhatsApp ou qualquer provider externo.

Nao houve alteracao funcional. Este documento apenas consolida a auditoria de reaproveitamento e define a arquitetura futura de alerting.

## Resumo Executivo

O Converta ja possui a base necessaria para iniciar alerting interno de forma conservadora:

- logging padronizado com envelope estruturado e redaction central;
- metricas internas em memoria com counters, gauges, timings, averages, p95 aproximado, uptime, CPU e memoria;
- endpoint protegido `GET /admin/ops/metrics`;
- dashboard interno `/admin/ops`;
- health com checagem de banco e medicao de dependencia;
- eventos persistidos via `Event`/`persistEvent`;
- feature flags por tenant para rollout e rollback;
- operacao PM2 com health/smoke/replay/runbooks.

O que ainda precisa nascer:

- motor de avaliacao de alertas;
- catalogo de regras e thresholds;
- estado de alerta (`UNACK`, `ACK`, `RESOLVED`);
- silence com escopo e expiracao;
- deduplicacao/storm protection;
- central visual de alertas;
- providers de notificacao.

Classificacao apos 78G: **ATENDE COM AJUSTE**. O desenho esta pronto.

Atualizacao 78H: o primeiro Alert Engine interno em memoria foi implementado em `internalAlertManager.ts`, com snapshot admin, ACK e resolve automatico. Ainda nao ha persistencia, silence, central visual ou notificacoes externas.

## Confirmacao De Nao Alteracao Funcional

Esta sprint nao:

- cria alertas reais;
- envia notificacoes;
- adiciona cron ou worker;
- altera health, metricas ou dashboard;
- altera login, canais, IA, chatbot, webhooks, scheduling, search ou audio;
- cria banco, migration ou nova dependencia externa.

## Auditoria De Reaproveitamento

| Area auditada | O que existe | Reaproveitamento | O que precisa nascer |
| --- | --- | --- | --- |
| Logger | `src/logger/logger.ts` emite JSON estruturado, usa contexto, niveis `debug/info/warn/error` e redaction recursiva | base para registrar `alert.*` sem PII | padrao de eventos de alerta e campos obrigatorios |
| Internal metrics | `internalMetrics.ts` suporta counter, gauge, timing e snapshot protegido | fonte primaria para thresholds de erro, latencia, uptime, memoria, CPU, DB e modulo | avaliador de regras sobre o snapshot |
| Dashboard operacional | `/admin/ops` consome `/admin/ops/metrics` com refresh manual | destino inicial para exibir alertas sem stack externa | Alert Center interno em sprint futura |
| Health | `/health` mede DB, uptime e dependencia | fonte critica para `health.down` e `db.unavailable` | split futuro liveness/readiness e checks por provider |
| Feature flags | `Client.features` e defaults conservadores | rollback por tenant com `alerting=false` | flags novas para runtime e notificacoes |
| Scheduler/CLIs | padrao de dry-run/execute, shadow e CLIs manuais | caminho seguro para avaliador manual inicial | avaliador runtime controlado e, depois, scheduler real |
| PM2 | `ecosystem.config.cjs`, autorestart e runbooks | fonte operacional manual para restart/memoria | coleta automatica ou integracao futura |
| Auditoria | `Event` tenant-scoped e `persistEvent` | persistir `alert.created`, `alert.acknowledged`, `alert.resolved`, `alert.silenced` | modelo/rotas de alerta em sprint futura |

## Arquitetura Proposta

Fluxo futuro:

```text
Runtime Metrics / Health / Events
        |
        v
Alert Rule Evaluator
        |
        v
Fingerprint + Deduplication
        |
        v
Alert State
        |
        +--> Dashboard interno
        +--> Audit Event
        +--> Notification Provider futuro
```

Principios:

- alertas nascem de metricas e health, nao de parsing de texto de log;
- logs continuam sendo evidencia e diagnostico, nao fonte primaria de regra;
- todo alerta deve ter `tenantId` quando aplicavel;
- labels nunca podem conter token, telefone, e-mail, transcript, media URL, raw payload, cookie ou Authorization;
- notificacoes externas ficam atras de flag separada.

## Feature Flags Futuras

| Flag | Default | Uso |
| --- | --- | --- |
| `alerting` | `false` | habilita avaliacao e criacao de alertas. |
| `alertingNotifications` | `false` | habilita envio para providers externos. |
| `alertingSilence` | `false` | habilita silenciamento operacional. |
| `alertingDashboard` | `false` | habilita central visual de alertas, se precisar rollout separado. |

Rollback minimo: `alerting=false`.

## Fontes De Alerta

| Fonte | Severidade inicial | Exemplos |
| --- | --- | --- |
| Health | CRITICAL | health indisponivel, DB down, processo reiniciando repetidamente. |
| DB | CRITICAL/HIGH | conexao indisponivel, `db_duration` alto, erro persistente de query. |
| Runtime Metrics | HIGH/ERROR | aumento de 5xx, p95 alto, memory/CPU elevados. |
| Search | MEDIUM/HIGH | falha de busca, indexador shadow falhando, indice desatualizado. |
| Audio | MEDIUM/HIGH | jobs failed, cleanup temporario falhando, provider indisponivel futuro. |
| Public API | HIGH | 5xx, 429 excessivo, denied spike, latencia alta. |
| Scheduling | HIGH | reminders failed, send controlado falhando, backlog elegivel alto. |
| MFA | HIGH/CRITICAL | falhas repetidas, lockout, brute force suspeito. |
| Webhooks | HIGH | dispatch failed/dead letter, shadow delivery inconsistente. |
| Telegram | MEDIUM/HIGH | webhook invalid/replay spike, outbound failed, token ausente. |
| Webchat | MEDIUM/HIGH | session/message denied spike, site ativo com falha de criacao de sessao. |

## Severidade

| Severidade | Definicao | Exemplo |
| --- | --- | --- |
| INFO | Evento operacional relevante, sem degradacao | deploy concluido, alerta resolvido. |
| WARNING | Degradacao inicial ou risco de evoluir | p95 subindo, memoria acima de 70%, erro intermitente. |
| ERROR | Falha funcional parcial ou repetida | 5xx acima do limite, provider falhando, job failed. |
| CRITICAL | Indisponibilidade, perda de capacidade central ou risco de seguranca | health down, DB down, brute force MFA, disco critico. |

## Thresholds Propostos

Valores iniciais devem ser conservadores e ajustados por ambiente.

| Metrica | WARNING | ERROR | CRITICAL |
| --- | --- | --- | --- |
| `http.errors` | > 5/min ou > 2% em 5 min | > 10/min ou > 5% em 5 min | > 20/min ou > 10% em 5 min |
| Request p95 | > 1500 ms por 5 min | > 3000 ms por 5 min | > 5000 ms por 5 min |
| DB status | degradacao intermitente | erro repetido | indisponivel |
| DB p95 | > 500 ms | > 2000 ms | > 5000 ms ou timeout |
| Dependency p95 | > 3000 ms | > 8000 ms | timeout repetido |
| Memory RSS | > 70% do limite | > 85% do limite | > 95% do limite ou restart loop |
| CPU | > 80% sustentado | > 95% sustentado | saturacao com erro/latencia |
| Uptime/restart | uptime < 120s apos deploy | 3 restarts/10 min | restart loop |
| Queue/backlog futuro | idade > 5 min | idade > 15 min | idade > 30 min |
| MFA failures | 5 falhas/user/10 min | 20 falhas/tenant/10 min | padrao distribuido suspeito |
| Webhook dead letter | 1 endpoint afetado | varios endpoints | falha sistemica |

## Destinos Futuros

| Destino | Fase | Observacao |
| --- | --- | --- |
| Dashboard interno | 78J | primeira superficie visual, sem dependencia externa. |
| Slack | 78I | bom para operacao tecnica, exige segredo e rate limit. |
| E-mail | 78I | bom para avisos formais, maior risco de ruido. |
| WhatsApp | posterior | util para plantao, mas exige cuidado para nao depender do proprio canal degradado. |
| Webhook | posterior | integra com NOC/cliente, deve reutilizar HMAC e retry policy. |

## Ciclo De Vida Do Alerta

Estados:

- `UNACK`: alerta aberto e ainda nao reconhecido;
- `ACK`: operador reconheceu e esta tratando;
- `RESOLVED`: condicao normalizou ou operador encerrou;
- `SILENCED`: overlay temporario, nao substitui o estado principal.

Fluxo:

```text
Regra dispara
  -> cria fingerprint
  -> se nao existe alerta aberto: alert.created / UNACK
  -> se ja existe: incrementa occurrenceCount
  -> operador reconhece: alert.acknowledged / ACK
  -> condicao normaliza: alert.resolved / RESOLVED
```

Campos futuros recomendados:

- `alertId`;
- `tenantId`;
- `severity`;
- `source`;
- `module`;
- `fingerprint`;
- `status`;
- `firstSeenAt`;
- `lastSeenAt`;
- `acknowledgedAt`;
- `resolvedAt`;
- `silencedUntil`;
- `metadata` redigido.

## Silence

Silence deve ter:

- escopo: global, tenant, module, source, severity ou fingerprint;
- duracao obrigatoria;
- motivo obrigatorio;
- usuario responsavel;
- auditoria;
- expiracao automatica.

Regras:

- silence nao apaga alerta;
- silence nao impede coleta de metricas;
- silence apenas suprime notificacoes e altera exibicao operacional;
- CRITICAL global deve exigir permissao administrativa.

## Rate Limiting E Storm Protection

Mecanismos futuros:

- fingerprint por `tenantId + source + module + rule + labels essenciais`;
- janela de deduplicacao;
- limite de notificacoes por alerta;
- digest para alertas repetidos;
- supressao por dependencia raiz, por exemplo DB down suprime alertas secundarios de rota;
- cooldown apos resolucao para evitar flapping.

## Auditoria

Eventos futuros:

- `alert.created`;
- `alert.acknowledged`;
- `alert.resolved`;
- `alert.silenced`;
- `alert.unsilenced`;
- `alert.notification.sent`;
- `alert.notification.skipped`;
- `alert.notification.failed`;
- `alert.rule.evaluated`;
- `alert.rule.failed`.

Todos devem seguir o padrao 78B:

- redaction central;
- `requestId`/`correlationId` quando houver;
- `tenantId` quando aplicavel;
- sem payload bruto;
- sem dados pessoais em labels.

## Rollback

Rollback operacional:

1. desligar `alertingNotifications=false`;
2. se necessario, desligar `alerting=false`;
3. manter `/admin/ops/metrics` e `/admin/ops`;
4. manter logs e eventos existentes;
5. alertas ja criados permanecem historicos quando houver persistencia futura.

O alerting nao deve ser dependencia de runtime funcional. Se falhar, canais, login, Public API, Webchat, Telegram, Scheduling, Search e Audio continuam operando.

## Roadmap

### 78H - Runtime Alerting MVP

- avaliador manual/diagnostico sobre `/admin/ops/metrics`;
- sem notificacao externa;
- regras iniciais para health, DB, 5xx, request p95 e memoria;
- dry-run primeiro;
- persistencia apenas se aprovada.

Status: implementado como MVP interno em memoria na Sprint 78H. Rotas: `GET /admin/ops/alerts` e `POST /admin/ops/alerts/:id/ack`.

### 78I - Notification Providers

- Slack/e-mail/webhook como providers opcionais;
- secrets criptografados;
- rate limit;
- dry-run;
- tenant piloto.

### 78J - Dashboard Alert Center

- lista de alertas;
- filtros por severidade/status/tenant/modulo;
- ACK;
- silence;
- resolved.

### 78K - HA Integration

- readiness/liveness separados;
- checks externos;
- plano de prova de carga;
- restore drill;
- RTO/RPO;
- integracao com HA/scale.

## Riscos

| Risco | Mitigacao |
| --- | --- |
| Ruido operacional | thresholds conservadores, dedupe, silence e digest. |
| Vazamento de PII em labels | whitelist de labels e redaction central. |
| Dependencia circular | alerting nao pode ser requisito para runtime funcionar. |
| Storm de notificacoes | fingerprint, cooldown e limite por janela. |
| Alertas sem acao clara | todo alerta deve apontar runbook ou acao recomendada. |
| Custo operacional | iniciar com dashboard interno e sem provider externo. |

## Result Report

- Auditoria de reaproveitamento concluida.
- Logger, metrics, dashboard, health, flags, PM2 e eventos foram considerados no desenho.
- Arquitetura de alertas definida.
- Severidades e thresholds iniciais definidos.
- ACK, silence, dedupe e storm protection definidos.
- Roadmap 78H-78K definido.
- Nenhuma alteracao funcional foi realizada.
