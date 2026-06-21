# Sprint 71B - Scheduling Design

Data: 2026-06-20

Escopo: desenho funcional e tecnico do modulo de agendamento. Nao houve migration, alteracao de banco, runtime, chatbot, IA, canais ou frontend.

## Objetivo

Projetar o primeiro modulo formal de agendamento do Converta, cobrindo:

- servicos agendaveis;
- recursos/unidades/equipes;
- disponibilidade;
- compromissos;
- lembretes;
- auditoria;
- integracao futura com inbox, chatbot, IA, campanhas, follow-up e API publica.

O modulo deve nascer multi-tenant, governado por feature flag e sem reaproveitar o fluxo legado de `demoStatus` como fonte de verdade.

## Principios

1. **Banco e tenant scope como fonte de verdade**: todo registro precisa de `clientId`.
2. **Agenda nao e follow-up**: follow-up retoma conversas; appointment representa compromisso.
3. **IA nao confirma sem disponibilidade**: chatbot/IA podem coletar preferencia, mas reserva depende de slot validado.
4. **Sem envio proativo fora de politica Meta**: lembretes fora da janela usam templates aprovados.
5. **Rollback por feature flag**: `scheduling=false` por padrao no lancamento.
6. **API publica read-first**: expor disponibilidade/compromissos antes de qualquer escrita externa.

## Entidades Alvo

### SchedulingService

Representa o tipo de atendimento ou procedimento agendavel.

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `departmentId` | string/null | setor responsavel |
| `name` | string | nome exibido |
| `description` | string/null | orientacao do servico |
| `durationMinutes` | int | duracao padrao |
| `bufferBeforeMinutes` | int | opcional |
| `bufferAfterMinutes` | int | opcional |
| `requiresApproval` | boolean | se precisa confirmacao humana |
| `status` | active/inactive | controle operacional |
| `metadata` | json | regras futuras |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Relações:

- `Client`;
- `Department`;
- `Appointment`;
- `SchedulingAvailability`.

### SchedulingResource

Representa quem ou o que atende: pessoa, equipe, unidade, sala, guiche, setor ou recurso logico.

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `departmentId` | string/null | setor |
| `name` | string | nome do recurso |
| `type` | user/team/unit/room/queue/other | tipo |
| `userId` | string/null | se vinculado a operador |
| `capacity` | int | 1 por padrao |
| `status` | active/inactive | controle |
| `timezone` | string | default America/Fortaleza ou tenant |
| `metadata` | json | dados futuros |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Relações:

- `Client`;
- `Department`;
- `User` opcional;
- `Appointment`;
- `SchedulingAvailability`.

### SchedulingAvailability

Define janelas recorrentes de atendimento.

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `serviceId` | string/null | disponibilidade por servico |
| `resourceId` | string/null | disponibilidade por recurso |
| `weekday` | int | 0-6 |
| `startsAtLocal` | string | HH:mm |
| `endsAtLocal` | string | HH:mm |
| `timezone` | string | America/Fortaleza etc. |
| `effectiveFrom` | date/null | inicio de vigencia |
| `effectiveUntil` | date/null | fim de vigencia |
| `status` | active/inactive | controle |
| `metadata` | json | regras futuras |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Regras:

- `serviceId` e `resourceId` podem ser combinados.
- Se ambos forem nulos, representa disponibilidade geral do tenant/departamento.
- Excecoes/feriados devem vir em uma fase posterior com `SchedulingException`.

### Appointment

Fonte de verdade do compromisso.

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `serviceId` | string | servico agendado |
| `resourceId` | string/null | recurso alocado |
| `departmentId` | string/null | setor responsavel |
| `contactId` | string/null | contato vinculado |
| `leadId` | string/null | lead vinculado |
| `conversationId` | string/null | conversa de origem |
| `channel` | string/null | whatsapp/instagram/messenger/futuro |
| `startsAt` | datetime | inicio UTC |
| `endsAt` | datetime | fim UTC |
| `timezone` | string | timezone operacional |
| `status` | pending/confirmed/rescheduled/cancelled/no_show/completed | estado |
| `source` | app/inbox/chatbot/ai/public_api/import/google | origem |
| `createdByUserId` | string/null | operador |
| `updatedByUserId` | string/null | operador |
| `externalCalendarEventId` | string/null | futuro Google Calendar |
| `notes` | string/null | nota operacional curta |
| `metadata` | json | dados seguros |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Constraints recomendadas:

