# Sprint 71D - Scheduling Reminders / Confirmation Design

Data: 2026-06-21

Escopo: desenho funcional e tecnico para lembretes, confirmacao, cancelamento e remarcacao de agendamentos. Nao houve alteracao de codigo, banco, migrations, WhatsApp, Messenger, Instagram, chatbot, IA, follow-up, campaigns ou runtime.

## Objetivo

Projetar como o modulo de Agendamento deve evoluir para lembrar e confirmar compromissos usando a estrutura criada na Sprint 71C:

- `SchedulingService`;
- `SchedulingResource`;
- `SchedulingAvailability`;
- `Appointment`;
- `AppointmentReminder`;
- CRUD em `/app/scheduling`;
- feature flag `scheduling=false` por padrao.

A 71D nao implementa envio automatico. Ela define o contrato para uma proxima sprint segura.

## Principios

1. **Appointment e a fonte de verdade**: lembretes e confirmacoes sempre derivam de `Appointment`.
2. **Reminder nao e Campaign**: `AppointmentReminder` controla comunicacao transacional individual; `Campaign` fica para comunicados em lote.
3. **Politica Meta antes de conveniencia**: se a janela de 24h estiver fechada, usar template aprovado.
4. **Runtime desligado por padrao**: novas flags devem nascer `false`.
5. **Idempotencia obrigatoria**: nenhum lembrete pode ser enviado duas vezes pelo mesmo `appointmentId + type + scheduledAt`.
6. **Rollback por tenant**: qualquer ativacao futura precisa poder ser desligada sem migration.
7. **Timeline auditavel**: confirmacoes, cancelamentos e falhas devem deixar evento operacional.

## AppointmentReminder

### Campos e Semantica

| Campo | Uso | Regra |
| --- | --- | --- |
| `id` | Identificador interno | Nao expor como provider id |
| `clientId` | Tenant scope | Obrigatorio em todas as queries |
| `appointmentId` | Compromisso vinculado | Obrigatorio |
| `type` | `24h`, `2h`, `custom`, `manual`, `confirmation` | Define regra de agendamento/envio |
| `channel` | `whatsapp`, `messenger`, `instagram`, `email`, futuro | Inicialmente priorizar WhatsApp |
| `scheduledAt` | Quando deve ser processado | Sempre UTC |
| `sentAt` | Quando foi enviado | `null` ate sucesso |
| `status` | `pending`, `sent`, `skipped`, `failed`, `cancelled`, `expired` | Controla scheduler futuro |
| `templateName` | Template Meta usado fora da janela | Obrigatorio se janela fechada |
| `templateLang` | Idioma do template | Default por tenant, ex. `pt_BR` |
| `requestId` | Idempotencia/correlacao | Derivar de appointment + tipo + horario |
| `error` | Falha redigida | Nunca salvar token/payload bruto |
| `metadata` | Dados seguros | Motivo de skip, tentativa, politica aplicada |

### Campos Operacionais Recomendados

Se a model atual nao possuir todos os campos abaixo, a proxima implementacao deve avaliar se usa `metadata` no MVP ou migration aditiva posterior:

| Campo | Motivo |
| --- | --- |
| `attemptCount` | controlar retry e limite de tentativas |
| `lastAttemptAt` | diagnostico e backoff |
| `failureReason` | erro redigido humano/operacional |
| `cancelledAt` | auditoria de cancelamento do lembrete |
| `retryAfterAt` | retry com backoff sem job agressivo |

### Politica de Cancelamento e Retry

- Se `Appointment.status` virar `cancelled`, `completed` ou `no_show`, reminders `pending` devem virar `cancelled` ou `skipped`.
- Se appointment for remarcado, reminders pendentes antigos devem ser cancelados e novos reminders criados.
- Se envio falhar por erro temporario, permitir retry com backoff curto e limite baixo.
- Se falhar por template inexistente, permissao Meta ou janela fechada sem template, marcar `failed` sem retry infinito.
- Se `scheduledAt` passou por muito tempo, marcar `expired` ou `skipped`, conforme regra do tenant.

## Tipos De Lembrete

### Lembrete 24h

Uso: reduzir faltas e confirmar presenca com antecedencia.

Regra:

