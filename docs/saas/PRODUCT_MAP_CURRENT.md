# Product Map Current

## Inicio efetivo e ensaio operacional local — 2026-09-26

Status: LOCAL ROLLOUT / SUSPENDED ROLLBACK REHEARSED; NOT DEPLOYED / OWNER UI PENDING.
Base `fedef1e1965aa6a1e53222426c6b55424e2d83fa`, branch
`review/campaign-recovery-20260926`; historico e owner PASS anteriores preservados.

- `effectiveStartedAt` passa a ser preenchido somente quando nulo, sob lock do
  grupo; materializacao/recuperacao preservam o valor. `job.startedAt` continua
  informando o claim do lote/tentativa, ja exposto pela API/UI. Nenhum ajuste visual.
- Testes focados: os dois casos reproduziram a sobrescrita e passaram apos a
  correcao (2/2); fila afetada 8/8; build backend PASS. Sem repetir suites amplas,
  build frontend ou smokes anteriores.
- Cluster PostgreSQL local separado, `127.0.0.1:55434/re7_rollout_local`, com
  ambiente limpo e provider em memoria. Base `6d664d0b`: 59 migrations e tres
  campanhas antigas; migrate deploy aplicou apenas a fila, totalizando 60.
  Campanhas antigas preservadas; checksum da migration conferido com Prisma.
- Falha injetada apos migration/antes da ativacao: runtime sem permissao de
  campanhas e admissao fechada; zero jobs criados. Banco migrado foi mantido.
- Codigo novo processou fila; pausa drenou uma chamada com aceite conhecido.
  Morte de outro processo apos submissao, antes da resposta local, deixou uma
  pendencia explicitamente marcada needs_review. Snapshot sem filhos sobreviveu
  a interrupcao e alteracao do CRM.
- Rollback ensaiado **com processamento suspenso**, ingresso HTTP em manutencao
  e papel runtime sem privilegios nas tabelas. Runner real de `6d664d0b` recebeu
  permission denied; zero provider. Jobs, leases, snapshots, resultados e demais
  registros permaneceram iguais no intervalo do rollback. Health nao foi usado
  como prova de rollback funcional; o backend antigo nao e uma alternativa de envio.
- Retorno exclusivo ao novo codigo: dois grupos completos, quatro aceites
  conhecidos, uma submissao incerta ainda retida e zero duplicacoes entre cinco
  submissoes simuladas. Todos os jobs/eventos anteriores e o inicio original dos
  grupos foram preservados. Admissao permaneceu fechada ao final do ensaio.
- Drift: 16 objetos do inventario anterior identicos antes/depois; diff somente
  leitura igual ao ja registrado, sem diferenca nas tabelas de fila. Nao impede
  este rollout aditivo, desde que defaults/indices/constraints sejam preservados.
  Nenhuma correcao incidental de drift, down migration, reset ou limpeza de filas.

Procedimento, condicoes de parada e limites: RUNBOOK_WHATSAPP_AGENT.md, secao
"Ensaio operacional local da fila — procedimento executado". Evidencias preservadas
em `local-evidence/recovery/rollout-local/`, incluindo tres dumps e manifestos.
Pendencias para decisao: validar cercas/permissoes e parada de todas as instancias
no ambiente alvo, reconciliacao de pendencias incertas, owner UI e aceite CRA.
Nao houve deploy, banco/provider de producao ou envio real. DELIVERED/READ →
Conversation/HUMAN/WAITING continua separado; reparo 6683 CLOSED.

## Correcoes da revisao Git 109c9f15 — 2026-09-26

Status: LOCAL REVIEW FIXES VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Base desta correcao: `109c9f1544003750d29930bd7b10ce6a4cf50c03`, branch
`review/campaign-recovery-20260926`. Historico `6d664d0b` e owner PASS do lote
anterior preservados; esta nota nao concede aceite CRA nem prontidao para deploy.

- CSV: grupo, filhos, seeds e resultado idempotente na mesma transacao; falha
  no segundo filho deixa zero registros. Retries concorrentes produzem um unico
  conjunto. Chave vinculada ao tenant/operacao/hash do payload; conflito = 409.
- Estados: locks de grupo preservam pausa/cancelamento/needs_review; falha
  impeditiva bloqueia os proximos lotes, inclusive rejeicao recebida apos pausa.
  Cancelado nao vira completed. Dinamica sem filhos pode pausar/retomar.
- Fila: tenants ocupados excluidos antes do limite; um candidato por tenant,
  ate 20 por consulta (teto 100), rechecado sob lock. Caso com 25 jobs antigos de
  A nao impede B; exclusividade e continuidade contra avulsa/test-send mantidas.
- Dinamica: recuperacao reutiliza o snapshot persistido, mesmo com CRM alterado;
  filhos e enqueue sao atomicos. Recuperacao do intervalo legado filhos/sem jobs
  nao duplica filhos nem snapshot. Apenas controlador sem provider recupera lease.
- UI/API: Enviar conjunto agora exige confirmacao e RBAC, entra na mesma fila,
  e retry nao duplica jobs. Agendamento futuro permanece sem antecipacao.

Validacao final: 13/13 focados novos; suites afetadas de campanhas **198/198**
(fila 8, runner 10, revisao 11, rotas 128, importacao 7, exclusao 5, UI 29),
compostas por 188 casos fora do runner e sua repeticao final 10/10; Webchat 17/17.
Builds backend/frontend PASS. Smoke visual de confirmar/recusar envio agregado,
pausa, retomada e cancelamento PASS; zero outbound/provider. Nao houve repeticao
da bateria visual anterior. Evidencia local: `local-evidence/recovery/review-fixes/`.

A primeira suite teve interrupcao SIGKILL do runner durante diagnostico de I/O
JSON; as demais suites passaram. A repeticao isolada revelou dois testes longos
com relogio congelado emitindo leases vencidas. Fixture corrigida para tempo
atual, sem reduzir audiencia, assertions ou concorrencia; runner final 10/10.
O build expos tipagem incorreta da nova fixture CSV e filtro startsWith sobre
UUID no Webchat, ja presente na base. Corrigidos TemplateContext e intervalo UUID
equivalente; quatro testes de protocolo e limites SQL locais validados. O mock
da auditoria compartilhada foi isolado (antes tentava gravar tenant_a no DB real).
O registro historico de build PASS nao substitui esta nova evidencia compilada.

Schema/SQL migration sem alteracao; DB local `re7_recovery_audit` com 60 migrations
concluidas e zero pendentes. Nenhum migrate adicional, db push/reset ou correcao
de drift historico. Continuam pendentes ensaio operacional de rollout/rollback,
owner UI, aceite CRA e drift residual inventariado no runbook. CI de push apenas
main/develop; bloqueio Vercel da branch de revisao preservado. Sem deploy/DB de
producao/provider real. DELIVERED/READ → Conversation/HUMAN/WAITING continua
separada e sem alteracao funcional; reparo 6683 CLOSED.

## Persistencia para revisao Git — 2026-09-26

Status desta frente: TECHNICAL LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Branch dedicada `review/campaign-recovery-20260926`, com parent/base `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`.
A base de reconstrucao foi `5d925973`; os 80 acrescimos documentais de `6d664d0b`
foram conferidos e seu historico permanece ancestral. O owner PASS do lote anterior
(normalizacao/settings/contraste, head funcional `5ee2de6b`) continua OWNER VALIDATED / CLOSED;
nao se estende automaticamente a esta frente de lotes/fila.

Delta e fontes foram arquivados antes da troca de branch. Reaplicacao sobre `6d664d0b`
restaurou os mesmos 23 arquivos, com hashes conferidos; nao houve conflito funcional,
reset/clean ou alteracao da branch original. Implementacao, testes, schema/migration,
os quatro docs e este runbook compoem o escopo; .data, evidencias, dumps, arquivos
compactados, credenciais e fixtures de ambiente ficam fora do Git.

As 18 anotacoes UUID correspondem a tipos SQL ja existentes, sem ALTER TYPE novo.
O inventario por objeto e impacto do drift residual anterior esta no
`docs/RUNBOOK_WHATSAPP_AGENT.md`, secao "Drift historico residual — revisao da fila".
Nenhum desses defaults, indices ou nomes foi corrigido nesta frente.

Validacao preservada: fila/runner/rotas 144/144, apoio 41/41 e rechecagem dos casos
falhos 4/4; builds e Prisma validados anteriormente. Sem repeticao de testes/builds
porque esta persistencia nao muda comportamento funcional. Staging e whitespace
sao conferidos separadamente. CI versionada: push apenas main/develop; PR apenas
com destino main/develop. `vercel.json` bloqueia auto-deploy somente desta branch
via git.deploymentEnabled=false para seu nome exato; demais branches inalteradas.
Push de revisao nao autoriza merge, deploy, producao DB, provider ou envio real.

Pendencias: ensaio operacional de rollout/rollback, drift residual anterior,
owner UI e aceite CRA. Divergencia DELIVERED/READ → Conversation/HUMAN/WAITING
permanece separada e sem alteracao funcional. Reparo 6683 continua CLOSED.

## Auditoria da recuperacao — 2026-09-26

Status tecnico: PRONTO PARA COMMIT DE REVISAO / NOT DEPLOYED / OWNER VALIDATION PENDING.
Esta nota atualiza o fechamento local abaixo; nao declara prontidao para deploy ou aceite CRA.

- Worktree persistente: `/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`. HEAD detached `5d9259739754816d570470a30d52eb7eb53541bc`;
  referencia do ultimo HEAD anterior `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`
  (branch original `zero-eligible-crm-eligibility-20260923`). Nao houve novo commit.
- Integridade: SHA-256 do patch e tar original conferidos; ambos coincidiam com
  o codigo no inicio desta auditoria. Replay independente das edicoes historicas
  confirmou migration, fila, runner e testes. API/UI e consultas CRM receberam
  as correcoes posteriores discriminadas em `local-evidence/recovery/audit/`.
  Nao existe snapshot integral do filesystem anterior: DB e capturas perdidos
  nao sao declarados recuperados byte a byte. Comportamentos criticos foram testados.
- Falhas fechadas: `CompletedServiceSnapshot.clientId` text versus cast SQL uuid;
  joins Client.id/WaPhoneNumber.clientId e Conversation.id/ConversationMetrics.conversationId
  com uuid/text na copia parcialmente criada. Banco novo `re7_recovery_audit`,
  127.0.0.1:55432, criado exclusivamente por `prisma migrate deploy`, corrigiu o ambiente.
  A fixture de agendamento ja teve o `idempotencyKey` obrigatorio reposto na retomada.
  Nenhuma assertion removida ou relaxada; concorrencia preservada.
