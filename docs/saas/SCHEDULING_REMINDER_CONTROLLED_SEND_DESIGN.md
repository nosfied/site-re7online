# Sprint 71G - Scheduling Reminder Controlled Send Design

Data: 2026-06-21

Escopo: desenho funcional e tecnico do primeiro envio real controlado de lembretes de agendamento. Nao houve alteracao de codigo, banco, migrations, WhatsApp, Messenger, Instagram, chatbot, IA, follow-up, campaigns ou runtime.

## Objetivo

Definir como o Converta deve sair do scheduler shadow da Sprint 71F para o primeiro envio real de `AppointmentReminder`, com risco controlado por tenant, canal, template, limites, dry-run e rollback imediato.

Esta sprint nao implementa envio. Ela define o contrato para uma futura Sprint 71H.

## Estado Atual

Ja existe em producao:

- `SchedulingService`;
- `SchedulingResource`;
- `SchedulingAvailability`;
- `Appointment`;
- `AppointmentReminder`;
- CRUD `/app/scheduling`;
- CRUD manual de lembretes;
- subrota `/app/scheduling/reminders`;
- feature flags `scheduling`, `schedulingReminders`, `schedulingRemindersShadow` e `schedulingConfirmation`;
- CLI shadow `npm run scheduling-reminders:shadow`;
- eventos redigidos de shadow.

Ainda nao existe:

- envio automatico;
- scheduler permanente;
- alteracao automatica de status;
- envio por canais;
- criacao de `OutboundMessage` por lembrete;
- parser de confirmacao/cancelamento.

## Principios

1. **WhatsApp primeiro**: o primeiro envio real deve usar apenas WhatsApp, porque e o canal mais maduro do Converta.
2. **Tenant piloto unico**: ativar primeiro em um tenant de teste/controlado.
3. **Flag explicita de envio**: shadow e envio real sao flags separadas.
4. **Template obrigatorio fora da janela**: nunca enviar texto livre fora da janela Meta de 24h.
5. **Dry-run antes de send**: toda janela de envio real deve ser precedida por dry-run no mesmo tenant.
6. **Idempotencia antes de provider**: se um reminder ja foi enviado, nao chamar provider novamente.
7. **Falha segura**: erro de template, policy, token ou provider marca `failed`/`skipped`, sem retry infinito.
8. **Rollback por flag**: desligar envio sem migration nem rollback de dados.

## Feature Flags

| Flag | Default | Uso |
| --- | --- | --- |
| `scheduling` | `false` | expor modulo de agendamento |
| `schedulingReminders` | `false` | permitir CRUD/manual de reminders |
| `schedulingRemindersShadow` | `false` | permitir calculo de elegibilidade shadow |
| `schedulingRemindersSend` | `false` | permitir envio real controlado |
| `schedulingConfirmation` | `false` | reservado para interpretar confirmacao/cancelamento |

`schedulingRemindersSend` deve nascer `false` para todos os perfis e tenants.

## Escopo Do Primeiro Envio Real

### Incluido

- canal `whatsapp`;
- reminders `pending`;
- `scheduledAt <= now`;
- appointment com status `scheduled`, `confirmed` ou `rescheduled`;
- appointment ainda futuro ou em janela operacional aceitavel;
- template definido no reminder ou por regra do tenant;
- persistencia de `OutboundMessage` somente apos aceite do provider;
- atualizacao do reminder para `sent`, `failed` ou `skipped`;
- eventos redigidos.

### Excluido

- Messenger;
- Instagram;
- email;
- Webchat;
- Telegram;
- Google Calendar;
- parser de resposta;
- remarcacao automatica;
- envio em lote sem limite;
- campanha como motor de lembrete;
- texto livre fora da janela Meta.

## Elegibilidade De Envio

Um reminder so pode ser enviado quando todos os criterios forem verdadeiros:

1. Tenant ativo.
2. `scheduling=true`.
3. `schedulingReminders=true`.
4. `schedulingRemindersSend=true`.
5. `AppointmentReminder.status=pending`.
6. `AppointmentReminder.scheduledAt <= now`.
7. `Appointment.status` em `scheduled`, `confirmed` ou `rescheduled`.
8. Appointment nao esta cancelado, completo, `no_show` ou expirado.
9. Canal permitido para a fase: `whatsapp`.
10. Existe contato/conversa/identidade resolvivel para envio.
11. Politica Meta permite o tipo de mensagem.
12. Template aprovado existe quando necessario.
13. Nao existe evento/idempotency key de envio anterior para o mesmo reminder.

## Politica Meta / Janela 24h

### Dentro Da Janela