- indice `(clientId, startsAt)`;
- indice `(clientId, status, startsAt)`;
- indice `(clientId, contactId)`;
- indice `(clientId, leadId)`;
- indice `(clientId, conversationId)`;
- constraint de conflito por `resourceId + startsAt/endsAt` deve ser avaliada com cuidado, porque Postgres exige abordagem especifica para intervalos.

### AppointmentReminder

Representa lembrete planejado e seu resultado.

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `appointmentId` | string | compromisso |
| `type` | 24h/2h/custom | tipo |
| `channel` | whatsapp/instagram/messenger/email/public_api | canal futuro |
| `scheduledAt` | datetime | quando deve disparar |
| `sentAt` | datetime/null | envio efetivo |
| `status` | pending/sent/skipped/failed/cancelled | estado |
| `templateName` | string/null | se usar template Meta |
| `templateLang` | string/null | idioma |
| `requestId` | string/null | idempotencia |
| `error` | string/null | erro redigido |
| `metadata` | json | dados seguros |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Regras:

- Lembretes devem ser cancelados se appointment for cancelado.
- Lembretes devem ser recalculados se appointment for remarcado.
- Envio fora da janela Meta deve usar template aprovado.

## Tenant Scope

Todas as entidades devem carregar `clientId`.

Regras obrigatorias:

- todas as queries usam `clientId`;
- nenhuma rota aceita `clientId` de body para tenant app;
- admin interno pode diagnosticar por tenant, mas conteudo operacional fica no `/app`;
- API publica resolve tenant pela API key;
- eventos e auditoria registram `clientId`.

## Relacoes Com Modulos Existentes

| Modulo | Relacao |
| --- | --- |
| `Contact` | pessoa/cidadao/cliente do compromisso |
| `Lead` | dados comerciais ou cadastrais complementares |
| `Conversation` | origem da solicitacao e timeline |
| `Department` | setor responsavel |
| `User` | operador que cria/altera ou recurso humano |
| `Template` | mensagens oficiais de confirmacao/lembrete |
| `Campaign` | comunicados em lote; nao deve ser motor de agenda |
| `Event` | auditoria de cada transicao |
| `ConversationMetrics` | relatorios futuros |
| `KnowledgeBase` | orientacoes/regras de agendamento por servico |

## Feature Flag E RBAC

Feature flag futura:

```text
scheduling
```

Default:

```text
business=false
government=false
```

Habilitar por tenant via `Client.features`.

RBAC sugerido:

| Papel | Permissao |
| --- | --- |
| ADMIN | configurar servicos, recursos, disponibilidade e operar agenda |
| SUPERVISOR | configurar e operar agenda |
| AGENT | criar/remarcar/cancelar compromissos se permitido pelo tenant |
| INTERNAL_ADMIN | diagnostico e suporte tecnico |

## Fluxos Funcionais

### Agendar

1. Operador, chatbot ou API inicia solicitacao.
2. Sistema identifica `serviceId`.
3. Sistema lista slots elegiveis.
4. Usuario escolhe horario.
5. Sistema cria `Appointment` em `pending` ou `confirmed`.
6. Registra evento `appointment.created`.
7. Adiciona item na timeline.
8. Cria reminders 24h/2h/custom conforme regra.
9. Envia confirmacao se aplicavel.

### Remarcar

1. Seleciona appointment existente.
2. Valida permissao e status.
3. Lista novos slots.
4. Atualiza `startsAt/endsAt/resourceId`.
5. Status muda para `rescheduled` ou permanece `confirmed` com evento.
6. Cancela reminders antigos pendentes.
7. Cria reminders novos.
8. Registra `appointment.rescheduled`.

### Cancelar

1. Seleciona appointment.
2. Informa motivo opcional.
3. Status muda para `cancelled`.
4. Cancela reminders pendentes.
5. Registra `appointment.cancelled`.
6. Opcionalmente envia notificacao.

### Confirmar

1. Appointment `pending` vira `confirmed`.
2. Registra `appointment.confirmed`.
3. Cria/atualiza reminders.
4. Exibe na timeline.
5. Opcionalmente envia confirmacao.

## Lembretes

Tipos iniciais:

