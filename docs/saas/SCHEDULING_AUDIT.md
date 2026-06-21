# Sprint 71A - Scheduling Audit

Data: 2026-06-20

Escopo: auditoria baseada no codigo atual. Nao houve alteracao de codigo, banco, runtime, canais ou configuracao.

## Resumo Executivo

O Converta **nao possui modulo formal de agendamento**. Nao ha entidades dedicadas para agenda, calendarios, disponibilidade, slots, reservas, servicos, unidades, profissionais, confirmacao/reagendamento/cancelamento ou integracao com calendarios externos.

O estado atual e **PARCIAL** porque existem blocos reaproveitaveis:

- follow-up automatico tenant-scoped e DB-first;
- campanhas com templates oficiais;
- chatbot flows tenant-scoped;
- IA/qualification para coleta de dados;
- historico/timeline/CRM;
- eventos e metricas para `lead.demo_requested` e `lead.demo_scheduled`;
- fluxo legado de "demo agendada" usado em funil comercial/prova de conceito.

Para editais que exigem agendamento real de servicos publicos ou privados, o Converta deve ser classificado como **NAO ATENDE** no requisito de agenda nativa. Para lembretes e retomadas de atendimento, classifica como **ATENDE PARCIALMENTE**.

## Classificacao Consolidada

| Item | Classificacao | Evidencia | Observacao |
| --- | --- | --- | --- |
| Agendamento nativo | NAO ATENDE | Nao ha models `Appointment`, `Calendar`, `Slot`, `Booking` ou equivalentes em `prisma/schema.prisma` | Falta modulo formal |
| Marcacao de horarios | PARCIAL | `demoStatus`, `demoPreferredSchedule`, `lastDemoScheduledAt` em estado/conversa | Restrito a fluxo legado de demo, sem calendario real |
| Calendarios/disponibilidade | NAO ATENDE | Nao ha entidade de calendario, unidade, profissional, horario ou capacidade | Necessario model novo |
| Reservas/slots | NAO ATENDE | Nao ha reserva transacional nem bloqueio de slot | Risco alto para edital |
| Follow-up agendado | ATENDE PARCIALMENTE | `followupService.ts`, `TenantOperationalConfig.config.followUp` | Retomada automatica, nao agenda de servico |
| Lembretes/reminders | ATENDE PARCIALMENTE | Follow-up pode enviar texto/template conforme janela e configuracao | Falta lembrar compromisso futuro vinculado a agenda |
| Campanhas/templates para lembrete | ATENDE PARCIALMENTE | `Campaign`, `Template`, `/app/campaigns` | Disparo em massa, nao lembrete transacional de agendamento |
| Chatbot flows para coleta | ATENDE PARCIALMENTE | `ChatbotFlow.definition`, `executeChatbotFlow`, IA qualification slots | Pode coletar dados, mas nao cria reserva |
| Integracao externa calendario | NAO ATENDE | Nao ha Google Calendar, Outlook, iCal, ICS ou API de agenda | Exige sprint propria |
| Feature flag de scheduling | NAO ATENDE | `src/lib/appFeatures.ts` nao possui `scheduling`; `FEATURE_FLAGS_MATRIX.md` nao lista agenda | Criar flag futura |

Pontuacao estimada para "Agendamento": **28%**.

## Evidencias No Codigo

### Nao Ha Modelo De Agenda

O schema possui modelos operacionais como `Campaign`, `Template`, `Lead`, `ChatbotFlow` e `KnowledgeBaseArticle`, mas nao possui modelo dedicado de agendamento.

Evidencias:

- `apps/whatsapp-agent/prisma/schema.prisma`
  - `Campaign`
  - `Template`
  - `Lead`
  - `ChatbotFlow`
  - ausencia de `Appointment`, `Schedule`, `Calendar`, `Availability`, `Slot`, `Booking`.

Impacto: o produto nao consegue garantir disponibilidade, evitar conflito de horarios, confirmar reserva nem reagendar com consistencia transacional.

### Fluxo Legado De Demo Agendada

Existe um fluxo especifico para capturar intencao de demonstracao e horario preferido, mas ele nao e uma agenda real.

Evidencias:

- `apps/whatsapp-agent/src/whatsapp/flowExecutor.ts`
  - `runMidDemoFlowExecutor`
  - `demoAction: "scheduled"`
  - `scheduleExtract`
  - `shouldSkipScheduledDemoFollowup`
- `apps/whatsapp-agent/src/conversation/conversation.service.ts`
  - `parseDemoIntent`
  - `applyDemoScheduledTransition`
  - `demoPreferredSchedule`
- `apps/whatsapp-agent/src/conversation/conversation.types.ts`
  - `demoStatus?: "none" | "requested" | "scheduled"`
  - `lastDemoScheduledAt`
- `apps/whatsapp-agent/src/http/routes.ts`
  - metricas/eventos `lead.demo_scheduled`.

Reaproveitamento: bom para parsing inicial, eventos e telemetria de conversao. Nao deve ser vendido como agenda.