- Schema: 18 anotacoes `@db.Uuid` alinhadas aos tipos das migrations existentes;
  Prisma Client 6.19.2 regenerado e semanticamente correspondente. SQL da fila intacto.
  Diff somente leitura ainda registra defaults, indices e nomes historicos;
  nao foi aplicado e nao ha diferenca de tipos ou estrutura da fila nesse diff.
- Migration validada: registro anterior de 60 migrations PASS recuperado; novo
  `migrate deploy` 60/60 PASS necessario porque o DB de teste recuperado havia
  sido substituido por schemas divergentes. Checksums de 60 SQLs iguais ao ledger.
  "Ensaio pendente" dizia respeito a rollout/rollback operacional, nao a falha
  da migration. Nao foi usado db push, reset ou SQL manual nesta auditoria.
- Testes finais: casos anteriormente falhos 4/4; fila 8/8 + runner 10/10 + rotas
  126/126 = 144/144; importacao/exclusao/contratos UI 41/41; zero skips/falhas.
  Backend build e prisma validate/generate PASS. Build frontend anterior preservado
  porque UI nao mudou nesta auditoria. Os quatro smokes aprovados nao foram repetidos.
- Contratos: 3.001 → quatro lotes, snapshot unico, variaveis CRM/CSV, isolamento por
  tenant/exclusividade, scheduler concorrente, retomada, aceite apos perda de lease
  e bloqueios antes do provider cobertos. Provider apenas simulado nos testes.
- Pendencias efetivas: rollout/rollback operacional, drift residual historico de
  defaults/indices, owner validation, aceite CRA e decisao de dominio DELIVERED/READ →
  Conversation/HUMAN/WAITING. Divergencia de dominio permanece separada e sem alteracao
  funcional; 6683 segue encerrado. Sem commit/push/deploy, producao DB ou envio real.

## Atualizacao de recuperacao e fechamento local — 2026-09-26

Status: TECHNICAL LOCAL VALIDATED / OWNER VALIDATION PENDING / NOT DEPLOYED.
Esta atualizacao substitui, para o smoke tecnico local, as lacunas visuais
registradas anteriormente; preserva o historico e nao representa aceite CRA.

- CRM estatico: selecao/filtro, previa e confirmacao clicados na UI; 3.001
  destinatarios persistidos em quatro filhos (1.000 / 1.000 / 1.000 / 1).
- CRM dinamico: estimativa e confirmacao de agendamento exercitadas na UI;
  zero filhos antes da execucao. Uma etapa do processador com relogio local
  controlado criou o snapshot de 3.001 destinatarios/quatro filhos, sem envio.
- CSV: upload, mapeamento, previa e confirmacao pela UI; um unico conjunto,
  3.001 destinatarios/quatro filhos. A UI trata a resposta agrupada; timeout
  especifico e chave de idempotencia reutilizada protegem a repeticao local.
- Acoes agregadas: agendamento atomico dos quatro lotes, reload, pausa,
  retomada e cancelamento confirmados no DB. Nenhum outbound foi criado.
- Test-send ocupado: clique real com input React preenchido, mensagem PT-BR,
  zero chamadas adicionais ao provider simulado, zero outbound e zero job novo.
- Corrigidos limites de parametros SQL em consultas de identidades CRM/CSV e
  exclusao operacional; a previa de campanha deixa de limitar a contagem a
  janela inicial de 800 contatos. Leitura de audiencia limitada a 5.000.
- Evidencias locais: `local-evidence/recovery/result-summary.json`, capturas e
  logs no worktree persistente `tmp/worktrees/re7-campaign-recovery-20260926`.
  Capturas antigas que estavam somente em `/tmp` nao sobreviveram ao reboot;
  seus resultados historicos foram recuperados do registro da sessao.
- Resultado historico da primeira retomada: builds PASS, suites 41/41 e 43/43;
  a suite ampla entao falhou nos bancos divergentes. Essas falhas foram diagnosticadas
  e fechadas na auditoria acima. O drift residual de defaults/indices continua documentado.
- Sem commit, push, deploy, banco de producao ou provider real. Guided Builder
  permanece pausado. Owner validation, aceite CRA e ensaio controlado de
  rollout/rollback da migration continuam pendentes.


Status: current-state documentation based on code inspection. No runtime behavior is defined here.

## Scope

This document maps the Converta product as implemented today in the repository. The main code surfaces are:

- Backend: `apps/whatsapp-agent/src`
- Database schema: `apps/whatsapp-agent/prisma/schema.prisma`
- App frontend: `src/app/app`
- Internal admin frontend: `src/app/admin`
- Shared frontend API/types: `src/lib`

## Product Profiles

Profiles are stored in `Client.profile` and normalized as `business` or `government`.

- Backend source: `apps/whatsapp-agent/src/features/clientFeatures.ts`
- Frontend source: `src/lib/appFeatures.ts`
- Admin tenant creation/editing supports selecting `business` or `government`.
- Architecture direction: `MARKET_PROFILE_ARCHITECTURE.md`
- Business capability contract: `BUSINESS_CAPABILITY_DESIGN.md`

The official long-term product model is:

```text
Converta
├── Core Platform
├── Market Profiles
├── Feature Packs
└── Tenant Configuration
```

Current runtime uses `Client.profile` plus `Client.features`. Future work should treat profile as default capability selection, not as direct product branching. Core modules should ask for capabilities/features and preserve RBAC and tenant isolation.

As of Sprint 82A, the CRM navigation guard uses the `crm` capability instead of the previous `profiles: ["business"]` transitional filter.

### Business

Default business profile favors commercial operations:

- CRM: business-only by default through the `crm` capability
- dashboard: off by default
- departments: on
- users: on
- templates: on
- SLA: on
- reports: on
- campaigns: on
- chatbot: on

### Government

Default government profile favors oversight and reporting:

- dashboard: on
- departments: on
- users: on
- templates: off
- SLA: on
- reports: on
- campaigns: off
- chatbot: on

## Implemented Modules