| Tipo | Quando | Uso |
| --- | --- | --- |
| `24h` | 24 horas antes | lembrete padrao |
| `2h` | 2 horas antes | lembrete proximo ao compromisso |
| `custom` | offset configuravel | casos especificos por tenant/servico |

Regras:

- nao enviar se appointment estiver cancelado/completed/no_show;
- se janela Meta aberta, pode enviar texto;
- se janela Meta fechada, exigir template aprovado;
- registrar `appointment.reminder.sent`, `appointment.reminder.skipped` ou `appointment.reminder.failed`;
- usar idempotencia por `appointmentId + type + scheduledAt`.

## Integração Futura Com Chatbot

Fase inicial: assistida, sem confirmacao automatica.

Uso esperado:

- coletar servico;
- coletar preferencia de data/turno;
- exibir opcoes de horario;
- se nao houver slot, direcionar para humano;
- confirmar apenas quando slot for validado pelo service de agenda.

Flags futuras:

```text
schedulingChatbotShadow
schedulingChatbotAnswering
```

## Integração Futura Com IA

A IA pode:

- extrair intencao de agendamento;
- identificar servico;
- identificar data/turno preferido;
- explicar regras de agendamento com Knowledge Base;
- sugerir handoff se baixa confianca.

A IA nao deve:

- inventar disponibilidade;
- confirmar horario sem `Appointment`;
- alterar appointment sem autorizacao.

Eventos futuros:

- `scheduling.ai.intent_detected`;
- `scheduling.ai.slot_suggested`;
- `scheduling.ai.low_confidence_handoff`.

## Integração Com Campaigns

Campanhas permanecem para comunicados em lote, por exemplo:

- aviso de feriado;
- mudanca de horario de funcionamento;
- comunicados a todos os agendados de um servico.

Nao usar Campaign como lembrete transacional individual. Para isso usar `AppointmentReminder`.

## Integração Com Follow-up

Follow-up pode ser reaproveitado como base conceitual de scheduler, idempotencia e limites.

Separacao obrigatoria:

- `followUp`: conversa parada;
- `AppointmentReminder`: compromisso futuro.

Nao misturar contadores e estados.

## Integração Com API Pública

Fases sugeridas:

### API read-only

- `GET /public-api/v1/scheduling/services`
- `GET /public-api/v1/scheduling/availability`
- `GET /public-api/v1/appointments`
- `GET /public-api/v1/appointments/{id}`

Scopes:

```text
read + scheduling
```

### API write controlada

Somente depois:

- `POST /public-api/v1/appointments`
- `POST /public-api/v1/appointments/{id}/cancel`
- `POST /public-api/v1/appointments/{id}/reschedule`

Requisitos:

- idempotency key;
- audit;
- rate limit;
- validação de disponibilidade;
- LGPD;
- rollback claro.

## Google Calendar

Nao implementar no MVP inicial.

Desenho futuro:

- `externalCalendarProvider`: google;
- `externalCalendarId`;
- `externalCalendarEventId`;
- sync status;
- OAuth tenant-scoped;
- logs redigidos;
- retry/backoff;
- conflito entre calendario externo e banco.

Regra arquitetural:

O banco do Converta continua fonte de verdade. Google Calendar e espelho/integracao externa, nao autoridade primaria.

## Classificação: Reaproveita, Migra, Novo

| Item | Classificacao | Observacao |
| --- | --- | --- |
| `Client` | reaproveita | tenant scope |
| `Department` | reaproveita | setor responsavel |
| `User/RBAC` | reaproveita | permissao e recurso humano |
| `Contact` | reaproveita | pessoa vinculada |
| `Lead` | reaproveita | dados complementares |
| `Conversation` | reaproveita | origem/timeline |
| `Event` | reaproveita | auditoria |
| `Template` | reaproveita | confirmacao/lembrete |
| `followUpService` | reaproveita parcialmente | padroes de elegibilidade/idempotencia, nao estado |
| `Campaign` | reaproveita parcialmente | comunicados em lote |
| `ChatbotFlow` | reaproveita | coleta/roteamento |
| `aiQualification` | reaproveita | extracao de slots |
| `demoStatus/demoPreferredSchedule` | legado, nao migrar direto | referencia para parser/eventos |
| `SchedulingService` | novo | model necessario |
| `SchedulingResource` | novo | model necessario |
| `SchedulingAvailability` | novo | model necessario |
| `Appointment` | novo | fonte de verdade |
| `AppointmentReminder` | novo | lembretes transacionais |
| `SchedulingException` | novo futuro | feriados/excecoes |
| Google Calendar OAuth/sync | novo futuro | fora do MVP |

