# CRA-PR Utility Campaign Acceptance Checklist

Status: LOCAL / CONTRACT ACCEPTANCE OPEN. The readiness audit is closed, but
contract acceptance still depends on approved CRA copy, Meta approval,
controlled recipient approval and evidence capture. This document does not
authorize real outbound traffic.

Last updated: 2026-09-15.

## Purpose

Prepare CRA-PR for the first controlled real WhatsApp Utility-template campaign
without sending a broad campaign and without bypassing Meta, tenant isolation,
opt-out, billing or owner approval gates.

## Current Production Snapshot

Read-only production snapshot on 2026-09-15:

- tenant: `cra-pr`, ACTIVE, profile `government`;
- features: `campaigns=true`, `templates=true`, `reports=true`,
  `protocols=true`, `satisfaction=true`;
- Meta/WhatsApp: `TenantMetaConfig` present, business token configured,
  phone `****7308`, WABA `****4194`, business `****8327`;
- templates: 0;
- template requests: 0;
- campaigns: 0;
- campaign-related Meta usage events: 0;
- active-message billing events: 0;
- opt-out campaign events: 0;
- outbound records exist for CRA operational history, but not as controlled
  Utility campaign acceptance evidence.

## Hard Gate

No real Meta outbound may be sent until the owner explicitly approves all of:

- template name and language;
- final Utility template text and variables;
- recipient list;
- send window;
- expected cost exposure;
- campaign name;
- exact number of messages.

If any item is missing, the correct status is `WAITING OWNER APPROVAL` and the
campaign must remain unsent.

## Current CRA Order - 2026-09-16

1. Recipient B controlled Utility validation - DONE on Demo.
2. Opt-out E2E - DONE on Demo.
3. Reports / exports / billing - DONE on Demo product evidence; CRA package
   still pending.
4. CRM import/upsert/report with `Situação no CRM` - production
   non-destructive validated; real CRA import not executed.
5. Contacts campaign relationship view - CANONICALLY INTEGRATED / TEST VALIDATED
   / OWNER PASS / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.
6. Acceptance package.

Approved outbound return destination is CLOSED / DEPLOYED / OWNER APPROVED /
PROD NON-DESTRUCTIVE VALIDATED at
`452d5826db42cc1b574eeff8fd8e0d038cd3491f`.

The CRM situation import/upsert/report front and Marketing media template
support must not be mixed into the current approved outbound return destination
delivery. Marketing media templates are P2 unless contract evidence promotes
them by owner decision.

## Controlled Campaign Contract

| Area | Required Result | Current Status |
| --- | --- | --- |
| Utility template | Approved Meta template for CRA | PENDING META/CONFIG |
| Template category | Utility only; no marketing | REQUIRED |
| Recipient source | Sanitized and approved list | WAITING OWNER/CRA |
| Import validation | Normalize phones, dedupe, reject invalid/provisional/excluded/opt-out contacts | PRODUCT SUPPORTED / NEEDS CRA RUN |
| CRM situation import/upsert/report | Optional `Situação no CRM`; existing contact updates instead of duplicate; blank fields preserve data; detailed formula-safe report CSV exposed after atomic per-row import | IMPLEMENTED / TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED; REAL IMPORT NOT EXECUTED |
| Variables | Required placeholders mapped per recipient or blocked | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Draft | Campaign can be created without sending | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Response destination | New campaign draft/import requires explicit response destination: human department with concrete queue, or active principal automated flow | IMPLEMENTED LOCALLY / NEEDS CRA RUN |
| Test send | Formal test-send excluded from contractual active-message billing | TESTED LOCALLY |
| Schedule/send | Explicit operator action only | PRODUCT SUPPORTED / NEEDS OWNER APPROVAL |
| Pause/resume/cancel | Supported by campaign lifecycle and app API | TESTED LOCALLY FOR LIFECYCLE |
| Opt-out | Active opt-out blocks campaign recipient and records event | DEMO VALIDATED / CRA ACCEPTANCE STILL NEEDED |
| Delivery status | Meta webhook updates status/history | PRODUCT SUPPORTED / NEEDS CRA SAMPLE |
| Contacts campaign relationship | Contacts/CRM shows campaign count, latest campaign/status and recent same-tenant campaign history from canonical campaign/outbound/event evidence; no Contact shadow history and no financial UX | CANONICALLY INTEGRATED / TEST VALIDATED / OWNER PASS / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED |
| Billing | Delivered/read Utility campaign outside 24h creates one billable event; read replay does not bill again | TESTED LOCALLY |
| Reports/export | CSV/monthly evidence available; PDF/equivalent acceptance pack still required | DEMO VALIDATED / CRA ACCEPTANCE STILL NEEDED |

