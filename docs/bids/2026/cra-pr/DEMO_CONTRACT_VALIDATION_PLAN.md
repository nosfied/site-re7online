# CRA-PR Demo Contract Validation Plan

Status: PHASE A COMPLETE / NO EXTERNAL SEND.

Last updated: 2026-09-15.

This document turns the CRA-PR contract matrix into a reusable multitenant
product acceptance baseline using `demo-converta` as a behavioral mirror. Demo
is not a CRA clone. No CRA contacts, recipients, tokens, WABA assets,
templates, users, business data, flow ownership or billing evidence may be
copied into Demo.

## Preflight Snapshot

- Canonical branch: detached checkout tracking `origin/flow-executor-quote-hardening`.
- Canonical head: `18fdb53ad704fcaa3ac453eae799d7ccf70f1315`.
- Origin head: `18fdb53ad704fcaa3ac453eae799d7ccf70f1315`.
- Production head: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`.
- Runtime-affecting head: production runtime remains on `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`; this phase made docs only.
- Production health: `ok=true`, `db=ok`.
- PM2/process snapshot: frontend `next start -p 3000`, backend on `:3001`,
  web worker running.
- Production migrations: 58 found, database schema up to date.
- Production database target, masked: `wa_agent@127.0.0.1:5432/whatsapp_agent`.

## Demo Snapshot

Read-only production snapshot on 2026-09-15:

- tenant: `demo-converta`, ACTIVE, profile `business`;
- features enabled: CRM, Inbox, chatbot, reports, support, training, campaigns,
  dashboard, templates, satisfaction, canned replies, webchat outbound and
  WhatsApp Web Session;
- features disabled: webchat and browser push notifications;
- users: 1 ADMIN active, 1 SUPERVISOR active, 5 AGENT active, 1 AGENT inactive;
- departments: 15 total, 10 active;
- queues: 19;
- chatbot flows: 4 total; active entrypoint is
  `CRA-PR - Atendimento Institucional (Demo)`;
- business-hours rows: 50;
- Meta Cloud: configured, business token present; phone/WABA/business IDs masked
  in operational notes;
- templates: 1 approved Utility, 1 failed Authentication, 2 failed Utility,
  2 rejected Marketing, 1 rejected Utility;
- template requests: failed/submitted/rejected history present;
- campaigns: 0;
- campaign billing/opt-out events: 0.

## Phase A Classification Summary

```text
TOTAL CRA REQUIREMENTS: 52
DEMO-VALIDATABLE: 36
ALREADY PRODUCT-VALIDATED: 19
VALIDATED IN THIS RUN: 8 read-only/environment capabilities
CRA-SPECIFIC ONLY: 12
CUSTOMER-DEFERRED: 4
PRODUCT GAPS: 1
REAL META OUTBOUND: NOT EXECUTED
CRA DATA USED IN DEMO: NO
```

`VALIDATED IN THIS RUN` means current Demo production state was read and found
usable as a Phase A mirror for the next gates. It does not mean contractual
acceptance evidence, delivered billing proof or CRA customer validation.

## Requirement Mapping

| REQ ID | Can Validate On Demo? | Why | Demo Test Method | CRA-Specific Validation Still Required? | Evidence Target |
| --- | --- | --- | --- | --- | --- |
| CRA-PLAT-001 | yes | SaaS/runtime health is multitenant | health, PM2/processes, app routes | acceptance artifact only | platform health record |
| CRA-WA-001 | yes | Demo has Meta Cloud configured | Meta readiness and template send gate | CRA official proof still required | Meta config/readiness evidence |
| CRA-META-001 | partial | technical operation generic; formal proof external | readiness/declarations | yes | signed Meta/API proof |
| CRA-CHAN-001 | partial | Inbox generic; non-WhatsApp channels deferred | WhatsApp/Demo Inbox only | yes for IG/FB/webchat | channel smoke package |
| CRA-WA-002 | yes | receive/reply/history generic | Demo WhatsApp cycle | CRA evidence pack still useful | redacted timeline/export |
| CRA-IG-001 | no | customer-deferred | none in this phase | yes | later channel validation |
| CRA-FB-001 | no | customer-deferred | none in this phase | yes | later channel validation |
| CRA-WEB-001 | no | customer-deferred | none in this phase | yes | later webchat validation |
| CRA-WEB-002 | no | customer site action | none in this phase | yes | embed/customer acceptance |
| CRA-CHAN-002 | partial | channel origin generic; multi-channel deferred | WhatsApp filters/reports | yes for other channels | report screenshots/export |
| CRA-HIST-001 | yes | timeline/history generic | Demo service cycle/export | CRA sample still useful | redacted history evidence |
| CRA-HUM-001 | yes | departments/queues/handoff generic | Demo department/queue/handoff | CRA config remains separate | handoff/queue evidence |
| CRA-HUM-002 | yes | status/SLA indicators generic | Demo report filters | CRA operational sample | report evidence |
| CRA-CHAT-001 | yes | flows and menus generic | Demo active flow/list/open | CRA flow evidence preserved | flow export/screenshot |
| CRA-CHAT-002 | yes | rendered menu options generic | Demo flow execution | CRA user acceptance | rendering evidence |
| CRA-CHAT-003 | partial | triggers depend configured flow | Demo trigger smoke if needed | source confirmation | trigger evidence |
| CRA-CHAT-004 | yes | automatic responses generic | Demo bot execution | CRA copy/hash separate | conversation evidence |
| CRA-CHAT-005 | yes | deterministic menu flow generic | Demo flow definition | no product gap | deterministic-flow note |
| CRA-CHAT-006 | yes | flow visibility fix is product-wide | Demo flow list/open | CRA already customer validated | app flow screenshot |
| CRA-HUM-003 | yes | human handoff generic | Demo handoff to queue | CRA handoff preserved | handoff event/runtime |
| CRA-HUM-004 | yes | claim/assign/transfer/close generic | Demo controlled service cycle | CRA transfer sample if required | service lifecycle export |
| CRA-PROT-001 | yes | protocol/continuation generic | Demo close/reentry | CRA sample redacted | protocol evidence |
| CRA-AUD-001 | yes | event/log/audit generic | Demo events/export | CRA package required | audit extract |
| CRA-CAMP-001 | yes | campaign engine is generic | Demo controlled campaign after owner gate | yes, CRA config/acceptance | campaign evidence |
| CRA-TPL-001 | yes | Demo has template lifecycle history and one approved Utility | inspect templates; submit only with approval | yes, CRA copy/template | template status evidence |
| CRA-TPL-002 | yes | request/review/submission pipeline generic | Demo template request lifecycle | yes, CRA approval | request/status evidence |
| CRA-TPL-003 | yes | category policy generic | Demo Utility-only route checks | yes, Meta category proof | category evidence |
| CRA-WA-003 | yes | active/template uses Meta Cloud | transport policy audit | CRA wording in acceptance | transport evidence |
| CRA-CAMP-002 | yes | import/CSV generic | Demo dry-run/import after gate | CRA list separate | import summary |
| CRA-CAMP-003 | yes | dedupe generic | Demo A repeated/B opt-out/C valid | CRA list separate | counts before/after |
| CRA-CAMP-004 | yes | variables generic | Demo safe variables | CRA template variables | preview/render evidence |
| CRA-CAMP-005 | yes | schedule/test/cancel/pause/resume exist and local lifecycle tests pass | Demo lifecycle test before send | CRA campaign acceptance | lifecycle matrix |
| CRA-CAMP-006 | yes | status history generic | Demo controlled send/webhook | CRA sample still needed | Meta status evidence |
| CRA-OPT-001 | yes | opt-out registry and campaign block generic | Demo opt-out E2E | CRA opt-out sample | pre-send block event |
| CRA-REP-001 | yes | exports generic | Demo report/export | CRA data sample | CSV/PDF/equivalent files |
| CRA-REP-002 | yes | monthly usage report generic | Demo usage report after send | CRA billing month | usage CSV |
| CRA-BILL-001 | yes | delivered Utility outside 24h billing generic | Demo controlled send + webhook replay | CRA invoice acceptance | billing ledger proof |
| CRA-SLA-001 | partial | health/runbooks generic; SLA period documentary | health/runbook evidence | yes | SLA evidence appendix |
| CRA-SUP-001 | partial | support process documentary | support docs | yes | support/ticket record |
| CRA-BKP-001 | partial | backup runbooks generic | backup/restore docs | yes | backup evidence |
| CRA-USER-001 | yes | users/RBAC/seat limit generic | Demo users/RBAC and prior Users 2.0 evidence | CRA snapshot preserved | users/RBAC evidence |
| CRA-USER-002 | yes | lifecycle guard generic | reuse deployed guard evidence; Demo safe smoke if needed | CRA operational timing | lifecycle evidence |
| CRA-LGPD-001 | yes | tenant isolation/RBAC generic | Demo scoping/export checks | signed CRA artifact | isolation evidence |
| CRA-LGPD-002 | partial | policy generic; CRA retention appendix required | docs/config audit | yes | retention appendix |
| CRA-GOV-001 | partial | support access controls generic; hardening watch remains | docs/audit evidence | yes | governance note |
| CRA-TRAIN-001 | no | attendance/customer action | none in Demo | yes | signed attendance |
| CRA-IMPL-001 | no | CRA implementation acceptance | none in Demo | yes | go-live checklist |
| CRA-VOL-001 | partial | scale generic; CRA volume not proven | non-destructive capacity evidence | yes | load/readiness evidence |
| CRA-VOL-002 | yes | active campaign mechanics generic | Demo controlled campaign and cost preview | yes | monthly limit report |
| CRA-META-002 | no | legal/asset transfer external | none in Demo | yes | ownership/transfer proof |
| CRA-NO-MKT-001 | yes | Utility-only policy generic | category allowlist and rejected Marketing history | CRA wording still required | policy evidence |
| CRA-INACT-001 | not required | HUMAN waiting-on-customer 1h auto-close is superseded and not a product requirement | none | no | keep BOT/FLOW P2 hardening notes |

## Phase A Findings

- Demo is suitable as a multitenant behavioral mirror for Utility/campaign,
  opt-out, reports, exports, billing mechanics, users/RBAC, departments/queues,
  flow management and tenant isolation.
- Demo already has one approved Utility template and template failure/rejection
  history, so Phase B does not necessarily require a new Meta template
  submission. If the owner chooses a new template, stop for exact-copy approval
  before submission.
- Demo has no campaign evidence yet. Campaign send, delivery webhook, billing
  event, opt-out E2E and exports remain open for later gated phases.
- No CRA data or assets were used.

## Phase B Owner Gate Preparation

Status: PREPARED / NO REAL SEND.

### Backlog Correction

The old HUMAN `WAITING_FOR_CUSTOMER 60m` / waiting-on-customer 1h
interpretation is **SUPERSEDED / NOT A PRODUCT REQUIREMENT**. Human
conversations may remain open indefinitely under attendant control. No automatic
60-minute human close is required for CRA.

The actual abandoned-automation front is BOT/FLOW lifecycle:

- `resetAfterMinutes` validated;
- stale pending question reset validated;
- inactivity handoff through Web Session path validated;
- residual cross-provider hardening remains P2;
- Guided lifecycle-policy exposure remains P2.

Corrected Phase B product gap count: 1. The remaining product gap is question
conditional branching by captured answer, not HUMAN 1h auto-close.

### Existing Demo Utility Template

Current approved Demo Utility template:

```text
name: data_exame
category: UTILITY
submittedCategory: UTILITY
language: pt_BR
status: approved
body: Paciente, seu exame foi marcado para {{1}}. Compareça com pelo menos 1 hora de antecedência.
variables: {{1}} = Data, example 21/03/2026
metaTemplateId: masked in production evidence
```

Suitability: **SUITABLE WITH DEMO TEST DATA ONLY**.

Reason: the template is approved, Utility, neutral enough for Demo/RE7
homologation and has one variable for variable-resolution evidence. It does not
impersonate CRA, but its health/exam wording should not be represented as CRA
customer copy. For a CRA-facing acceptance send, a CRA-approved Utility copy is
still required.

### Campaign Requirement Gate

| REQ ID | Requirement | Mandatory? | Demo Validation Method |
| --- | --- | --- | --- |
| CRA-CAMP-002 | recipient import CSV/XLSX/API | yes, CSV/XLSX or equivalent where allowed | CSV import/preview on Demo campaign draft; XLSX only if required beyond equivalent |
| CRA-CAMP-003 | segmentation/deduplication | yes | controlled list A, A duplicate, B opted out, C valid |
| CRA-CAMP-004 | variables/personalization/media/links | variables yes when template has placeholders; media only if the active template requires it | `data_exame` variable `{{1}}` with recipient-specific safe dates; missing variable must block |
| CRA-CAMP-005 | schedule/test/cancel/pause | yes for lifecycle controls, exact semantics must be evidenced | schedule future draft, test-send only if approved, cancel before send, pause/resume only where state allows |
| CRA-CAMP-006 | status/delivery history | yes | future controlled Meta send + webhook status capture |
| CRA-OPT-001 | opt-out block before campaign send | yes | include an opted-out Demo recipient and prove exclusion before Meta send |
| CRA-REP-001 | export CSV/XLSX/equivalent/PDF | yes; official clarification allows CSV/XLSX or equivalent open/widely used; PDF can be formatted report | export generated campaign/report evidence after send |
| CRA-REP-002 | monthly consumption report | yes | Meta usage/active-message report after controlled delivered Utility |
| CRA-BILL-001 | delivered Utility outside 24h only; read no duplicate | yes | controlled outside-24h recipient, delivered/read webhook and billing event idempotency |
| CRA-VOL-002 | 10,000 active Utility/month readiness | yes, capability/monitoring evidence | no volume send; validate controls and monthly report mechanics |

### Lifecycle Semantics

Scheduling: **IMPLEMENTED / NEEDS DEMO VALIDATION**.

- Draft can transition to `scheduled` with a future UTC instant.
- Past/invalid dates are rejected.
- The scheduler processes `scheduledAt <= now`, claims by status, changes to
  `sending`, clears `scheduledAt` and starts the campaign run.
- Scheduled campaigns can transition back to draft or to cancelled by lifecycle
  rules; direct edit semantics still need UI-level evidence.
- Restart safety is DB-backed through `Campaign.status=scheduled` and
  `scheduledAt`.

Pause: **IMPLEMENTED / NEEDS DEMO VALIDATION**.

- `sending -> paused` is allowed.
- Runner checks campaign status before each recipient and stops when it sees
  `paused`.
- `paused -> sending` resumes and starts a new campaign run from persisted seed.
- `scheduled -> paused` is not a valid transition; scheduled cancellation is the
  safe pre-start control.
- `completed/blocked/failed/cancelled` are terminal for pause/resume.

Cancel: **IMPLEMENTED / NEEDS DEMO VALIDATION**.

- `draft`, `scheduled`, `sending` and `paused` can transition to `cancelled`.
- Runner stops when it sees `cancelled`.
- Cancel clears `scheduledAt` in campaign service.

### Local Phase B Precheck Evidence

Safe local DB target: `postgresql://re7test:****@127.0.0.1:5432/re7_cra_contract_test2`.