## Roadmap De MVP

### Sprint 71C - Scheduling Schema + Feature Flag

- models aditivos;
- `scheduling=false` por padrao;
- testes de isolamento tenant;
- sem runtime chatbot/IA;
- sem Google Calendar.

### Sprint 71D - App CRUD

- `/app/scheduling`;
- CRUD de servicos;
- CRUD de recursos;
- disponibilidade semanal simples;
- CRUD manual de appointments;
- timeline read-only do appointment.

### Sprint 71E - Inbox Assisted Scheduling

- botao "Agendar" na timeline;
- criar/remarcar/cancelar appointment a partir de conversa;
- evento na timeline;
- sem IA automatica.

### Sprint 71F - Appointment Reminders

- criar reminders 24h/2h/custom;
- scheduler;
- templates Meta quando janela fechada;
- eventos e auditoria;
- retry seguro.

### Sprint 71G - Chatbot/IA Shadow

- detectar intencao de agendamento;
- sugerir slots em shadow;
- evaluation/replay;
- sem enviar confirmacao automatica ainda.

### Sprint 71H - Public API Scheduling Read

- endpoints read-only de servicos, disponibilidade e appointments;
- scopes `read + scheduling`;
- OpenAPI.

### Sprint 71I - Google Calendar Design/Connector

- desenho e depois implementacao controlada;
- OAuth separado;
- sync unidirecional inicialmente;
- sem tornar Google fonte primaria.

## Critérios De Aceite Do MVP

O modulo so deve ser considerado "ATENDE PARCIALMENTE" para editais quando existir:

- `Appointment` persistido por tenant;
- CRUD manual no `/app`;
- disponibilidade configuravel;
- confirmacao/cancelamento/remarcacao;
- timeline vinculada;
- lembretes auditaveis;
- relatorio basico.

So deve ser considerado "ATENDE" quando houver:

- validacao de conflito;
- lembretes por compromisso;
- dashboard/relatorio;
- permissao por perfil;
- API/documentacao se edital exigir;
- testes de multi-tenant e replay de fluxos.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Reserva duplicada | Alto | transacao + validacao de conflito |
| Exposicao de PII | Alto | DTO minimo, tenant scope, LGPD |
| IA confirmar errado | Alto | IA em shadow primeiro |
| Complexidade de disponibilidade | Medio/alto | MVP semanal simples antes de excecoes |
| Lembrete fora da janela Meta | Medio/alto | templates aprovados |
| Confundir campanha com lembrete transacional | Medio | separar `AppointmentReminder` |
| Google Calendar divergente | Medio/alto | Converta como fonte primaria |

## Veredito

O caminho correto e construir agendamento como modulo novo, reaproveitando CRM, conversas, chatbot, IA qualification, templates, eventos e follow-up apenas como infraestrutura de apoio.

Nao ha migracao direta a partir do fluxo legado de demo. O fluxo de demo ajuda como experiencia acumulada, mas nao substitui agenda.

## Status Pos-Sprint 71C

A Sprint 71C implementou o MVP estrutural do modulo:

- migration aditiva com `SchedulingService`, `SchedulingResource`, `SchedulingAvailability`, `Appointment` e `AppointmentReminder`;
- tenant scope obrigatorio via `clientId`;
- feature flag `scheduling=false` por padrao para `business` e `government`;
- CRUD basico tenant-scoped em `/app/scheduling`;
- leitura/escrita restrita a `ADMIN` e `SUPERVISOR`;
- sem runtime de chatbot, IA, canais, API publica, Google Calendar ou lembretes automaticos.

Com isso, o requisito de agendamento passa a **ATENDE PARCIALMENTE** em nivel estrutural. Para editais que exigem jornada completa de agendamento, ainda faltam:

- criacao/remarcacao/cancelamento a partir da timeline;
- auditoria/timeline do appointment;
- validacao de conflito;
- lembretes automaticos;
- relatorio de agenda;
- consumo por chatbot/IA em shadow antes de qualquer resposta automatica.

Proxima sprint recomendada: **Sprint 71D - Scheduling Validation + Inbox Entry Point**, ainda sem lembretes automaticos.
