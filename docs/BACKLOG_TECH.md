# BACKLOG — RE7ONLINE WHATSAPP AGENT

---

## FASE ATUAL DO PRODUTO

Produto SaaS operacional validado com:

- multi-tenant real em produção
- Postgres como source of truth
- campanhas assíncronas operacionais
- controle de uso por tenant
- UI administrativa funcional
- onboarding via Meta validado (Embedded Signup)
- onboarding interno assistido implementado (Sprint 26)
- observabilidade real da Meta integrada na UI de campanhas (Sprint 28)
- área do cliente operacional com login próprio e auto-scope (Sprint 29)

---

## ESTADO ATUAL

Produto operacional com observabilidade real da Meta e área do cliente funcional.

O onboarding interno foi implementado, porém ainda não validado com novo tenant via UI.

### Privacidade / LGPD por titular - 2026-09-20

Data Subject Privacy / LGPD contact-centric anonymization: OWNER PASS / LOCAL
VALIDATED / CLEAN DELIVERY DEPLOYED / PRODUCTION HEALTH VALIDATED. A nova frente adiciona preview e execucao de
anonimizacao por titular a partir de `Contact` canonico do mesmo tenant, com
fallback para `Lead.id` quando `Contact.id` ainda e nulo, busca/seleção pelo CRM
autenticado, confirmacao forte
`ANONIMIZAR TITULAR`, bloqueio de identidade ambigua e evento auditavel
sanitizado `privacy.subject.anonymized`. A implementacao reutiliza as primitivas
de `privacyRetentionService.ts`; a logica comum de minimizacao de Contact,
ContactChannelIdentity, Lead, LeadNote, OutboundMessage e Event foi extraida
para helper compartilhado, preservando a anonimizacao/retencao de conversa
existente. Nao houve schema, migration, hard delete, provider call, envio real,
ou deploy. Distincoes preservadas: exclusao operacional no CRM nao e
anonimizacao LGPD; exclusao de conversa e anonimizacao de conversa permanecem
com seus contratos atuais; retencao continua sendo rotina separada; reentrada
cria/usa novo ciclo operacional sem reidratar historico anonimizado.

Owner UX addition/correction: Contacts agora possui atalho compacto
`Privacidade` com icone de cadeado entre `Abrir contato` e `Retirar da
operação`, visivel para ADMIN, que apenas abre `/app/settings/privacy` com o
titular preselecionado. O atalho nao depende de conversa: quando a linha ainda
nao materializa `Contact.id`, a tela de Privacidade usa `Lead.id` como alvo sem
criar Contact artificial, sem telefone cru como chave de mutacao e sem segunda
engine de anonimizacao. A busca de titular em Privacidade passou a usar endpoint
governamental proprio que reutiliza o read model do CRM para contatos ativos,
Lead-only e operacionalmente excluidos, sem alterar a lista operacional normal
do CRM. Invariante permanente: OPERATIONAL EXCLUSION DOES NOT REMOVE SUBJECT
FROM PRIVACY GOVERNANCE DISCOVERY.

Production deploy, 2026-09-20: clean privacy head
`2527eb6cd01261c2825e2127191c1e3edcf88692` was fast-forward deployed over
`9bb5f88f6a10ff3280e5adcdc777e9df0b0f7657` after persistent PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/privacy-clean-20260920T200352Z-predeploy.dump`.
Backend/frontend builds passed, `re7-whatsapp-agent` and `re7-admin-front`
were reloaded, and `re7-whatsapp-web-worker` was preserved. Health returned
`ok`/`db=ok`. Domain counts for Contact, Lead, ContactChannelIdentity,
Conversation and OutboundMessage stayed unchanged during validation. No
`privacy.subject.anonymized`, provider send, `crm.contact.created` or
materialization event was emitted. Authenticated visual smoke was not exercised
because no valid current production app credential was available and an old
demo-prefeitura ADMIN session was rejected as expired by runtime auth policy;
no real anonymization was executed.

Invalid phone UX mapping: OWNER PASS / LOCAL VALIDATED / CLEAN DELIVERY DEPLOYED. Erros
`invalid_phone` vindos da validacao canonica de CRM agora mostram
`Informe um número de WhatsApp válido com código do país 55 e DDD.` no app. O
backend, normalizador canonico, CSV, campanhas e regras de persistencia nao
foram alterados; nao ha segundo validador frontend.

Lead-only operational exclusion materialization: DEPLOYED / PRODUCTION HEALTH
VALIDATED / REAL LEAD-ONLY E2E NOT EXERCISED. A acao operacional `Retirar da operação` agora suporta linhas
Lead-only usando resolucao canonica de identidade e materializando `Contact`
somente quando o operador executa explicitamente essa acao. Antes da
materializacao, o guard de conversa ativa e aplicado; conflitos de identidade
bloqueiam a mutacao com erro seguro; CCI canonico e reutilizado/criado sem
duplicar contato; reativacao usa o mesmo `Contact`. A materializacao registra o
evento `crm.contact.materialized_for_operational_exclusion` e exibe origem CRM
como `Integração / sistema`. Privacidade/LGPD permanece separada e preservada:
anonimizacao Lead-only continua usando o fluxo de titular existente, sem criar
`Contact` para privacidade. Deploy de producao em `fa7744ac01292f78e094302e932a4d2bd73cb9c9`
foi validado com backup, FF-only, build backend, reload apenas de
`re7-whatsapp-agent`, health/db OK e PM2 estavel. A busca read-only encontrou
candidatos Lead-only no tenant Demo, mas nenhum fixture com identidade WhatsApp
valida e comprovadamente seguro para mutacao; por isso o E2E real ficou
`NOT EXERCISED` e nenhum dado de CRM foi fabricado. Divida do teste
`crmConversationStartRoutes.test.ts`: 2 falhas de expectativa de masking foram
confirmadas identicas no base `fa507507` e nao sao regressao deste follow-up.

P1 Privacy subject atomicity, 2026-09-21: DEPLOYED / PRODUCTION HEALTH +
READ-ONLY PRIVACY VALIDATED. Head implantado:
`55acabafd21a1a594b8650d4fd4ebc8bf14f0263`. Incidente confirmado no tenant Demo para titular `****6787`,
requestId `46f4aba3-23d6-422b-b018-520c540839d5`: a anonimizacao por titular
executou a anonimização de conversa antes da transacao do titular e depois
falhou em `ContactChannelIdentity` por colisao no indice unico
`(clientId, channel, provider, channelAccountId, externalUserHash)` quando mais
de uma CCI do mesmo tuple recebia o mesmo hash anonimo. A correcao implantada coloca
conversa, runtime DB state, Contact, CCI, Lead, LeadNote, mensagens/eventos e
evento final `privacy.subject.anonymized` na mesma transacao Prisma; cleanup de
runtime JSON ocorre somente apos commit e e best-effort. CCI deixa de usar
`updateMany` amplo com hash compartilhado e passa a receber hash deterministico
non-PII por identidade. O deploy teve backup PostgreSQL, FF-only, build backend,
reload apenas de `re7-whatsapp-agent`, health/db OK, busca/preview de
Privacidade 200, preview Lead-only 200 quando havia sujeito natural, nenhum
confirm `ANONIMIZAR TITULAR`, nenhum repair de `****6787` e nenhum envio Meta
iniciado pelo smoke. A anonimizacao real por titular continua PAUSADA ate plano
e gate separados de repair/validacao; preview/busca continuam utilizaveis e
anonimizacao de conversa isolada preserva contrato existente.

Extensao implantada do mesmo P1: a anonimizacao por titular tambem desvincula o
titular de sementes privadas de campanha dentro da mesma transacao. Campanhas,
templates, datas, agregados, ledger/billing e evidencias anonimas permanecem;
o seed `campaign.seed.saved` remove apenas `leadIds`, destinatario privado,
`recipientRefs` e `componentsByWaId` do titular, preservando destinatarios nao
relacionados. Eventos `campaign.recipient.import_blocked` deixam de carregar
recipient bruto do titular. Re-cadastro posterior do mesmo telefone nao deve
ressuscitar campanhas antigas no CRM.

---

## PRIORIDADE ATUAL

Roadmap funcional/produto apos hardening de producao de 08-10/09.

Itens em `WATCH` nao bloqueiam a fila de execucao e nao devem virar frente ativa
sem novo incidente comprovado. Performance residual de Inbox deve ser medida em
janelas representativas futuras, mas nao e a prioridade corrente de
desenvolvimento.

### Auditoria canonica de backlog — 2026-09-13

Fonte de verdade auditada: branch canonico `flow-executor-quote-hardening`,
origin/production HEAD `69bedc38396b8f837a236b0af4a5446397919403`, producao
online, health `ok/db ok`, PM2 online, Prisma migrations up to date e CRA
`/admin/chatbot/settings` validado em runtime DB-backed.

Fechado / validado:

- Guided Builder 2.4: CLOSED / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION
  NON-DESTRUCTIVE VALIDATED. Entrega frontend-only em `ca34e123`, 54/54 testes
  PASS, build PASS, sem schema/migration, sem reload de backend/worker, hashes
  de `ChatbotFlow.definition` inalterados no smoke de producao e rotas
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot` saudaveis.
- Syer `****9614`: CLOSED. A correcao generica de handoff foi publicada em
  `597d7030`; o atendimento pre-fix foi reparado uma unica vez apos backup,
  preservando mensagens, protocolo, ciclo, fechamento e responsavel.
- Human handoff / queue contract: CLOSED / REAL VALIDATED. `WAITING` humano
  exige `departmentId` + `queueId` concreto. `queueId=null` nao representa fila
  padrao. O Guided Builder expõe `Setor`; fila unica e resolvida internamente,
  zero fila bloqueia e 2+ filas mostram seletor condicional.
- Canonical mail transport: CLOSED / DEPLOYED / REAL VALIDATED em `fec3a489`.
  Password reset, first access/invitation, Web Session disconnect alerts,
  template review e PostgreSQL backup alerts usam a camada canonica de mail.
  Fallback Resend API e SMTP `2465` centralizado permanecem preservados.
- Hybrid transport / identity / recovery: CLOSED / REAL VALIDATED para routing
  Web Session passivo, fresh-flow E2E, Meta duplicate dedupe, Lead/P2002,
  claim-before-downstream recovery e exactly-once coexistence.
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED por trafego organico. Nao e
  frente ativa; fairness e cursor round-robin permanecem somente WATCH.
- SECULT report truth/current-state, Maria 2/2 capacity diagnosis, Maria apos
  AVAILABLE, stale-heartbeat exclusion, AGENT closed access, CLOSED claim
  invariant, close observability, close terminal lifecycle e presence panel
  wording: CLOSED / VALIDATED ou CLOSED / DEPLOYED conforme historico abaixo.
- Inbox performance: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao REAL
  VALIDATED; `94882d76` foi REVERTED por regressao real; `4bc8befd` esta
  DEPLOYED. `last_message_lookup` permanece KNOWN RESIDUAL HOTSPOT / NO ACTIVE
  PATCH.
- Internal multitenant support access: IMPLEMENTED / P2 WATCH-HARDENING. O
  produto ja possui grant temporario, sessao de suporte, auditoria e banner de
  modo suporte; melhorias futuras devem focar evidencia operacional e least
  privilege, nao recriar o mecanismo.
- Users x Departments M2M: IMPLEMENTED. Existe
  `UserDepartmentMembership`, UI de usuarios com multiplos setores e uso no
  RBAC/assignment. Gap restante e refinamento de relatorios/filtros, nao modelo
  relacional basico.
- CRA admin chatbot settings: CLOSED / REAL VALIDATED em
  `69bedc38396b8f837a236b0af4a5446397919403`. Em 2026-09-13 a
  auditoria do toast inicial em
  `/admin/tenants/cra-pr/chatbot?clientKey=cra-pr` mostrou que CRA existe como
  `Client` DB-backed, mas `/admin/chatbot/settings` retornava
  `tenant_not_found` por exigir entrada legada em `.data/tenants.json`. A rota
  passa a montar tenant efetivo em memoria a partir do `Client` e dos resolvers
  DB-first, preservando fallback legado e sem criar entrada artificial em
  `tenants.json`. Smoke de producao: settings 200, resources 6 departamentos /
  6 filas, flows 1, health ok/db ok, `.data/tenants.json` ausente.
- Admin chatbot loading/badge: CLOSED / REAL VALIDATED em `69bedc38`. A UI
  admin hidrata flows/recursos mesmo se settings falhar parcialmente, o estado
  de loading nao depende mais de `settings != null`, o bug de badge permanente
  "Carregando" foi fechado e erro verdadeiro e exibido quando settings nao
  estiver disponivel.
- Abandoned automation / BOT flow lifecycle: LOCAL E2E VALIDATED / P2 RESIDUAL
  HARDENING. Em 2026-09-14, o comportamento existente foi validado em DB
  local seguro, sem runtime change, sem producao e sem deploy. `resetAfterMinutes`
  reinicia menu/submenu/captura no proximo inbound e nao move para HUMAN nem
  CLOSED; `timeoutMinutes/action=HANDOFF` promove uma vez para HUMAN/WAITING
  com department/queue concretos, protocolo e mensagem de posicao quando o
  destino e valido; nova varredura nao duplica handoff. Caveats abertos:
  limpeza de `flowContext` em reset stale, copy/UX de timeout e paridade
  provider-independent do processor. Auto-close generico de atendimento HUMAN
  continua fora do requisito.