Focused tests run on 2026-09-15:

```text
campaignRecipientImport.test.ts
campaignLifecycle.test.ts
activeMessageBilling.test.ts
metaUsagePreview.test.ts

13/13 PASS
```

Coverage:

- CSV import preview and persist without sending;
- normalization, invalid numbers and duplicate handling;
- opt-out exclusion before outbound;
- required variable mapping and missing-variable safe failure;
- lifecycle transitions and future scheduledAt normalization;
- delivered Utility outside 24h creates one active billing event;
- duplicate delivered/read replay does not double-bill;
- failed/inside-window/non-Utility/test-send are not billable;
- cost preview for one or multiple Utility recipients.

### Recipient Set

Prepared, not persisted and not sent:

- recipient count: 2 for the first controlled send;
- recipient type: owner-authorized Demo/RE7 test numbers only;
- CRA citizen/customer data: prohibited;
- variable values: Demo-safe future dates, one per recipient;
- 24h window: must be proven outside window from actual last inbound before
  send; do not manipulate timestamps.

### Contract Cost Preview

Commercial premise source:
`docs/bids/2026/cra-pr-90004-2026/proposta-comercial-premissas.md`.

Reference package:

- R$ 3.200,00/month central recommendation;
- 10,000 active messages/month estimated;
- derived central planning unit: R$ 0,32 per billable active Utility message.