## Template Pipeline Map

Audited on 2026-09-15 against the current canonical checkout.

1. Tenant user creates a template request in `/app/templates`; backend route
   `/app/templates/request` validates content, language, variables, category
   policy and duplicate/open request conflicts.
2. Internal/admin review happens through `/admin/templates/requests`, with edit,
   approve, reject/cancel and audit events.
3. Meta submission is admin-only through
   `/admin/templates/requests/:id/submit`; it resolves tenant Meta credentials,
   validates local template format and stores safe provider diagnostics only.
4. Status follow-up uses template sync routes and provider status normalization.
5. Approved, locally enabled Utility templates become eligible for campaign
   draft/import and send paths.
6. Campaign CSV preview/import validates phone normalization, duplicates,
   existing campaign seed, missing variables, provisional/excluded contacts and
   active opt-out before a draft can be sent.
7. Send/test-send/schedule/resume paths re-check template availability, category
   policy, recipient eligibility and usage controls before Meta outbound.
8. New campaign configuration persists the response destination explicitly in
   the campaign seed. Human destination requires concrete department/queue;
   automated destination requires any active same-tenant flow selected by exact
   `flowId`. `entryPoint` remains only the default for unqualified/new inbound.
   Legacy default operational fallback is compatibility only, not the new
   configuration contract.
9. Evidence surfaces are active-message billing report/CSV, Meta usage
   summary/report/CSV, campaign export and event ledger records.

## CRA Template Configuration Plan

No approved CRA customer copy was found in the repository or production snapshot.
Do not invent final copy. Prepare a fillable Utility template request only after
CRA/owner supplies:

- template purpose and official wording;
- template name slug and language, expected `pt_BR`;
- variables and example values for each placeholder;
- intended recipient group and exact controlled count;
- confirmation that the message is Utility/institutional, not Marketing;
- approval of the expected send window and cost exposure.

The first controlled template should remain department/institutional and avoid
promotional wording. Any media/link attachment must be reviewed against Meta
policy before submission.

Marketing templates with IMAGE/VIDEO headers are not part of this Utility
acceptance checklist. They require a separate P2 product/Meta audit covering
Marketing category, media examples/handles, preview, variables, buttons where
supported, approval/rejection status/reason, send path and official Marketing
pricing source.

## Controlled Recipient Plan

Use only 2 to 5 owner-authorized recipients:

- RE7 internal test numbers explicitly approved for this CRA acceptance smoke;
  or
- CRA internal numbers explicitly approved by CRA/owner for the test.

The list must be stored only as operational test input, masked in reports, and
must not be expanded into a broad campaign. The selected recipient should have
no open 24h service window when the billing smoke is intended to prove active
Utility billing; verify `lastInboundAt` is null or older than 24h before the real
send.

## Pre-Send Gates

- Approved CRA copy: pending.
- Meta template approval: pending.
- Recipient list approval: pending.
- Opt-out precheck: required through preview/import and active opt-out registry.
- 24h window precheck: required per recipient before real send; avoid using a
  recent inbound/open service window for billing evidence.
- Cost preview: required with template category, eligible count, blocked count,
  window classification and current local rate-card assumptions. Do not invent
  Meta fees; local preview is operational evidence, not Meta invoice.
- Owner approval: required for template, recipients, window, campaign name,
  expected cost exposure and exact number of messages.

## Evidence Capture Plan

Capture and redact:

- campaign id and template id/name/category/language;
- masked recipient list and eligibility/blocked summary;
- opt-out block event, when applicable;
- send timestamp, provider message id and Meta status history;
- accepted/sent/delivered/read/failed/rejected counts;
- 24h window classification used for billing;
- active-message billing event reference, if delivered/read outside 24h;
- monthly active-message report/CSV and Meta usage report/CSV;
- final acceptance note tying evidence to the contract item.

Phase E reports/exports/billing evidence, 2026-09-16: Demo product capability is
validated by existing evidence and production read-only checks. A remains a
truthful failed/reconciled campaign with one billing event; B is a completed
delivered campaign with one billing event; opt-out is a completed blocked
campaign with zero outbound/billing. CSV/open-equivalent evidence is documented
in `PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md` and `.csv`. Native XLSX is
not claimed and CRA final BRL contract unit remains pending.

