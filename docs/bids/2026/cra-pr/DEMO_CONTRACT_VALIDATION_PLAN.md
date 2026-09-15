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
PRODUCT GAPS: 2
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
| CRA-CAMP-005 | partial | schedule/test/cancel exist; pause semantics need exact evidence | Demo lifecycle test | CRA campaign acceptance | lifecycle matrix |
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
| CRA-INACT-001 | no | product/domain gap pending source confirmation | none | yes if source confirms | lifecycle-safe design |

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

## Evidence Package

Path:

```text
docs/bids/2026/cra-pr/evidence/demo-contract-validation/
```

Phase A creates only the package index. Later phases must add sanitized evidence
by requirement group and must not commit secrets, raw tokens, private recipient
numbers or unnecessary personal data.