- Inbox visibility policy audit: CLOSED / AUDITED / NO CODE CHANGE. A politica
  `shared`/`assignee_only_after_assignment` permanece apenas como regra de
  projecao/visibilidade para lista/detalhe/timeline; nao altera criacao de
  conversa, handoff, fila, capacidade, presenca, claim, transferencia, envio,
  fechamento, atribuicao automatica ou RBAC canonico. A restricao de acesso de
  AGENT a conversas `CLOSED` permanece mais forte e preservada.
- P1 Auth malformed claim process crash: CLOSED / DEPLOYED / PRODUCTION HEALTH
  VALIDATED. Em 2026-09-20, smoke pos-deploy revelou que token assinado com
  `clientId` malformado podia chegar ao Prisma em `AppAuthSession.clientId`
  (`@db.Uuid`), gerar `P2023`, escapar como `unhandledRejection` e reiniciar
  `re7-whatsapp-agent` via PM2. O fix `8f15eedf4eb11dd8f0bea4f1dd79bb50cae3be9e`
  valida claims UUID-backed antes de qualquer lookup Prisma e adiciona boundary
  de promise/erro ao ciclo HTTP de `handleRequest`: claim malformada retorna
  `401 invalid_token`; falha inesperada de request retorna 500 generico sem
  stack, mensagem Prisma, token, PII ou segredo no cliente. Global
  `unhandledRejection` permanece como last-resort fora do ciclo HTTP. Deploy
  production FF-only feito sobre `1a28cf2a82a8bc37dec0343f0487f2faf6be2962`,
  backend build PASS, reload somente de `re7-whatsapp-agent`, admin-front e
  web-worker preservados. Smoke seguro usou sessao real existente e token
  claramente invalido; NAO houve reproducao de token assinado malformado em
  producao. Health `ok/db=ok`, PID do agent preservado apos smoke, logs sem
  `process.unhandledRejection` e sem Prisma `P2023`.

ACTIVE P0:

- NONE.

ACTIVE P1:

1. Operational Queue production rollout:
   CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS. The
   deployed baseline supports
   creation/import now requires explicit `returnDestination` in the
   `campaign.seed.saved` contract: `human_department` with concrete
   `departmentId` + `queueId`. The local successor UI accepts Department only,
   resolves explicit `Department.operationalQueueId`, blocks unavailable
   mappings and never exposes a multi-queue selector. Strict production cutover
   resolved all 54 departments on 2026-09-18, including the five owner decisions
   recorded on 2026-09-18.
   `automated_flow` uses any
   active same-tenant `ChatbotFlow` persisted as `chatbot:<flowId>` at runtime.
   `entryPoint` is not required for explicit campaign invocation; it remains the
   default selector for unqualified/new inbound only.
   Direct CRM contact initiation no longer falls back to generic operational
   defaults; it uses the initiating user's valid primary department and blocks
   before provider send when missing. Legacy campaigns without this seed remain
   compatible through the old operational default fallback, but new campaign
   configuration has no implicit name-based destination. Tests/builds: focused
   `operationalQueue.test.ts` 8/8 PASS, runtime routing 30/30 PASS, identity
   12/12 PASS, `campaignsFeatureRoutes.test.ts` 114/114 PASS,
   `ChatbotFlowBuilder.test.ts` 53/53 PASS, backend build PASS, frontend build
   PASS. Production advanced by FF-only to
   `b166bcac8bf443d34ba7f3821016b6bae8069728`; backup
   `/opt/re7online/backups/operational-queue-rollout-20260918-104054` passed
   (`20,664,912` bytes, 578 objects, SHA256
   `a5898b277a82e5d0317314c9decaeb75dede023f76a8d55afc2044c4da230ddf`);
   migration `20260917213000_add_department_operational_queue` applied; first
   reconciliation updated 44 explicit mappings and created/linked 2 internal
   queues; second reconciliation was idempotent. Post-verify: 54 departments, 44
   active resolved, 0 active unresolved, 8 inactive null, 2 inactive with queue,
   0 cross-tenant/department links. Backend/frontend builds, targeted PM2 reload
   and HTTP smoke passed. No real Meta send and no `****6787` repair occurred.

2. Campaign UX / result truth canonical integration:
   INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY. The
   owner-approved Campaign UX delta was recovered from
   `.codex-recovery/re7-cra-crm-integration-20260917T2015.tar.gz` and
   reapplied on the current canonical Operational Queue baseline
   `6eec15c4c4725079c3dd5e48e3eb10d81643c2db`, without schema/migration,
   queue-domain changes, production deploy, Meta send or `****6787` repair.
   Customer UX now keeps campaign destination Department-only, removes
   customer-facing price/cost/tariff surfaces from Campaigns and the Inbox
   template shortcut, exposes persisted lifecycle tabs `Enviando`,
   `Agendadas` and `Concluídas`, keeps the progress/detail modal closeable
   while backend execution continues, and renders recipient-level blocked,
   skipped, pending and opt-out states from persisted backend data. Backend
   execution remains authoritative; the frontend only observes persisted
   campaign state. Final local result-detail audit for Demo campaign `Campanha
   teste set.2` / `lembrete_vencimento_anuidade` confirmed that the repeated
   `****6787` line was a projection/fallback duplication, not a duplicate
   provider send. Detail now reconciles one current outcome per intended
   recipient when identity evidence exists, shows the full phone only inside
   the authenticated campaign detail, preserves masking in draft/review, and
   classifies mixed delivered/blocked evidence as partial delivery. Recovery artifact:
   `codex-recovery/campaign-ux-result-truth-delta-20260918.patch`, 36,387
   bytes, SHA256
   `5967b2baab3ceffa3333b6f04ec31b622652e2399e2cbcf69de60379a53db490`.
   Root-cause closure for `****9614`: the runner blocked before provider
   because canonical resolution found two same-tenant Contact candidates and
   one Lead. The duplicate Contact is historical residue from the former
   campaign bootstrap, created before Identity P1; no current creation bypass
   was reproduced. The same recipient remains blocked until a separately
   owner-authorized transactional data repair. Counters are separated as
   delivered 1, blocked 1, pending 0 and technical failures 0, with campaign
   wording `Entrega parcial`. Evidence and dry-run repair package:
   `docs/saas/DEMO_9614_CAMPAIGN_IDENTITY_CLOSURE_2026-09-18.md`.
   Validation: `campaignsPageContract.test.ts` 9/9 PASS,
   `campaignsFeatureRoutes.test.ts` 115/115 PASS on safe local DB
   `re7_campaign_result_truth_test`, backend build PASS, frontend build PASS,
   `git diff --check` PASS. Production remains protected at
   `b413eea04af15cef2cf7667dbc3fa84bca3f49bc`; production health/db/migrations
   PASS read-only. Owner visual revalidation on this integrated branch is still
   pending.

   P1 canonical 12/13-digit corrective, 2026-09-18: READY FOR OWNER REVIEW /
   NO DEPLOY. The first synthetic result-truth test did not reproduce the real
   persisted shape. Production validation at HEAD `6f63133d7c3bb09097a11c0b49eefa7b9f8383c3`
   exposed a 13-digit seed and 12-digit delivered outbound for the same
   `****6787` identity, creating a false missing-history failure. The hard gate
   stopped validation. The projection now reuses
   `buildCrmWhatsappIdentityCandidates`; it does not add a campaign normalizer
   or rewrite history. Exact and reverse shapes, multiple real attempts,
   genuine fallback, cross-tenant isolation and `****9614` blocked semantics are
   covered. Read-only replay of the real records returns exactly 2 rows: 1
   delivered, 1 blocked, 0 pending, 0 technical failures, `Entrega parcial`.
   Validation: campaign backend 118/118, complementary matrices 56/56 and
   72/72 PASS. Schema unchanged, migration none, no send, no repair. Canonical
   record:
   `docs/saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md`.

   Open controlled data action: Demo `****9614` historical identity residue.
   DATA REPAIR PREPARED / OWNER AUTHORIZATION REQUIRED / NO RESEND. Factory is
   fixed; do not reopen Identity P1 as an active product bug without new
   creation evidence contradicting the focused identity-path tests.

   Campaign composer cleanup: IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO
   DEPLOY. Unsaved composition is now governed by one dirty-state contract and
   one idempotent reset. Explicit discard and Campaign-tab navigation clear
   name, template/variables, recipients, CRM/CSV previews, mappings,
   destination and errors; stale async preview responses are invalidated.
   Preview creates no server record. Explicit drafts, CRM upserts committed by
   CSV draft creation, scheduled/sending/completed campaigns, outbound, billing
   and history remain preserved. Canonical lifecycle:
   `docs/saas/CAMPAIGN_COMPOSER_LIFECYCLE.md`.
   Local gate on 2026-09-18: composer/page contracts 18/18 PASS, Campaign
   backend 115/115 PASS, import/CRM 23/23 PASS, both builds and focused lint
   PASS. Authenticated smoke confirmed clean discard/re-entry, clean CSV cancel
   and intentional draft preservation. Owner visual review remains pending.

3. CRA Demo Utility Recipient B controlled send: COMPLETED / DEMO PRODUCT
   CAPABILITY VALIDATED / CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 the
   owner authorized exactly one Utility send to Recipient B `****6787` through
   campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214`. Preflight passed:
   `demo-converta` active, `data_exame` approved Utility `pt_BR`, B-only
   audience, A excluded, no active opt-out, outside 24h by 143.72h, explicit
   HUMAN return destination `Atendimento Geral`
   (`cmsiwk1o100014sdzl5cqd2ki`) -> `Fila Geral`
   (`cmsiyb2k200n94sdpu5khkee0`), and department OPEN. Backup:
   `/opt/re7online/backups/demo-b-controlled-send-20260916/pre-demo-b-controlled-send-20260916T132038Z.dump`
   (20M, 593 objects, SHA256
   `e73be155604ae0c7e7fe42b44dc87a1213755030cfa1c0d5d585f33e0319253a`).
   Result: exactly 1 Meta call, accepted with Meta id
   `wamid.HBgMNTU4NDk0Nzg2Nzg3FQIAERgUQ0UzOTE0Q0UyNUY0QjQ3OUZCQ0EA`,
   local OutboundMessage `076910ef-ce6f-43d6-bfc2-2f30c4b41930`,
   `campaign.message.submit_started` PASS, `campaign.message.provider_accepted`
   PASS, `campaign.message.reconciliation_required` absent, webhook `sent=1`,
   `delivered=1`, `read=0`, `failed=0`, billing event
   `billing.active_message.delivered` count=1, duplicate billing NO. Campaign
   status `completed`, `sentCount=1`, `blockedCount=0`. A external sends in
   this run: 0. Sanitized evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md`
   and `.csv`. Opt-out E2E was later completed on Demo; CRA real
   acceptance/report package still needs owner/customer acceptance evidence.