## Required Evidence Sequence

1. Create or request the CRA Utility template.
2. Wait for Meta approval and record category/language/name.
3. Prepare a small recipient list approved by owner/CRA.
4. Preview/import recipients and resolve invalid, duplicate, opt-out,
   excluded or missing-variable rows before send.
5. Create draft only.
6. Execute test-send only if approved.
7. Obtain explicit owner approval for the real controlled send.
8. Send only the approved number of messages in the approved window.
9. Capture delivered/read/failed status, opt-out blocks and campaign export.
10. Capture monthly billing/usage report and acceptance evidence.

## Deferred Channels

Instagram Direct, Facebook Messenger and Website/Webchat are contract-required,
but customer-deferred for this phase. They must not be treated as active
blockers for the Utility campaign front, and must be reopened only when CRA
confirms assets, site access and delivery window.

## Current Classification

```text
CRA-PR UTILITY CAMPAIGN:
LOCAL / CONTRACT ACCEPTANCE OPEN

UTILITY READINESS AUDIT:
CLOSED

REAL SEND:
NOT EXECUTED

OWNER APPROVAL FOR REAL SEND:
REQUIRED

TEMPLATE:
PENDING

CRA APPROVED COPY:
NOT FOUND / CUSTOMER INPUT REQUIRED

RECIPIENT COUNT:
0 APPROVED FOR REAL SEND
```

## Local Test Gate - 2026-09-15

Safe local database target used for DB-backed validation:
`postgresql://re7test:****@127.0.0.1:5432/re7_cra_contract_test2`.
Production database was not used.

- Prisma migrations: 58/58 applied to the local test database.
- Focused DB-backed campaign tests:
  `campaignRecipientImport.test.ts` and `campaignRunner.test.ts` passed 5/5.
- Billing/preview/lifecycle unit tests passed 5/5.
- Broader `campaignsFeatureRoutes.test.ts` passed 111/112; the remaining
  timeout is `meta inbound clears active chatbot runtime when persisted flow is
  inactive`, unrelated to the Utility template/campaign acceptance path and not
  a reason to send a real campaign.

## Demo Phase A Mirror - 2026-09-15

`demo-converta` has one approved Utility template and Meta Cloud configured, so
it is eligible for the next owner-gated homologation phase without copying CRA
assets. It has zero campaigns and zero campaign billing/opt-out evidence at the
Phase A snapshot.

Phase B must stop for owner approval before using an existing Demo template or
submitting any new Demo template. Phase C real outbound may use only 2 to 5
explicitly authorized Demo/RE7 recipients. No CRA recipient, token, template,
WABA asset or business data may be used.

## Demo Phase C Incident / Repair Gate - 2026-09-15

Controlled Demo send `d9874c03-10e8-4061-a92e-6caa7b3001c3` remains failed and
must not be retried automatically.

- Recipient `****9614`: Meta accepted the `data_exame` Utility template, owner
  confirmed real receipt, and forensic audit recovered the Meta message id plus
  `sent` and `delivered` webhook events. Local OutboundMessage/ledger/report
  rows are still missing and must not be invented.
- Recipient `****6787`: not attempted and not safe to send without a fresh
  owner gate.
- Root cause: campaign runner validated mandatory operational default
  department/queue only after external Meta mutation.
- Generic repair: pre-send operational default validation, deterministic
  submit/provider-accepted idempotency events, reconciliation-required retry
  stop, and orphan webhook status evidence without synthetic billing.
- Validation: `campaignRunner.test.ts` 5/5 PASS,
  `campaignsFeatureRoutes.test.ts` 113/113 PASS, billing 4/4 PASS, preview
  4/4 PASS, backend build PASS, production non-destructive smoke PASS.
- Production delivery: deployed on 2026-09-15 at `b8c8f616` by FF-only update,
  no migration, no db push, reload only `re7-whatsapp-agent`.
- Recipient A reconciliation audit: RECONCILED / NEVER RESENT after explicit
  owner approval and fresh backup. Production has exactly one local outbound for
  A, one idempotent delivered Utility billing event, `sentCount=1`, campaign
  `status=failed`, and one manual audit event.

