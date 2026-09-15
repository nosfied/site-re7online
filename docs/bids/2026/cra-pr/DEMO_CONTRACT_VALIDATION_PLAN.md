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
- derived planning unit: R$ 0,32 per billable active Utility message.

Owner-gate example for 2 messages:

```text
2 x R$ 0,32 = R$ 0,64 maximum contractual reference amount
```

This is a planning preview, not a CRA invoice and not a Meta retail fee.

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
R$ 0,64 reference maximum for 2 billable active Utility messages

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
R$ 0,64 reference total

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
LOCAL FIX TESTED / STOP.

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
No deploy and no new real send were executed.

Evidence file:
`docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_CONTROLLED_UTILITY_RESULT_2026-09-15.md`.

Next required gate: deploy/review of the generic repair plus a fresh explicit
owner send gate before any controlled Meta send. `****9614` must not be resent;
`****6787` remains unattempted.

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