3. CRA Demo opt-out E2E: COMPLETED / DEMO PRODUCT CAPABILITY VALIDATED /
   CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 the owner explicitly authorized
   opt-out creation, one controlled blocked campaign and reversal for B
   `****6787`. Canonical `recordContactOptOut` created
   `contact.opt_out.recorded` (`88361d0f-89df-41fc-852b-ce84cbb43cc4`);
   campaign `d260bdc6-326f-4487-8d15-21c2a98dd741` blocked before provider via
   `campaign.recipient.opt_out_blocked`
   (`80d6ca1d-94f2-4465-81b7-74888c1d0edc`), `blockedCount=1`,
   `sentCount=0`, Meta calls 0, real messages 0, OutboundMessage 0 and billing
   events 0. Canonical `revokeContactOptOut` created
   `contact.opt_out.revoked` (`a5b58132-79fe-49dd-8aff-49fb78bf4566`); B is
   eligible again and history is preserved. A `****9614` was untouched
   (outbounds 125/125, billing 1/1, opt-out events 0/0). Evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_D_OPT_OUT_E2E_2026-09-16.md`
   and `.csv`.

4. CRA reports / exports / billing acceptance audit: COMPLETED FOR DEMO
   PRODUCT CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 a
   docs/evidence-only audit reviewed the official clarification and product
   routes without sending campaigns, changing opt-out or mutating ledger data.
   Sources confirm export may be CSV/XLSX or equivalent open/widely used format
   and active-message billing is Utility outside 24h effectively delivered;
   read does not add billing. Production read-only evidence: A campaign
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` remains truthful as
   `failed`/reconciled with one outbound and one
   `billing.active_message.delivered`; B campaign
   `bb1d30e2-3a98-471a-9531-1f5e5d76a214` is `completed` with one delivered
   outbound and one billing event; opt-out campaign
   `d260bdc6-326f-4487-8d15-21c2a98dd741` has `blockedCount=1`, zero outbound
   and zero billing. `demo-converta` and `cra-pr` both have `campaigns` and
   `reports` enabled. CSV/open-equivalent evidence PASS; native XLSX is not
   claimed; formatted PDF exists in reports but campaign consumption remains
   CSV/open-equivalent. Provider cost, estimated USD payload and CRA
   contractual BRL price remain separate; CRA final contract unit remains NOT
   PROVEN. Evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md`
   and `.csv`. Next front: CRM import/upsert/report with optional
   `Situacao no CRM`.

5. CRA campaign import - optional CRM situation column: IMPLEMENTED /
   TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED /
   PRODUCTION NON-DESTRUCTIVE VALIDATED.
   Campaign/contact audience files may optionally contain
   `Situacao no CRM` / `Situação no CRM`. When populated, the value must resolve
   deterministically against CRM situations/statuses already configured for the
   same tenant, persist the canonical internal id/reference, never use
   cross-tenant values, never create a CRM status silently and report unknown
   values truthfully in preview/import validation. Unsafe fuzzy matching is not
   allowed. This front is a safe tenant-scoped CRM upsert, not only a new
   column: if imported identity matches an existing CRM contact, update the
   canonical record and do not create another contact. Blank uploaded cells
   preserve existing name/status values; valid imported name may update the
   existing contact according to current CRM semantics; valid resolved
   `Situação no CRM` may update the existing situation reference. Repeated
   identities inside the file must not create duplicate contacts. After import,
   a detailed operator report is mandatory with totals, created/updated/
   unchanged/skipped/errors, duplicate/consolidation evidence and per-row safe
   result details; downloadable evidence should reuse existing export/report
   infrastructure. Audit completed: CRM status model,
   canonical identity/normalization/deduplication mechanism, current import
   schema, segmentation usage, status naming/uniqueness, update-vs-create
   semantics, duplicate-row policy, partial-success behavior and report/export
   infrastructure were reviewed. Implemented local result: `Lead.status` is the CRM situation
   model; campaign CSV import now previews/applies tenant-scoped CRM upsert via
   existing identity helpers, updates valid nonblank names, preserves blank
   name/status cells, resolves `Situação no CRM` by same-tenant active status id
   or label with deterministic normalization, blocks unknown/ambiguous
   situations at row level, prevents duplicate contact creation for repeated
   identities, records per-row import evidence and exposes downloadable CSV
   report in the app campaign import flow. CRA customer import run is still
   pending owner-approved sample data.
   Audit history preserved: owner result was PARTIAL PASS; the 2026-09-17
   principles audit blocked the front on four P1 findings (transaction
   consistency, duplicate winner order, parallel identity matching and missing
   CRM capability). The corrective batch now uses the canonical CRM resolver,
   commits CRM mutation/status/campaign seed per row, validates before claiming
   duplicate identity, requires `campaigns` plus `crm` (and `contacts` scope in
   the public API), and neutralizes spreadsheet formulas in the result CSV.
   Focused rollback, hash-only identity, duplicate-order, authorization and CSV
   tests pass. Residual P2: canonical preview resolution is sequential per row
   (100 rows about 231 ms; 1,000 rows about 1.76 s locally) and may need later
   bulk performance hardening without a parallel identity engine. Residual P3:
   normalize internal operation/error labels exposed to the operator. Owner
   revalidation passed locally on 2026-09-17 for preview, import, no-duplicate
   behavior, hash-only identity, CRM situation, blank preservation, duplicate
   winner, report/download, CSV safety, history preservation and regressions;
   no real send occurred. Canonical integration was then prepared from
   `819cd9b5` with the audited corrective delta preserved. Production reached
   `cad9489c` by FF-only on 2026-09-17 after verified persistent backup; backend
   and frontend builds/reloads and non-destructive runtime/bundle/DB checks
   passed. No real production import or send was executed, and CRA/customer
   acceptance remains pending. The authorized operational untracked directory
   `apps/whatsapp-web-worker/.data/` remained intact and its process was not
   reloaded; this is operational state, not a product defect. Completion
   telemetry and the broader lint baseline remain WATCH.

6. Contacts - campaign relationship view: CANONICALLY INTEGRATED / TEST
   VALIDATED / OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. Implemented
   in the CRM/Contacts area as a read-only projection from canonical
   `Campaign`, `OutboundMessage` and campaign event evidence. Contact list now
   shows compact campaign count, latest campaign/date/template/status, and the
   contact detail drawer shows recent campaign history with navigation to the
   existing campaign detail route. No Contact-owned shadow campaign-history
   model, schema or migration was added; no campaign/billing history was
   rewritten. Scope is same-tenant only and the list uses one bounded aggregate
   projection for the current page plus on-demand detail to avoid per-row N+1.
   Customer UX exposes operational statuses only, with no price/cost fields.
   Validation on safe local DB `re7_queue_domain_test_20260917`:
   `crmCapabilityRoutes.test.ts` 19/19 PASS including same-phone/cross-tenant
   isolation, delivered status, opt-out block, identity conflict, detail link
   and no financial strings; backend build PASS; frontend build PASS; diff
   check PASS. CRA customer acceptance and production deployment remain pending.

7. Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
   PASS / NO DEPLOY. This is visual/interaction polish on already
   closed domain behavior. Contacts now use clickable rows, compact
   Inbox/Departments-like action buttons, full phone display only inside the
   authenticated same-tenant CRM read model, no duplicate top-level CRM
   Situation/active-send/template-eligibility summary, active-send control as an
   ON/OFF switch backed by the canonical opt-out record/revoke path, and one
   expandable "Campanhas relacionadas" section instead of repeated standalone
   campaign cards. Final owner rule: contact deletion is available only from the
   contact list row; the contact detail keeps close/edit/save/cancel semantics
   and has no delete action. Contact exclusion remains the existing guarded
   operational exclusion path; active/open conversations still block with
   explicit instructions and no auto-close/transfer/delete. Campaigns removed the
   redundant top counter panel, moved counts into tabs, made campaign rows open
   detail directly, right-aligned compact actions, removed the technical
   provider/persistence note and normalized detail counters so "Processadas"
   and "Aceitas pelo provedor" are distinct. Campaign detail now has view-only
   recipient/result filters by result status, same-tenant CRM Situation and
   name/phone search; the filtered set can be copied as tabular text or loaded
   into the existing composer as current canonical contacts with explicit
   excluded-without-current-contact counts. This prefill does not send and the
   normal composer path rechecks opt-out/identity at draft/send time. Dynamic
   CRM-filter scheduled campaigns are now a separate OWNER PASS / LOCAL
   VALIDATED / NOT DEPLOYED front documented in
   `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`: schedule-time stores
   only the CRM Situation filter, execution-time creates one immutable snapshot,
   and static campaigns remain unchanged. No schema/migration, no real send, no
   financial customer UX and no campaign/history rewrite.

8. Contacts UX finishing + phone normalization/import validation hardening,
   2026-09-19: OWNER PASS / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED. Final local
   polish keeps the active-conversation delete guard in the Contact list row but
   makes the blocking toast closable, removes the redundant active-conversation
   warning/action block from Contact detail, and makes `Abrir campanha` navigate
   to the existing campaign detail route. Contact CSV preview now disables while
   pending and ignores stale duplicate responses; preview/confirm report created,
   updated/reused, skipped, failed rows and detailed formula-safe errors with
   copy/download actions. Permanent invariant: NO NEW CONTACT/RECIPIENT PHONE MAY
   BE PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION. Manual Contact
   create, Contact CSV import and Campaign CSV import now share the canonical CRM
   WhatsApp identity normalizer, reject missing DDD, unsupported/non-Brazil and
   structurally invalid phone numbers before persistence, and preserve approved
   12/13-digit Brazilian identity equivalence. Follow-up convergence completed
   locally: Contacts CSV now reuses the Campaign CSV parser/status resolver where
   domain-compatible, supports `Situação no CRM`, validates that CRM statuses
   already exist in the same tenant, rejects invalid status rows before
   persistence, preserves existing status when the CSV cell is blank, and uses the
   same preview/report philosophy with row-level errors and copy/download
   evidence. No provider call, schema, migration, production mutation, real send,
   opt-out rewrite, result-history rewrite or tenant hardcode. Production
   deployment `1f8304f8624e76ba3efc507b9eccd80060447adb` was applied by
   fast-forward only from `5208de159dd11b94dd5db2382446c66b38705c52` after
   verified PostgreSQL backup
   `/opt/re7online/backups/converta-persistent/postgres/contacts-phone-integrity-20260919-233044/whatsapp_agent.dump`
   (`sha256=e4c965d219c85aaeff211d12161b49cc74e8b553e47f34758c34b621e2b153cf`).
   Production validation used Demo preview/read-only paths only: Contact CSV and
   Campaign CSV preview produced zero Contact, Lead, Campaign or Outbound
   mutations; no provider call, real send, billing event or schema/migration
   occurred. Existing historical invalid phone rows remain an audit/repair topic
   and were not mass-corrected by this gate.

   Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
   VALIDATED / NOT DEPLOYED. Owner production feedback required the Contacts
   CSV modal to converge visually and behaviorally with the Campaign CSV import
   flow. Local delta removes the initial `Confirmar importacao` action until a
   preview exists, locks duplicate preview/import actions during pending/result
   states, provides an explicit cancel/reset path, renders preview/report/errors
   with Campaign-style cards, badges and tables, localizes operation/reason
   labels, and shows full authenticated phone evidence in the Contacts CSV
   preview/report. Preview validity is tied to the exact selected phone/name/CRM
   Situation column mapping; mapping changes keep the stale preview visible,
   block import and require `Atualizar previa`. Domain behavior remains
   unchanged: preview before import, same-tenant CRM Situation resolution,
   canonical phone normalization, formula-safe report CSV, no provider call, no
   real send, no schema/migration.

   CRM post-deploy hardening, 2026-09-21: LOCAL VALIDATED / COMMIT PENDING /
   NOT DEPLOYED. Contact origin semantics were hardened without adding a
   persistence field: CRM CSV confirm now persists individual per-contact
   canonical provenance through the existing `crm.contact.created` audit event;
   `crm_manual` maps to `Cadastro manual`, `crm_import` maps to `Importacao CSV`,
   campaign/audience evidence maps to `Campanha / audiencia`, explicit
   conversation/inbound/system sources map to their user-facing categories and
   legacy records without reliable evidence show `Nao identificado` rather than
   fabricated provenance. Origin is first reliable CRM entry provenance: a
   manually created contact later updated by CSV remains `Cadastro manual`,
   while a CSV-created contact shows `Importacao CSV`. Contacts CSV modal state
   now exposes one secondary action per state: `Cancelar` before processing and
   `Fechar` after the completed summary; no redundant close/cancel pair remains.
   CRM conversation actions now preserve historical count/history while exposing
   `Abrir conversa` only when the selected conversation is projectable by the
   canonical Inbox policy `shouldProjectConversationToHumanInbox(...)`. BOT-only
   or otherwise non-projectable historical conversations remain historical CRM
   evidence and no longer create false Inbox-open actions. No schema/migration,
   no provider call, no real send, no runtime mutation and no new conversation.

7. Campaign post-Meta persistence / operational default: CLOSED / DEPLOYED /
   TEST VALIDATED / PROD NON-DESTRUCTIVE VALIDATED. Em 2026-09-15, Phase C autorizada para exatamente
   2 mensagens Utility `data_exame` via META_CLOUD no `demo-converta` parou com
   bug operacional. Prechecks passaram, a primeira chamada Meta para `****9614`
   foi aceita e o owner confirmou recebimento real, mas o runner falhou em seguida com
   `default_operational_department_missing` antes de persistir OutboundMessage,
   ledger e report; `****6787` nao foi enviado. Campanha
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` ficou `failed`, `sentCount=0`,
   `blockedCount=0`. Meta message id foi recuperado nos eventos runtime e
   webhooks `sent` e `delivered` foram encontrados em `webhook.status.received`,
   mas nao correlacionaram porque o OutboundMessage local nao existia. Causa:
   `ensureCampaignOutboundConversation` exigia default operacional depois da
   mutacao externa Meta; no Demo havia departamento/fila, mas sem default ativo
   `Atendimento Geral/Fila Geral`, e a dependencia nao era preflight. Fix
   local generico aplicado sem tenant hardcode: preflight de default operacional
   antes de Meta, eventos idempotentes `campaign.message.submit_started` e
   `campaign.message.provider_accepted`, bloqueio de retry com
   `campaign.message.reconciliation_required`, e registro
   `webhook.status.orphaned` para status sem OutboundMessage sem criar billing
   sintetico. Auditoria read-only de risco confirmou que nao e Demo-only:
   `cra-pr`, `demo-converta`, `secult-pe` e `syer-rodrigues` nao possuem
   `defaultDepartmentId/defaultQueueId` nem default geral ativo; `re7online`
   possui default geral ativo. Testes locais PASS: `campaignRunner.test.ts` 5/5,
   `campaignsFeatureRoutes.test.ts` 113/113, billing 4/4, preview 4/4,
   backend build PASS e `git diff --check` PASS. Deploy FF-only em producao em
   2026-09-15 no commit `b8c8f616`; backup persistente
   `/opt/re7online/backups/campaign-post-meta-20260915/pre-campaign-post-meta-20260915-210808.dump`
   (`20M`, 578 objetos, SHA256
   `e4e2dc141ff23f5afef9bc4504ef7951d4038ddc39cb623754e51dded455ca27`);
   reload somente `re7-whatsapp-agent` (`3253772` -> `3319619`), frontend e
   web worker preservados, health/db PASS. Smoke nao destrutivo no bundle
   implantado confirmou preflight antes de send, marker accepted,
   reconciliation guard e orphan status path. Nao houve novo envio real; A nao
   deve ser reenviado e B requer novo owner gate. Auditoria manual de Recipient
   A em 2026-09-15 concluiu SAFE CONSTRAINED RECONCILIATION POSSIBLE e o owner
   aprovou a reparacao restrita. Backup persistente criado em
   `/opt/re7online/backups/recipient-a-reconciliation-20260915/pre-recipient-a-reconciliation-20260915T213115Z.dump`
   (`20M`, 593 objetos, SHA256
   `d0957043bcf2a137bbe700c7517606ac0d716ec85da24b89d2bd68d897d43122`).
   Reparacao aplicada somente em `demo-converta`: 1 OutboundMessage criado para
   `****9614` (`1375f639-b3df-425a-987e-545d2ffcddd1`), Meta id recuperado
   anexado, delivered real aplicado por billing canonico idempotente
   (`billing.active_message.delivered`), `sentCount=1`, `status=failed`
   preservado e audit event unico registrado. A nao foi reenviado; B nao foi
   enviado. RECIPIENT A RECONCILIATION = RECONCILED / NEVER RESENT; RECIPIENT B
   historical 2026-09-15 attempt = NOT ATTEMPTED / BLOCKED PRE-META BY DEMO
   OPERATIONAL DEFAULT, later superseded by 2026-09-16 explicit destination
   draft preparation with no real send.
   Owner autorizou B-only em 2026-09-15, mas o preflight imediato bloqueou antes
   da Meta: `demo-converta` possui `Atendimento Geral` inativo e `Fila Geral`
   ligada ao departamento inativo; nao existe par active default
   `Atendimento Geral` + `Fila Geral`. Como `failed -> sending` e proibido, a
   campanha original nao pode ser retomada; caminho correto seria nova campanha
   controlada B-only depois de reparo config-only do default operacional Demo.
   Meta calls para B nesta tentativa: 0. Auditoria de
   default operacional Demo em 2026-09-15 concluiu CONFIG PENDING / OWNER GATE:
   o mecanismo canonico existente nao usa `defaultDepartmentId/defaultQueueId`;
   ele resolve por `Atendimento Geral` ativo + `Fila Geral` em
   `ensureDefaultOperationalDepartmentAndQueue`. O Demo ja possui o departamento
   `cmsiwk1o100014sdzl5cqd2ki` (`Atendimento Geral`,
   `atendimento-geral`) com a fila `cmsiyb2k200n94sdpu5khkee0`
   (`Fila Geral`) e membro ativo, mas o departamento esta inativo. Proposta
   preparada e nao executada: reativar esse departamento existente; nao criar
   setor/fila novo, nao escolher setor tematico SECULT/CRA e nao enviar Meta.
   Owner approval obrigatorio antes da mutacao DB config-only.
   Auditoria de
   unidade de billing em 2026-09-15 confirmou que `R$ 0,32` veio da premissa
   interna central `R$ 3.200,00 / 10.000 mensagens ativas`, nao de Meta, nao de
   override de tenant e nao de proposta final CRA encontrada. O ledger de A esta
   correto como elegibilidade/contagem delivered Utility fora de 24h. A prova
   oficial estreita de custo Meta para B foi obtida em 2026-09-15: Brazil
   Utility, BRL, efetivo em 2026-07-01, tier 0-250.000, R$ 0,0350/mensagem
   entregue. A unidade BRL final CRA permanece NOT PROVEN;
   OPT-OUT E2E e REPORTS/EXPORT/BILLING permanecem pendentes ate nova evidencia
   valida de campanha.