Pode usar texto livre, mas no primeiro MVP recomenda-se ainda usar template quando o reminder tiver `templateName`, para reduzir divergencia entre ambientes.

### Fora Da Janela

Obrigatorio:

- `templateName`;
- `templateLang`;
- template aprovado no tenant/canal;
- variaveis seguras e sem PII excessiva.

Se faltar template:

- nao enviar;
- marcar `skipped` ou `failed` com motivo redigido `missing_template`;
- registrar evento.

## Templates Minimos

| Template | Uso | Obrigatorio No MVP |
| --- | --- | --- |
| `appointment_reminder_24h` | lembrete 24h | sim, se houver reminder 24h |
| `appointment_reminder_2h` | lembrete 2h | sim, se houver reminder 2h |
| `appointment_reminder_manual` | lembrete manual/controlado | recomendado |

Variaveis sugeridas:

| Variavel | Conteudo |
| --- | --- |
| `{{1}}` | nome seguro do contato, se disponivel |
| `{{2}}` | servico/agendamento |
| `{{3}}` | data e hora local |
| `{{4}}` | local/unidade/canal |

Nao incluir CPF, documento, protocolo sensivel ou detalhes medicos/juridicos no template padrao.

## Idempotencia

Idempotency key sugerida:

```text
appointment-reminder-send:{clientId}:{reminderId}:{scheduledAt}
```

Antes de chamar provider:

1. verificar `AppointmentReminder.status`;
2. verificar `Event` com requestId da idempotency key;
3. verificar `OutboundMessage` vinculado em metadata, se implementado;
4. aplicar lock/transacao curta quando possivel.

Se a chave ja existir:

- nao reenviar;
- retornar como `skipped_duplicate`;
- registrar log redigido.

## Atualizacao De Status

| Resultado | Reminder.status | Evento |
| --- | --- | --- |
| Provider aceitou | `sent` | `appointment.reminder.sent` |
| Template ausente | `skipped` ou `failed` | `appointment.reminder.skipped` |
| Janela fechada sem template | `skipped` | `appointment.reminder.skipped` |
| Provider erro temporario | `failed` com retry futuro controlado | `appointment.reminder.failed` |
| Appointment cancelado/completo | `skipped` | `appointment.reminder.skipped` |
| Duplicado/idempotente | manter `sent` ou `skipped` | `appointment.reminder.skipped` |

No MVP, preferir **sem retry automatico**. Retry deve ser sprint separada.

## Persistencia De Timeline

Quando provider aceitar:

- criar `OutboundMessage` com `channel=whatsapp`;
- registrar `providerMessageId`, se houver;
- vincular ao tenant/conversa quando possivel;
- exibir na timeline como mensagem enviada pelo sistema;
- registrar `Event` com payload redigido.

Se nao houver conversa vinculada:

- nao inventar conversa sem regra definida;
- marcar `failed`/`skipped` com motivo `conversation_not_resolved`;
- revisar em sprint posterior.

## CLI / Job Proposto

Script futuro:

```bash
npm run scheduling-reminders:send -- --tenant demo-prefeitura --dry-run --json
npm run scheduling-reminders:send -- --tenant demo-prefeitura --execute --json
```

Parametros:

| Parametro | Uso |
| --- | --- |
| `--tenant` | obrigatorio para `--execute` no primeiro MVP |
| `--dry-run` | default |
| `--execute` | exige tenant e flag ativa |
| `--limit` | limite por rodada |
| `--channel whatsapp` | canal inicial |
| `--record-events` | grava auditoria mesmo em dry-run |

Sem `--execute`, nunca chamar provider.

## Limites Operacionais

Primeiro MVP:

| Limite | Valor Inicial |
| --- | --- |
| tenants por execucao real | 1 |
| reminders por execucao | 10 |
| canais | WhatsApp |
| retry automatico | 0 |
| intervalo minimo entre execucoes | manual/controlado |
| janela de observacao | 24h |

Somente ampliar limites depois de smoke real e revisao de logs.

## Eventos

| Evento | Quando |
| --- | --- |
| `appointment.reminder.send_dry_run` | dry-run calculou o que enviaria |
| `appointment.reminder.send_attempted` | antes de chamar provider |
| `appointment.reminder.sent` | provider aceitou |
| `appointment.reminder.failed` | provider/policy falhou |
| `appointment.reminder.skipped` | regra impediu envio |
| `appointment.reminder.send_batch_completed` | fim da rodada |

Payload deve conter apenas:

- `clientId`;
- `appointmentId`;
- `reminderId`;
- `channel`;
- `kind`;
- `templateName`;
- `reason`;
- `requestId`;
- contadores.