Owner-gate example for 2 messages:

```text
2 x R$ 0,32 = R$ 0,64 central planning reference amount
```

Billing unit reconciliation update, 2026-09-15: `R$ 0,32` comes from the
internal central commercial premise `R$ 3.200,00 / 10.000 mensagens ativas`,
not from Meta, not from a persisted tenant billing override, and not from a
final submitted CRA commercial proposal found in this repository. The exact CRA
contract unit remains NOT PROVEN in the current evidence pack. Recipient B real
send is PAUSED FOR BILLING UNIT RECONCILIATION. This is a planning preview, not
a CRA invoice and not a Meta retail fee.

Meta pricing narrow gate, 2026-09-15: official WhatsApp Business Platform
Pricing / Meta Developers evidence proves the provider cost needed for the
controlled Demo Utility B gate: Brazil, Utility, BRL, effective 2026-07-01, tier
0-250,000, R$ 0,0350/message. CRA final contractual active-message unit remains
NOT PROVEN and separate; `R$ 0,32` remains planning only. Owner approved the
exact R$ 0,0350 provider-cost gate, but Recipient B is still NOT ATTEMPTED
because the later operational-default preflight stopped before Meta. Generic
Meta pricing source-of-truth implementation is P2 FinOps hardening, not the
current CRA execution front.