P2 / PRODUCT + META CAPABILITY:

1. Meta Marketing template media support: OPEN. Audit and implement
   professional support for MARKETING templates with IMAGE and VIDEO headers,
   Meta media/example requirements, upload/handle lifecycle, preview,
   variables, supported buttons, submission, approval/rejection status,
   rejection reason, approved-template send path and current official Meta
   Marketing pricing source. This must not be mixed with the current CRA Utility
   controlled campaign. If CRA Contract/TR evidence later proves Marketing media
   templates are required for current acceptance, flag for owner decision and
   potentially promote it to the CRA contract front.

WATCH / EXTERNAL OPERATIONS:

1. Demo channel continuity: WATCH / SEPARATE META AND WEB SESSION TRACKS.
   Auditoria somente leitura de 2026-09-15 preserva o historico do incidente
   externo Meta de 2026-09-14 (`status=BANNED`, WABA `REJECTED`, business
   `not_verified`, templates `SCAM`) sem tratar isso como causa de Web Session.
   A evidencia atual em producao mudou: `npm run meta:readiness -- --tenant
   demo-converta` retornou `WARN` sem `FAIL`/`WAITING_EXTERNAL`, com
   `TenantMetaConfig` presente, token presente, WABA/phone mapeados e validacao
   externa de subscription ainda requerida. A Web Session do Demo, que entrou em
   `QR_REQUIRED` em 2026-09-13 22:40:23Z com `action=auth_clear`, foi
   reemparelhada em 2026-09-14 16:31Z e esta `CONNECTED` em producao para
   `****5328`; material `baileysAuthState.v1` aprovado esta configurado. Nao
   limpar, desconectar, resetar, trocar numero/WABA ou reexecutar onboarding sem
   diagnostico e autorizacao explicita do owner.
2. CRA-PR contractual readiness: UTILITY READINESS AUDIT CLOSED / CONTRACT
   ACCEPTANCE OPEN / CONTRACT GAPS TRACKED OUTSIDE RUNTIME P1 UNLESS CODE GAP
   IS PROVEN. A matriz canonica
   `docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md` mapeia 52 requisitos
   do Contrato/TR contra produto, configuracao CRA e evidencia de producao.
   Nao reabrir CRA active flow visibility nem CRA business hours: ambos estao
   fechados, respectivamente CUSTOMER VALIDATED e CONFIGURED / OPERATIONALLY
   VALIDATED. Atualizacao de 2026-09-15: a frente ativa e aceite contratual da
   campanha Utility controlada; a copia CRA aprovada ainda nao foi encontrada,
   portanto nao ha autorizacao para submissao Meta nem envio real. Instagram
   Direct, Facebook Messenger e Website/Webchat seguem contratados, mas estao
   CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING e nao bloqueiam esta fase.
   Snapshot somente leitura CRA: Meta/WhatsApp configurado, `campaigns=true`,
   `templates=true`, 0 templates, 0 pedidos de template, 0 campanhas, 0 eventos
   de billing/opt-out de campanha. Checklist canonico atualizado em
   `docs/bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md`.
   Proibido submeter template Meta ou envio Meta real sem copia CRA aprovada e
   aprovacao explicita do owner cobrindo template, destinatarios, janela, custo
   esperado, nome da campanha e quantidade de mensagens. Gate local de DB em
   `re7_cra_contract_test2`: migrations 58/58, campanha/import/runner 5/5 PASS,
   billing/preview/lifecycle 5/5 PASS; suite ampla `campaignsFeatureRoutes`
   111/112 PASS com timeout em runtime de chatbot inativo, fora da frente
   Utility/campaign. Ordem atual: Utility/campaign acceptance, opt-out,
   relatorios/exportacoes/billing, acceptance pack; canais adiados so reabrem
   com janela do cliente.
   Demo contract validation Phase A, 2026-09-15: `demo-converta` foi auditado
   como mirror multitenant, nao clone CRA. Snapshot read-only: ACTIVE/business,
   Meta Cloud configurada, 1 Utility aprovado, 0 campanhas, 0 eventos de
   billing/opt-out de campanha, 15 departamentos, 19 filas, 4 fluxos e 50 linhas
   de horario. Plano canonico criado em
   `docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md`: 36/52 requisitos
   demo-validatable, 19 ja product-validated, 8 capacidades validadas nesta
   leitura, 12 CRA-specific only, 4 customer-deferred, 1 product gap. Nenhuma
   submissao Meta, envio real ou dado CRA usado no Demo.
   Phase B owner gate, 2026-09-15: template Demo aprovado `data_exame`
   (Utility/pt_BR, 1 variavel Data) e adequado apenas para homologacao Demo com
   dados de teste; testes locais de precheck 13/13 PASS; custo de referencia
   anterior para 2 mensagens = R$ 0,64, agora reclassificado como referencia
   central de planejamento pendente de reconciliacao de unidade. Sem envio real.
   Correcao de backlog: HUMAN
   waiting-on-customer 1h e SUPERSEDED / NOT REQUIRED; atendimento humano pode
   permanecer aberto sob controle do atendente. O front correto e BOT/FLOW
   lifecycle, ja validado para resetAfterMinutes, stale pending question reset e
   inactivity handoff, com residual cross-provider e Guided lifecycle UX em P2.
   Phase C controlled gate, 2026-09-15: owner autorizou os dois numeros
   Demo/RE7 conhecidos por finais `9614` e `6787`. Preflight read-only PASS:
   producao health/db ok, Demo ACTIVE/business, `campaigns=true`,
   `templates=true`, Meta config presente, Web Session conectada, template
   `data_exame` ainda `approved`, migrations 58 up to date. Ambos os
   destinatarios estao fora de 24h por ultimo inbound em 2026-09-10, sem
   opt-out ativo encontrado, dedupe reduz `6787` a um alvo final apesar de
   historico duplicado de provider. Preview: 2 mensagens META_CLOUD; custo BRL
   pausado para reconciliacao de unidade. REAL SEND = NO; parar no owner
   real-send hard gate ate aprovacao explicita deste envio exato apos preview
   final e unidade de billing validada.
   Phase C controlled send, 2026-09-15: OWNER AUTHORIZED / PARTIAL REAL META
   ACCEPTANCE / PRODUCT ISSUE FOUND / STOP. Campanha
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` criada no Demo. Meta Cloud aceitou 1
   template `data_exame` para `****9614`, mas o runner falhou imediatamente com
   `default_operational_department_missing` antes de persistir OutboundMessage,
   ledger e report; `****6787` nao foi enviado. Resultado real: accepted=1,
   delivered webhook recuperado=1, read=0 observado, ledger local billable=0,
   total local evidenciado R$ 0,00. Testes locais de
   billing/idempotencia/lifecycle 10/10 PASS, mas sao evidencia de teste.
   Proibido retry sem owner repair gate.

RECENTLY CLOSED:

- CRA active flow tenant visibility: CLOSED / DEPLOYED / CUSTOMER VALIDATED.
   Real CRA ADMIN Eduardo reproduced the original absence and later confirmed
   after the production fix that the active CRA flow is visible in tenant-side
   `/app/chatbot` and can be opened from `Fluxos cadastrados`. Root cause
   history preserved: the flow always existed correctly in DB/runtime/admin API,
   `/agent-api/app/chatbot/flows` returned it, but
   `/agent-api/app/chatbot/settings` returned 404 because app settings still
   depended on legacy `.data/tenants.json` for a DB-backed `Client`; coupled
   `Promise.all()` hydration then prevented the successful flows response from
   reaching UI state. Runtime commit `363ce3ab` made `/app/chatbot/settings`
   DB-backed and split flows/settings/resources hydration. Flow
   `cmtkhhxtq002p4spns3fp0yux` / `CRA-PR - Atendimento Institucional` was not
   recreated, cloned, regenerated, reactivated or rewritten; production
   definition hash stayed
   `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
   Validation levels: LOCAL OWNER PASS, SERVER-SIDE PRODUCTION PASS, CUSTOMER
   CRA ADMIN PASS. Detailed record:
   `docs/saas/CRA_ACTIVE_FLOW_VISIBILITY_AUDIT_2026-09-15.md`.
- User deactivation active-conversation guard: CLOSED / DEPLOYED / OWNER
   APPROVED / PRODUCTION NON-DESTRUCTIVE VALIDATED. Entrega em producao em
   `c40c44dc205b2324a9197322334141c5e7f079f0`, apos backup PostgreSQL
   persistente
   `/opt/re7online/site-re7online/apps/whatsapp-agent/backups/postgres/20260914-175614.dump`
   (`19734685` bytes, 578 objetos, sha256
   `07de59fb2a7d30e05170a57ac50e713627d6655ffcd351716d9c92e2c8a97592`).
   Predicado canonico: mesmo tenant, `ConversationRuntimeState.assignedUserId`
   do usuario, `closedAt=null`, `status IN (WAITING, IN_PROGRESS)` e `mode`
   ausente ou diferente de `BOT`. `WAITING` sem atribuicao, `CLOSED`, outro
   tenant e BOT nao bloqueiam. A desativacao nao fecha, transfere, remove
   atribuicao, troca fila ou altera lifecycle de conversa silenciosamente;
   retorna `user_has_active_conversations` com mensagem acionavel. Backend guard
   aplicado em `/app/users/:id` e `/admin/users/:id`; UI tenant-side mostra a
   mensagem especifica e mantem estado persistido ativo em rejeicao. Validacao
   local: regressao backend focada 1/1 PASS, contrato frontend 7/7 PASS, builds
   backend/frontend PASS, `git diff --check` PASS, schema unchanged, migration
   none. Suite completa `campaignsFeatureRoutes` ficou 109/110 PASS com timeout
   pre-existente e nao relacionado, mantido em WATCH. Deploy FF-only recarregou
   apenas `re7-whatsapp-agent` e `re7-admin-front`; `re7-whatsapp-web-worker`
   preservado. Smoke producao: health ok/db ok, `/app/users` 200,
   `/app/settings/users` 200, API `/app/users` sem auth 401, guard presente no
   codigo em producao e tenants `demo-converta`, `cra-pr`, `secult-pe` e
   `syer-rodrigues` ACTIVE em consulta somente leitura.