Acceptance remains open until a new explicit owner send gate authorizes any
remaining real outbound and valid campaign persistence/report/billing evidence
is captured.

## Demo Phase B Owner Gate - 2026-09-15

No real send was executed.

Existing approved Demo Utility template:

```text
name: data_exame
language: pt_BR
status: approved
body: Paciente, seu exame foi marcado para {{1}}. Compareça com pelo menos 1 hora de antecedência.
variable: {{1}} Data, example 21/03/2026
```

Suitability: suitable for Demo/RE7 controlled homologation with test data only.
It must not be treated as CRA customer copy.

Pre-send local gate:

- import/dedupe/variables/opt-out/lifecycle/billing tests: 13/13 PASS;
- scheduling: implemented, needs Demo evidence;
- pause: implemented for running campaigns, needs Demo evidence;
- cancel: implemented for draft/scheduled/sending/paused, needs Demo evidence;
- expected reference cost for first 2-message controlled send:
  PAUSED. Previous `2 x R$ 0,32 = R$ 0,64` is only a central planning
  reference from `R$ 3.200,00 / 10.000 mensagens ativas`, not a proven final
  CRA contract unit.

Owner approval was granted for B-only after the provider-cost gate, but the
send remains NOT ATTEMPTED because the immediate operational-default preflight
stopped before Meta.

Meta pricing narrow gate, 2026-09-15: do not use `meta-br-planning`, USD 0.008,
R$ 0,32 or any planning spreadsheet as official Meta tariff. Official WhatsApp
Business Platform Pricing / Meta Developers evidence proves Brazil Utility BRL
R$ 0,0350/message, effective 2026-07-01, tier 0-250,000. CRA contract unit
semantics remain separate and NOT PROVEN.

Recipient B owner-authorized send gate, 2026-09-15: STOPPED BEFORE META.
Preflight PASS for template, authorization, outside-24h, opt-out and A no-resend
risk, but ISSUE for operational default. `demo-converta` has `Atendimento Geral`
inactive and no active default operational `Atendimento Geral` + `Fila Geral`
pair. No Meta call was made for B.

Recipient B-only explicit human return gate, 2026-09-16: STOPPED BEFORE CAMPAIGN
CREATE / SUPERSEDED BY FINAL DESTINATION CONFIGURATION / NO REAL SEND. The B-only pre-send
checks remain PASS for template, authorization, canonical dedupe, outside-24h,
opt-out and A exclusion. Human return destination cannot be persisted yet:
`Setor Teste` is active but has zero queues; `Atendimento Geral` has queues but
is inactive; remaining active queued departments are thematic, so selecting one
would be arbitrary. No campaign draft was created and no provider call was made
in that read-only pass; the later 2026-09-16 final owner gate selected the Demo
generic destination explicitly by IDs.

