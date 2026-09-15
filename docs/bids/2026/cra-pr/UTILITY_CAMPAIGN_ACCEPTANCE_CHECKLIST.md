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

## Controlled Campaign Contract

| Area | Required Result | Current Status |
| --- | --- | --- |
| Utility template | Approved Meta template for CRA | PENDING META/CONFIG |
| Template category | Utility only; no marketing | REQUIRED |
| Recipient source | Sanitized and approved list | WAITING OWNER/CRA |
| Import validation | Normalize phones, dedupe, reject invalid/provisional/excluded/opt-out contacts | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Variables | Required placeholders mapped per recipient or blocked | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Draft | Campaign can be created without sending | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Test send | Formal test-send excluded from contractual active-message billing | TESTED LOCALLY |
| Schedule/send | Explicit operator action only | PRODUCT SUPPORTED / NEEDS OWNER APPROVAL |
| Pause/resume/cancel | Supported by campaign lifecycle and app API | TESTED LOCALLY FOR LIFECYCLE |
| Opt-out | Active opt-out blocks campaign recipient and records event | PRODUCT SUPPORTED / NEEDS CRA EVIDENCE |
| Delivery status | Meta webhook updates status/history | PRODUCT SUPPORTED / NEEDS CRA SAMPLE |
| Billing | Delivered/read Utility campaign outside 24h creates one billable event; read replay does not bill again | TESTED LOCALLY |
| Reports/export | CSV/monthly evidence available; PDF/equivalent acceptance pack still required | PRODUCT SUPPORTED / NEEDS CRA SAMPLE |

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
8. Evidence surfaces are active-message billing report/CSV, Meta usage
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
  `2 x R$ 0,32 = R$ 0,64`.

Owner approval is still required for exact recipients, send window, 24h proof,
message count and real Meta outbound.

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
- Expected reference cost: R$ 0,64.
- Owner real-send approval: PENDING for this exact send preview.
- Real Meta outbound: NOT EXECUTED.

Before any real send, re-run 24h and opt-out checks and capture owner approval
for template, recipients, message count, window, campaign name and expected
cost.