- Users Management 2.0: CLOSED / DEPLOYED / OWNER APPROVED / PRODUCTION
   NON-DESTRUCTIVE VALIDATED. Inactive user disappearing
   root cause: `GET /app/users` filtrava `User.isActive=true` no backend,
   enquanto a UI ja possuia filtro de status e serializer preservava
   `isActive=false`. Ajuste local inclui inativos no modo Todos, filtros
   `Todos/Ativos/Inativos`, linhas expansivas em `/app/users`, contador
   `activeUsers/maxActiveAppUsers` usando o mesmo resolver/enforcement do
   backend e micro-ajustes finais de owner: filtro com regiao visual distinta,
   botao explicito expandir/recolher, hierarquia tonal header/body e botao
   Salvar preenchido. Contrato de draft: expandir inicializa do estado
   persistido; recolher, trocar linha ou alterar filtros descarta alteracoes
   nao salvas; filtros, contador e disponibilidade de assentos derivam somente
   de `users` persistido, nunca de `userDrafts`. Test gate local: frontend
   focado PASS, backend focado PASS, builds PASS, schema unchanged, migration
   none. Entrega em producao aplicada em 2026-09-14 no commit
   `5ad40c10eda77076bc2a069e432663ac2271f0a8`; smoke pos-deploy confirmou
   health, rotas `/app/users` e `/app/settings/users`, backend online e dados
   reais com usuarios inativos por tenant sem mutacao.
- Departments Management UX 2.0: CLOSED / DEPLOYED / OWNER APPROVED /
   PRODUCTION NON-DESTRUCTIVE VALIDATED.
   Aplicacao local em `/app/settings/departments` reaproveita o padrao visual
   aprovado em Users Management 2.0 e Guided Builder: linhas recolhiveis, botao
   circular explicito expandir/recolher, um setor aberto por vez, header com
   resumo persistido e corpo expandido em tom subordinado para edicao. Contrato
   de draft: expandir inicializa a partir de `departments` persistido; recolher,
   trocar linha ou alterar filtros descarta alteracoes nao salvas; resumo/filtro
   nao deriva de draft local. Sem alteracao de rota, fila, horario, RBAC,
   autoassign, capacidade, presenca, Inbox visibility, schema ou migracao.
   Refinamento aprovado tambem fixa a coluna direita dos controles expansivos
   em Users Management 2.0 e Departments Management UX 2.0 com
   `grid-cols-[minmax(0,1fr)_auto]`, impedindo que conteudo quebrado empurre o
   botao circular para uma segunda linha. Entrega em producao aplicada em
   2026-09-14 no commit `5c051f83df6bc99aa998985ba93301e601e502df`; smoke
   pos-deploy confirmou health, `/app/users`, `/app/settings/departments`,
   estrutura right-anchor em producao e tenants demo-converta, cra-pr,
   secult-pe e syer-rodrigues ACTIVE sem mutacao.

ACTIVE P2:

1. Question conditional branching: PRODUCT GAP / OPEN. Runtime atual suporta
   captura sequencial (`capture.next`) e o Guided limita ate 3 perguntas
   consecutivas; nao ha predicados por valor capturado, sim/nao ou fallback por
   resposta livre. Nao e bug do Guided Builder.
2. Reporting context enhancements: ENHANCEMENT / OPEN. Adicionar contexto AUTO
   vs MANUAL, policy, `presenceMode`, carga/capacidade atual e filtros
   ativo/inativo onde fizer sentido, sem reabrir bugs de verdade de relatorio ja
   fechados.
3. Guided Builder final review summary: UX BACKLOG / OPEN. A etapa "Revisar
   antes de aplicar" hoje mostra resumo parcial orientado ao caminho humano mais
   relevante quando existe handoff. O backlog e evoluir para resumo completo por
   opcao/submenu/caminho, sem alterar runtime ou `ChatbotFlow.definition` ate
   haver contrato de UX aprovado.
4. Meta Cloud unlink/removal cleanup semantics: PRODUCT/OPS GAP / OPEN.
   Consolidar semantica de disconnect/unlink, limpeza de token, associacoes
   phone/WABA, estado de coexistencia, remocao de canal por tenant e fallback
   seguro.
5. Meta pricing source of truth / FinOps hardening: P2 / GENERIC PRODUCT
   BACKLOG. Futuro escopo: rate cards Meta versionados, resolver por
   pais/categoria, datas de vigencia, ingestao de fonte oficial, snapshots
   historicos de custo provedor, politica FX, separacao custo Meta vs preco
   cliente e deteccao de staleness. Nao e frente bloqueadora ampla da aderencia
   CRA agora. Para a campanha Demo controlada, a prova estreita ja obtida e:
   Brazil Utility, BRL, efetivo em 2026-07-01, tier 0-250.000, rate oficial
   R$ 0,0350 por mensagem entregue via endpoint oficial WhatsApp Business
   Platform Pricing. Recipient B Demo foi enviado e entregue em 2026-09-16;
   FinOps generico continua P2. Doc canonico:
   `docs/saas/META_PRICING_SOURCE_OF_TRUTH.md`.
6. Internal support access hardening: P2 / WATCH-HARDENING. Mecanismo existe;
   manter evolucao em auditoria, expiracao, evidencias e menor privilegio.
7. Chatbot Flow `isActive` vs `entryPoint` semantics: WORKING AS DESIGNED /
   P2 DOMAIN HARDENING. Auditoria de 2026-09-15 atualizada: `entryPoint` e o
   seletor padrao de novas conversas (`clientId + isActive=true +
   entryPoint=true`), enquanto `isActive` e o gate de execucao por id explicito
   e continuidade de runtime. Active non-entrypoint nao e redundante: Support
   Hub e destino automatizado de retorno de campanha executam por flow id
   explicito, exigem `isActive=true` e nao exigem `entryPoint=true`. Modelo
   atualizado: MULTI-ACTIVE RUNTIME COM UM ENTRYPOINT PADRAO. Gaps P2:
   clarificar UX normal de Active vs Principal; invariantes
   `entryPoint=>isActive`, um entrypoint por tenant e corrida de troca de
   principal sao application-only ou ausentes no DB. Registro:
   `docs/saas/CHATBOT_FLOW_ACTIVE_ENTRYPOINT_SEMANTICS_AUDIT_2026-09-15.md`.
8. CAMPAIGN RETURN FLOW DEACTIVATED AFTER SEND: P2 LIFECYCLE DECISION / OPEN.
   Auditoria local: runtime explicito tenta carregar `{ id, clientId,
   isActive=true }`; se o flow selecionado da campanha for desativado apos o
   envio e antes da resposta, o loader atual nao continua esse flow e cai no
   seletor de entryPoint. Nenhum fallback novo foi implementado neste patch.
9. Abandoned automation / BOT flow lifecycle: P2 RESIDUAL HARDENING. O
   comportamento existente ja foi validado: `resetAfterMinutes` reinicia
   menu/submenu/captura no proximo inbound sem HUMAN/CLOSED, e
   `timeoutMinutes/action=HANDOFF` promove uma vez para HUMAN/WAITING com
   department/queue concretos, protocolo e posicao na fila quando o destino e
   valido. Residuais: limpeza/copy de `flowContext`, UX de timeout e paridade
   cross-provider do hardening, sem auto-close HUMAN.
9. Guided Builder - BOT inactivity policy UX: P2 / UX + PRODUCT CLARIFICATION /
   OPEN. Futuro Guided deve explicar em linguagem de negocio duas politicas
   independentes: por quanto tempo a pessoa pode voltar e continuar de onde
   parou (`resetAfterMinutes`) e se abandono de automacao deve gerar handoff
   humano automatico (`inactivityPolicy.timeoutMinutes` + `action=HANDOFF`).
   Antes de implementar, auditar valores/defaults reais em producao e exigir
   que owner veja valores atuais, entenda consequencias, escolha duracao
   conscientemente e veja resumo no review. Nao criar nem reabrir
   `WAITING_FOR_CUSTOMER 60m`; HUMAN auto-close permanece NOT REQUIRED.

P3:

- polish de nome social/display name;
- acao rapida de retificacao;
- melhorias menores de UX/filtros que nao bloqueiam contrato.

WATCH only:

- Inbox performance residual e CPU;
- `last_message_lookup` residual;
- SECULT fairness e round-robin cursor;
- SECULT Web Session non-content suppression organic validation;
- scale/load validation em janelas representativas;
- Syer Dashboard transient error / refresh loop: BUG NOT PROVEN / WATCH. Owner
  observou `/app/dashboard` lento, toast vermelho breve e recuperacao posterior
  em tenant com pouco dado; auditoria anterior nao provou endpoint falho, refresh
  loop, relacao com `/app/conversations` ou regressao de CPU. So promover a frente
  com reproducao ou evidencia nova.
- billing/ledger Meta como conciliacao futura.

Proximas cinco frentes:

1. P2 Guided Builder - BOT inactivity policy UX. Why now: o runtime ja suporta
   `resetAfterMinutes` e handoff automatico por `inactivityPolicy`, mas a
   configuracao guiada precisa expor isso em linguagem operacional clara e
   separar reset de retorno vs handoff por abandono. Dependencia: auditar
   valores/defaults reais antes de propor UI. Code esperado: sim, futuro.
   Risco: medio por semantica de lifecycle. Done: owner ve valores atuais,
   escolhe duracao conscientemente e review resume o comportamento.
2. P2 Abandoned automation / BOT flow lifecycle hardening. Why now: cidadao pode iniciar
   menu/pergunta/captura e abandonar antes de concluir. Valor: endurece reset,
   expiracao e UX de automacao incompleta sem afetar HUMAN. Dependencia:
   validar comportamento atual de `resetAfterMinutes` e
   `timeoutMinutes/action=HANDOFF` em E2E local. Demo validavel: sim. Code
   esperado: talvez, reaproveitando executor/processador existente. Config
   esperado: flow-level primeiro. Risco: medio por lifecycle. Done: abandono de
   menu/captura/submenu, inbound tardio, restart e tenant isolation testados.
3. CRA hours configuration and operational validation. Why now: cliente real
   ainda sem horarios salvos nos departamentos. Valor: ativa o comportamento
   fora de expediente ja existente sem bloquear autoatendimento. Dependencia:
   cliente configurar horarios. Demo validavel: sim. Code esperado: nao.
   Config esperado: sim. Risco: baixo. Done: horario CRA salvo e fluxo validado
   dentro/fora do expediente.
3. P2 Question conditional branching. Why now: lacuna descoberta durante 2.4 e
   valor direto para fluxos institucionais. Valor: respostas sim/nao e caminhos
   por resposta. Dependencia: desenho de runtime/predicados. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio/alto. Done:
   predicates testados sem quebrar fluxos existentes.
4. P2 Reporting context enhancements. Why now: transforma validacoes de fila em
   evidencia operacional sem mexer no core de atribuicao. Valor: auditoria para
   supervisao/contratos. Dependencia: definir campos e filtros. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio. Done:
   relatorios mostram contexto sem distorcer historico.

---

## RISCOS E PENDÊNCIAS ATUAIS — 2026-05-03

### Atualizacao operacional consolidada — 2026-09-01

Estado fechado/validado:

- hybrid exactly-once: CLOSED / REAL VALIDATED;
- Meta template routing in configured modes: CLOSED / REAL VALIDATED;
- HYBRID template outbound: CLOSED / REAL VALIDATED;
- Meta-to-Web echo safety: CLOSED / REAL VALIDATED;
- HYBRID inbound dedupe after Meta template reply: CLOSED / REAL VALIDATED;
- HYBRID claim-before-downstream recovery: HARDENED / REAL VALIDATED;
- HYBRID full fresh-flow E2E: CLOSED / REAL VALIDATED;
- exactly-once coexistence path exercised: CLOSED / REAL VALIDATED;
- post-reply freeform routing in HYBRID/AUTO: CLOSED / REAL VALIDATED;
- multichannel Lead identity reconciliation / P2002: CLOSED / REAL VALIDATED;
- Meta usage accounting for template vs Web Session freeform: CLOSED / REAL VALIDATED;
- flow/runtime coherence: CLOSED / REAL VALIDATED;
- closed HUMAN reentry: CLOSED / REAL VALIDATED;
- SECULT CompletedServiceSnapshot: CLOSED / REAL ORGANIC VALIDATED;
- SECULT current-state report truth: CLOSED / REAL VALIDATED;
- Maria capacity diagnosis: CLOSED / CORRECT PRODUCT BEHAVIOR;
- SECULT completed-service reporting: CLOSED / PRODUCTION VALIDATED;
- Inbox Timeline Phase 1: CLOSED / PRODUCTION VALIDATED;
- Inbox Phase 2 WebSocket-driven invalidation: CLOSED / PRODUCTION VALIDATED;
- multichannel reconciliation migration: CLOSED / PRODUCTION VALIDATED;
- Web Session wrapped media normalization: CLOSED / SAFE NORMALIZATION PATCH;
- SECULT Web Session non-content control event suppression: DEPLOYED / TESTED in
  `c308198a`; organic validation pending;
- SECULT auto-assignment incident 2026-08-31: AUDITED / BUG NOT CONFIRMED; UX clarification deployed in `c91671e9`;
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED on 2026-09-10; after
  activation on 2026-09-09 11:38:31 -03, 30 organic auto-assignments selected
  11 distinct agents, Maria Helena received one automatic assignment after
  becoming available below capacity, `no_eligible=0`, and stale heartbeat alone
  produced zero exclusions. Fairness and round-robin cursor remain WATCH, not
  proven algorithm defects.