Recipient B-only final owner send gate, 2026-09-16: PREPARED / NO REAL SEND.
Owner explicitly selected the existing Demo generic destination `Atendimento
Geral` (`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
(`cmsiyb2k200n94sdpu5khkee0`) for this campaign. This is persisted by IDs and
does not reintroduce name-based routing. Campaign
`bb1d30e2-3a98-471a-9531-1f5e5d76a214` is draft, B-only, template
`data_exame`, return type HUMAN, totalRecipients=1, sentCount=0,
blockedCount=0, opt-out PASS, outside 24h PASS, official Meta provider rate
R$ 0.0350 if delivered, CRA contract price NOT PROVEN. This prepared state was
superseded by the owner-approved controlled B send below.

Recipient B controlled Utility send, 2026-09-16: COMPLETED / DEMO PRODUCT
CAPABILITY VALIDATION. Requested=1, Meta calls=1, accepted=YES, delivered=YES,
read=NO, failed=NO. Campaign
`bb1d30e2-3a98-471a-9531-1f5e5d76a214` ended `completed`, `sentCount=1`,
`blockedCount=0`. Local OutboundMessage exists, provider accepted marker exists,
reconciliation required is absent, return destination persisted, billing event
count is 1 and duplicate billing is NO. Sanitized CSV evidence was created.
This validates Demo product capability only; CRA real campaign acceptance and
CRA contract unit remain separate.

Opt-out E2E preparation, 2026-09-16: READY FOR OWNER GATE / NO MUTATION / NO
REAL META SEND. Audit confirmed canonical event-sourced opt-out in `Event`,
campaign guard before Meta, manual active/template guard, canned reply guard,
CSV/export `opt_out`, tenant isolation and reversal path. `data_exame` remains
approved; new Utility templates `atualizacao_protocolo` and
`lembrete_vencimento_anuidade` are `PENDING` at Meta and are not required for
the opt-out gate. Recommended recipient is B `****6787`; A `****9614` should not
be mutated because it is the historical reconciliation case. Future expected
E2E: create canonical opt-out, run one blocked campaign, Meta calls 0, real
messages 0, capture `campaign.recipient.opt_out_blocked` and export evidence,
then revoke only if explicitly approved.

Opt-out E2E execution, 2026-09-16: COMPLETED / DEMO PRODUCT CAPABILITY
VALIDATED. B `****6787` was opted out through canonical service, campaign
`d260bdc6-326f-4487-8d15-21c2a98dd741` blocked before Meta with
`blockedCount=1`, `sentCount=0`, Meta calls=0, real messages=0,
OutboundMessage=0 and billing=0, then B was restored eligible through canonical
reversal. A `****9614` was not touched. Evidence files:
`PHASE_D_OPT_OUT_E2E_2026-09-16.md` and `.csv`.

Demo operational default proposal, 2026-09-15: SUPERSEDED BY 2026-09-16 OWNER
DESTINATION CONFIGURATION. The
valid existing candidate is `Atendimento Geral`
(`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
(`cmsiyb2k200n94sdpu5khkee0`); queue exists under the same Demo tenant, but the
department is inactive. Proposed fix is config-only reactivation of that existing
department, with owner approval required before mutation. The later owner gate
selected and validated this existing destination by explicit IDs; B still
remains NOT ATTEMPTED until final send approval.

## Demo Phase C Controlled Utility Gate - 2026-09-15

No real send executed.

- Authorized recipient finals: `9614` and `6787`.
- Full numbers are not recorded in this checklist.
- Template read-back: `data_exame`, Utility, `pt_BR`, `approved`, one `{{1}}`
  Data variable.
- Final unique recipients: 2 after normalization/dedupe.
- 24h precheck: both outside 24h based on last inbound from 2026-09-10.
- Opt-out precheck: PASS, no active opt-out event found for the two masked
  targets.
- Transport: `META_CLOUD`.
- Expected reference cost: PAUSED FOR BILLING UNIT RECONCILIATION.
- Owner real-send approval: PENDING for this exact send preview and billing
  unit.
- Real Meta outbound: NOT EXECUTED.

Before any real send, re-run 24h and opt-out checks and capture owner approval
for template, recipients, message count, window, campaign name and expected
cost.

## Demo Phase C Controlled Utility Send Result - 2026-09-15

Real send was attempted under explicit owner authorization, but did not complete
the 2-message scope.

- Campaign: `d9874c03-10e8-4061-a92e-6caa7b3001c3`.
- Requested: 2.
- Attempted against Meta: 1.
- Accepted by Meta: 1, recipient `****9614`.
- Not attempted: 1, recipient `****6787`.
- Runner failure: `default_operational_department_missing`.
- Campaign DB status: `failed`, `sentCount=0`, `blockedCount=0`.
- Persisted OutboundMessage rows for campaign: 0.
- Billing ledger rows for campaign: 0.
- Delivered/read observed: 0.
- Contractual billable evidence: 0, R$ 0,00.
- Report/export evidence: ISSUE, blocked by missing persisted outbound/ledger.

Stop condition: no retry, no replacement recipient and no configuration/code
repair in this phase. Separate owner gate is required.

## Campaign UX / Result Truth Integration - 2026-09-18

Status: INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY.

- Standard campaign destination remains Department-only; Queue is internal via
  `Department.operationalQueueId`.
- Campaign and Inbox template customer UX must not show price, cost, tariff,
  Meta rate or estimated financial totals.
- Lifecycle tabs are persisted-state based: `Enviando`, `Agendadas`,
  `Concluídas`.
- Progress/detail modal can be closed without cancelling backend execution.
- Recipient-level detail must show persisted blocked/skipped/pending/opt-out
  states and business-readable reasons when available.
- Validation completed: UI contract 6/6 PASS, `campaignsFeatureRoutes.test.ts`
  114/114 PASS, backend/frontend builds PASS, `git diff --check` PASS.
- No real Meta send, no production deploy, no schema/migration and no
  `****6787` repair/mutation occurred.