Limites:

- nao valida disponibilidade;
- nao cria compromisso formal;
- nao tem calendario;
- nao tem profissional/unidade/servico;
- nao envia lembrete vinculado a data marcada;
- nao possui tela de gestao de agenda.

### Follow-up Agendado

Existe rotina madura de follow-up operacional para retomada de conversa parada.

Evidencias:

- `apps/whatsapp-agent/src/followup/followupService.ts`
  - `evaluateFollowUpEligibility`
  - `delayMinutes`
  - `maxCount`
  - envio por texto ou template conforme janela;
  - evita humano, conversas fechadas, anonymized/deleted, handoff ativo e limites.
- `apps/whatsapp-agent/src/config/tenantOperationalConfig.ts`
  - `followUp` DB-first.
- `docs/saas/GOVERNANCE_CONFIG.md`
  - follow-up migrado para `TenantOperationalConfig.config.followUp`.

Reaproveitamento: excelente para lembretes e notificacoes futuras, desde que acoplado a uma entidade de compromisso/agenda.

Limites:

- hoje o trigger e estado da conversa, nao data/hora de compromisso;
- nao ha agenda de servico;
- nao ha lembrete D-1/H-2 por appointment;
- nao ha cancelamento/reagendamento.

### Campanhas E Templates

Campanhas ja permitem disparos com templates aprovados pela Meta.

Evidencias:

- `apps/whatsapp-agent/prisma/schema.prisma`
  - `Campaign`
  - `Template`
  - `TemplateRequest`
- `apps/whatsapp-agent/src/campaigns/campaignService.ts`
  - `createCampaign`
  - `listCampaigns`
  - `cancelCampaign`
- `apps/whatsapp-agent/src/http/routes.ts`
  - rotas `/app/campaigns` e `/admin/campaigns`.
- `src/lib/appFeatures.ts`
  - feature `campaigns`.

Reaproveitamento: bom para comunicados e campanhas de confirmacao em lote. Para agendamento, deve ser usado com cuidado como camada de notificacao, nao como motor de agenda.

Limites:

- campanha e orientada a lote;
- nao ha idempotencia por compromisso;
- nao ha relacao formal com slot/reserva;
- risco de disparo fora de contexto se usado como lembrete transacional sem modelagem.

### Chatbot Flows, IA E Qualification

O chatbot e IA podem coletar dados necessarios para um futuro agendamento.

Evidencias:

- `ChatbotFlow` em `prisma/schema.prisma`;
- `apps/whatsapp-agent/src/chatbot/chatbotFlow.ts`;
- `TenantOperationalConfig.config.aiIntentQualification`;
- testes com `aiQualification.slots`.

Reaproveitamento:

- coletar servico desejado;
- coletar unidade, preferencia de dia/horario, nome, documento se permitido;
- decidir handoff quando horario nao estiver disponivel;
- alimentar CRM/timeline.

Limites:

- o fluxo nao deve confirmar agenda sem validar slot;
- qualification coleta dados, mas nao reserva horario;
- precisa de integracao com modulo de disponibilidade.

## Feature Flags

Nao existe feature flag dedicada `scheduling` ou `appointments`.

Flags relacionadas:

| Flag | Status | Uso |
| --- | --- | --- |
| `chatbot` | existente | Pode coletar dados para agendamento |
| `campaigns` | existente | Pode enviar comunicados/templates |
| `knowledgeBase` | existente | Pode fornecer orientacoes sobre regras de agendamento |
| `reports`/dashboard via modulos existentes | parcial | Podem relatar atendimentos, nao agenda |

Recomendacao: criar `scheduling` desligada por padrao quando o MVP for implementado.

## O Que Reaproveita

| Bloco atual | Reaproveitamento recomendado |
| --- | --- |
| `Client` | tenant scope do modulo de agenda |
| `User`/RBAC | permissao para configurar agenda e operar reservas |
| `Department` | associar servicos/agendas a setores |
| `Lead`/`Contact`/CRM Timeline | vincular pessoa ao compromisso |
| `Conversation`/timeline | registrar solicitacao, confirmacao, cancelamento e lembretes |
| `ChatbotFlow` | coletar servico e preferencia |
| `aiQualification` | extrair campos de agendamento |
| `followUp` | base para lembretes e retomadas |
| `Template` | mensagens oficiais de confirmacao/lembrete quando janela Meta estiver fechada |
| `Campaign` | comunicados em lote, nao reserva individual |
| `Event` | auditoria de agenda |
| `Reports` | base para indicadores futuros de comparecimento/cancelamento |

## O Que Migra

Nao ha modulo formal a migrar.

Itens que devem ser tratados como legado/reaproveitamento, nao migracao direta:

- `demoStatus`;
- `demoPreferredSchedule`;
- `lead.demo_scheduled`;
- parser de intencao de demo em `parseDemoIntent`;
- metricas de demo agendada.

Esses itens podem virar referencia para um modelo novo, mas nao devem ser a fonte de verdade da agenda.

## O Que Precisa Desenvolver