- criar `AppointmentReminder.type=24h`;
- `scheduledAt = appointment.startsAt - 24h`;
- se `scheduledAt` ja passou, nao criar ou criar como `skipped`;
- fora da janela Meta, usar template aprovado.

### Lembrete 2h

Uso: lembrar compromisso proximo e reduzir no-show.

Regra:

- criar `AppointmentReminder.type=2h`;
- `scheduledAt = appointment.startsAt - 2h`;
- cancelar se appointment nao estiver `confirmed` ou `pending`;
- fora da janela Meta, usar template aprovado.

### Lembrete Custom

Uso: servicos publicos/privados com regras diferentes, por exemplo 48h, 30min ou 7 dias.

Regra:

- configurar offset por tenant/servico em fase futura;
- guardar tipo `custom` e offset em `metadata`;
- nunca enviar sem template/politica validada.

### Lembrete Manual

Uso: operador decide enviar lembrete individual a partir da agenda/timeline.

Regra:

- criar `AppointmentReminder.type=manual`;
- operador escolhe canal/template;
- pode ser enviado imediatamente;
- respeitar janela Meta e permissao do tenant;
- registrar evento e item de timeline.

### Lembrete Automatico Futuro

Uso: scheduler processa reminders pendentes.

Regra:

- protegido por `schedulingReminders=false` por padrao;
- job busca por `clientId`, `status=pending`, `scheduledAt <= now`;
- valida appointment e politica Meta;
- envia e persiste `OutboundMessage`;
- registra `Event`;
- nao usa Campaign como motor.

## Fluxo De Confirmacao

### Estados Recomendados Do Appointment

| Estado | Significado |
| --- | --- |
| `pending` | compromisso criado, aguardando confirmacao |
| `confirmed` | cliente/cidadao confirmou |
| `rescheduled` | horario alterado |
| `cancelled` | cancelado |
| `no_show` | nao compareceu |
| `completed` | atendimento realizado |

### Confirmar

1. Cliente responde afirmativamente ou operador confirma manualmente.
2. Sistema valida `appointmentId`, tenant e status elegivel.
3. Status muda para `confirmed`.
4. Reminders pendentes sao mantidos ou recalculados conforme regra.
5. Registra `appointment.confirmed`.
6. Timeline recebe evento seguro.

### Cancelar

1. Cliente solicita cancelamento ou operador cancela manualmente.
2. Sistema valida permissao/status.
3. Status muda para `cancelled`.
4. Reminders pendentes mudam para `cancelled`.
5. Registra `appointment.cancelled`.
6. Opcionalmente envia mensagem/template de cancelamento.

### Remarcar

1. Cliente ou operador solicita novo horario.
2. Sistema valida disponibilidade.
3. Appointment atualiza `startsAt`, `endsAt`, `resourceId` se aplicavel.
4. Status muda para `rescheduled` ou `confirmed`, conforme regra do tenant.
5. Reminders antigos pendentes sao cancelados.
6. Novos reminders sao criados.
7. Registra `appointment.rescheduled`.

### Nao Responder

1. Reminder de confirmacao foi enviado.
2. Aguardou ate `confirmationExpiresAt` futuro ou ate `startsAt - cutoff`.
3. Se nao houver resposta, status pode permanecer `pending` ou virar `no_response`, conforme regra futura.
4. Registra `appointment.no_response`.
5. Opcionalmente entra em fila de revisao humana.

### Expirar Convite

Uso: quando um horario sugerido ainda nao foi reservado definitivamente.

Regra futura:

- convite de horario deve ter validade curta;
- se expirar antes de confirmacao, liberar slot;
- registrar `appointment.invite_expired`;
- nao confundir com `Appointment.confirmed`.

## Reaproveitamento De Modulos