Recipient B owner-authorized send gate, 2026-09-15: owner approved B-only, one
Meta message max, but execution stopped before Meta. Preflight found
`demo-converta` has no active default operational `Atendimento Geral` +
`Fila Geral` pair; the existing `Atendimento Geral` is inactive and its
`Fila Geral` is therefore not a valid active default. The original campaign is
terminal `failed` and cannot be resumed (`failed -> sending` is invalid). Next
safe path is a separate owner-approved config-only repair of Demo operational
default, then a new controlled B-only campaign. Meta calls for B: 0.

Demo operational default owner gate, 2026-09-15: SUPERSEDED BY 2026-09-16 OWNER
DESTINATION CONFIGURATION. The read-only production audit
confirmed the canonical runtime mechanism is structural, not a
`TenantOperationalConfig.config.defaultDepartmentId/defaultQueueId` pointer:
`ensureDefaultOperationalDepartmentAndQueue` resolves an active department named
`Atendimento Geral` / slug `atendimento-geral` and its `Fila Geral`. Existing
Demo candidate `cmsiwk1o100014sdzl5cqd2ki` (`Atendimento Geral`) has existing
queue `cmsiyb2k200n94sdpu5khkee0` (`Fila Geral`) and an active member, but the
department is inactive. Proposed mutation, not executed: reactivate that
existing department only. No Meta send, no campaign retry and no CRA data/config
impact occurred in that 2026-09-15 gate.

Outbound return destination hardening, deployed 2026-09-16 at
`452d5826db42cc1b574eeff8fd8e0d038cd3491f`: next controlled Demo
campaign configuration must persist an explicit response destination in
`campaign.seed.saved`; the historical default operational pair is compatibility
fallback only. Human destination requires an active department with concrete
queue; automated destination requires any active same-tenant flow selected by
exact `flowId`. Status: CLOSED / DEPLOYED / OWNER APPROVED / PROD
NON-DESTRUCTIVE VALIDATED. This product delivery did not itself authorize a real
send; a separate owner-approved B-only controlled Utility send was executed and
validated later on 2026-09-16.

## Follow-up Backlog Reconciliation - 2026-09-16

The approved outbound return destination delivery is already closed/deployed
and must not absorb new requirements.

Current CRA order:

1. reports / exports / billing;
2. CRM import/upsert/report with `Situação no CRM`;
3. Contacts campaign relationship view;
4. acceptance package.

Campaign/CRM import/upsert/report enhancement:

- status: IMPLEMENTED / TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER
  REVALIDATION PENDING;
- uploaded audience/contact files may optionally contain `Situação no CRM`;
- when the column is absent, existing import behavior must be preserved;
- when populated, the value must resolve to an existing same-tenant CRM
  situation/status and persist the canonical internal id/reference;
- unknown values must appear as truthful preview/import validation issues;
- implementation must not use cross-tenant values, unsafe fuzzy matching or
  silent CRM status creation;
- if imported identity matches an existing CRM contact, update the canonical
  record and do not create another contact;
- valid imported name may update an existing contact according to current CRM
  semantics; blank name preserves the existing value;
- valid resolved `Situação no CRM` may update the existing situation reference;
  blank status preserves the existing value;
- repeated identities inside the file must not create duplicate contacts;
- after import, produce detailed downloadable operator evidence with totals and
  per-row safe result details;
- audit completed: CRM situation is `Lead.status`; status catalog is
  same-tenant `TenantOperationalConfig.config.crmBusinessStatuses`; import
  reuses existing CRM identity/upsert helpers; no schema/migration was required;
- CRA/customer production evidence is still pending approved data and a
  separate controlled production gate; local owner revalidation passed.
- audit history: initial implementation and owner PARTIAL PASS were followed by
  a 2026-09-17 principles audit blocked on four P1 findings; the corrective
  batch passed focused rollback, canonical hash identity, duplicate-order,
  capability and CSV safety tests; principles re-audit and owner revalidation
  then passed, canonical integration was prepared, and production reached
  `cad9489c` by FF-only with backend/frontend build, health, bundle markers,
  authorization gates and Demo read-only state checks passing. Authenticated
  production preview was not exercised because no safe current Demo password
  was available; no credential or role was changed. No real import/send was
  executed, so this is not CRA E4 import evidence and customer acceptance
  remains pending.
- residual P2: canonical preview matching is sequential per row and remains a
  later performance-hardening item; do not introduce a parallel matcher.

Marketing media templates:

- status: P2 / PRODUCT + META CAPABILITY;
- scope: MARKETING category, IMAGE/VIDEO headers, Meta media/example
  requirements, upload/handle lifecycle, preview, variables, supported buttons,
  submission, approval/rejection status and reason, approved-template send path
  and current official Marketing pricing source;
- not part of the current Utility controlled campaign;
- if CRA Contract/TR evidence explicitly requires Marketing media template
  support for current acceptance, stop for owner decision and promote the item
  out of P2.

Contacts campaign relationship view:

- status: CANONICALLY INTEGRATED / TEST VALIDATED / OWNER PASS / CLEAN DELIVERY PREPARED / PRODUCTION DEPLOY PENDING /
  CRA CAMPAIGN-CRM FOLLOW-UP;