| Module | Status | Primary Surface | Main Backend/DB Evidence | Dependencies |
| --- | --- | --- | --- | --- |
| Inbox omnichannel | Operational | `/app/inbox` | `Conversation`, `Message`, `InboundMessage`, `OutboundMessage`, `ConversationRuntimeState` | WebSocket, channel persistence, auth, tenant resolution |
| WhatsApp runtime | Operational | webhook/runtime | `whatsapp/webhook.controller.ts`, `WaPhoneNumber`, `TenantMetaConfig` | Meta Cloud API, tenant config, DB |
| Messenger/Facebook | Operational human messaging | `/app/inbox` | `metaWebhookPassive.ts`, `messengerInboundPersistence.ts`, channel accounts | `channelAccounts`, Page token |
| Instagram | Operational inbound/outbound manual, human-only | `/app/inbox`, `/app/settings/channels/instagram` | `instagramInboundPersistence.ts`, `instagramBusinessLogin.service.ts`, channel accounts | Instagram Business Login token, aliases, app review |
| Chatbot flows | Operational with tenant locks; Guided Builder 2.4 closed / deployed / owner-approved local / production non-destructive validated | `/app/chatbot` | `ChatbotFlow`, `chatbot/chatbotFlow.ts`, `TenantOperationalConfig` | `Client.features.chatbot`; follow-up, handoff notification, media handoff policy, plan limits, automation disable flags and scoped assistant config are DB-first with `tenants.json` fallback |
| AI supervised fallback | Partial/tenant-configured | runtime/admin | `controlledAssistant.ts`, `TenantOperationalConfig.config.aiAssistantConfig`, `TenantOperationalConfig.config.aiIntentQualification` | OpenAI config; prompt/topic/profile, intent catalog and qualification schema are DB-first with `tenants.json` fallback |
| Campaigns | Operational; new local contract requires explicit response destination in campaign seed | `/app/campaigns` | `Campaign`, `campaignRunner.ts`, `routing/outboundReturnDestination.ts` | templates, contacts/leads, departments/queues or any active same-tenant flow, feature flag |
| Templates | Operational | `/app/templates`, admin routes | `Template`, `TemplateRequest`, `meta/template.service.ts` | WABA token, feature flag |
| CRM/timeline | Operational | `/app/crm`, `/app/inbox` | `Lead`, `LeadNote`, conversation/message models | CRM status catalog is DB-first in `TenantOperationalConfig` with `tenants.json` fallback |
| Knowledge Base | Structural MVP, controlled rollout | `/app/knowledge-base` | `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, feature `knowledgeBase` | runtime consumption by IA/chatbot is designed but not enabled |
| Scheduling | Structural MVP, controlled rollout | `/app/scheduling` | `SchedulingService`, `SchedulingResource`, `SchedulingAvailability`, `Appointment`, `AppointmentReminder`, feature `scheduling` | no chatbot/IA/API/calendar/reminder runtime integration yet |

### Campaign CRM Audience Split - 2026-09-25

Local implementation only: Campaigns now has a draft-splitting path for CRM
audiences larger than the central 1,000-recipient draft capacity. The split is
not a send or schedule operation. It resolves the complete selected audience in
the backend for the same tenant, up to the existing 5,000 analysis ceiling, and
returns the planned static draft distribution before the operator confirms. The
confirmed drafts are numbered from the original name and preserve template,
variable mappings and return destination. Dynamic CRM filters are converted only
by explicit operator choice into static snapshots; the original dynamic mode is
preserved outside that choice. Pagination remains only a preview concern and is
not used as the final recipient set for splitting. Status: LOCAL PARTIAL
IMPLEMENTATION / FOCUSED TEST VALIDATED / NOT DEPLOYED / OWNER UI PENDING.

CRA large-audience audit: this is not yet a durable batch campaign model.
Production still has no deployed parent/group model for campaigns. A CRA-ready
model requires immutable execution snapshot, child campaign/chunk membership,
tenant-level coordination, batch-wide actions/progress and restart/idempotency
recovery. Numbered names remain display labels; the local batch/chunk link is
not deployed yet.

Owner execution contract, 2026-09-25: one tenant may have at most one active
campaign executor at a time. Local implementation on 2026-09-26 adds the
durable per-tenant queue and lease, reused by standalone campaigns and batch
chunks, for immediate and scheduled execution. Ordering is deterministic by
`eligibleAt`, sequence/id and chunk index; test-send remains unitary and now
uses a durable technical job/lease so it cannot bypass active or uncertain
campaign execution. Static split drafts now persist a batch/chunk link instead
of relying on the numbered name as identity. Focused local validation passed
queue 8/8, campaign route split/lifecycle/opt-out tests, backend/frontend
builds and `git diff --check`; `prisma migrate deploy` passed in isolated local
DB. Follow-up on 2026-09-26 added explicit uncertain-execution recovery and
stronger executor containment: expired running jobs do not release the tenant
automatically, an operator classification to `needs_review` records a reason,
releases the lease without automatic resend, invalidates the old executor token,
and batch chunks are claimed in `chunkIndex` order. The runner also checks the
lease after the provider returns before persisting or advancing. Campaigns UI
can display this blocked state and reason. Status: PARTIALLY IMPLEMENTED /
FOCUSED VALIDATED / NOT DEPLOYED / OWNER UI PENDING. Remaining product gaps:
true dynamic snapshot split above 1,000 still needs integrated group execution
evidence, grouped CSV execution still needs full coordinated split/run evidence,
full
aggregate group UX, authenticated browser smoke and production
rollout/rollback validation.
| Satisfaction/NPS | Structural MVP, controlled rollout | `/app/satisfaction` | `SatisfactionQuestion`, `SatisfactionSurvey`, `SatisfactionResponse`, feature `satisfaction` | no automatic sending, chatbot/IA trigger, public form or reports yet |
| Dashboard | Available by profile/flag | `/app/dashboard` | feature-gated routes | `Client.features.dashboard` |
| Reports | Operational | `/app/reports` | report routes, `ConversationMetrics`, SLA/retention reads | feature flag, operational data |
| Departments/queues | Operational | `/app/departments`, admin | `Department`, `Queue` | feature flag, inbox assignment |
| Users/RBAC | Operational | `/app/users`, auth routes | `User`, `AppAuthSession`, `PasswordResetToken` | auth/session governance |
| Feature flags | Operational | app/admin | `Client.features`, `Client.profile` | backend/frontend defaults |
| LGPD/privacy | Operational + subject anonymization owner-approved, P1 atomicity/campaign unlinking fix local/not deployed | `/app/settings/privacy` | `RetentionConfig`, privacy retention service, Contact/Lead subject orchestrator, privacy subject search, campaign seed privacy helper | retention job; deployed without real anonymization smoke; operational CRM exclusion does not remove subject from privacy discovery; Contact target preferred, Lead-only target supported; Lead-only operational exclusion materialization is deployed as explicit operational action only, with privacy preserved; 2026-09-21 Demo `****6787` incident requires suspending real subject anonymization in production until atomic transaction + per-CCI anonymized hash + campaign seed subject unlinking fix is deployed; preview/search remain usable |
| Push/PWA notifications | Operational with platform limits | app shell/inbox | `PushSubscription`, `webPushService.ts`, service worker | browser permission/support |
| Demo/POC data | Internal/demo | scripts | `seed-demo.mjs`, `seed-re7-demo-screenshots.mjs` | local/demo only |
| Internal admin console | Operational | `/admin` | admin routes, tenant/channel/onboarding pages | `X-Admin-Token`, DB-backed `Client`, `TenantOperationalConfig`, legacy `tenants.json` fallback |

Contacts/Campaigns local finishing, 2026-09-19: OWNER PASS / DEPLOYED /
PRODUCTION NON-DESTRUCTIVE VALIDATED. Contact delete active-conversation
guard remains in the list row with closable toast feedback; Contact detail no
longer repeats the active-conversation warning/action block; related campaign
navigation opens the exact campaign detail route. Contact CSV preview/confirm
now exposes a detailed report and pending-state protection. Permanent invariant:
NO NEW CONTACT/RECIPIENT PHONE MAY BE PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION.
Manual Contact, Contact CSV and Campaign CSV share the canonical
CRM WhatsApp identity parser and preserve Brazilian 12/13-digit equivalence. Contacts CSV also accepts optional
`Situação no CRM` using the same same-tenant CRM status resolver used by Campaign
import where compatible; invalid status rows are blocked and blank status
preserves/defaults through canonical CRM upsert semantics. Historical invalid
data is not claimed cleaned without a separate audit/repair gate. Production
validation used Demo preview/read-only paths only and produced zero Contact,
Lead, Campaign or Outbound mutations.

Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
VALIDATED / NOT DEPLOYED. Contacts CSV now mirrors the Campaign CSV operator
pattern locally: file selection then preview, import confirmation only after
preview, locked duplicate actions while preview/import/report is active,
cancel/reset available, Portuguese operation labels and Campaign-style
cards/tables/badges. Full phone values are shown only in authenticated Contacts
CSV import preview/report evidence for reconciliation. Preview validity is tied
to the exact phone/name/CRM Situation mapping used; mapping changes stale the
visible preview, block import and require refreshed preview. No schema,
migration, provider call, real send or production deploy occurred.

CRM post-deploy hardening, 2026-09-21: LOCAL VALIDATED / NOT DEPLOYED. CRM
contact origin now means first reliable provenance of the operational/CRM record
and is derived from canonical evidence only: manual, CSV import,
campaign/audience, conversation/inbound, system/integration or unknown for
legacy records without reliable evidence. CSV confirm persists individual
per-contact provenance through the existing audit event; no new persistence
field was added. Manual contacts later updated by CSV remain `Cadastro manual`;
CSV-created contacts show `Importação CSV`. Contacts CSV state has one secondary
action per state: `Cancelar` before processing and `Fechar` after completed
summary. CRM keeps historical conversation count/history, but Inbox-open fields
and detail/history action are populated only for conversations projectable by
the canonical human Inbox policy; BOT-only historical records do not create
false Inbox navigation.

CRA-PR controlled campaign readiness, 2026-09-15: the product capability for
template request/review/submission, campaign drafts/import, lifecycle controls,
opt-out blocking, delivery status, Meta usage ledger and active-message billing
is present in the codebase. The readiness audit is closed, but contract
acceptance is open because CRA has no configured template, template request or
campaign in production yet, and no approved CRA Utility copy was found. Demo
product evidence now covers controlled Utility B, opt-out E2E and
reports/exports/billing Phase E; the current contract front is CRM
import/upsert/report with optional `Situacao no CRM`, then contacts campaign
relationship view, final CRA report/billing package and acceptance pack. No
Meta template submission or real send is authorized without approved customer
copy and explicit owner approval. Instagram Direct, Facebook Messenger and
Website/Webchat remain
contract-required but customer-deferred with delivery window pending and are not
blockers for this phase.

CRA campaign follow-up reconciliation, 2026-09-16: the approved outbound return
destination delivery is CLOSED / DEPLOYED / OWNER APPROVED / PROD
NON-DESTRUCTIVE VALIDATED at `452d5826db42cc1b574eeff8fd8e0d038cd3491f`.
New requirement
CRM situation import/upsert/report is IMPLEMENTED / TEST VALIDATED / PRINCIPLES
AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION NON-DESTRUCTIVE
VALIDATED at `cad9489c`. It includes optional `Situação no CRM`, same-tenant
deterministic status resolution against `Lead.status`, existing contact update
instead of duplication, blank-cell preservation, no silent status creation, no
duplicate contacts from repeated input rows and detailed downloadable import
evidence exposed in the campaign CSV import flow. Local owner revalidation
passed; no real production import was executed and CRA/customer evidence remains pending.
Marketing
template media support is P2 product/Meta capability, covering MARKETING
category plus IMAGE/VIDEO headers and official Marketing pricing; it is
parallel to the Utility campaign front unless contract evidence promotes it.

Audit history: the owner PARTIAL PASS was followed by a 2026-09-17 four-P1
principles block. The corrective batch now shares one canonical identity
resolver, commits CRM/status/campaign seed atomically per row, validates rows
before duplicate claiming, enforces CRM capability and protects result CSV
cells from formulas. Focused tests and principles re-audit passed, owner
revalidation passed, canonical integration was prepared, and production was
deployed FF-only with non-destructive validation. Sequential per-row
identity resolution remains P2 performance hardening; internal result wording
remains P3 UX. Completion telemetry and the broader lint baseline remain WATCH.

Contacts campaign relationship view is CANONICALLY INTEGRATED / TEST VALIDATED /
OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. It exposes campaign count,
last campaign/date/template/status and recent campaign history inside
Contacts/CRM without creating Contact-owned campaign history. Canonical source
remains existing campaign/outbound/event evidence, same-tenant only; the list
uses a bounded aggregate projection for the current page and detail is loaded
on demand to avoid per-row N+1. Customer UX excludes price/cost/billing values.
Focused CRM route regression passed 19/19 on safe local DB, with backend and
frontend builds passing. Production delivery and CRA acceptance are pending.

Contacts + Campaigns UX refinement is implemented locally with owner pass:
Contacts uses clickable rows, compact actions, full phone in authenticated
same-tenant CRM, no duplicate top summary for CRM Situation/active-send/template
eligibility, switch-based active-send block and one expandable related-campaign
section. Delete is row-only in the Contact list and no longer appears inside
Contact detail, which keeps close/edit/save/cancel semantics. Campaigns removes
the redundant top counter panel, carries counts in
tabs, opens detail from row click, right-aligns actions, uses distinct compact
counter labels and removes implementation explanatory copy. Campaign detail
adds view-only result filters by result status, CRM Situation and name/phone,
copy of filtered rows and "new campaign from filtered" prefill through current
canonical contacts in the existing composer. Rows without current reusable
contacts are excluded with explicit counts. Result truth, composer cleanup,
opt-out and financial UX remain unchanged. Dynamic CRM-filter scheduled
campaigns are a separate OWNER PASS / LOCAL VALIDATED / NOT DEPLOYED front
documented in `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`, with
schedule-time filter persistence and execution-time immutable snapshot.

CRA-PR Demo mirror, 2026-09-15: `demo-converta` is the reusable multitenant
product acceptance baseline for generic CRA requirements. Phase A created the
plan at `docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md` and confirmed
by read-only production snapshot that Demo has Meta Cloud configured, one
approved Utility template, campaign/template/report features enabled, no
campaigns and no campaign billing/opt-out events. Later phases require owner
gate before any Meta outbound.

Admin chatbot settings note, 2026-09-13: `/admin/chatbot/settings` must support
DB-backed clients that do not have a legacy `.data/tenants.json` entry. Settings
resolve through `TenantOperationalConfig` and safe runtime defaults using an
in-memory tenant fallback from `Client`; legacy tenants still use
`tenants.json`. The admin page should keep flows/resources visible after a
partial settings error and must not show a persistent "Carregando" badge once
loading is finished.

Production validation in
`69bedc38396b8f837a236b0af4a5446397919403`: CRA settings returns 200, CRA
resources returns 6 departments and 6 queues, CRA flow count is 1, health is
ok/db ok, and no artificial `cra-pr` entry was created in `.data/tenants.json`.
Status: CRA SETTINGS = CLOSED / REAL VALIDATED; ADMIN LOADING/BADGE =
CLOSED / REAL VALIDATED.

Chatbot Guided Builder 2.3 recovery note, 2026-09-12: the final approved
delivery was rebuilt on a clean worktree from the canonical production/origin
HEAD. A reboot had removed the temporary `/tmp` worktree, an initial post-reboot
reapplication showed an old version, and the active local state was reconstructed
from Codex session patches without production mutation during recovery. `/tmp`
worktrees are not sufficient preservation for owner-validation work. The final
owner micro-adjustment keeps sibling rows collapsed after deleting a menu option,
submenu/nested row or editable record, returning focus to the parent/current
editor context instead of opening the next sibling. Delivery remains frontend
only: no `ChatbotFlow.definition` change, tenant hardcode, schema or migration.

Human handoff destination contract, 2026-09-12: operational human handoff must
resolve to a concrete queue before it becomes visible/assignable in the human
Inbox. `departmentId` without `queueId` is treated as an incomplete destination
unless runtime can resolve exactly one existing queue for the department. Guided
Builder must not serialize an ambiguous "default queue" as `queueId=null`.
Normal Guided UX asks only for the business concept, `Setor`: one queue is
resolved internally without queue label/selector/copy, zero queues block with
"Este setor ainda nao esta preparado para receber atendimentos.", and 2+ queues
show a conditional "Fila" selector as an operational exception. After the user
selects "Encaminhar para atendimento humano", the editor must render the `Setor`
field directly and must not add a separate instructional card telling the user
to choose the sector.

Syer `****9614` operational repair, 2026-09-12: the generic fix was deployed in
`597d7030`, then the already-existing pre-fix runtime row
`9b1c9518-5632-47ac-9520-f1685e500f1f` was repaired after backup by changing
only `ConversationRuntimeState.queueId` from `null` to the existing Syer queue
`cmtoekafy00014s4lg41vs5i0` (`Fila Geral`). No message, history, protocol,
cycle, assignment, close state or outbound record was changed. Canonical rule:
a human handoff entering `WAITING` must have a concrete `queueId`; `queueId=null`
is not a valid representation of a default queue.

Guided Builder 2.4 local UX contract: model selection and wizard Continue/Back
must not move page scroll; editable row expansion scrolls to the row header; and
delete/cancel/back-to-parent actions recover focus to the parent/current context
without auto-opening siblings. "Fazer uma pergunta" means question -> capture
answer -> continue to an explicit next business action, with at most 3
consecutive questions. Runtime conditional branching by captured answer is not
available in the current flow engine; keep it as a product gap until predicates
are implemented and tested. New Guided human handoff generation must never rely
on `queueId=null` as a default queue.

Guided Builder 2.4 delivery state, 2026-09-13: deployed frontend-only in
`ca34e123c72de2e96f0dcff27b4e17f29e5b630b`, owner-approved locally and
production non-destructive validated. The delivery passed 54/54 focused tests,
frontend build and `git diff --check`; production health/routes passed; backend
and worker were not reloaded; no schema/migration/runtime contract changed; and
Demo/CRA/SECULT/Syer flow definition hashes stayed unchanged during smoke.

Current backlog classification:

- P0: none.
- P1: none.
- Auth malformed-claim process crash P1 is CLOSED / DEPLOYED / PRODUCTION
  HEALTH VALIDATED in `8f15eedf4eb11dd8f0bea4f1dd79bb50cae3be9e`.
  UUID-backed auth claims are validated before Prisma; malformed signed
  `clientId` resolves to controlled `401 invalid_token`, and unexpected request
  failures are contained by an HTTP request boundary with generic 500 output.
  Production smoke used a real existing session and an obviously invalid token;
  no malformed signed token was reproduced in production, and logs after smoke
  showed no `unhandledRejection` or Prisma `P2023`.
- Campaign post-Meta persistence / operational default is CLOSED / DEPLOYED /
  TEST VALIDATED / PROD NON-DESTRUCTIVE VALIDATED. Demo Phase C
  `data_exame` accepted one Meta send for `****9614`; owner confirmed real
  receipt and Meta `sent`/`delivered` webhook events were later found, but the
  local OutboundMessage/ledger/report rows were missing because the runner
  required operational default bootstrap after the external Meta mutation.
  Local generic fix adds pre-send default validation, idempotent submit/accepted
  events, retry hard-stop with reconciliation-required evidence, and orphan
  webhook status evidence without synthetic billing. Read-only risk audit shows
  the latent class is not Demo-only: `cra-pr`, `demo-converta`, `secult-pe` and
  `syer-rodrigues` lack configured operational defaults and active general
  defaults, while `re7online` has one active general default. Production deploy
  was FF-only on 2026-09-15 at `b8c8f616`, reloading only
  `re7-whatsapp-agent`; health/db and non-destructive bundle smoke passed. No
  new real send occurred; `****9614` must not be resent and `****6787` needs a
  fresh owner gate. Recipient A reconciliation audit found a safe constrained
  repair path; after owner approval and backup, production reconciliation was
  applied for A only, with one local outbound, one delivered Utility billing
  event, `sentCount=1`, preserved `status=failed`, and no resend. B send,
  is now gated for explicit owner approval. Official Meta provider cost for one
  remaining Brazil Utility message was proven from WhatsApp Business Platform
  Pricing / Meta Developers on 2026-09-15: BRL 0.0350/message, effective
  2026-07-01, tier 0-250,000. `R$ 0,32` remains an internal planning unit, not a
  proven final CRA contract unit. Owner authorized B-only send on 2026-09-15,
  but the immediate preflight stopped before Meta because `demo-converta` has
  `Atendimento Geral` inactive and no active default operational
  `Atendimento Geral` + `Fila Geral` pair. Meta calls for B in that attempt: 0.
  Demo operational-default follow-up on 2026-09-15 is CONFIG PENDING / OWNER
  GATE: canonical runtime resolves an active `Atendimento Geral` plus
  `Fila Geral`; Demo already has department `cmsiwk1o100014sdzl5cqd2ki` and
  queue `cmsiyb2k200n94sdpu5khkee0`, but the department is inactive. Proposed
  repair is reactivation of that existing department only, with no code change,
  no Meta send and no campaign retry before approval.
  Recipient B controlled Utility send on 2026-09-16 is COMPLETED for Demo
  product capability validation: one Meta call, accepted, delivered, one local
  outbound, explicit human return destination persisted, one
  `billing.active_message.delivered`, no A resend and sanitized CSV evidence.
  CRA real campaign acceptance and contract price remain separate. Opt-out E2E
  remains the current active gate at that point. Opt-out E2E preparation on
  2026-09-16 reached READY FOR OWNER GATE / NO MUTATION: canonical state is event-sourced in
  `Event`, scope is `clientId` + `waIdCanonical`, campaign/manual active sends
  block before Meta and export `opt_out`. New Utility templates
  `atualizacao_protocolo` and `lembrete_vencimento_anuidade` are Meta `PENDING`;
  `data_exame` remains approved. Recommended future test recipient is B
  `****6787`; A `****9614` remains preserved as reconciliation evidence.
  Opt-out E2E execution later on 2026-09-16 is COMPLETED for Demo product
  capability validation: B was opted out canonically, one campaign blocked before
  Meta with `blockedCount=1`, Meta calls/real messages/outbound/billing all 0,
  opt-out was revoked canonically, B became eligible again and A was untouched.
  Reports/exports/billing Phase E then completed Demo product capability
  evidence without send, opt-out mutation or ledger mutation: campaign CSV,
  report CSV/PDF path, Meta usage CSV and active-message billing CSV were
  audited; A has one reconciled billing event, B has one delivered billing
  event and opt-out has zero outbound/billing. CRA customer report package and
  final BRL contract unit remain pending. Next fronts are CRM import/upsert/
  report with optional `Situacao no CRM`, then owner/prod gate for Contacts
  campaign relationship view.
- Meta pricing source of truth / FinOps hardening is P2 generic product backlog.
  The broad future work is rate-card ingestion, resolver, snapshots, FX and
  staleness detection. It must not consume the current CRA adherence front
  beyond the narrow official-rate proof already obtained for Recipient B gate.
- Watch/external operations: abandoned automation / BOT flow lifecycle local E2E validated on
  2026-09-14 in
  `docs/saas/INACTIVITY_AUTOMATION_LIFECYCLE_AUDIT_2026-09-14.md`; product
  decisions remain open for stale `flowContext` cleanup, timeout UX and
  provider parity; Demo channel continuity separated by transport. The
  2026-09-14 Meta external incident (`phone.status=BANNED`, WABA `REJECTED`) is
  historical evidence, while the 2026-09-15 production readiness check is `WARN`
  without `FAIL`/`WAITING_EXTERNAL`; Demo Web Session moved from historical
  `QR_REQUIRED` at 2026-09-13 22:40:23Z to current `CONNECTED` after
  re-pairing. User deactivation active-conversation guard is closed / deployed /
  owner approved / production non-destructive validated.
- CRA/SECULT business-hours audit, 2026-09-14: CLOSED / DOCS-ONLY. The runtime
  department-hours mechanism is already present and production `secult-pe`
  preserves its approved `OPEN`/`CLOSED + QUEUE_FOR_NEXT_OPEN` contract. Current
  `cra-pr` departments were operationally configured on 2026-09-15 with
  `America/Sao_Paulo`, Mon-Fri 09:00-17:00, weekends closed, and preserved
  `QUEUE_FOR_NEXT_OPEN`; resolver and flow-aware validation passed for all six
  departments / two representative handoff destinations. This is closed as
  CONFIGURED / OPERATIONALLY VALIDATED using existing product capability plus
  config, not product runtime P1.
- CRA-PR contract/TR adherence, 2026-09-15: canonical matrix added at
  `docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md`. It tracks 52
  contractual requirements separately from the technical backlog. Current
  contract blockers are tenant/channel/configuration/evidence heavy:
  Instagram/Facebook/Webchat activation, CRA Utility template/campaign
  acceptance, opt-out proof, report/export/billing package, and acceptance
  evidence for SLA/support/training/LGPD/backup/Meta. Active flow visibility
  remains CLOSED / CUSTOMER VALIDATED and CRA business hours remain CONFIGURED /
  OPERATIONALLY VALIDATED.
- CRA-PR Demo contract validation, 2026-09-15: PHASE A COMPLETE / NO EXTERNAL
  SEND. Demo can validate generic product mechanics but does not close CRA
  customer acceptance, CRA template approval, CRA billing evidence or deferred
  IG/FB/Webchat channels.
- CRA-PR Demo Phase B owner gate, 2026-09-15: PREPARED / NO EXTERNAL SEND.
  Approved Demo Utility template `data_exame` (`pt_BR`, one date variable) is
  suitable for Demo/RE7 test data only, not as CRA copy. Local pre-send checks
  pass 13/13 for import, dedupe, variables, opt-out exclusion, lifecycle and
  billing idempotency. Planned controlled owner gate is 2 messages; prior
  R$ 0,64 preview is paused as central planning reference until billing-unit
  reconciliation closes, with explicit owner approval and 24h-window check still
  required before sending.
- CRA-PR Demo Phase C controlled Utility gate, 2026-09-15: PREPARED / OWNER
  REAL-SEND APPROVAL PENDING / NO EXTERNAL SEND. Owner authorized known Demo/RE7
  finals `9614` and `6787`; read-back confirms `data_exame` approved, both
  outside 24h, no active opt-out found and final unique recipients 2. BRL cost
  is paused for billing-unit reconciliation. This does not close CRA-specific
  acceptance and does not execute Meta outbound.
- CRA-PR Demo Phase C controlled Utility send, 2026-09-15: PARTIAL REAL META
  ACCEPTANCE / PRODUCT ISSUE FOUND / GENERIC FIX DEPLOYED / STOP. Meta accepted one
  `data_exame` template for `****9614`, owner confirmed real receipt, and Meta
  `sent`/`delivered` webhooks were recovered, but the runner failed with
  `default_operational_department_missing` before OutboundMessage/ledger/report
  persistence, so local product evidence stayed missing; `****6787` was not
  sent. The generic preflight/idempotency/orphan-status fix is deployed, but any
  retry/send still requires a separate owner-approved send gate.
- CRA active flow tenant visibility, 2026-09-15: CLOSED / DEPLOYED / CUSTOMER
  VALIDATED. Runtime flow works
  per owner report, but CRA tenant admins did not see the active flow in
  `/app/chatbot`. Production DB/runtime/admin API and real Eduardo app trace
  proved the active flow exists, belongs to CRA, has `features.chatbot=true`,
  and `/agent-api/app/chatbot/flows` returns 200 for the CRA ADMIN session. First
  missing layer was app frontend hydration: `/agent-api/app/chatbot/settings`
  returned 404 because app settings still depended on legacy `.data/tenants.json`;
  `Promise.all()` then prevented `hydrateFlows()` from rendering the returned
  flow. Runtime commit `363ce3ab` makes app settings DB-backed for modern
  `Client` tenants and hydrates flows/settings/resources independently.
  Production smoke after backup `pre-cra-flow-visibility-20260915-133330.dump`
  confirmed CRA settings/flows HTTP 200 and preserved the active definition hash
  `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
  Customer CRA ADMIN Eduardo confirmed after the production fix that the active
  flow is visible in tenant `/app/chatbot` and can be opened from `Fluxos
  cadastrados`. Existing active flow must not be recreated or definition-mutated.