| Modulo | Como reaproveitar | Cuidado |
| --- | --- | --- |
| `Template` | templates oficiais Meta para confirmacao/lembrete/cancelamento | templates precisam estar aprovados antes do runtime |
| `Campaign` | comunicados em lote para agenda, ex. feriado ou mudanca geral | nao usar como lembrete individual |
| `FollowUp` | padroes de scheduler, elegibilidade, limites e idempotencia | nao compartilhar contadores/estado |
| `OutboundMessage` | persistir envio efetivo e status de provider | nao criar como enviado se Meta falhar |
| `Event` | auditoria por tenant e appointment | payload redigido |
| `Conversation Timeline` | mostrar evento de agenda e mensagens enviadas | nao expor payload bruto |
| `CRM` | vincular appointment a contato/lead/status | evitar duplicar dados pessoais |
| `Public API` | futura leitura de appointments/reminders | escrita exige idempotency key |
| `Knowledge Base` | regras por servico: documentos, preparo, horarios | nao substituir disponibilidade real |

## Politica Meta / WhatsApp

### Dentro Da Janela De 24h

Se a conversa com o cliente/cidadao estiver dentro da janela Meta:

- pode enviar texto livre de confirmacao/lembrete;
- ainda deve respeitar opt-out/tenant policy;
- registrar `OutboundMessage` e `Event`.

### Fora Da Janela De 24h

Se a janela estiver fechada:

- usar template WhatsApp aprovado;
- nao tentar texto livre;
- se template faltar, marcar reminder como `failed` ou `skipped` com `failureReason=missing_template`;
- nao fazer retry infinito.

### Templates Sugeridos

