# Campaign Import / CRM Upsert Requirements

Status: IMPLEMENTED / TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER APPROVED
LOCAL / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.

Last updated: 2026-09-17.

This document records the implemented local contract for campaign CSV import as
CRM upsert. It does not authorize real sends, production deployment or CRA
customer-data import; each requires its own controlled gate.

## Optional CRM Situation Column

Campaign/contact audience imports may optionally accept:

```text
Situação no CRM
```

ASCII-compatible accepted header aliases may include `Situacao no CRM`, but the
canonical business label remains `Situação no CRM`.

When the column is absent, existing campaign import behavior must remain
unchanged.

When the column is present and populated:

- resolve the value against CRM situations/statuses configured for the same
  tenant;
- persist the canonical internal id/reference, not only display text;
- never use a cross-tenant value;
- never create a new CRM status silently;
- report unknown, ambiguous or inactive values truthfully in preview/import
  validation;
- use deterministic matching and avoid unsafe fuzzy matching;
- preserve import dry-run/preview before persistence.

## Implemented CRM Upsert Contract

This front is not only a new optional CSV/XLSX column. Campaign/contact import
behaves as a safe tenant-scoped CRM upsert for CSV campaign imports.

If an imported identity matches an existing CRM contact, the import must update
the existing canonical record and must not create another contact. Reuse the
current identity, normalization and deduplication mechanism; do not build a
second contact matching algorithm without first auditing the actual canonical
model.

Implementation audit result:

- `Lead.status` is the canonical CRM situation reference used by CRM filters;
- existing identity normalization/reuse lives in
  `apps/whatsapp-agent/src/crm/crmWhatsappIdentity.ts`;
- campaign preview and commit reuse the side-effect-free identity resolver from
  the canonical `upsertCrmContact` service instead of maintaining a second
  matching/hash engine;
- same-tenant phone/WhatsApp identity and CRM lead/contact linkage determine
  whether the import creates, updates or leaves a record unchanged.

## Field Update Semantics

For an existing matched contact:

- If imported name is present and valid, update according to current CRM
  field-update semantics.
- If imported name is absent or blank, preserve the existing name.
- If imported `Situação no CRM` is present and resolves, update the existing
  CRM situation/status reference.
- If imported `Situação no CRM` is absent or blank, preserve the existing
  situation/status.
- Do not clear existing values merely because an uploaded cell is empty.
- No destructive overwrite by omission.

For a new contact:

- create exactly one contact through the current CRM creation path;
- apply valid imported name, normalized phone/identity, `Situação no CRM` and
  other currently supported fields;
- do not create duplicates.

## Duplicate Input Rows

Repeated identity inside the same uploaded file must converge to one canonical
contact maximum.

Mandatory invariant:

- do not create one contact per duplicated row.

Implemented policy: a row claims an identity only after its row-level
validations pass. The first valid occurrence wins deterministically; invalid
occurrences before or after it are reported for their actual validation error,
and later valid repetitions are consolidated as duplicates. They do not create
additional contacts.

## Matching Rules

CRM situation matching must be deterministic and tenant-scoped.

Safe normalization may include, after audit:

- trim whitespace;
- case normalization;
- accent normalization where existing product conventions permit it.

Do not use aggressive fuzzy matching. For example, `Em negociação` must not
accidentally resolve to `Negociação concluída`. Ambiguous matches must not be
guessed; report them for review/error.

## Import Preview

Preview resolves status and intended CRM operation before final import.

Per row, classify as applicable:

- NEW CONTACT;
- EXISTING CONTACT - UPDATE;
- NO CHANGE;
- UNKNOWN CRM SITUATION;
- INVALID PHONE;
- DUPLICATE INPUT;
- CONFLICT;
- OTHER VALIDATED ERROR.

Show intended changes before execution if practical within the existing
workflow.

## Detailed Post-Import Report

After every completed campaign CSV import, the app receives a detailed result
report and exposes a CSV download.

Summary must include:

- TOTAL ROWS;
- CREATED;
- UPDATED;
- UNCHANGED;
- SKIPPED;
- ERRORS;
- DUPLICATES/CONSOLIDATED where applicable.

Per-row/detail evidence should include as appropriate:

- source row number;
- safe/masked contact identifier;
- operation result;
- contact existing/new;
- fields changed;
- old CRM situation -> new CRM situation;
- whether name was updated;
- whether duplicate input was detected;
- error code/reason;
- validation message.

Do not expose cross-tenant or private data unnecessarily.

## Report Download