- SECULT Inbox/CPU correlation: CLOSED FOR PHASE 2 DECISION / CPU IMPROVED /
  WATCH;
- Backend CPU residual load watch after hybrid claim recovery deploy: IMPROVED /
  WATCH.
  Samples on 2026-09-10 held near 67-69% and later near 60-61% CPU with health
  PASS, memory stable around 230-278 MB, DB pressure NORMAL, SECULT real traffic
  active, `runtime_state_fallback=0`, `multichannel.dual_read=0`, and no
  retry/reconnect/error loop evidence. Current residual hotspot remains
  `/app/conversations` list reads: 21 req/min produced 246
  `inbox.list.query_count`/min, approximately 11.7 queries/request.
- `/app/conversations` fixed-cost lookup optimization: REAL VALIDATED. The
  route is already mostly batched and did not show
  current runtime-state N+1 in production (`runtime_state_fallback=0`). A small
  backend patch now reuses the `Client.features/profile` already loaded by
  request auth, removing one duplicate `client.findUnique(features/profile)` DB
  read per app Inbox list request. Comparable 2026-09-10 measurement after
  `1aae26b5` showed ~10.7 queries/request under real SECULT Inbox polling, with
  `tenant_features` effectively zero-cost in the app list path. No global cache,
  current-state cache or response cache was introduced.
- `/app/conversations` channel state batch hotspot: REAL VALIDATED / IMPROVED.
  Production audit on 2026-09-10 showed no external
  provider call and no per-row query fan-out in `channel_state_batch`, but
  SECULT's 251 Web Session identities caused the switch-warning lookup to
  materialize about 10.3k historical outbound rows per refresh. The selected
  patch keeps the same tenant-scoped provider truth and query count, but fetches
  only the latest outbound row per identity with bounded SQL result sets.
  Comparable post-deploy measurement showed SECULT `channel_state_batch`
  interval avg ~189ms and cumulative p95 ~692ms, down from the previous
  ~445-615ms avg / ~782-1411ms p95 observed baselines. No global cache, stale
  channel-state cache, schema change or migration was added.
- `/app/conversations` bounded outbound preview lookup experiment: REVERTED /
  REAL PERFORMANCE REGRESSION. The `94882d76` patch was semantically correct, but production
  evidence on 2026-09-10 showed a PostgreSQL plan regression for SECULT:
  `JOIN LATERAL` executed a per-identity plan with sequential scans and estimated
  cost around 150k versus around 1.6k for the previous broad outbound lookup.
  Comparable 5-minute window showed `last_message_lookup` around 5.9s average
  and `/app/conversations` around 5.8s average, while the pre-change comparable
  baseline was about 275ms for `last_message_lookup`. Runtime was rolled back by
  `4bc8befd`; keep the semantic oracle and plan evidence for a future design.
- Browser Push / PWA notifications: CLOSED / REAL VALIDATED;
- true foreground Web Push detection: CLOSED / REAL VALIDATED in `670f392d`;
- hidden desktop local sound: CLOSED / REAL VALIDATED in `c50fb73c`;
- supervisor team presence panel: DEPLOYED / VISUAL SMOKE PENDING;
- deploy impact matrix hardening: CLOSED / SCRIPT + DEPLOY INTEGRATION + RUNBOOK;
- closed-conversation access hardening: CLOSED / PRODUCTION VALIDATED in
  `93cd0e06`;
- CLOSED claim invariant: CLOSED / PRODUCTION VALIDATED;
- Inbox close action observability: IMPLEMENTED / VALIDATED FOR ROOT-CAUSE
  FORENSICS;
- Inbox close terminal lifecycle: FIXED / DEPLOYED in `f62f1288`;
- Web Session operational disconnect alert delivery: FIXED / DEPLOYED in
  `b31fd976`; SMTP port `2465` now uses TLS, retryable transport failures have
  bounded retry, and delivered alerts still dedupe by incident fingerprint;
- Canonical mail transport cleanup: CLOSED / IMPLEMENTED. Password reset,
  first-access invitations, Web Session disconnect alerts, template-review
  alerts and PostgreSQL backup alerts now share one canonical mail provider and
  config resolver. Business callers still own recipients, content, dedupe and
  retry policy.
- CRA Demo V1: READY FOR CUSTOMER VALIDATION.
- CRA-PR real HYBRID operational validation: CLOSED / PASS;
- CRA-PR approved flow -> consent -> menu -> handoff: CLOSED / PASS;
- CRA-PR human Inbox + human outbound/inbound + normal close: CLOSED / PASS;
- CRA-PR `CompletedServiceSnapshot`: CLOSED / exactly 1 snapshot in validation;
- CRA-PR CSAT score/responded and optional comment in same response: CLOSED / PASS;
- CRA-PR Browser Push background: CLOSED / REAL VALIDATED;
- CRA-PR ready for training 2026-09-09: YES.
- Guided Builder 2.1 business-first: DEPLOYED / LOCAL + PRODUCTION READ-ONLY
  VALIDATED;
- Guided Builder second-flow stale JSON incident: CLOSED / REAL VALIDATED;
- Guided Builder new-flow entrypoint safety: FIXED. Creating a new chatbot
  flow must not replace the tenant entrypoint unless the operator explicitly
  marks it as the main entry flow.

Fila ativa historica substituida pela "Auditoria canonica de backlog —
2026-09-13" acima. Nao usar listas antigas como fila corrente quando houver
conflito.

WATCH only:

- Inbox performance residual: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao
  REAL VALIDATED; `94882d76` foi REVERTED por regressao real de plano e
  `4bc8befd` esta DEPLOYED. Proxima acao e apenas medicao em futura janela
  SECULT representativa, nao novo patch.
- CPU residual: WATCH. Nao ha evidencia atual de dual-read, runtime fallback,
  reconnect loop, retry hibrido ou pressao de DB.
- `last_message_lookup`: KNOWN RESIDUAL HOTSPOT / NO ACTIVE PATCH. Nao retornar
  ao desenho lateral per-identity sem indice/plano comprovado.
- SECULT fairness/round-robin cursor: WATCH. `presenceMode=AVAILABLE` ja tem
  comportamento funcional validado.
- SECULT Web Session non-content suppression: DEPLOYED / TESTED / WATCH.
  Validacao organica permanece observacao passiva; nao reabrir frente ativa sem
  nova evidencia representativa de bolhas `Mensagem nao suportada`.

Dividas tecnicas abertas:

- `multichannel.shadow_write.failed` / `missing_channel_account_id`: preexistente, non-strict, sem retry loop, associado a projection/data-quality gap de Web Session, non-blocking;
- drift historico global Prisma schema/migrations: separado da migration de reconciliacao multichannel ja validada;
- SECULT Web Session `UNKNOWN` media historical rows: no backfill; exact original subtype is
  not recoverable from the sanitized persisted payload;
- SECULT closed-conversation RBAC incident 2026-09-09: fixed generically. AGENT
  users no longer list or directly access `CLOSED` conversations; SUPERVISOR and
  ADMIN historical access is preserved. Claim/assume against `CLOSED`
  conversations is rejected with `conversation_closed` before assignment capacity
  checks.
- SECULT Inbox close terminal telemetry incident 2026-09-09: fixed generically.
  `close.requested` is followed by an awaited terminal client event,
  `close.succeeded` or `close.failed`, before post-close UI reconciliation can
  clear selection or remove the row. Backend close semantics, CSAT, protocol
  closure and snapshots remain unchanged.
- Demo Web Session recovery: CLOSED / REAL VALIDATED after controlled reconnect.
  Inbound, outbound, close, CSAT and post-send stability passed without
  401/conflict recurrence.
- CRA/SECULT business hours audit, 2026-09-14: CLOSED / DOCS-ONLY. Canonical
  HEAD and production HEAD match `56c4a392d1eb017ad8fcafffbad5fbd442e7152f`.
  The core runtime already resolves `DepartmentBusinessHour` /
  `DepartmentBusinessHourException` by department with tenant timezone fallback.
  SECULT keeps the approved contract: departments have Mon-Fri 08:00-17:00
  `America/Recife` hours, resolve `OPEN` at 12:00 BRT and `CLOSED` at 20:00
  BRT, and `QUEUE_FOR_NEXT_OPEN` queues closed handoff without autoassign. CRA
  has no department hours configured, so every audited department resolves
  `NO_SCHEDULE` both inside and outside the copied 09:00-17:00 text. This is a
  configuration/operational validation item, not a runtime P1. Detailed record:
  `docs/saas/CRA_SECULT_BUSINESS_HOURS_AUDIT_2026-09-14.md`.
- CRA business hours operational configuration, 2026-09-15: CLOSED /
  PRODUCTION CONFIG VALIDATED. Backup
  `/opt/re7online/backups/converta-persistent/postgres/pre-cra-business-hours-20260915-001956.dump`
  captured before mutation (`19737083` bytes, SHA-256
  `1a0fa2daff91f5c290b7308782d10e274142be7a9a4833bea5b5a9315a6568ae`,
  578 objects). `cra-pr` timezone set to `America/Sao_Paulo`; all 6 active
  departments configured Mon-Fri 09:00-17:00 with weekends closed and zero
  exceptions; each preserves one concrete `Fila Geral` queue.
  `closedHandoffPolicy.action=QUEUE_FOR_NEXT_OPEN` preserved. Resolver
  validation passed for all departments at Monday 10:00/16:59 `OPEN`,
  Monday 17:00/17:01/20:00 `CLOSED`, and Saturday 10:00 `CLOSED`.
  Flow-aware validation passed on Cobrança and Fiscalização. SECULT timezone,
  08:00-17:00 schedules, policy and resolver status were read-only verified
  unchanged. No code, schema, migration, PM2 reload or deploy.
- baselines CRA versionados nesta consolidacao como evidencia de validacao, nao como dump operacional:
  - `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md`;
  - `docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`.
- CRA department hours: CLOSED / PRODUCTION CONFIG VALIDATED. Under the current
  domain rule, any future department without schedule would still resolve
  `NO_SCHEDULE` / open, but the six active CRA departments now have
  `America/Sao_Paulo` Mon-Fri 09:00-17:00 configured and validated;
- billing measurement items ainda abertos: ciclo receptivo logico, template Utility fora de 24h entregue, ledger Meta apos 2026-10-01 e relatorio contratual mensal.
- alteracoes externas de `.env`/segredos continuam como procedimento
  operacional separado; a matriz de deploy cobre impacto derivado de diff Git.

### Guided Builder — reconciliacao do patch local

Em 2026-09-10 o patch local antigo/quarentenado de Guided Builder foi portado
limpamente para worktree isolado baseado no HEAD canonico `fec3a489`, sem tocar
o worktree principal e sem misturar com o hardening de producao:

- `src/components/app/ChatbotFlowBuilder.tsx`;
- `src/components/app/ChatbotFlowBuilder.test.ts`;
- `src/app/app/chatbot/page.tsx`;
- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`.

Estado reconciliado:

- STRATEGY: clean isolated worktree from current canonical HEAD + explicit port
  of only Guided Builder files.
- SOURCE OF TRUTH: same `ChatbotFlow.definition`; Guided and Advanced modes
  mutate/read the same draft JSON through `onDefinitionTextChange`.
- SHADOW MODEL: no wizard/planning schema persisted in the flow definition.
- SUPPORTED OBJECTIVES: direct human handoff, menu, consent, capture, text and
  custom/advanced.
- NEXT TASK: detects missing start, missing menu option, missing option
  destination, missing handoff destination, invalid queue/department pairing,
  consent destination, capture field/next, broken references and orphan nodes.
- TRANSFORMATIONS: deterministic node creation for menu/text/capture/consent/
  handoff; existing orphan content is preserved for review instead of silently
  deleted.
- EXISTING FLOWS: Syer-style direct handoff and CRA-style complex consent/menu
  flows load without objective reset and preserve advanced metadata.
- VALIDATION: `ChatbotFlowBuilder.test.ts` 22/22 PASS; frontend build PASS;
  `git diff --check` PASS.

Smoke local de 2026-09-10:

- temporary non-versioned harness rendered the real `ChatbotFlowBuilder`
  component in desktop, tablet and mobile;
- new flow entry experience, supported objective cards, next-task panel,
  journey preview and checklist rendered coherently;
- Syer-style direct handoff fixture loaded without reset/destructive rewrite;
- CRA-style consent/menu/handoff fixture loaded without corruption and kept
  Advanced mode as the escape hatch for complex structures;
- responsive layout did not show horizontal overflow or clipped controls in the
  captured viewports;
- authenticated route smoke was completed in an isolated local worktree with an
  ephemeral Postgres database, 58 migrations applied, supported `demo:seed`, a
  real `/auth/login` app session and the local admin token;
- `/app/chatbot` loaded inside the real App shell with tenant context, existing
  flow list, create-flow entry and no alert/loading gate;
- `/admin/tenants/demo-prefeitura/chatbot` loaded inside the real Admin shell
  with tenant context, save controls and no login gate;
- existing flow expand/edit exercised Guided and Advanced modes against the same
  draft JSON;
- Advanced -> Guided reflected a JSON text edit immediately in the guided
  summary, fields and preview;
- Guided -> Advanced reflected a guided destination change in the advanced JSON;
- explicit save persisted to the local ephemeral database and survived route
  reload;
- desktop, tablet, mobile, dark/light theme and keyboard focus smoke passed
  without horizontal overflow.

Status: REAL VALIDATED in local authenticated route smoke and deployed by the
frontend-only production rollout ending at `9b5bdb34`. No production tenant flow
mutation was performed by this validation.

### Guided Builder 2.1 — business-first flow creator

Em 2026-09-11 o redesign local do Guided Builder foi reorientado para o modelo
aprovado pelo owner: em vez de mostrar um painel tecnico com passos detectados,
o editor novo comeca perguntando qual fluxo de negocio sera criado, faz poucas
perguntas por vez, gera uma definicao real de `ChatbotFlow.definition`, mostra
preview/checklist e aplica o resultado ao rascunho somente por acao explicita.

Estado atual:

- STATUS: GUIDED BUILDER 2.1 / LOCAL IMPLEMENTED / HUMAN VALIDATION ROUND 2.
- WORKTREE: isolado em `/tmp/re7-guided-wizard`, baseado no HEAD canonico
  `06256cc2`.
- SCOPE: frontend/editor somente.
- SOURCE OF TRUTH: preservado em `ChatbotFlow.definition`.
- SEMANTICA: sem alteracao de runtime, parsing, transitions, handoff, save
  payload, schema ou migration.
- UX: novo fluxo abre em modelos de negocio: atendimento institucional com
  menu, encaminhamento direto, coleta antes do atendimento, mensagem
  informativa ou modo avancado.
- WIZARD: cada modelo usa perguntas curtas sobre mensagem inicial,
  consentimento, opcoes, destinos, validacao de entrada, horario futuro,
  mensagem de handoff e preview.
- SUBMENUS: o modelo institucional agora representa um subconjunto CRA-like com
  menus aninhados gerados como nodes reais `type=menu`, sem node type novo.
- NAVIGATION: submenus podem expor `9 - Voltar ao Menu Anterior` e
  `0 - Voltar ao Menu Principal`, seguindo a convencao ja observada nos fluxos
  CRA. O menu principal nao recebe retorno redundante.
- HOURS: o wizard explica que o autoatendimento pode continuar funcionando e
  que horario humano pertence ao cadastro de departamentos; sem horario salvo,
  a regra de dominio atual permanece `NO_SCHEDULE`/aberto.
- APPLY DRAFT: "Aplicar ao rascunho" atualiza apenas o JSON local e mostra
  feedback explicito de sucesso, erro ou "nenhuma alteracao"; salvar continua
  sendo acao separada da pagina.
- EXISTING FLOW EDIT: fluxos existentes exibem landing separada com Revisar
  jornada, Editar etapas simples e Abrir modo avancado. A edicao simples mostra
  hierarquia de menus/submenus, permitindo abrir opcoes como Registro sem
  expor a arvore inteira ou misturar com criacao.
- MODE STATE: Assistente guiado e Modo avancado agora comunicam estado exclusivo
  e finalidade; "Abrir modo avancado" deixou de parecer selecionado dentro da
  landing de fluxo existente.
- RESET: apos criacao bem-sucedida de novo fluxo em `/app` ou `/admin`, o
  rascunho transiente volta ao estado inicial.
- OUTPUT: os geradores criam nodes reais (`menu`, `text`, `capture`,
  `consent`, `handoff`) sem persistir metadata de wizard ou shadow model.
- EXISTING FLOWS: abrir fluxo existente mostra resumo seguro e acoes explicitas
  de revisar jornada, editar informacoes simples ou abrir modo avancado; nao
  executa reset, reclassificacao destrutiva ou mutation automatica.
- MARKET PATTERN: alinhado ao padrao observado em builders atuais de mercado:
  selecao de template/use case, perguntas progressivas, preview antes de
  publicar, fallback para editor visual/avancado e protecao contra alterar
  automacoes existentes sem confirmacao.
- VALIDACAO TECNICA LOCAL: `ChatbotFlowBuilder.test.ts` 32/32 PASS; frontend
  build PASS; `git diff --check` PASS.
- STATUS: DEPLOYED / PRODUCTION READ-ONLY VALIDATED. Criacoes reais de teste
  no tenant Syer foram usadas apenas para validar a sequencia de criacao; o
  fluxo ativo real foi preservado.

### Guided Builder 2.1 — segundo fluxo com JSON invalido

Em 2026-09-11 foi auditado o incidente P1 em que a criacao de um segundo fluxo
guiado para o tenant real Syer Rodrigues terminava com a mensagem
`JSON invalido` antes de chegar ao backend.

Conclusao:

- ROOT CAUSE: estado transiente do builder de novo fluxo permanecia montado apos
  uma criacao bem-sucedida; o parent limpava o texto do novo fluxo, mas a
  sessao interna do wizard podia carregar dados mutaveis da criacao anterior.
- ESCOPO: bug de estado client-side no editor guiado; nao houve evidencia de
  problema de backend, schema, migration ou configuracao especifica da Syer.
- SYER REAL: auditado em read-only. O fluxo real existente permaneceu
  inalterado.
- FIX: o wizard passou a criar defaults frescos por sessao e o builder de novo
  fluxo em `/app` e `/admin` e remontado apos criacao bem-sucedida.
- VALIDACAO LOCAL: fixture Syer-like comprovou primeira, segunda e terceira
  criacoes sequenciais com JSON serializavel/parseavel e destinos validos.

Validacao real: em 2026-09-11, na producao `96220ea4`, a UI admin do tenant
`syer-rodrigues` criou dois fluxos guiados de teste inativos em sequencia, sem
`JSON invalido` e sem estado stale. A abertura de um terceiro novo fluxo
iniciou limpa, sem salvar. O fluxo ativo real manteve o mesmo hash de
definition.

Status: REAL VALIDATED / CLOSED.

### Guided Builder 2.1 — seguranca de entrada principal em novos fluxos

Em 2026-09-11 foi auditado um incidente P1 durante a validacao real da Syer:
um fluxo novo podia herdar `entryPoint=true` no formulario de criacao e
substituir temporariamente o fluxo principal do tenant.

Conclusao:

- ROOT CAUSE: default client-side inseguro nos formularios de novo fluxo de
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot`. O backend estava
  correto ao tratar `entryPoint=true` como acao explicita de troca.
- ESCOPO: bug generico de UX/seguranca de criacao; sem tenant hardcode, sem
  schema, sem migration e sem alteracao de runtime.
- FIX: novo fluxo passa a iniciar com `entryPoint=false` por default
  compartilhado; apos `create` bem-sucedido, o rascunho tambem reseta para
  `false`.
- CONTRATO: criar fluxo novo nunca troca a entrada principal silenciosamente.
  A troca continua permitida somente por acao explicita do operador/admin.
- VALIDACAO: teste backend cobre create sem `entryPoint`, create com
  `entryPoint=false` e troca explicita posterior por `PUT entryPoint=true`.

Status: FIXED / DEPLOY TARGET. Validacao pos-deploy deve confirmar que o fluxo
principal ativo da Syer permanece preservado.

### Guided Builder 2.2 — baseline recovery apos selecao local divergente

Em 2026-09-11 o resultado local inicial do Guided Builder 2.2 foi invalidado
para validacao de produto. O HEAD de producao estava atual; o problema foi a
selecao local de worktree/bundle/servidor, contaminada por uma linha antiga e
divergente do Guided Builder ja aprovado e publicado. O owner abriu o ambiente
local e viu uma UI anterior, sem os refinamentos aprovados de producao, provando
que aquele ambiente nao era baseline confiavel.

Impacto:

- PRODUCAO: nao afetada; nao houve commit, push ou deploy do resultado
  invalido.
- RESULTADO 2.2 ANTERIOR: INVALID FOR HUMAN PRODUCT VALIDATION.
- CAUSA OPERACIONAL: desenvolvimento/servidor local misturou worktrees e portas;
  `3010`/backend antigo apontavam para `/tmp/re7-guided-wizard`, enquanto uma
  tentativa posterior servia outro bundle em porta diferente.
- REGRA DE PROCESSO: qualquer trabalho de UX deve reproduzir localmente o
  baseline de producao aprovado antes de aplicar novos deltas.

Reconstrucao correta:

- BASE: worktree limpa `/tmp/re7-guided-22-current` criada a partir do HEAD
  canonico de producao `bf5f1d76`.
- BASELINE LOCAL: backend local isolado e frontend em `3022`, `demo:seed` e
  login real `admin@demo-prefeitura.local`; `/app/chatbot` respondeu no bundle
  da base aprovada. Para evitar CORS em desenvolvimento, o frontend deve usar
  `/agent-api` relativo via rewrite local.
- PORT 2.2: aplicado cirurgicamente sobre a base atual, sem copiar arquivos
  inteiros da linha divergente.
- DELTAS PORTADOS: cancelar/excluir opcao do wizard, excluir submenu simples ja
  criado, cancelar submenu em criacao, confirmacao destrutiva antes de remover
  caminhos com filhos, protecao de estruturas compartilhadas/avancadas pelo
  modo avancado, limpeza de submenu aninhado ao trocar destino, botao inferior
  "Voltar ao nivel anterior", tons por nivel de menu, texto unificado
  "Encaminhar para atendimento humano", fluxo Setor -> Fila condicional,
  explicacoes para "Mostrar outra mensagem" e "Fazer uma pergunta", e suporte a
  texto livre/emoji digitado pelo usuario no wizard, preview e JSON gerado.
- VALIDACAO TECNICA: `ChatbotFlowBuilder.test.ts` 37/37 PASS; frontend build
  PASS; `git diff --check` PASS.
- STATUS: GUIDED BUILDER 2.2 / DEPLOYED / PRODUCT OWNER REAL VALIDATION. A
  entrega frontend-only foi publicada em producao no commit `db34d83c`, sem
  alteracao de backend, worker, schema ou migration. O proximo marco e o owner
  concluir os testes reais em producao.

### Guided Builder 2.3 — refinamento de criacao e edicao por opcoes

Em 2026-09-11 o owner aprovou a base 2.2 e registrou feedback de uso real para
reduzir atrito do criador guiado antes de nova publicacao.

Escopo 2.3 aprovado:

- remover as decisoes "Ativo" e "Entrada principal" do cadastro de novo fluxo;
  novos fluxos continuam com `entryPoint=false` e ativacao como acao operacional
  separada;
- no modelo "Atendimento institucional com menu", iniciar pelo consentimento e
  depois seguir para mensagem/opcoes do menu principal;
- substituir copy especifica por texto neutro: "Quais opcoes estarao
  disponiveis no menu?";
- editar opcoes e destinos ja na primeira tela do menu principal, em linhas
  expansivas, uma opcao aberta por vez, com submenu, exclusao e pendencias
  dentro do proprio bloco;
- aplicar o mesmo padrao recursivo para submenus e preservar tons/bordas por
  nivel hierarquico;
- padronizar resultados de acao em toast global visivel independentemente do
  scroll, mantendo validacao de campo inline;
- restaurar foco/scroll para a secao ativa apos voltar nivel, cancelar submenu,
  remover opcao ou aplicar rascunho.

Status:

- GUIDED BUILDER 2.3 / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION REAL VALIDATION.
- Sem schema, migration, backend, worker ou semantica runtime.
- Owner aprovou a UX final local; validacao real em producao permanece aberta
  ate exercicio humano em tenant real apos deploy.

Nota de recuperacao 2026-09-12:

- A worktree temporaria usada durante a validacao local foi perdida apos reboot
  da maquina; isso confirmou que `/tmp` nao e suficiente como preservacao de
  trabalho do owner.
- A primeira reaplicacao pos-reboot recuperou uma versao antiga e foi descartada
  como referencia funcional.
- Producao nao foi mutada, nao houve commit, push ou deploy da 2.3 durante a
  recuperacao.
- A versao local atual foi reconstruida a partir dos patches da sessao Codex e
  confrontada contra o HEAD canonico de producao/origin antes da continuidade.
- A aprovacao local final do owner foi aplicada sobre worktree limpa baseada no
  HEAD canonico atual antes de commit/push/deploy; qualquer revisao futura deve
  manter backup de diff fora de `/tmp`.
- Ajuste final do owner: ao excluir opcao, submenu/linha aninhada ou registro
  editavel, a UI nao deve abrir automaticamente o proximo irmao. O item e
  removido, irmaos permanecem colapsados, e o foco volta ao contexto pai ou a
  secao atual.
- Entrega final 2.3 e frontend-only: sem mudanca de `ChatbotFlow.definition`,
  sem tenant hardcode, sem migration e sem reload de backend/worker.

### Contact Timeline / Histórico do contato

Status:

- implementado como view derivada, sem tabela nova
- endpoint `/app/conversation/:waId/timeline` em produção
- acesso pelo inbox na coluna CRM

Riscos conhecidos:

- cursor atual usa apenas `createdAt`; em volume alto com muitos registros no mesmo milissegundo, pode haver borda rara de paginação. Evoluir para cursor composto `createdAt + id`.
- timeline agrega `InboundMessage`, `OutboundMessage`, `Event` e `LeadNote` em memória por lote. Está limitado, mas deve ser revisado se tenants tiverem alto volume histórico.
- eventos são exibidos sem `payloadJson` bruto por segurança; caso a operação peça detalhes ricos, criar normalizador por tipo de evento, não expor payload integral.
- `Contact` existe, mas o CRM operacional ainda usa `Lead`. Evitar criar nova entidade ou duplicar histórico até consolidar o modelo pessoa/contato.
- `Contact` não possui `waIdCanonical`; se ele virar entidade principal, avaliar migration específica.
- LGPD: timeline respeita `deletedAt`/`historyVisibleAfter`; manter testes sempre que alterar anonimização, retenção ou reentrada.