- Contacts list shows compact campaign count, latest campaign/date/template and
  translated recipient status where applicable;
- contact detail shows recent campaign history and navigation to existing
  campaign detail;
- source remains existing campaign/outbound/event records; no Contact shadow
  campaign-history model, schema or migration;
- same-tenant only; focused regression covers cross-tenant leakage guard;
- avoid N+1 per contact row by using bounded aggregate/list projection and
  on-demand detail;
- customer UX does not show financial values;
- local validation: `crmCapabilityRoutes.test.ts` 19/19 PASS, backend build
  PASS, frontend build PASS, diff check PASS.

Contacts + Campaigns UX refinement, 2026-09-19:

- status: IMPLEMENTED LOCAL / OWNER PASS / NO DEPLOY;
- scope: UX only, no domain rewrite;
- Contacts rows open detail, actions are compact, authenticated same-tenant CRM
  shows full phone, duplicate summary fields are removed, active-send block uses
  a canonical opt-out switch and campaign history is grouped under one
  expandable section; Delete remains only on the Contact list row and does not
  appear inside Contact detail;
- Campaigns removes the top counter panel, adds tab counts, opens detail on row
  click, right-aligns actions, deduplicates detail counters and removes
  technical provider/persistence copy;
- Campaign detail adds filters by result status, same-tenant CRM Situation and
  name/phone, filtered copy and draft prefill from filtered current canonical
  contacts through the existing composer; rows without current reusable contact
  are excluded explicitly and no real send occurs;
- result truth, composer cleanup, operational queue, identity and opt-out
  contracts remain unchanged.
- Dynamic CRM-filter scheduled campaigns are a separate OWNER PASS / LOCAL
  VALIDATED / NOT DEPLOYED front; see
  `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`.
- Phone/import finishing, 2026-09-19: OWNER PASS / DEPLOYED / PRODUCTION
  NON-DESTRUCTIVE VALIDATED. Contact CSV preview/confirm reports totals and row-level errors;
  duplicate/stale preview requests are blocked; manual Contact, Contact CSV and
  Campaign CSV use the canonical CRM WhatsApp identity parser before
  persistence. Permanent invariant: NO NEW CONTACT/RECIPIENT PHONE MAY BE
  PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION. Contacts CSV now
  supports optional `Situação no CRM`, resolving only to existing same-tenant CRM
  statuses; invalid status rows are rejected and blank status preserves/defaults
  through canonical CRM upsert semantics.
- Contacts CSV complete UX/data-integrity addendum, 2026-09-20: OWNER PASS /
  LOCAL VALIDATED / NOT DEPLOYED. The Contacts CSV preview is valid only for the
  exact phone/name/CRM Situation column mapping that generated it. Mapping
  changes keep the stale preview visible, change the action to `Atualizar
  prévia`, disable import, and require refreshed preview before persistence.
  This closes the local owner UX gate without real send, provider call,
  schema/migration or CRA customer-data import.

Production deploy closeout on 2026-09-19: commit
`1f8304f8624e76ba3efc507b9eccd80060447adb` was deployed to Converta by
fast-forward only after verified PostgreSQL backup. Demo validation remained
non-destructive: Contact CSV preview and Campaign CSV preview validated phone
normalization/CRM-status rejection with zero Contact, Lead, Campaign or Outbound
mutation and no real send/provider call.

### Phase B Owner Gate Package

```text
DEMO TEMPLATE:
data_exame

CONTENT SUMMARY:
Paciente, seu exame foi marcado para {{1}}. Compareça com pelo menos 1 hora de antecedência.

RECIPIENT COUNT:
2 pending owner-authorized Demo/RE7 numbers

MESSAGE COUNT:
2

SEND WINDOW:
pending owner approval; choose a monitored business-hours window

24H STATUS:
pending proof immediately before send; selected recipients must be outside 24h

EXPECTED CONTRACT COST:
PAUSED FOR BILLING UNIT RECONCILIATION. Prior R$ 0,64 is only central planning
reference, not final CRA unit evidence.

OPT-OUT:
precheck locally PASS; Demo production opt-out exclusion evidence pending

REAL META OUTBOUND:
NOT EXECUTED
```

## Owner Gate For Phase B

Do not execute real Meta outbound until the owner explicitly approves:

- template to use: pending; recommended first check is whether the existing Demo
  approved Utility template is appropriate for neutral homologation;
- recipients: 2 to 5 owner-authorized RE7/Demo test numbers only;
- message count: pending, must equal approved recipient count;
- expected cost exposure: pending local preview, no invented Meta fee;
- send window: pending;
- evidence to collect: campaign id, template, masked recipients, Meta message id,
  accepted/delivered/read/failed status, 24h classification, billing event,
  opt-out block, report/export files.

## Phase C Controlled Utility Gate - 2026-09-15

Status: PREPARED / OWNER REAL-SEND APPROVAL PENDING / NO REAL SEND.

The owner authorized the two known Demo/RE7 test recipients by final digits
`9614` and `6787`. This authorizes recipient selection for the gate; it is not
recorded as approval for Meta outbound until the exact final send preview is
approved.

Current production read-back:

- canonical/origin docs head before this update: `759edcd20b0b4ed1e3187204a6bc76b1d874c74f`;
- production runtime head: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`;
- health: ok/db ok;
- migrations: 58 found, database schema up to date;
- Demo: ACTIVE/business, `campaigns=true`, `templates=true`;
- Demo Meta config: present;
- Demo Web Session: connected;
- campaigns before gate: 0;
- template `data_exame`: still `approved`, Utility, `pt_BR`, body and variable
  unchanged.

Recipient pre-send result:

- `****9614`: authorized, one canonical target, last inbound 2026-09-10 14:37Z,
  outside 24h, no active opt-out found.
- `****6787`: authorized, historical duplicate lead rows across provider
  history, deduped to one final normalized target, last inbound 2026-09-10
  13:39Z, outside 24h, no active opt-out found.
- final unique targets: 2.

Campaign preview:

```text
CAMPAIGN NAME:
Demo CRA Phase C - Utility data_exame - 2026-09-15