| Nome sugerido | Uso | Variaveis |
| --- | --- | --- |
| `appointment_confirmation_request` | pedir confirmacao de compromisso | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora`, `{{4}} local`, `{{5}} protocolo` |
| `appointment_confirmed` | confirmar que o compromisso foi confirmado | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora`, `{{4}} local` |
| `appointment_reminder_24h` | lembrete 24h | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora`, `{{4}} local` |
| `appointment_reminder_2h` | lembrete 2h | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora`, `{{4}} local` |
| `appointment_cancelled` | informar cancelamento | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora`, `{{4}} motivo` |
| `appointment_rescheduled` | informar remarcacao | `{{1}} nome`, `{{2}} servico`, `{{3}} data_hora_antiga`, `{{4}} data_hora_nova`, `{{5}} local` |

Texto dos templates deve ser neutro, sem prometer disponibilidade fora do banco e sem incluir dados sensiveis desnecessarios.

## Feature Flags E Tenant Scope

Flags propostas:

| Flag | Default | Uso |
| --- | --- | --- |
| `scheduling` | `false` | expor modulo estrutural |
| `schedulingReminders` | `false` | permitir criar/processar lembretes |
| `schedulingConfirmation` | `false` | permitir confirmacao/cancelamento por resposta do cliente |

Regras:

- todas as flags sao tenant-scoped via `Client.features`;
- scheduler futuro precisa checar flag por tenant antes de processar;
- admin interno pode diagnosticar, mas runtime deve respeitar o tenant;
- rollback imediato: desligar flag do tenant.

## Eventos E Auditoria

Eventos propostos:

| Evento | Quando |
| --- | --- |
| `appointment.reminder.scheduled` | reminder criado |
| `appointment.reminder.sent` | envio aceito pelo provider |
| `appointment.reminder.failed` | falha redigida |
| `appointment.reminder.skipped` | nao enviado por regra |
| `appointment.reminder.cancelled` | cancelado por mudanca de appointment |
| `appointment.confirmed` | compromisso confirmado |
| `appointment.cancelled` | compromisso cancelado |
| `appointment.rescheduled` | horario alterado |
| `appointment.no_response` | expirou sem resposta |

Payload minimo:

- `appointmentId`;
- `reminderId`, quando houver;
- `clientId`;
- `channel`;
- `templateName`, quando houver;
- `status`;
- `reason` redigido;
- `requestId`.

Nao registrar:

- token;
- payload bruto Meta;
- documento pessoal;
- midia;
- texto completo se contiver PII desnecessaria.

## Reports Futuros

Metricas:

| Metrica | Definicao |
| --- | --- |
| taxa de confirmacao | confirmados / pedidos de confirmacao |
| taxa de cancelamento | cancelados / appointments totais |
| no-show | `no_show` / appointments confirmados |
| lembretes enviados | reminders `sent` por periodo |
| falhas de envio | reminders `failed` por periodo e motivo |
| tempo ate confirmacao | `confirmedAt - createdAt` futuro |
| comparecimento por servico | appointments completados por servico/recurso |

Exportacao:

- CSV/PDF no modulo Reports;
- filtros por periodo, servico, recurso, departamento e canal;
- separar lembretes transacionais de campanhas.

## Rollback

Rollback deve ser possivel sem migration:

1. Desligar `schedulingReminders` do tenant.
2. Desligar `schedulingConfirmation` do tenant.
3. Pausar scheduler futuro.
4. Desativar templates de appointment no tenant.
5. Marcar reminders pendentes como `skipped` apenas se houver decisao operacional.
6. Manter appointments e historico intactos.

Se um canal falhar:

- pausar apenas aquele canal/template;
- manter CRUD de agendamento funcionando;
- impedir retry infinito.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Envio fora da politica Meta | Alto | template obrigatorio fora da janela |
| Duplicidade de lembrete | Alto | idempotencia por appointment/tipo/horario |
| Confirmacao errada | Alto | validar tenant, appointment e status antes de mudar estado |
| Reagendamento sem disponibilidade | Alto | service de disponibilidade antes da alteracao |
| PII em eventos | Alto | payload redigido e DTO minimo |
| Misturar Campaign com reminder | Medio | `AppointmentReminder` como fonte transacional |
| Scheduler agressivo | Medio | batch pequeno, lock/idempotencia, flags por tenant |
| Template ausente | Medio | falha segura, sem envio livre fora da janela |

## Ordem Recomendada De Implementacao

### Sprint 71E - Scheduling Reminder Config + Manual Confirmation

- adicionar flags `schedulingReminders` e `schedulingConfirmation` default `false`;
- permitir criar reminders 24h/2h/custom ao criar/remarcar appointment;
- registrar eventos;
- permitir confirmacao/cancelamento manual pelo operador;
- sem scheduler automatico.

### Sprint 71F - Reminder Scheduler Shadow

- job calcula reminders elegiveis;
- nao envia;
- registra apenas metadados e contadores;
- compara template/window policy;
- valida performance e idempotencia.

### Sprint 71G - Reminder Sending Controlled

- ativar por tenant;
- enviar somente WhatsApp primeiro;
- usar template fora da janela;
- persistir `OutboundMessage`;
- registrar eventos e falhas;
- smoke real controlado.

### Sprint 71H - Customer Confirmation Parsing

- interpretar respostas simples: confirmar, cancelar, remarcar;
- primeiro em shadow;
- depois com flag `schedulingConfirmation=true`;
- handoff se ambiguo.

## Veredito

O modulo de agendamento ja possui base estrutural em producao, mas lembretes e confirmacao devem entrar em fases separadas. O proximo passo seguro e criar configuracao/manual confirmation sem scheduler automatico, depois medir em shadow, e so entao ativar envio controlado por tenant.

## Status Pos-Sprint 71E

A primeira etapa operacional posterior a este design implementou:

- flags `schedulingReminders` e `schedulingConfirmation`, ambas `false` por padrao;
- CRUD manual de `AppointmentReminder` em `/app/scheduling`;
- aba de lembretes visivel somente quando `schedulingReminders=true`;
- vinculo logico de template (`templateName`/`templateLang`);
- nenhum scheduler automatico;
- nenhum envio de mensagem;
- nenhuma alteracao em WhatsApp, Messenger, Instagram, chatbot, IA, follow-up ou campaigns.

O proximo passo continua sendo scheduler em shadow antes de qualquer envio real.

## Status Pos-Sprint 71F

A etapa de scheduler shadow foi implementada sem envio:

- flag `schedulingRemindersShadow=false` por padrao;
- script manual `npm run scheduling-reminders:shadow -- --json`;
- opcao `--record-events` para gravar auditoria redigida em `Event`;
- eventos/logs:
  - `appointment.reminder.shadow_run`;
  - `appointment.reminder.shadow_eligible`;
- nenhum canal e chamado;
- nenhum status de reminder e alterado;
- nenhum `OutboundMessage` e criado.

Criterio para avancar para envio real:

- shadow por tenant sem divergencia;
- templates aprovados e mapeados;
- janela Meta/WhatsApp validada;
- idempotencia de envio definida;
- rollback por feature flag testado.