- Chatbot Flow active vs entrypoint semantics, 2026-09-15: CLOSED / READ-ONLY
  AUDIT / P2 UX CLARIFICATION + P2 DOMAIN HARDENING. `entryPoint` e o seletor
  padrao de novas conversas (`clientId + isActive=true + entryPoint=true`);
  `isActive` e o gate para execucao por id explicito e continuidade de runtime.
  Active non-entrypoint e capacidade real no Support Hub via
  `supportChannel.chatbotFlowId`, mas nao ha seletor secundario geral para
  campanha, departamento, intent, link, QR/referral, Webchat embed ou
  flow-to-flow. Producao nao tem duplicate entrypoints nem inactive entrypoints;
  recomendar clarificacao de UX e hardening de invariantes sem abrir P1.
- P2: question conditional branching by captured answer; Guided Builder BOT
  inactivity policy UX; reporting context enhancements; Guided Builder complete
  final-review summary; Meta Cloud unlink/removal semantics; support access
  hardening.
- WATCH: Syer Dashboard transient error UX/observability, Inbox performance,
  CPU, `last_message_lookup`, SECULT fairness and round-robin cursor, SECULT
  non-content suppression organic validation and representative scale/load
  validation.

Abandoned automation audit, 2026-09-14: the earlier `WAITING_FOR_CUSTOMER 60m`
human auto-close interpretation is superseded and is not a current product
requirement. `WAITING_USER` in BOT context means automation waiting for user
input. Local E2E validated persisted `chatbotRuntime.lastInteractionAt`,
flow-level `resetAfterMinutes`, background `timeoutMinutes/action=HANDOFF`, DB
claim, duplicate prevention and restart resilience without production mutation.
Remaining gap: product-harden cleanup/expiry UX for incomplete BOT flows,
stale `flowContext` policy and provider parity without closing HUMAN
conversations automatically.