TEMPLATE:
data_exame

MESSAGE COUNT:
2

TRANSPORT:
META_CLOUD

EXPECTED CONTRACTUAL COST:
PAUSED FOR BILLING UNIT RECONCILIATION

REAL META OUTBOUND:
NOT EXECUTED
```

Stop reason: explicit owner approval for this exact send after the final preview
is still required by the real-send hard gate. Recheck 24h window and opt-out
immediately before any future send.

Evidence file:
`docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_CONTROLLED_UTILITY_GATE_2026-09-15.md`.

## Phase C Controlled Utility Send Result - 2026-09-15

Status: OWNER AUTHORIZED / PARTIAL REAL META ACCEPTANCE / PRODUCT ISSUE FOUND /
GENERIC FIX DEPLOYED / STOP.

Campaign id: `d9874c03-10e8-4061-a92e-6caa7b3001c3`.

The owner explicitly authorized exactly 2 `data_exame` Utility messages through
META_CLOUD to the two prepared Demo/RE7 recipients. Immediate pre-send recheck
passed: Demo active, Meta configured, template approved, both recipients outside
24h, no active opt-out, final unique recipients 2.

Actual execution:

- first recipient `****9614`: Meta Cloud accepted the template request and owner later confirmed real receipt;
- runner then failed with `default_operational_department_missing`;
- no OutboundMessage row was persisted for the accepted Meta send;
- no billing ledger row was created;
- second recipient `****6787` was not sent;
- campaign status became `failed`, `sentCount=0`, `blockedCount=0`.

Billing/report result:

- Meta technical status recovered after forensic audit: `sent` and `delivered`;
- read observed: 0;
- billable local ledger evidence: 0;
- contractual total evidenced: R$ 0,00;
- report/export validation: ISSUE, because the campaign has no persisted
  OutboundMessage/ledger rows.

Blocking finding: Demo has departments/queues, but no
`defaultDepartmentId/defaultQueueId` in `TenantOperationalConfig`. The campaign
runner did not block this before external Meta mutation and failed during
conversation bootstrap after the first Meta acceptance. Forensic audit proved a
generic ordering/idempotency bug: operational default bootstrap happened after
Meta send, and webhooks for the accepted message became orphan status evidence
because no local OutboundMessage existed. A local generic fix was implemented
and tested without tenant hardcode: operational default preflight before Meta
send, idempotent submit/provider-accepted events, reconciliation-required
retry stop, and `webhook.status.orphaned` evidence without synthetic billing.
The generic repair was deployed to production on 2026-09-15 via FF-only update
to `b8c8f616`, with persistent PostgreSQL backup, no migration, no db push and
reload only of `re7-whatsapp-agent`. Health/db and non-destructive bundle smoke
passed. No retry and no new real send were executed.

Evidence file:
`docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_CONTROLLED_UTILITY_RESULT_2026-09-15.md`.

Historical next required gate at that point: a fresh explicit owner send gate
before any controlled Meta send. `****9614` must not be resent; `****6787` was
still unattempted at that moment and was later sent only through the separate
B-only campaign approved on 2026-09-16. Manual reconciliation for A remains an
owner decision, not an automatic deploy action.
Read-only audit on 2026-09-15 produced an exact constrained repair proposal for
A only. The owner approved the repair, and production reconciliation was applied
after backup: one local outbound was created from the recovered Meta
id/webhooks, delivered Utility billing was recorded through existing idempotent
logic, `sentCount=1`, and campaign `status=failed` was preserved. A was never
resent. At that moment `****6787` still required a fresh owner gate; it was later
sent only through the separate B-only campaign approved on 2026-09-16.

Recipient B-only explicit human return destination gate, 2026-09-16:
READ-ONLY PRE-SEND GATE / SUPERSEDED BY FINAL DESTINATION CONFIGURATION /
NO REAL SEND.
Production evidence confirmed `demo-converta` active, `data_exame` approved
Utility `pt_BR`, current body `Paciente, seu exame foi marcado para {{1}}.
Compareça com pelo menos 1 hora de antecedência.`, one variable `{{1}}`, B
`****6787` authorized and normalized to one canonical target, no active opt-out,
outside 24h by 5 days 23h, no B `data_exame` outbound, and Meta provider rate
R$ 0.0350 if delivered. Destination inventory did not produce exactly one safe
generic human target: active `Setor Teste` has zero queues; inactive
`Atendimento Geral` has queues; remaining active queued departments are
thematic. No campaign draft was created and no provider call was made in that
read-only pass. This was superseded later on 2026-09-16 when the owner selected
the existing Demo `Atendimento Geral` + `Fila Geral` destination by explicit IDs.

Recipient B-only final destination configuration, 2026-09-16: FINAL SEND GATE
PREPARED / NO REAL SEND. Owner confirmed the existing Demo generic destination
for this campaign: `Atendimento Geral` (`cmsiwk1o100014sdzl5cqd2ki`) +
`Fila Geral` (`cmsiyb2k200n94sdpu5khkee0`). This is explicit tenant-scoped ID
routing, not a product dependency on the names. Read-back confirmed department
active, queue under the same Demo tenant/department, no active flow references,
no open conversations in that department, 3 memberships and normal business
hours Mon-Fri 08:00-17:00 with existing exception 2026-09-07. Backup:
`/opt/re7online/backups/demo-b-destination-gate-20260916/pre-demo-b-destination-gate-20260916T130703Z.dump`,
20M, 593 objects, SHA256
`0b4a2d4006ccfa1c9a589a5926f277edae64d8fa5924985045708d5b8102f50d`.
Campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214` (`Demo contrato CRA -
data_exame B-only - final 6787 - 2026-09-16`) was created as draft with
encrypted B-only seed, `returnDestination` = human department/queue above,
`totalRecipients=1`, `sentCount=0`, `blockedCount=0`, import summary PASS and
zero OutboundMessage rows. This prepared state was superseded by the
owner-approved controlled B send below.

