# Campaign Composer Lifecycle

Status: DEPLOYED / PRODUCTION VALIDATED.

## Permanent invariant

Campaign composition is transient until deliberately saved or execution is
started. Discarding an unsaved composition removes all transient client/server
state. Explicit drafts and campaigns that are scheduled, sending, or completed
are never removed by composer cleanup.

## State inventory

### Client transient

The new-campaign composer keeps the following only in React state:

- campaign name, approved template and fixed/template-variable mappings;
- manual recipients;
- CRM audience filters, page, preview and validation error;
- CSV file text/name, headers, column mappings, preview, import report and
  validation error;
- response destination mode, Department or automated Flow selection and
  derived destination preview;
- expanded creation row, loading/preflight flags, form errors and composer
  toast.

No campaign-composition data is stored in local storage, session storage,
IndexedDB or a client query cache. The `campaignId` URL parameter selects an
existing persisted campaign detail; it is not an unsaved composer identifier.
Browser reload, browser back to another route and navigation to another app
page unmount this state naturally.

### Server read-only preview

CRM audience preview and CSV preview query current tenant data and return an
eligibility projection. They do not create a Campaign, recipient seed, CRM
Contact/Lead, schedule, event, outbound or provider call. Therefore there is no
server-side transient record to delete when a preview is abandoned.

### Intentional draft

Only explicit `Criar rascunho` or `Criar rascunho com CSV` persists a Campaign
with `status=draft`, its private recipient seed, destination and audit/import
events. This is intentional persistence and survives navigation/reload.

CSV draft creation is also the explicit CRM import commit boundary. Tenant-
scoped CRM upserts committed atomically per accepted row are canonical CRM
history and are not rolled back if the operator later discards the Campaign
draft. Preview alone performs no upsert.

`Descartar rascunho` is not composer cleanup: it is an explicit persisted
transition from `draft` to `cancelled`, with an audit event. The backend rejects
this operation for scheduled, sending, completed and other non-draft states,
and tenant ownership is mandatory.

### Execution and historical state

Scheduling exists only after an intentional draft was saved. A scheduled
Campaign and its job survive ordinary navigation. Starting immediate/manual or
draft execution crosses the hard boundary into persisted execution. Closing
the progress/detail modal only closes presentation; it does not cancel or
delete the Campaign. OutboundMessage, billing and historical events are never
part of composer cleanup.

## Cleanup contract

One `resetCampaignComposer` operation clears all client-transient composition
state and invalidates in-flight CRM/CSV preview responses so stale async data
cannot repopulate a discarded attempt. It is safe to call repeatedly.

One `isComposerDirty` contract covers meaningful name, template, variables,
manual recipients, audience filters/preview, CSV data/mappings/preview/report
and destination changes. Explicit discard and internal Campaign-tab navigation
ask for confirmation only when this contract is true. Empty composers reset
without confirmation. Operations that are actively saving or previewing are
allowed to finish before tab navigation.

After explicit draft creation or immediate execution, the transient composer
is reset. Re-entering `Criar campanha` starts with no prior name, template,
variables, recipients, CSV, preview, Department, Flow, errors or warnings. The
application does not auto-select the first Department/Flow as hidden state.

## Scope and safety

- no backend discard endpoint was added because unsaved composition has no
  server identity or record;
- no schema or migration is necessary;
- no provider call or real send is part of validation;
- no tenant hardcode or cross-tenant cleanup exists;
- Demo `****9614` historical identity residue is untouched and remains a
  separate owner-authorized repair gate;
- Campaign Result Truth remains two intended recipients, one delivered and one
  identity-conflict block, without a duplicate projection row.

## Local validation - 2026-09-18

- composer lifecycle and Campaign page contracts: 18/18 PASS;
- Campaign backend regressions: 115/115 PASS;
- Campaign import and canonical CRM upsert regressions: 23/23 PASS;
- focused frontend lint, backend build, frontend build and `git diff --check`:
  PASS;
- authenticated browser smoke: unsaved attempt A discarded, attempt B opened
  pristine, CSV preview cancelled without residual file/table/toast, explicit
  draft preserved while a new composer opened pristine;
- no real send or provider call was made. The local variable-template fixture
  correctly rejected scheduling with `template_variables_required`; persisted
  schedule survival and lifecycle protection remain covered by the backend
  Campaign suite.

## Production validation - 2026-09-18

Status: DEPLOYED / PRODUCTION VALIDATED, with unsafe timing/lifecycle
sub-properties retained as TEST VALIDATED.

- authenticated Demo unsaved composition populated name, template and
  Department; explicit discard followed by tab change/re-entry returned a
  pristine composer with no prior name, template, Department or preview;
- read-only CSV preview completed with one ready row; while the result was
  present the action was disabled as `Previa gerada`; discard/re-entry removed
  the file, mappings and preview;
- controlled draft `0630703c-b1ac-42cc-ae3f-dfc84d7e57d2` persisted across a
  browser reload with one recipient and `status=draft`, then only that draft
  was explicitly discarded; final status is `cancelled`;
- database evidence for that draft shows `sentCount=0`, zero OutboundMessage by
  request id or payload, and only `campaign.seed.saved` plus
  `campaign.draft.discarded`; no real send or provider call occurred;
- completed history was observed in production. Scheduled/sending survival and
  stale async-response invalidation remain TEST VALIDATED because manufacturing
  latency or execution in production would violate the no-send gate;
- Demo `****9614` was not mutated and its repair remains a separate owner gate.