The detailed result must be accessible to the operator after import.

Audit existing export infrastructure before implementation. Prefer reuse of
existing CSV, XLSX/open equivalent or existing downloadable import report
infrastructure. Do not invent a new file-generation stack if one already exists.

The report should remain available according to existing audit/history
conventions if the product already persists import jobs/results.

## Failure Semantics

Audit whether import currently supports partial success before redefining
behavior.

Implementation distinguishes:

- whole-file fatal failure;
- row-level validation failure;
- successful creation/update;
- skipped/no-change row.

Never report an import simply as success if some rows failed.

Each validated row commits its canonical CRM upsert, optional `Lead.status`
change and cumulative campaign seed in one Prisma transaction. A failure before
seed persistence rolls back that row's CRM changes and is counted/reported as a
row error. Completion telemetry remains separate from the row commit, but it
does not define recipient membership.

The app CSV preview and draft endpoints require both `campaigns` and `crm`.
Public API recipient import requires `write`, `campaigns` and `contacts` scopes
plus the tenant CRM capability. Denial occurs before CRM/campaign mutation.

## Multitenant And Idempotency Rules

Mandatory:

- same tenant only;
- canonical identity reuse;
- repeated import must not create duplicates;
- importing the same file twice should converge safely according to update
  semantics;
- no cross-tenant CRM situation lookup;
- no cross-tenant contact matching.

## Audit Result

- Actual CRM status model: `Lead.status`.
- Status catalog source: same-tenant `TenantOperationalConfig.config.crmBusinessStatuses`
  via DB-first resolver with existing fallback.
- Current segmentation use: campaign audience filters use CRM status ids/labels
  from the same tenant.
- Status matching: active same-tenant id or label, deterministic trim/case/accent
  normalization, no unsafe fuzzy matching.
- Identity/deduplication: existing CRM WhatsApp identity normalization and
  the same canonical identity resolver used by `upsertCrmContact`, including
  `externalUserHash`-only reuse.
- Field updates: valid nonblank imported name/status may update; blank cells
  preserve.
- Duplicate-row behavior: consolidated/no duplicate contact.
- Partial-success behavior: valid rows may import while row-level failures are
  reported.
- Report/download: detailed CSV is returned in the import response and exposed
  in `/app/campaigns`; user-controlled cells beginning with `=`, `+`, `-` or
  `@` are neutralized as spreadsheet data.

## Principles Audit History

- Previous owner result: PARTIAL PASS.
- Principles audit on 2026-09-17: BLOCKED on four P1 findings: transaction
  consistency, premature duplicate claiming, parallel preview identity matching
  and missing CRM capability enforcement.
- Corrective batch on 2026-09-17: focused tests and principles re-audit PASS;
  owner visual revalidation also PASS. Canonical integration was prepared from
  `819cd9b5` with the audited delta preserved. Production reached `cad9489c` by
  FF-only on 2026-09-17 after verified persistent backup; impacted builds,
  reloads, health, bundle markers, authorization gates and Demo read-only state
  checks passed. Authenticated production preview and real import were not
  executed; CRA customer acceptance remains pending.
- Production backup evidence: PostgreSQL dump
  `/opt/re7online/backups/converta-persistent/postgres/20260917-145842.dump`,
  20,510,523 bytes, 578 objects, SHA-256
  `034ef77ec053daa9e1f07e4d3ff3288a8d4c4bf2d8c94e05dcd7c2763f5ecc29`;
  sanitized HEAD/PM2/config metadata is under
  `/opt/re7online/backups/converta-persistent/deploys/cra-crm-import-20260917-145842`.
  The authorized untracked operational path
  `apps/whatsapp-web-worker/.data/` remained untouched, and the Web Worker kept
  the same PID and restart count.
- Residual P2: preview performs sequential canonical identity resolution per
  validated row. Local synthetic preview measured about 231 ms for 100 rows and
  1.76 s for 1,000 rows. Future optimization must preserve the single canonical
  resolver contract.
- Residual P3: translate remaining internal operation/error codes displayed in
  operator detail without changing persisted report semantics.

## CRA Classification

This is not part of the current approved outbound return destination delivery.

Current CRA order:

1. recipient B controlled Utility validation - done on Demo;
2. opt-out E2E - done on Demo;
3. reports / exports / billing - done on Demo;
4. CRM import/upsert/report owner validation - passed locally;
5. controlled production deployment - done, non-destructive validation only;
6. CRA-approved sample import evidence if separately authorized;
7. acceptance package.