Recipient B controlled Utility send, 2026-09-16: COMPLETED / DEMO PRODUCT
CAPABILITY VALIDATION / NOT CRA REAL CAMPAIGN. Owner authorized exactly one Meta
Utility send to B `****6787`. Pre-send checks passed: campaign draft
`bb1d30e2-3a98-471a-9531-1f5e5d76a214`, B-only, A excluded, `data_exame`
approved Utility `pt_BR`, no active opt-out, outside 24h by 143.72h, explicit
HUMAN return destination `Atendimento Geral` -> `Fila Geral`, and department
OPEN. Backup:
`/opt/re7online/backups/demo-b-controlled-send-20260916/pre-demo-b-controlled-send-20260916T132038Z.dump`,
20M, 593 objects, SHA256
`e73be155604ae0c7e7fe42b44dc87a1213755030cfa1c0d5d585f33e0319253a`.
Execution made exactly one Meta call. Meta accepted message
`wamid.HBgMNTU4NDk0Nzg2Nzg3FQIAERgUQ0UzOTE0Q0UyNUY0QjQ3OUZCQ0EA`; local
OutboundMessage `076910ef-ce6f-43d6-bfc2-2f30c4b41930` was persisted;
`submit_started` and `provider_accepted` markers are present; reconciliation
required is absent. Webhooks: sent=1, delivered=1, read=0, failed=0. Billing:
exactly one `billing.active_message.delivered`, duplicate billing NO. Campaign
ended `completed`, `sentCount=1`, `blockedCount=0`. A external sends in this
run: 0. Sanitized evidence:
`evidence/demo-contract-validation/PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md`
and `.csv`. Opt-out E2E was completed later on Demo; next front after opt-out is
reports/exports/billing.

Opt-out E2E preparation, 2026-09-16: READY FOR OWNER GATE / NO MUTATION / NO
REAL META SEND. Production/code audit confirmed canonical opt-out is event-based
in `Event` using `contact.opt_out.recorded` and `contact.opt_out.revoked`,
scoped by `clientId` + `waIdCanonical`; campaign block evidence uses
`campaign.recipient.opt_out_blocked`. Campaign runner filters opt-out before
return-destination preflight and before any Meta call. Manual active/template
sends and canned replies are also blocked for active opt-out in the current
implementation. Campaign export includes `opt_out` and non-billing reason
`opt_out`; CRM exposes `activeOptOut` and `templateSendBlockedReason=opt_out`.
`data_exame` remains approved; `atualizacao_protocolo` and
`lembrete_vencimento_anuidade` are Utility `PENDING` at Meta and are not needed
for this gate. Recommended future E2E recipient: B `****6787`; A `****9614`
must be preserved as historical reconciliation evidence. Future owner-approved
sequence: create canonical opt-out with source `controlled_demo_validation`,
run one blocked campaign for B, prove Meta calls 0/real messages 0, collect
export/report evidence, and revoke only if explicitly approved. Evidence:
`evidence/demo-contract-validation/PHASE_D_OPT_OUT_OWNER_GATE_PREPARATION_2026-09-16.md`.

Opt-out E2E execution, 2026-09-16: COMPLETED / DEMO PRODUCT CAPABILITY
VALIDATED / NOT CRA CUSTOMER SAMPLE. Owner authorized B `****6787` only.
Canonical opt-out event `88361d0f-89df-41fc-852b-ce84cbb43cc4`
(`contact.opt_out.recorded`) made B active opted-out. Controlled campaign
`d260bdc6-326f-4487-8d15-21c2a98dd741` used `data_exame`, targeted only B and
blocked before provider with `campaign.recipient.opt_out_blocked`
`80d6ca1d-94f2-4465-81b7-74888c1d0edc`. Actual campaign state:
`completed`, `totalRecipients=1`, `sentCount=0`, `blockedCount=1`. Meta calls,
real messages, OutboundMessage rows and billing events for this campaign are all
0. Canonical revoke event `a5b58132-79fe-49dd-8aff-49fb78bf4566`
(`contact.opt_out.revoked`) restored B eligibility and preserved history.
A `****9614` remained untouched. Evidence:
`evidence/demo-contract-validation/PHASE_D_OPT_OUT_E2E_2026-09-16.md` and
`.csv`.

Reports/exports/billing Phase E, 2026-09-16: COMPLETED FOR DEMO PRODUCT
CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. A docs/evidence-only audit reviewed
contract sources, code routes and production read-only evidence. Contract
sources allow CSV/XLSX or open-equivalent export and define billable active
message as Utility outside 24h effectively delivered; read status does not add
billing. Product support includes campaign CSV export, operational report CSV
exports, Meta usage CSV, receptive-session CSV and active-message billing
CSV/report. Demo evidence now covers A failed/reconciled with one delivered
billing event, B completed/delivered with one billing event, and opt-out blocked
with zero outbound/billing. Evidence:
`evidence/demo-contract-validation/PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md`
and `.csv`. Native XLSX is not claimed. CRA final contract BRL unit and CRA
customer package remain pending. Next front: CRM import/upsert/report with
optional `Situacao no CRM`.

### Guided Builder - Bot Inactivity Policy UX Backlog

New backlog item opened: **P2 / UX + PRODUCT CLARIFICATION / OPEN**.

Future Guided Builder must explain two independent bot inactivity policies in
business language:

- return reset: "Por quanto tempo a pessoa pode voltar e continuar de onde
  parou?", mapped internally to `resetAfterMinutes`;