Syer Dashboard audit, 2026-09-13: read-only production audit on
`69bedc38396b8f837a236b0af4a5446397919403` found no confirmed refresh loop or
dashboard backend error. `/app/dashboard` fetches users, departments and
`/app/dashboard/overview`; it does not fetch `/app/conversations`. Overview
refresh cadence is 15s plus realtime debounce of 500ms for message/handoff/status
events. Syer data volume is low (1 runtime state, 1 non-deleted conversation,
10 metrics, 10 leads, 2 users, 1 department), so tenant cardinality and Inbox
query cost are not supported as root cause. Status: BUG NOT PROVEN / WATCH; no
code patch without a reproducible endpoint failure.

Users Management 2.0 delivery state, 2026-09-14: deployed in
`5ad40c10eda77076bc2a069e432663ac2271f0a8`, owner-approved and production
non-destructive validated. `/app/users` is the canonical tenant-side users
management surface; inactive users remain visible in `Todos`/`Inativos`, active
seat count uses the backend enforcement source, and `/app/users` plus
`/app/settings/users` returned production HTML after deployment. The delivered
UX includes expandable rows, circular expand/collapse, fixed right action
column, tonal header/body hierarchy, filled Save action and persisted-state-only
filters/counters.

Departments Management UX 2.0 state, 2026-09-14: DEPLOYED / OWNER APPROVED /
PRODUCTION NON-DESTRUCTIVE VALIDATED.
`/app/settings/departments` uses the same expandable-row presentation used by
Users Management 2.0 and Guided Builder. The UX contract is
compact persisted summaries, shared circular expand/collapse control, one row
open at a time, expanded edit body with separate tone, and unsaved draft reset
on collapse/row switch/filter changes. The shared Users/Departments row header
uses a fixed right action column so wrapped summaries never push the circular
expand control below the header. No department/queue routing semantics, hours
rules, RBAC, schema or migration changed. Delivery commit
`5c051f83df6bc99aa998985ba93301e601e502df`; smoke confirmed health,
`/app/users`, `/app/settings/departments`, production right-anchor structure and
representative tenant status without mutating department data.

Shared expandable admin pattern, 2026-09-14: Guided Builder, Users and
Departments use the approved administrative row pattern where applicable:
compact closed row, expandable detail body, circular expand/collapse control,
fixed right-side action column, wrapping left content, header visually distinct
from body, one row open at a time where appropriate, collapse/row switch/filter
changes discard unsaved local draft, and only persisted state drives global
filters/counters. This pattern is not automatically mandated for unrelated
screens without product justification.

User deactivation lifecycle rule, 2026-09-14: CLOSED / DEPLOYED / OWNER
APPROVED / PRODUCTION NON-DESTRUCTIVE VALIDATED. A user must not be deactivated while active HUMAN
operational conversations are still assigned to that user. The local predicate
is same tenant, `ConversationRuntimeState.assignedUserId` equal to the user,
`closedAt=null`, `status IN (WAITING, IN_PROGRESS)` and `mode` null or not
`BOT`. `WAITING` without assignment, `CLOSED`, other tenant and BOT do not
block. Those conversations must first be reassigned/transferred to an eligible
attendant or closed through the existing lifecycle. Deactivation itself does not
silently close, transfer, unassign, change queue or mutate conversation
lifecycle state; attempted deactivation returns `user_has_active_conversations`
with an actionable message. Backend is authoritative and frontend messaging is
UX only. Local owner-approved validation: backend focused 1/1 PASS, frontend
7/7 PASS, builds PASS; full `campaignsFeatureRoutes` 109/110 PASS with the
unrelated pre-existing timeout `meta inbound clears active chatbot runtime when
persisted flow is inactive` tracked separately as WATCH. No schema/migration and
production delivery in `c40c44dc205b2324a9197322334141c5e7f079f0`; persistent
PostgreSQL backup `20260914-175614.dump`; reload scope was `re7-whatsapp-agent`
and `re7-admin-front`; web worker preserved; health, `/app/users`,
`/app/settings/users`, unauthenticated API behavior and representative tenant
read-only checks passed.

Inbox visibility policy audit, 2026-09-13: `shared` and
`assignee_only_after_assignment` are visibility/projection modes for Inbox list,
detail and timeline access. They do not redefine assignment, queue capacity,
presence, handoff creation, claim, transfer, send, close or tenant RBAC. The
AGENT `CLOSED` restriction remains stronger than the visibility policy and is
preserved.

Already implemented and not active model gaps: internal multitenant support
access has temporary audited grants and support sessions; user-to-department M2M
exists through `UserDepartmentMembership`, UI and assignment/RBAC usage.

## Main Runtime Dependencies

- Postgres/Prisma for operational data and many tenant-owned entities.
- `TenantOperationalConfig` for migrated operational config: CRM status catalog, manual handoff template pointer, follow-up settings, handoff lead notification settings, media handoff policy, plan/quota limits, automation disable flags and scoped AI assistant config.
- `.data/tenants.json` only for tenant technical configuration not yet migrated
  and compatibility fallback; modern DB-backed tenants must not require a JSON
  entry for admin tenant operations.