Nao registrar:

- token;
- payload bruto Meta;
- telefone bruto se nao necessario;
- texto completo sensivel;
- midia.

## Rollback

Rollback imediato:

1. Desligar `schedulingRemindersSend=false` no tenant.
2. Parar job/cron manual.
3. Manter `schedulingRemindersShadow=true` se quiser continuar observando.
4. Nao reverter banco.
5. Revisar reminders `failed/skipped`.

Rollback por canal:

- desabilitar apenas canal `whatsapp` em configuracao futura;
- manter CRUD e shadow ativos.

Rollback de template:

- remover/desabilitar template do tenant;
- proximos reminders devem virar `skipped`/`failed`, nao texto livre.

## Smoke Da Sprint 71H

Antes de enviar:

1. Confirmar tenant piloto.
2. Confirmar `schedulingRemindersSend=true`.
3. Confirmar template aprovado.
4. Criar appointment e reminder manual controlado.
5. Rodar dry-run.
6. Confirmar elegibilidade.
7. Rodar execute com `--limit 1`.
8. Confirmar provider OK.
9. Confirmar `OutboundMessage`.
10. Confirmar timeline.
11. Confirmar chegada no WhatsApp.
12. Confirmar eventos redigidos.
13. Desligar flag se houver qualquer comportamento inesperado.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Envio duplicado | Alto | idempotency key + checagem de status antes do provider |
| Texto livre fora da janela | Alto | template obrigatorio e falha segura |
| Tenant errado | Alto | todas as queries por `clientId`; tenant obrigatorio no execute inicial |
| PII em template/evento | Alto | variaveis minimas e eventos redigidos |
| Provider lento/falha | Medio | limite baixo e sem retry automatico no MVP |
| Timeline divergente | Medio | persistir `OutboundMessage` somente apos aceite |
| Operador confundir shadow com envio | Medio | nomes de script claros: `shadow` vs `send --execute` |

## Ordem Recomendada

### Sprint 71H - Controlled Send MVP

- criar flag `schedulingRemindersSend=false`;
- criar service/CLI de envio real;
- WhatsApp apenas;
- `--dry-run` default;
- `--execute` exige tenant e flag ativa;
- sem cron permanente;
- sem retry automatico.

### Sprint 71I - Manual UI Send

- botao manual "Enviar lembrete" na aba de lembretes;
- usa o mesmo service de envio;
- exige permissao e flag.

### Sprint 71J - Confirmation Parsing Shadow

- interpretar resposta do cliente em shadow;
- sem alterar appointment ainda.

## Veredito

O primeiro envio real deve ser tratado como operacao controlada, nao como scheduler automatico. A proxima sprint segura e implementar `schedulingRemindersSend` e CLI de envio com `--dry-run` default, `--execute` restrito a tenant piloto, WhatsApp apenas, template obrigatorio quando necessario, limites baixos e rollback por flag.

## Status Pos-Sprint 71H

A Sprint 71H implementou o primeiro envio real controlado de lembretes:

- feature flag `schedulingRemindersSend=false` por padrao;
- comando manual `npm run scheduling-reminders:send`;
- `--dry-run` como default;
- `--execute` explicito e dependente da flag do tenant;
- tenant obrigatorio;
- WhatsApp como unico canal suportado no MVP;
- envio via pipeline existente de template WhatsApp;
- idempotencia por `AppointmentReminder.status=pending`, `sentAt=null` e `requestId=null`;
- persistencia em `AppointmentReminder.status`, `sentAt`, `error`, `requestId` e `metadata`;
- eventos redigidos:
  - `appointment.reminder.send_started`;
  - `appointment.reminder.sent`;
  - `appointment.reminder.failed`;
  - `appointment.reminder.skipped`;
- nenhum cron, worker ou scheduler automatico.

Nesta primeira versao, a politica operacional e conservadora: o envio real exige `templateName` e `templateLang`. Texto livre dentro da janela de 24h fica fora do MVP para evitar criar um caminho paralelo de envio e manter a validacao de App/Meta mais previsivel.

Uso:

```bash
npm run scheduling-reminders:send -- --tenant demo-prefeitura --json
npm run scheduling-reminders:send -- --tenant demo-prefeitura --limit 1 --execute --json
```

Rollback imediato:

1. Definir `schedulingRemindersSend=false` no tenant.
2. Manter `schedulingReminders` e `schedulingRemindersShadow` se o tenant continuar usando CRUD/shadow.
3. Revisar reminders `failed`/`skipped` antes de qualquer nova tentativa.