Pendências recomendadas:

- adicionar cursor composto `createdAt + id` na timeline.
- criar testes de endpoint para: mensagens, eventos, notas, paginação, escopo por setor e corte LGPD.
- avaliar se histórico deve ter busca por termo em fase futura.
- avaliar tela dedicada de contato apenas após uso real validar necessidade.

### Runtime / Operação

Status:

- producao atual em `STORAGE_MODE=postgres`
- leitura operacional estrita a Postgres para runtime state
- JSON permanece apenas como compatibilidade historica/local quando configurado

Riscos conhecidos:

- manter rotina `state:validate` documentada após alterações em handoff, claim, transfer, release, retenção e reentrada.
- qualquer novo write operacional precisa atualizar Postgres e manter compatibilidade com o fallback JSON enquanto a transição não for encerrada.

Pendências recomendadas:

- definir critério para encerrar escrita JSON ou mantê-la como fallback permanente.
- incluir validação de runtime no checklist de deploy quando houver mudança operacional.

---

## SPRINT 26 — ONBOARDING INTERNO ASSISTIDO

Status:

- implementado (backend + UI)
- não validado com novo tenant real

Classificação:

- item latente (não bloqueante)

Diretriz:

- NÃO priorizar validação neste momento
- retomar apenas quando houver novo cliente real

---

## SPRINT 28 — OBSERVABILIDADE META (COMPLETED)

- status real da Meta integrado na UI de campanhas
- delivered / read / failed visíveis
- billing visível por mensagem
- correção de regressão de status (prioridade)
- consistência UI = banco validada

Impacto:

- elimina ambiguidade operacional
- aumenta confiança do operador
- permite operação profissional com cliente real

---

## SPRINT 29 — ÁREA DO CLIENTE (COMPLETED)

- login por usuário implementado
- auto-scope via token (`clientId`)
- rotas `/app/*` criadas
- inbox operacional com claim/release, status e notas
- campanhas completas com criação, cancelamento e replay
- criação de usuário via UI implementada
- reset de senha via API implementado
- onboarding interno consolidado
- fluxo completo sem script validado
- login e acesso do cliente funcional
- isolamento total por tenant
- isolamento por tenant validado
- uso independente sem admin validado

Impacto:

- sistema passou a ser utilizável pelo cliente final
- elimina dependência do `/admin`
- transforma a plataforma em SaaS real
- elimina dependência técnica no onboarding
- permite criação de clientes em minutos
- habilita operação com múltiplos tenants
- sistema passa a ser operacional em escala inicial

---

## PRÓXIMAS ETAPAS (ORDEM ESTRATÉGICA)

---

### 1. Uso real com clientes

- execução de campanhas
- operação assistida
- coleta de feedback real

---

### 2. Ajustes baseados em uso

- melhorias de UX
- redução de fricção operacional
- correções pontuais

---

### 3. Evolução incremental do produto

- filtros avançados
- melhorias de interface
- ajustes de fluxo

---

## FUTURO (NÃO PRIORITÁRIO)

- onboarding self-service para cliente
- fila persistente (Redis/Bull)
- retry automático
- scheduler de campanhas
- segmentação avançada

---

## DIRETRIZ IMPORTANTE

Priorizar:

- uso real
- operação com cliente
- estabilidade

ANTES de:

- novas features
- refatorações grandes
- otimizações prematuras

---

# HISTÓRICO DE SPRINTS (MARCOS)

- Sprint 14 -> shadow write completo
- Sprint 15 -> leitura híbrida
- Sprint 16 -> consistência validada
- Sprint 17 -> Postgres como source of truth
- Sprint 18 -> controle de uso
- Sprint 19 -> campanhas base
- Sprint 20 -> execução assíncrona
- Sprint 21 -> API operacional
- Sprint 22 -> operação assistida
- Sprint 23 -> UI de campanhas
- Sprint 24 -> refinamento de UX
- Sprint 25 -> onboarding real validado (JUSTA)
- Sprint 26 -> onboarding interno assistido
- Sprint 28 -> observabilidade Meta
- Sprint 29 -> área do cliente

## Incidente P1 — handoff humano com setor sem fila concreta

Em 2026-09-12 foi auditado em producao o tenant `syer-rodrigues`, contato
`****9614`: o inbound chegou, o bot respondeu, o handoff foi ativado e o runtime
ficou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`,
`departmentId=Campanha 2026`, `queueId=null`, sem responsavel e sem fechamento.
A conversa nao projetou para a Inbox humana porque o invariant operacional da
Inbox exige destino humano completo: setor + fila.

Conclusao de dominio: `queueId=null` nao e um destino operacional humano valido
para atendimento aguardando atribuicao. O caminho correto e resolver uma fila
concreta antes de criar/projetar atendimento humano; nao afrouxar a visibilidade
da Inbox para aceitar aguardando sem fila.

Auditoria read-only em producao: 10 fluxos ativos; 7 handoffs ativos com
`departmentId` e sem `queueId`, distribuidos em 2 tenants
(`syer-rodrigues`: 6; `lab-websession`: 1). Os setores afetados tinham
exatamente uma fila existente (`Fila Geral`), permitindo resolucao deterministica
sem hardcode de tenant.

Fix local: `departmentAwareHandoff` resolve automaticamente a unica fila
existente do setor quando o fluxo legado/guiado traz apenas `departmentId`; se o
setor nao tem fila ou tem multiplas filas sem escolha explicita, bloqueia o
handoff em vez de criar `WAITING` invisivel. O Guided Builder passa a exigir fila
concreta, auto-selecionando a unica fila do setor e exibindo erro acionavel
quando nao ha fila cadastrada.

Contrato preservado: Inbox, SLA, relatórios, posicao de fila, claim,
transferencia, notificacoes e atribuicao automatica continuam operando sobre
destino humano completo (`departmentId` + `queueId`).

Fechamento operacional em 2026-09-12: apos backup fresco de pre-reparo, o atendimento ja existente
`****9614` foi reparado com uma unica mutacao de campo em
`ConversationRuntimeState.queueId`, de `null` para a fila existente
`cmtoekafy00014s4lg41vs5i0` (`Fila Geral`). Nenhuma mensagem, historico,
protocolo, ciclo, fechamento ou atribuicao foi alterado. A prova pos-reparo
mostrou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`, setor
`Campanha 2026`, fila `Fila Geral`, sem responsavel, conversa aberta,
projecao canonica na Inbox humana exatamente uma vez e posicao de fila `1`.
Incidente fechado.

Guided Builder 2.4 local: consolidar UX sem alterar runtime ou schema. Navegacao
do wizard (selecionar modelo, Continuar, Voltar) preserva a posicao atual de
scroll e usa foco com `preventScroll`; expansao de linha editavel ancora o
cabecalho da propria linha; exclusao/cancelamento/retorno recupera o contexto
pai sem abrir o proximo irmao. Cancelar submenu em criacao remove apenas o
estado transiente, mantem o pai expandido e devolve foco ao cabecalho do pai.
Destino "Fazer uma pergunta" exige pergunta, tipo de resposta e proximo
comportamento definido; permite no maximo 3 perguntas consecutivas antes de
outro destino. Auditoria de runtime classificou branching por resposta
capturada como PRODUCT GAP: o runtime atual tem captura sequencial por
`capture.next`, mas nao possui predicados por valor capturado, igualdade,
sim/nao ou fallback branch para resposta livre.

Registro historico do Guided 2.4: `WAITING` humano precisava de
`departmentId` + `queueId` concreto. Auditoria local de cardinalidade encontrou
24 setores ativos sem fila, 56 com uma fila e 5 com duas ou mais filas. Os 5
casos multi-fila foram classificados como `default` = INTERNAL DEFAULT/Re7 Demo
e `campaigns-feature-*` = AUTOMATED TEST ARTIFACT por metadados reais
(`phoneNumbers=0`, `channelAccounts=0`, fixture em
`campaignsFeatureRoutes.test.ts`); nenhum fluxo ativo ou runtime usa multiplas
filas dentro do mesmo setor. A UX 2.4 resolvia fila unica internamente sem
label/seletor/texto de fila; setor sem fila bloqueia com "Este setor ainda nao
esta preparado para receber atendimentos."; somente setor com 2+ filas exibe
seletor "Fila" como excecao. Esse comportamento foi SUPERSEDED localmente pelo
dominio explicito: a UX mostra apenas Setor e bloqueia se
`operationalQueueId` estiver ausente. Fluxos existentes com `departmentId` e
`queueId=null` exibem aviso e nao sao reescritos automaticamente ao abrir.

Backlog 2.4: GUIDED BUILDER 2.4 = APPROVED FOR FRONTEND-ONLY DELIVERY /
PRODUCTION VALIDATION; HANDOFF QUEUE UX = SIMPLIFIED / CONDITIONAL EXCEPTION;
QUESTION CONDITIONAL BRANCHING = PRODUCT GAP.

Micro-ajuste final de UX 2.4: o owner apontou redundancia no bloco visual
"Escolha o setor que recebera o atendimento." apos selecionar "Encaminhar para
atendimento humano". O bloco/cartao instrucional foi removido; o editor agora
mostra diretamente `Setor`/selector, mantendo fila unica interna, bloqueio de
setor sem fila, seletor excepcional para 2+ filas, preview e JSON gerado sem
alteracao. Status historico local antes da entrega: GUIDED BUILDER 2.4 =
OWNER APPROVED LOCAL.

Entrega aprovada do Guided Builder 2.4: delta validado aplicado sobre o HEAD
canonico e publicado em `ca34e123c72de2e96f0dcff27b4e17f29e5b630b`, sem
migracao, sem hardcode de tenant, sem reload de backend/worker e preservando
`ChatbotFlow.definition`. Status: GUIDED BUILDER 2.4 = CLOSED / DEPLOYED /
OWNER APPROVED LOCAL / PRODUCTION NON-DESTRUCTIVE VALIDATED; HANDOFF QUEUE
CONTRACT = CLOSED / REAL VALIDATED; QUESTION CONDITIONAL BRANCHING = PRODUCT
GAP / OPEN; SYER ****9614 = CLOSED.

---

# BACKLOG LATENTE (RETOMAR QUANDO NECESSÁRIO)

- validação onboarding assistido
- validação real do onboarding (novo cliente)
- relatorios por atendente com historico persistido em Postgres para producao em `STORAGE_MODE=json`
- padronização tenantId vs clientId
- limpeza de `.data/default`
- revisão do tenant `cliente-demo`

---

# BACKLOG LEGADO (BAIXA PRIORIDADE)

- normalização de leadName
- lastMessage nulo
- limpeza de logs antigos
- ajustes de parsing
- melhorias menores de inbox

---

# DECISÕES ARQUITETURAIS

- NÃO implementar recursos não oficiais de WhatsApp
- manter foco 100% na API oficial da Meta
- manter arquitetura simples e evolutiva
- Sprint 42.1: separar superfícies /admin (plataforma) vs /app (cliente), migrando users, departments e reports para /app com requireClientAuth e auditoria por userId real

## Canonical Identity P1 delivery - 2026-09-17

- **IDENTITY P1: DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.** Production
  advanced by fast-forward from `cad9489c` to `ed329ec8` on 2026-09-17. Meta
  inbound/capture and campaign CRM bootstrap reuse the existing canonical
  resolver. The clean delivery passed 119 focused tests; the production backend
  build, targeted agent reload, health/DB checks and read-only route/module
  smokes passed without schema, migration, backfill or tenant hardcode. A real
  post-deploy identity event has not yet been exercised.
- **QUEUE DOMAIN: CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.**
  Nullable `Department.operationalQueueId`, composite same-tenant/same-department
  FK, atomic Department lifecycle and explicit routing are implemented in the
  isolated worktree. Local migration/tests/builds pass. Read-only production
  audit of all 54 departments found 34 auto-safe exactly-one mappings, 8
  inactive null-allowed rows, 7 resolved multi-queue mappings and 5 active
  owner-resolved rows: `demo-converta` Setor Teste and `lab-websession`
  Department Lunch get owner-approved internal queues; `demo-converta` FUNDARPE,
  `re7online` Comercial and `re7online` Governo e Licitações get exact
  owner-selected existing queues. Runtime name/order/usage inference remains
  prohibited. Production cutover on 2026-09-18 applied the nullable schema
  migration and reconciled 54/54 departments by explicit IDs. First production
  reconciliation: 44 explicit updates, 2 internal queues created/linked; second
  run: idempotent. Post-verify active unresolved = 0 and cross-tenant/department
  links = 0. Owner decision package:
  `docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`.
- **CAMPAIGN UX: OWNER PASS / QUEUE-DEPENDENT DELIVERY DEPLOYED.** The
  normal UX selects only Setor and persists the exact internal queue. Production
  delivery is now backed by `Department.operationalQueueId`; no queue selector is
  exposed to the customer-facing admin UX.
- Demo `****6787`: pre/post read-only snapshots of both historical Contacts and
  Leads matched exactly; no production mutation occurred and repair remains a
  separate gate.