- Meta Cloud API for WhatsApp, Messenger and Instagram.
- WebSocket bridge for realtime inbox.
- Web Push/VAPID for native notifications.
- OpenAI for AI fallback where enabled/configured.

## Current Product Classification

- Operational: yes.
- Sellable for business tenants: yes, especially WhatsApp-first omnichannel operations.
- Government-ready: partial, with profile/feature defaults and reporting foundations.
- Scalable: operationally improving; remaining configuration governance should continue moving DB-first while keeping `tenants.json` as compatibility fallback only.

Canonical Identity P1 (2026-09-17): DEPLOYED / PRODUCTION NON-DESTRUCTIVE
VALIDATED at production HEAD `ed329ec8` by FF-only. Meta inbound/capture and
campaign bootstrap share the existing canonical CRM resolver; 13/12-digit,
Meta/Web Session, external-hash and cross-tenant tests pass without duplicate
Contact/Lead creation. Production backend build, targeted agent reload,
health/DB and read-only route/module smokes passed. No schema/migration or
production repair was included; a real post-deploy identity event remains
pending evidence.

Operational Queue is deployed with an explicit nullable
`Department.operationalQueueId`, database-enforced tenant/department ownership,
atomic create/activation and Department-only Campaign/Guided UX. Status is
Closed / deployed / production reconciled / smoke pass. The production reconciliation of all 54 departments is
in `docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md`: 34
exactly-one mappings are auto-safe, 8 inactive rows are null-allowed, 7
multi-queue mappings are resolved by audit and the final 5 active blockers now
have owner decisions. Production rollout on 2026-09-18 advanced by FF-only to
`b166bcac8bf443d34ba7f3821016b6bae8069728`, applied migration
`20260917213000_add_department_operational_queue`, reconciled 44 explicit
mappings, created/linked 2 owner-approved internal queues and left 8 inactive
rows null-allowed. Post-verify active unresolved = 0 and cross-tenant/department
links = 0. The owner decision package is
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`. Campaign UX
remains owner PASS and real `****6787` repair remains a separate pending gate.

Campaign UX / result truth integration (2026-09-18): integrated locally on the
current Operational Queue baseline and ready for owner revalidation; not
deployed. Campaign creation/return destination stays Department-only in the
customer UI and uses internal `Department.operationalQueueId` resolution.
Customer-facing Campaigns and Inbox template shortcut surfaces remove financial
price/cost/tariff estimates. Campaign lists/details expose persisted lifecycle
tabs (`Enviando`, `Agendadas`, `Concluídas`), closeable backend-observing
progress modal and recipient-level blocked/skipped/pending/opt-out result
truth. Final local audit of `Campanha teste set.2` corrected a detail-only
projection/fallback duplicate: no duplicate provider send existed. The
authenticated detail now reconciles one current outcome per intended recipient,
shows the full phone, preserves draft/review masking and reports mixed
delivered/blocked evidence as partial delivery. `****9614` was blocked before
provider because historical pre-Identity-P1 residue left two same-tenant
Contact candidates for one Lead; no active creation bypass was reproduced, and
repair remains a separately authorized data action. Counters separate blocked
from technical failures. Tests/builds: UI contract 9/9
PASS, `campaignsFeatureRoutes.test.ts` 115/115 PASS, backend build PASS,
frontend build PASS, diff check PASS. No
schema/migration, deploy, real send or `****6787` mutation.

Campaign composition lifecycle is implemented locally and pending owner review:
unsaved form/CRM-preview/CSV/destination state has one dirty contract and one
complete discard reset. Re-entry starts pristine. Intentional drafts,
scheduled/sending/completed campaigns and execution history are outside this
cleanup boundary. CSV preview is read-only; CRM upserts happen only at explicit
draft creation and are not silently reversed. No schema/migration or deploy.

Campaign Result Truth canonical 12/13 corrective (2026-09-18): P1 VALIDATED
LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY. Production validation of
`Campanha teste set.2` disproved the earlier synthetic fixture: the seed held
the delivered recipient in 13-digit form while its historical outbound held
the 12-digit form. The projection now reuses the canonical CRM/Identity P1
candidate semantics and associates evidence without changing historical rows.
Actual production records replay to exactly two visible outcomes: delivered
`****6787`, blocked `****9614`, no pending or technical failure, `Entrega
parcial`. Tests: 118/118 + 56/56 + 72/72 PASS. Schema unchanged; no migration,
send, repair or deploy. Campaign Composer Cleanup remains deployed with its own
production validation pending.

Campaign flow integrity review (2026-09-21): IMPLEMENTED LOCAL / VALIDATED /
NO DEPLOY. Campaign CSV mapping is now `Contato`, `Campo 1`, `Campo 2`,
`Campo 3`; template variables can only source those generic fields and generic
fields do not mutate CRM name/status. Authenticated preview/report shows full
normalized WhatsApp identifiers and one table with ready, blocked and error
rows plus copy/export evidence. Campaign name uniqueness is tenant-scoped and
normalized by trim/case/whitespace. Draft reopen, send, schedule and scheduled
execution use persisted seed truth. Variable-template test-send resolves the
test target's own campaign values when present, or a deterministic eligible
sample from the same campaign seed for external test numbers, and stops before
provider/aggregate mutation when incomplete. CRM campaign relationship history
remains actual-send-only; draft, import, test-send and scheduled not-run records
stay excluded.

Campaign flow follow-up (2026-09-22): LOCAL FIX PREPARED / NOT DEPLOYED.
Campaign CSV mapping is expanded to required `Contato` plus optional
`Campo 1` through `Campo 10`; unmapped generic fields are not offered as
template-variable sources. CSV column mapping and message variable mapping are
separate UI groups, preview errors/blocks can be copied for report evidence,
and authenticated draft detail exposes full WhatsApp identifiers. Static CSV
draft seeds with complete per-recipient `componentsByWaId` and empty
`templateVariableMappings` are accepted for send/schedule without DB repair;
dynamic CRM-filter campaigns still require canonical template-variable
mappings.

Campaign execution truth + CRM UX follow-up (2026-09-22): LOCAL FIX PREPARED /
NOT DEPLOYED. Campaign CSV preview/draft/schedule/discard persists only the
campaign-owned private seed and components; Contact/Lead/CCI creation and CRM
situation mutation are deferred until an eligible recipient reaches real
campaign execution after preflight and an actual provider request, including
provider-returned `FAILED` attempts without new Conversation/RuntimeState.
Pre-provider blocks still do not materialize CRM. CRM-filter preview is
eligible-only, with blocked contacts hidden from the audience count and full
authenticated identifiers shown. Draft/discarded/never-sent campaigns remain
excluded from contact campaign history. Campaign result filters, CSV mapping
selects, reuse state restoration and Contacts CSV preview alignment were
hardened locally without schema, migration, provider call or real send.
Follow-up local de reuso de campanha, 2026-09-24: a previa reaproveitada de
audiencia CRM estatica deve atualizar `Situacao no CRM` e elegibilidade a partir
do read model CRM atual para os `leadIds` persistidos, sem ampliar a audiencia
por filtros nao persistidos. O filtro dinamico de CRM continua restauravel
quando `dynamicFilter.crmBusinessStatusId` existe no seed. Status: LOCAL FIX
PREPARED / NOT DEPLOYED.
Complemento local de validacao: opt-out/bloqueio posterior a campanha original,
posterior a previa ou posterior ao agendamento e revalidado antes do provider
por preflight de rascunho/envio ou pelo runner. O contato bloqueado nao recebe
novo Outbound, Conversation, RuntimeState, provider call nem historico de nova
participacao; audiencia mista preserva envio aos elegiveis e todos bloqueados
preserva zero-eligible. `Situacao no CRM` continua informativa, nao bloqueio.
Limitacao mantida: filtros estaticos historicos ausentes do seed nao sao
inferidos, e a hidratacao da UI usa leitura de detalhe por `leadId` selecionado.
Follow-up de revisao `be4f2d51`: a leitura por contato agora tem concorrencia
limitada, loading explicito antes da previa final e protecao completa contra
respostas obsoletas apos cancelamento/reset/outro reuso. Falha 404, auth/403 e
rede/consulta ficam inelegiveis com rotulos proprios; "Sem situacao" aparece
somente quando a consulta CRM atual foi bem-sucedida e o contato realmente nao
tem situacao cadastrada. Status: LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI
PENDING.
Validacao comportamental local concluida: helper de hidratacao 6/6 PASS,
contrato da pagina de campanhas 25/25 PASS e frontend build PASS; nenhuma
producao, provider real, envio real, schema ou migration.

Deploy de producao, 2026-09-24: head funcional
`1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` implantado por FF-only a partir de
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`, depois do backup PostgreSQL
persistente
`/opt/re7online/backups/converta-persistent/postgres/campaign-reuse-preview-1ea1fef-20260924T200821Z/20260924-200822.dump`
(`sha256=3d87e903c379e63e7ccd60ea3c0f583fd7ac3929a4f6f0d8e8965f1148f5124c`,
581 objetos). Build frontend PASS; reload somente de `re7-admin-front`; backend
agent e worker preservados. Health e rotas `/app/campaigns`, `/app/crm` e
`/app/inbox` PASS. Validacao visual autenticada do owner segue pendente.
Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.

Local campaign refinement, 2026-09-25: campaign reuse/detail remains
production-deployed at `1ea1fef...`, but a new local correction is prepared and
not deployed. It cleans the campaign detail layout, removes duplicated
composer-only variable mapping from detail, keeps real result-message status
conditional on actual evidence, accepts only a phone number for UI test-send
while preserving backend variable resolution/error contracts, and loads full
campaign detail before reuse mode selection when list payload lacks `draftSeed`.
Static historical filters still are not reconstructed if not persisted; the
draft recipient table does not fabricate current/historical provenance that the
API does not expose. Validation: campaign page/reuse contracts 32/32 PASS,
focused backend campaign routes 2/2 PASS, frontend/backend builds PASS.
Authenticated local browser smoke on desktop and narrow viewport PASS with
simulated providers and evidence in
`.codex/evidence/campaign-refinement-2026-09-25/`; owner UI validation and
production deploy remain pending. Status: LOCAL FIX PREPARED / NOT DEPLOYED /
OWNER UI PENDING.

