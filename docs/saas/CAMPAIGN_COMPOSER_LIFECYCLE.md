# Campaign Composer Lifecycle

## Prevalência documental — 26/10/2026

Os checkpoints LOCAL/NO DEPLOY abaixo registram a etapa de criação, não a release
ativa. A entrega dinâmica integrada e seu encerramento constam no
[registro de 12/10](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/out15-closure-20261012/RESULT_2026-10-12.md).
API/frontend a959 e IMAGE/VIDEO têm os aceites posteriores em
[CURRENT_STATE.md](CURRENT_STATE.md). Preservar o contrato do compositor;
não inferir aceite de toda navegação/descarte/agendamento da existência de um envio.
Para o próximo teste, seguir o [mapa vigente](PRODUCT_MAP_CURRENT_2026-10-19.md),
sem repetir deploy por rótulo local histórico.

## Checkpoints históricos

## Audience preview boundary — local correction 12/10/2026

The user changing CRM query/status/channel/conversation filter or recipient mode invalidates the existing preview request generation, estimate/error/page and loading state. Late responses from the previous generation cannot repopulate it. This reuses the existing request-generation mechanism; no polling layer or persisted state is added. Programmatic reuse and reset retain their explicit boundaries and restored selections. Zero estimate remains valid for dynamic scheduling after a matching preview.

[out.15 audit and six browser proofs](../reviews/automation-freeform-window-release-af26/dynamic-audience-continuity-20261011/README.md): the stale preview defect is reproduced locally; its occurrence in the original historical campaign is not proven. Saved dynamic filters and immutable execution snapshots remain distinct from the transient estimate. Correction NOT DEPLOYED.

Status: IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO DEPLOY.

## Permanent invariant

Campaign composition is transient until deliberately saved or execution is
started. Discarding an unsaved composition removes all transient client/server
state. Explicit drafts and campaigns that are scheduled, sending, or completed
are never removed by composer cleanup.

## State inventory

### Client transient

The new-campaign composer keeps the following only in React state:

- campaign name, approved template and fixed/template-variable mappings;
- manual recipients and the composer civil schedule date/time;
- CRM audience filters, page, preview and validation error;
- CSV file text/name, headers, column mappings, preview, import report and
  validation error;
- response destination mode, Department or automated Flow selection and
  derived destination preview;
- media asset reference and authenticated preview when the selected template
  requires an IMAGE/VIDEO header;
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
media and destination/schedule changes. Explicit discard and internal Campaign-tab navigation
ask for confirmation only when this contract is true. Empty composers reset
without confirmation. Operations that are actively saving or previewing are
allowed to finish before tab navigation.

After explicit draft creation or immediate execution, the transient composer
is reset. Re-entering `Criar campanha` starts with no prior name, template,
variables, recipients, CSV, preview, Department, Flow, errors or warnings. The
application does not auto-select the first Department/Flow as hidden state.

## Scope and safety

- no backend discard endpoint was added because unsaved composition has no
  campaign identity or record; an unreferenced media upload has its own guarded
  DELETE and referenced assets are preserved;
- the original composer cleanup required no schema. The 2026-10-21 template
  media delta adds a separate, additive persistence model documented in
  [Templates e campanhas WhatsApp com mídia](META_TEMPLATE_MEDIA_SUPPORT.md);
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
  Campaign suite. Owner visual review remains pending.

## Schedule editing boundaries — 07/10/2026

The composer and persisted campaign detail have independent scheduling state.
Detail hydration occurs once per selection/open boundary, including null time;
background polling never replaces an operator edit. Closing and reopening the
detail explicitly reloads its persisted instant. Composer discard/reset clears
its schedule and schedule-only edits participate in dirty detection.

Persisted ISO instants are formatted through local date components for the
browser `datetime-local` input, consistently with existing browser-local date
presentation. Submission converts that civil value to ISO. In a browser in
America/Fortaleza, 12:40 maps to 15:40Z. No new tenant/server timezone rule is
introduced; a browser in another timezone retains the existing local contract.