### Models Minimos

Sugestao para MVP:

- `SchedulingService`
  - `clientId`
  - `departmentId`
  - `name`
  - `durationMinutes`
  - `status`
- `SchedulingResource`
  - pessoa, setor, sala, unidade ou fila logica;
  - capacidade.
- `SchedulingAvailability`
  - dia da semana;
  - inicio/fim;
  - excecoes/feriados.
- `Appointment`
  - `clientId`
  - `contactId`/`leadId`
  - `conversationId`
  - `serviceId`
  - `resourceId`
  - `startsAt`
  - `endsAt`
  - `status`: pending/confirmed/cancelled/rescheduled/no_show/completed
  - `createdBy`: bot/user/api
  - metadados seguros.
- `AppointmentReminder`
  - tipo, canal, template, scheduledAt, sentAt, status.

### Rotas/Telas

- `/app/scheduling`
  - lista de compromissos;
  - calendario simples;
  - filtros por status, servico, setor, data;
  - criar/editar/cancelar/reagendar;
  - configuracao de disponibilidade.
- integraçao no inbox:
  - botao "Agendar";
  - bloco de compromisso na timeline;
  - acao de confirmar/cancelar.
- API publica futura:
  - leitura de servicos/slots;
  - criacao controlada somente em sprint posterior.

### Runtime

- chatbot pode consultar slots disponiveis;
- IA pode extrair preferencia, mas confirmacao deve depender do motor de agenda;
- lembretes usam templates quando necessario;
- eventos auditaveis:
  - `appointment.created`;
  - `appointment.confirmed`;
  - `appointment.rescheduled`;
  - `appointment.cancelled`;
  - `appointment.reminder.sent`;
  - `appointment.no_show`.

## Riscos

| Risco | Severidade | Motivo | Mitigacao |
| --- | --- | --- | --- |
| Confirmar horario indisponivel | Alto | Sem lock/slot transacional, dois usuarios podem reservar o mesmo horario | Criar slot/reserva com transacao e constraint |
| Expor dados pessoais | Alto | Agenda pode carregar nome, telefone, documento, servico | DTO minimo, LGPD, retention, auditoria |
| Confundir follow-up com agenda | Alto | Follow-up atual nao representa compromisso | Separar entidades e linguagem |
| Meta policy/janela fechada | Medio/alto | Lembretes fora da janela exigem template aprovado | Usar Template e validar status |
| Multi-tenant leakage | Alto | Agenda e dado operacional sensivel | Todas queries por `clientId` e testes de isolamento |
| Complexidade de calendario | Medio/alto | Feriados, excecoes, recursos, capacidade | MVP com disponibilidade simples antes de integracoes externas |
| Regressao no inbox/chatbot | Medio | Integrar agenda ao runtime altera fluxo | Comecar CRUD + shadow/assistido, depois automacao |

## MVP Recomendado

### Sprint 71B - Scheduling MVP Design

Somente desenho tecnico/funcional:

- entidades;
- RBAC;
- feature flag `scheduling`;
- regras de disponibilidade;
- eventos;
- integraçao com inbox/chatbot/follow-up;
- criterios de edital.

### Sprint 71C - Scheduling Schema + Admin/App CRUD

Sem runtime automatico:

- models aditivos;
- tela `/app/scheduling`;
- criar/editar/cancelar compromisso manualmente;
- vincular a contato/lead/conversa;
- feature flag desligada por padrao;
- sem IA confirmando horario.

### Sprint 71D - Inbox Assisted Scheduling

- botao de agendamento na timeline;
- criar compromisso a partir de conversa;
- registrar evento na timeline;
- permitir lembrete manual/template.

### Sprint 71E - Chatbot/IA Scheduling Shadow

- IA extrai preferencia;
- chatbot sugere slots;
- shadow mode primeiro;
- confirmacao automatica so depois de testes.

### Sprint 71F - Reminders

- lembretes por appointment;
- template quando janela fechada;
- controle de envio, status e auditoria.

## Veredito Para Licitacoes

| Exigencia edital | Classificacao atual | Observacao |
| --- | --- | --- |
| "Possui agendamento automatico" | NAO ATENDE | Nao ha agenda/slots/reserva |
| "Permite lembretes/retomadas" | ATENDE PARCIALMENTE | Follow-up existe, mas nao vinculado a compromisso |
| "Chatbot agenda horario" | NAO ATENDE | Pode coletar preferencia, mas nao reservar |
| "Confirmacao automatica" | NAO ATENDE | Exige Appointment + Reminder |
| "Campanhas de lembrete" | ATENDE PARCIALMENTE | Campanhas existem, mas nao agenda transacional |
| "Relatorio de agendamentos" | NAO ATENDE | Nao ha model de appointment |

Conclusao: o Converta esta bem posicionado para construir agendamento sem retrabalho, mas ainda nao deve declarar atendimento pleno a editais que exijam agenda nativa, calendario ou reservas.

Proxima sprint recomendada: **Sprint 71B - Scheduling MVP Design**.