Review follow-up `efbcc62`, 2026-09-25: local campaign reuse hardening now
starts the stale-response guard before the first detail fetch, preventing late
campaign A responses/errors from changing state after campaign B or cancel.
Draft copy is neutral unless readiness is actually validated. Campaign result
visibility uses structured `missing_individual_history` for seed placeholders
and treats `pricingBillable` as evidence only when boolean, so genuine failures
remain visible, draft/no-execution placeholders stay hidden and completed
missing-history rows appear as historical inconsistency instead of proven
provider failure. Validation so far: page/reuse contracts 32/32 PASS and focused backend campaign routes 3/3
PASS on local DB; frontend/backend builds PASS; authenticated local smoke on
frontend `3068` / backend `3067` PASS for neutral draft copy, hidden
draft/seed-only result section, reuse without silent manual fallback and bounded draft table.
Evidence: `.codex/evidence/campaign-review-efbcc62-2026-09-25/`. Status: LOCAL
FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING.

Production deploy, 2026-09-25: campaign refinement is now DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER UI PENDING at functional head
`d172b0e65a5237d835acd6ef5ece7ee50af5d241`, fast-forwarded from
`1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6`. Backup snapshot:
`/opt/re7online/backups/converta-persistent/snapshots/20260925T102510Z`
(`database.dump` sha256
`33003b892ae5b4f8d0228177017aa7c3c68707b910c36b7da6eb39affc070c13`,
22,330,663 bytes, 581 objects, checksum verified). Backend and frontend builds
passed; only `re7-whatsapp-agent` and `re7-admin-front` were reloaded. Worker
was preserved after checking the changed backend route/test files are outside
the worker compile graph. Health/db and basic campaign/CRM/Inbox routes passed.
Authenticated owner UI smoke for the detailed campaign/refinement cases was NOT
EXERCISED from the deploy shell. Validation caused no draft, schedule, test
send, campaign send, opt-out mutation, provider call, schema change or migration.

Local follow-up, 2026-09-25: owner confirmed the deployed visual refinements as
PASS and authorized campaign test-send to use a campaign recipient sample. The
UI still asks only for the destination number; backend resolution reuses current
seed/component/mapping and block-check mechanisms. A test number inside the
audience uses its own data. An external test number uses the first eligible
complete sample from the campaign in deterministic order and sends only to the
typed number. No valid sample or blocked test destination stops before provider.
The same local lot removes the duplicated draft-detail summary block
(`Solicitados`, `Aceitos`, `Bloqueados`, `Duplicados` and technical reason
chips) while preserving campaign main counters, recipient review, eligibility
and backend validation. Status: LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI
PENDING.

Follow-up on 2026-09-25: the backend now chooses campaign test-send sample data
after canonical draft readiness resolves CRM mappings. A typed test number that
belongs to the audience, including Brazilian 12/13 digit aliases, uses that
recipient's own current values; if the known recipient is incomplete, the test
blocks before provider instead of borrowing another recipient's values. External
test numbers may still use the first eligible complete sample, skipping
incomplete candidates deterministically. Focused local coverage passed for
static CRM audience, dynamic CRM filter, alias matching, exact test
destination, no provider call for incomplete known recipient, and preserved
draft campaign status. Status: LOCAL VALIDATED / NOT DEPLOYED / OWNER UI
PENDING.

Production deploy on 2026-09-25: this lot is now deployed at functional head
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` after persistent backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T130420Z`
(`database.dump`, 22,377,789 bytes, SHA256
`1ed097a1ded0c14c0e75dc97ba6af1ba3ccadf985080bc612ff3cd4db0df3bb5`,
581 manifest objects). Backend and frontend builds passed. PM2 reloaded only
`re7-whatsapp-agent` and `re7-admin-front`; `re7-whatsapp-web-worker` was
preserved. Health/db and `/app/campaigns`, `/app/crm`, `/app/inbox`,
`/app/login` route checks passed. Authenticated draft-detail UI smoke was NOT
EXERCISED from the deploy shell and remains OWNER UI PENDING. Validation did
not click test-send, create drafts, schedule, send, mutate opt-out or call a
real provider. Schema unchanged; no migration. Status:
DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.

Owner validation on 2026-09-25 confirmed PASS for the deployed test-send sample
and draft-detail cleanup lot at `aba600989eda77f6cb1258256f5aa0ba2f40ba03`.

Local campaign/settings follow-up on 2026-09-25: test-send destination
normalization now reuses the canonical CRM WhatsApp identity normalizer so a
valid Brazilian number with DDD and no `55` resolves to the same canonical
destination as the full form. Incomplete/ambiguous input blocks before provider
with a specific PT-BR message, while full international inputs, 12/13 aliases,
opt-out/exclusion and sample selection remain preserved. CRM settings now use
expandable administrative rows aligned with Departments, without changing CRM
rules or persistence; `Situação no CRM` remains distinct from active-send
blocking. Campaign light-theme select/options and manual-send label contrast
were corrected with theme-aware classes. Follow-up smoke diagnosed the previous
CRM load error as a local fixture issue: the process lacked the legacy
`.data/tenants.json` entry required by `/app/crm/settings`. A minimal ignored
local entry restored the supported smoke path; the endpoint returned 200 from
DB-backed CRM statuses and browser smoke validated mouse/keyboard expansion,
save persistence after reload, abandoning unsaved edits by reload,
desktop/narrow and light/dark. Focused backend coverage confirms BR national
number without `55`, full `55` form, international preservation,
incomplete/ambiguous rejection and alias opt-out blocking. Status:
LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.

Pre-deploy review correction on 2026-09-25: CRM/test-send normalization now
distinguishes DDD `55` from country code `55` using the canonical parser's
input length. National `55 99140-0002` and full `55 55 99140-0002` converge,
selected-recipient data is preserved, and opt-out/alias blocking applies to both
forms before provider. Focused tests and backend build passed. Status:
LOCAL VALIDATED / NOT DEPLOYED.

Focused ordinary-send audit on 2026-09-25 confirmed and extended the same
normalization contract to campaign CSV/import, CRM static/dynamic recipients,
campaign reuse and scheduled execution. Campaign runner inputs are normalized
before opt-out and provider dispatch, so national DDD `55`, another Brazilian
DDD and full `55` forms converge, destination duplication is avoided, and alias
opt-out/exclusion blocks before provider. CSV/import remains a typed-file
surface and rejects unsupported international input as controlled validation;
CRM/Inbox sends use stored conversation/contact identities instead of accepting
free-form phone entry. Provider calls were simulated only. Status:
LOCAL VALIDATED / NOT DEPLOYED.

Review follow-up on 2026-09-25: destination normalization in the campaign
runner now carries `componentsByWaId` through the original-to-canonical mapping.
National DDD `55` recipients keep their own variables after normalization to
full canonical form; national/full duplicate entries are sent once and do not
mix another recipient's data. Focused runner and route tests plus backend build
passed with providers mocked. Status: LOCAL VALIDATED / NOT DEPLOYED.

Production deploy, 2026-09-25: the phone-normalization, recipient-variable
preservation, CRM settings layout and campaign light-theme contrast lot is now
DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING at functional head
`5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`. Production moved FF-only from
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` after backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T161546Z`
(`database/database.dump`, 22,438,545 bytes, SHA256
`a7812cccd56a5f398ee7664aea44591b933997d74fc8199bc1a9ea6c2a5a2860`, 581
objects). Backend/frontend builds and `git diff --check` passed. Reload scope:
`re7-whatsapp-agent` and `re7-admin-front` only; worker preserved. Health and
page reachability for campaigns, CRM, Inbox, CRM settings and login passed, but
authenticated owner UI smoke was NOT EXERCISED from shell. No provider call,
real send, business-data mutation, schema change or migration occurred during
validation.

