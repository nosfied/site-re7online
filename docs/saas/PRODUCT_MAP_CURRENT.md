# Product Map Current

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
| Satisfaction/NPS | Structural MVP, controlled rollout | `/app/satisfaction` | `SatisfactionQuestion`, `SatisfactionSurvey`, `SatisfactionResponse`, feature `satisfaction` | no automatic sending, chatbot/IA trigger, public form or reports yet |
| Dashboard | Available by profile/flag | `/app/dashboard` | feature-gated routes | `Client.features.dashboard` |
| Reports | Operational | `/app/reports` | report routes, `ConversationMetrics`, SLA/retention reads | feature flag, operational data |
| Departments/queues | Operational | `/app/departments`, admin | `Department`, `Queue` | feature flag, inbox assignment |
| Users/RBAC | Operational | `/app/users`, auth routes | `User`, `AppAuthSession`, `PasswordResetToken` | auth/session governance |
| Feature flags | Operational | app/admin | `Client.features`, `Client.profile` | backend/frontend defaults |
| LGPD/privacy | Operational | `/app/settings/privacy` | `RetentionConfig`, privacy retention service | retention job |
| Push/PWA notifications | Operational with platform limits | app shell/inbox | `PushSubscription`, `webPushService.ts`, service worker | browser permission/support |
| Demo/POC data | Internal/demo | scripts | `seed-demo.mjs`, `seed-re7-demo-screenshots.mjs` | local/demo only |
| Internal admin console | Operational | `/admin` | admin routes, tenant/channel/onboarding pages | `X-Admin-Token`, DB-backed `Client`, `TenantOperationalConfig`, legacy `tenants.json` fallback |

CRA-PR controlled campaign readiness, 2026-09-15: the product capability for
template request/review/submission, campaign drafts/import, lifecycle controls,
opt-out blocking, delivery status, Meta usage ledger and active-message billing
is present in the codebase. The readiness audit is closed, but contract
acceptance is open because CRA has no configured template, template request or
campaign in production yet, and no approved CRA Utility copy was found. The
current contract front is Utility/campaign acceptance, then opt-out, then
reports/exports/billing, then acceptance pack. No Meta template submission or
real send is authorized without approved customer copy and explicit owner
approval. Instagram Direct, Facebook Messenger and Website/Webchat remain
contract-required but customer-deferred with delivery window pending and are not
blockers for this phase.

CRA campaign follow-up reconciliation, 2026-09-16: the approved outbound return
destination delivery is CLOSED / DEPLOYED / OWNER APPROVED / PROD
NON-DESTRUCTIVE VALIDATED at `452d5826db42cc1b574eeff8fd8e0d038cd3491f`.
New requirement
CRM situation import/upsert/report is OPEN / NEXT CRA CAMPAIGN IMPORT FRONT.
It includes optional `Situação no CRM`, same-tenant deterministic status
resolution, existing contact update instead of duplication, blank-cell
preservation, no silent status creation, no duplicate contacts from repeated
input rows and mandatory detailed downloadable import evidence. Marketing
template media support is P2 product/Meta capability, covering MARKETING
category plus IMAGE/VIDEO headers and official Marketing pricing; it is
parallel to the Utility campaign front unless contract evidence promotes it.

Contacts campaign relationship view is OPEN / CRA CAMPAIGN-CRM FOLLOW-UP. It
should expose campaign count, last campaign/send/template, delivery/read/failure
state, opt-out/skipped/blocked context, CRM Situation and campaign/history
navigation inside Contacts without creating a Contact-owned campaign history.
Canonical source remains existing campaign/outbound/billing/opt-out records;
the implementation should use same-tenant aggregate/list projection and
on-demand expanded detail to avoid N+1 per contact row.

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
  remains the next gate.
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