- automatic human handoff: "Se a pessoa abandonar a automacao, deseja
  encaminha-la automaticamente para atendimento humano apos algum tempo?",
  mapped internally to `inactivityPolicy.timeoutMinutes` + `action=HANDOFF`.

This is not HUMAN auto-close, not `WAITING_FOR_CUSTOMER 60m` and not automatic
closure of human service. Those interpretations remain SUPERSEDED / NOT A
PRODUCT REQUIREMENT.

## Evidence Package

Path:

```text
docs/bids/2026/cra-pr/evidence/demo-contract-validation/
```

Phase A creates only the package index. Later phases must add sanitized evidence
by requirement group and must not commit secrets, raw tokens, private recipient
numbers or unnecessary personal data.

## Canonical identity delivery gate - 2026-09-17

Identity and Queue remain separate fronts. The no-schema identity correction
passed 119 focused tests and was deployed by FF-only to production HEAD
`ed329ec8` on 2026-09-17. Backend build, targeted agent reload, health/DB and
read-only module/route checks passed. Meta inbound/capture and campaign
bootstrap now reuse the canonical CRM resolver; a real post-deploy identity
event remains pending natural or separately authorized evidence.

Queue is IMPLEMENTED LOCAL / OWNER UX PASS / OWNER DECISIONS COMPLETE / FINAL
LOCAL CUTOVER PACKAGE PREPARED / NOT DEPLOYED. No name, creation order or usage
inference is allowed. Campaign UX is owner-approved and its Department-only
destination is locally implemented, but validation must not resume a real send
from this gate. The complete 54-department read-only matrix and the five final
owner decisions are recorded in
`docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md` and
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`. Production
migration/data reconciliation/deploy remain a separate controlled rollout. Real
Demo `****6787` was not mutated or repaired here.

## Campaign UX / result truth canonical integration - 2026-09-18

Status: INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY.

The recovered approved Campaign UX/result-truth delta is now integrated on the
canonical Operational Queue baseline. This is product readiness for owner visual
revalidation, not a new Demo/CRA send. The standard campaign return destination
is Department-only; Queue remains internal through
`Department.operationalQueueId`. The customer UX removes campaign/Inbox
template cost previews and financial columns, shows persisted lifecycle tabs
(`Enviando`, `Agendadas`, `Concluídas`), keeps the progress modal closeable
while backend execution continues, and exposes recipient-level persisted result
states/reasons.

Validation: UI contract 9/9 PASS, `campaignsFeatureRoutes.test.ts` 115/115
PASS on `re7_campaign_result_truth_test`, backend/frontend builds PASS and
`git diff --check` PASS. No production deploy, no real Meta send, no schema or
migration, and no `****6787` mutation.

Final result-detail correction: read-only evidence for `Campanha teste set.2`
with template `lembrete_vencimento_anuidade` showed one delivered provider
attempt for `****6787` and one import block for `****9614`. The extra visible
line came from projection plus seed fallback, not another send. Local detail
now reconciles those as two recipient outcomes, exposes the full phone only in
the authenticated detail and reports the mixed result as partial delivery.
The recipient itself was not omitted: `****9614` was blocked before provider
because two same-tenant canonical Contact candidates existed for one Lead.
Read-only comparison proved this graph existed at campaign execution and still
exists. It is residue from the former campaign bootstrap before Identity P1;
current creation paths did not reproduce a bypass. Without separately
authorized data repair, the same recipient remains blocked today. Expected
summary is total 2, delivered 1, blocked 1, pending 0 and technical failures 0.
Validation updated to UI contract 9/9, backend focused suite 115/115 and
identity-path matrix 106/106 PASS. No real send or production mutation.

## Campaign composer cleanup - 2026-09-18

Status: IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO DEPLOY.

The Demo/CRA campaign operator must be able to abandon unsaved CRM audience,
CSV or manual composition and start another campaign with pristine name,
template, variables, recipients, file/preview, destination and validation
state. Preview is read-only. Explicit draft creation is the persistence
boundary; schedule is available only after that boundary. Saved drafts and
scheduled/sending/completed campaigns survive navigation, and closing progress
does not cancel execution. No real send or production mutation was used for
this lifecycle validation.

## Campaign Result Truth P1 12/13 gate - 2026-09-18

Status: CORRECTIVE VALIDATED / OWNER REVIEW READY / NO DEPLOY.

The production validation gate discovered that the prior synthetic test did
not model a 13-digit campaign seed associated with a historical 12-digit
delivered outbound. The projection correction uses the established canonical
identity candidates and changes no persisted data. Sanitized exact-shape,
reverse-shape, multiple-attempt, real-fallback and cross-tenant regressions
pass. The actual Demo records were replayed read-only and project 2 rows:
`****6787` delivered and `****9614` blocked; totals are 2/1/1/0/0 and the label
is `Entrega parcial`. This is product evidence only, not a new Demo send or CRA
acceptance. Production validation after deployment remains pending.

## Campaign flow integrity review - 2026-09-21

Status: IMPLEMENTED LOCAL / VALIDATED / NO DEPLOY.

Demo/CRA campaign validation must treat Campaign CSV files through the generic
mapping model `Contato`, `Campo 1`, `Campo 2` and `Campo 3`. Template variables
come only from those generic fields; generic fields do not change CRM name or
CRM situation. Authenticated preview/report shows full normalized WhatsApp
identifiers, one table for ready/blocked/error rows and copy/export evidence.
Campaign names are unique within a tenant after normalized comparison. The
saved campaign seed is canonical for reopen, send, schedule and scheduled
execution. Variable-template test sends require explicit values when the test
number is outside the saved recipients and fail before provider calls if
incomplete. Contact campaign history is based only on actual send evidence, not
drafts, import seeds, test sends or scheduled-not-run campaigns.