Owner validation, 2026-09-25: owner confirmed PASS for that deployed lot, so the
functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e` is now recorded as
DEPLOYED / OWNER VALIDATED / CLOSED for product purposes. This does not replace
formal CRA acceptance. Backup-retention permission cleanup remains an
operational follow-up, and the transient Prisma reload error recovered with
health/db OK.

Audience above 1,000 audit, 2026-09-25, published behavior before the local
batch backend: static CRM audience selection is preview-driven and paginated.
The UI requests `/app/campaigns/audience-preview`
with `limit=25`; "Criar rascunho com audiencia" persists only the eligible
Lead IDs in the current preview response, and backend draft creation rejects
more than 1,000 explicit selected Lead IDs. Dynamic CRM-filter scheduling stores
only the filter and resolves recipients at execution; the runner queries
`take: 1001` and fails with `dynamic_match_limit_exceeded` when current matches
exceed 1,000, before provider dispatch. No automatic batching exists. Product
map gap: add a clearer preflight/UX warning for the 1,000-recipient limit and
dynamic overflow behavior.

Campaign batches + tenant queue local update, 2026-09-26: BACKEND CORE + GROUP
UI INTEGRATED LOCALLY / FOCUSED VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
The local implementation adds durable batch/chunk/job/lease records and keeps
`Campaign` as the executable chunk. It enforces one campaign executor per tenant,
blocks test-send while tenant execution is active or uncertain, and preserves
accepted provider evidence when ownership is lost after provider return while
stopping before the next recipient. Local backend proof: `campaignExecutionQueue`
8/8 PASS, `campaignRunner` 10/10 PASS with CRM dynamic 3,001 -> one snapshot ->
four sequential chunks and CSV 3,001 -> four chunks with variables preserved and
post-plan block excluded, `campaignsFeatureRoutes` 125/125 PASS, backend build
PASS and `git diff --check` PASS. UI integration now adds the group summary to
Campaign detail with batch source, numbered chunks, aggregate and per-chunk
progress, queue state, requested/effective timing and operator-facing block
reasons. Focused post-UI validation: `campaignsPageContract.test.ts` 29/29
PASS, frontend build PASS, backend build PASS, `campaignsFeatureRoutes.test.ts`
125/125 PASS after the detail payload change and `git diff --check` PASS.
Authenticated local API smoke confirmed SUPERVISOR/ADMIN detail access to the
3,001-recipient/four-chunk fixture and AGENT 403. Chrome headless/CDP visual
smoke then confirmed Campaign detail rendering on desktop/narrow for the
	future-scheduled `batch-visual-20260926` fixture: group summary, four chunks,
	tenant queue copy and progress were visible to SUPERVISOR/ADMIN; AGENT direct
	access showed the restricted state without batch detail. Follow-up CDP smoke
	clicked aggregate pause/resume/cancel and confirmed local DB persistence:
	paused jobs=4, resumed queued jobs=4 and cancelled jobs/campaigns=4. Occupied
	test-send stayed at outbound delta 0 while tenant busy, but the UI toast click
	remains visually inconclusive because the controlled input did not update in
	the CDP script. Grouped CRM/CSV creation confirmation and UI-clicked occupied
	test-send toast remain visually NOT EXERCISED; owner validation, deploy and production
	migration rollout remain pending.

Contract divergence found during the 2026-09-26 batch UI closure: the production
baseline `5ee2de6...` already materializes Inbox `Conversation` and
`ConversationRuntimeState` for campaign outbounds on Meta `DELIVERED`/`READ`
webhook, without inbound activity. The local batch lot does not change that path,
but this must be reconciled before promoting batch campaigns if the canonical
principle remains that outbound campaign attempts alone are not operational
conversations.

CRM origin + full Contacts CSV + campaign block guards (2026-09-23): DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING. Production was
fast-forwarded to `2a652e693a4bce5cfaa7e0a1fa5ef667537f154a`;
backend/frontend builds and health passed, and only agent/admin-front were
reloaded. Contact origin remains event-derived and earliest reliable provenance
wins; inbound-created contacts/leads are classified as `Atendimento / conversa`.
Contacts CSV maps all editable CRM fields currently available in the
manual/contact surface while preserving blank/unmapped existing data. CRM
`NEW` is enforced as active system status and campaign-eligible by default; it
is not a send block by itself. Campaign and Inbox active-send blocks remain
before provider calls and now expose owner-friendly reasons; Campaigns/Inbox
remain free of billing notices in customer UX. No schema/migration, no smoke
provider call and no real campaign send. Authenticated owner UI and real
post-deploy CSV/campaign mutation evidence remain not exercised.

Zero-eligible campaign + CRM eligibility counts (2026-09-23): DEPLOYED /
PRODUCTION HEALTH VALIDATED / READ-ONLY DOMAIN VALIDATED / OWNER UI PENDING on
head `b8166b1cafea08f183646976a28b5649550729cd`. Manual immediate campaigns with every recipient
blocked before provider execution now return controlled
`no_eligible_recipients` before creating Campaign/Outbound/Runtime or making a
provider call. Mixed requests preserve campaign/block audit context and execute
only eligible recipients. Contact campaign history remains actual-send/provider
evidence only: pre-provider opt-out/active-send blocks are not listed as
contact campaign history, while real failed/delivered/read attempts remain.
CRM settings and campaign recipient preparation share the same eligible
audience projection, excluding anonymized, opt-out/active-send blocked,
operationally excluded and invalid-identity subjects from eligible counts.
Production read-only validation confirmed backend health/db OK, normal frontend
and backend builds PASS before reload, worker process preserved, Demo eligible
projection `totalEligible=4`, and pre-provider block evidence not leaking into
Contact campaign history.

P1 campaign delivery truth + alias-safe blocking (2026-09-23): LOCAL FIX
VALIDATED / NOT DEPLOYED. Campaign delivery semantics now distinguish provider
accepted/submitted from delivered/read truth. Outbound submission can create CRM
attempt evidence, but Inbox conversation/runtime materialization is gated by
Meta delivered/read webhook evidence. Campaign CSV import no longer guesses the
first column as phone when headers are arbitrary; the operator must map the phone
column unless a safe alias is detected. Opt-out/send-block evaluation is
alias-safe for Brazilian 12/13 digit identities. Meta reaction-only webhooks are
suppressed as non-content events. `Campaign.sentCount` remains a legacy
submitted/accepted counter and must not be read as delivered/read/final success
truth. Real `****6683` controlled repair was executed in production on
2026-09-24, deleting only false operational projections for campaign
`ad354ce4-35dc-4fca-85e5-3108cc9a2332`: runtime
`38012577-8dbb-43d5-8bdd-2ef8ba541038` and conversation
`9a07b043-6657-4dc3-9e7f-2b904caf939c`. Campaign, Outbound, Event,
billing/meta usage, Contact, Lead and CCI were preserved, including failed Meta
evidence `131026`.

Campaign RBAC/active-send authorization update on 2026-09-24 is DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER VALIDATED / CLOSED at functional production
head `b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`. The
audit found the Campaign nav item had `feature: "campaigns"` but no explicit
manager `minRole`; the local patch hides Campaigns from AGENT navigation,
denies direct `/app/campaigns` without loading protected campaign data, and
enforces SUPERVISOR/ADMIN centrally in app campaign APIs before body parsing,
mutation or provider execution. SUPERVISOR/ADMIN access remains layered with
tenant, session, feature and CRM capability gates. Campaign opt-out/revoke
endpoints were audited and preserved for CRM consumers. Local validation:
backend campaign feature suite 121/121 PASS on the dedicated local DB and
frontend campaign contract 24/24 PASS; isolated browser smoke on ports
`3039`/`3000` confirmed AGENT controlled denial with no protected campaign API
hydration and SUPERVISOR/ADMIN campaign loading; backend/frontend builds PASS.
The 2026-09-24 local complement added valid SUPERVISOR/ADMIN fixtures for CSV
preview/draft, CRM draft, manual immediate create, send, schedule, resume and
test-send with simulated provider calls; AGENT negatives still assert no
mutation and no provider call.
Regression mapping remained green: `campaignRunner.test.ts` 7/7,
`campaignRecipientImport.test.ts` 7/7 and `tenantConfig.test.ts` 3/3. No
schema/migration, real provider call or real send occurred in this RBAC deploy.
Production moved by FF-only from `957f19caced77693188a387bb7f7840a24092c67`
after backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-rbac-b1a528a-20260924T143728Z/20260924-143729.dump`
(sha256 `215049ecb9aafdb6bd1e209b5a2f414b0ef8b0247447ec5719207de039a9ef58`,
581 objects). Backend/frontend builds and health passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded and the worker was
preserved. Role-specific production smoke remains NOT EXERCISED because no
legitimate AGENT/SUPERVISOR/ADMIN sessions were available during automated
smoke. Owner later declared "validação passou"; that closes the RBAC front.

Next P2 remains Guided Builder BOT inactivity policy UX. Existing runtime uses
flow-level `inactivityPolicy.resetAfterMinutes` for next-inbound BOT reset and
`timeoutMinutes/action=HANDOFF` for background BOT-to-HUMAN/WAITING handoff
when destination/consent are valid. Current Guided UI preserves the field and
summarizes reset, but lacks explicit operator controls/copy for automatic
handoff. Smallest proposed implementation: add a lifecycle policy section in
Guided and final review using existing fields only; preserve Advanced JSON,
runtime, schema, provider behavior and HUMAN/WAITING manual control. CRA
business hours remain configured/validated and are not a pending implementation
item.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


### Guarda operacional e recuperação — implementação local 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. Guarda persistente fechada por padrão,
controle superadmin e drain durável integram as entradas de campanha e a fila
existente; suspensão administrativa preserva intenção, snapshot e aceites.
Pause/cancel em execução, RBAC e exclusividade preservados; Inbox outbound não
foi bloqueado. Worktree de recuperação separado em `5ee2de6b` com campanhas
permanentemente fechadas e Client privado, sem dependência das tabelas novas
para atendimento. [Resultados exatos e limites do ensaio](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local): execução 40/40, rotas 44/44 + caso final 1/1; guarda final 8/8;
atendimento antigo 4/4 sem fila e 5/5 com fila; retorno entre artefatos 1/1;
ambos builds backend PASS. Subconjuntos não são soma de casos únicos.

LOCAL IMPLEMENTED / TECHNICALLY VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Primeira instalação ainda exige acesso/inventário operacional, decisão sobre
interrupção da API antiga e reconciliação de chamadas sem observabilidade;
a guarda nova não fornece prova retroativa. Sem promessa de inbound/retries,
sem nova migration ou mudança de privilégios. Owner PASS anterior preservado,
aceite CRA pendente, Guided Builder pausado, 6683 CLOSED e DELIVERED/READ →
HUMAN/WAITING separados, sem mudança funcional desses contratos.


### Publicação dos artefatos de guarda e recuperação — 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Candidato em `review/campaign-recovery-20260926`
(parent `2b5697b6`, histórico funcional `2ecfc91a` preservado); recuperação separada
em `review/campaign-service-recovery-20260926`, commit `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`,
parent direto `5ee2de6b`, atendimento funcional com campanhas fechadas em código.
Guarda candidata exige host único declarado e identidade local compatível; não
coordena hosts nem substitui inventário. 11/11 testes da guarda e build candidato
PASS; demais resultados anteriores preservados no preflight único
`docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`; procedimento/configuração em
`docs/RUNBOOK_WHATSAPP_AGENT.md`, seção de publicação dos dois artefatos.
Backups e estado privado permanecem locais; branches excluídas de auto-deploy.
Primeira transição, acessos operacionais, janela/impacto, owner UI e CRA pendentes.
Sem quiescência retroativa. Histórico owner PASS preservado, 6683 CLOSED,
Guided Builder pausado e DELIVERED/READ → HUMAN/WAITING separado.


### Correções incrementais da guarda — 2026-09-26

Sobre 889a1c7c/e6a12bc9: consentimento opt-out/revoke preservado com política e
RBAC existentes nos dois artefatos; aceite conhecido alcança SQL apesar de
contenção/EIO do ledger. Pendência compartilhada .uncertain impede abertura,
novos envios e drain; recuperação permanece permanentemente fechada. Nenhum
retry cego ou limpeza de lock/tarefa por timeout. Se SQL e filesystem falham,
a resposta pode ficar só em memória: coordenação/durabilidade não são prometidas.
Resultados afetados: guarda 15/15, runner 11/11, rotas candidatas 5/5; recuperação
consentimento 1/1 e fechamento 2/2; CRM 4/4 em cada artefato; ambos builds PASS.
Detalhes sem duplicar relatório: preflight `docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`
e procedimento em `docs/RUNBOOK_WHATSAPP_AGENT.md` (seção de consentimento/aceite).
Histórico/evidências preservados. NOT DEPLOYED / OWNER UI PENDING; primeira
transição, owner UI/CRA e incertezas antigas pendentes. 6683 CLOSED; divergência
DELIVERED/READ → HUMAN/WAITING separada, sem quiescência retroativa.
