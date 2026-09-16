# Campaign Import / CRM Upsert Requirements

Status: CRA CONTRACT ADHERENCE FOLLOW-UP / CAMPAIGN IMPORT ENHANCEMENT.

Last updated: 2026-09-16.

This document defines the future contract only. It does not implement code,
change runtime behavior, authorize real sends or alter the approved outbound
return destination delivery.

## Optional CRM Situation Column

Future campaign/contact audience imports may optionally accept:

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

## CRM Upsert Contract

This front is not only a new optional CSV/XLSX column. Campaign/contact import
must behave as a safe tenant-scoped CRM upsert.

If an imported identity matches an existing CRM contact, the import must update
the existing canonical record and must not create another contact. Reuse the
current identity, normalization and deduplication mechanism; do not build a
second contact matching algorithm without first auditing the actual canonical
model.

Before implementation, determine which identifier is authoritative:

- normalized phone;
- Lead identity;
- Contact identity;
- channel identity;
- another canonical model.

Do not assume this before auditing the code and schema.

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

Implementation must audit existing import semantics before choosing whether the
policy is merge, first valid row wins, last valid row wins or conflict requiring
review. Until that audit is complete, only the no-duplicate invariant is
canonical.

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

Future implementation should preview resolution before final import where the
current import architecture permits.

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

After every completed import, generate and make available a detailed result
report.

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

Future implementation must clearly distinguish:

- whole-file fatal failure;
- row-level validation failure;
- successful creation/update;
- skipped/no-change row.

Never report an import simply as success if some rows failed.

## Multitenant And Idempotency Rules

Mandatory:

- same tenant only;
- canonical identity reuse;
- repeated import must not create duplicates;
- importing the same file twice should converge safely according to update
  semantics;
- no cross-tenant CRM situation lookup;
- no cross-tenant contact matching.

## Required Audit Before Implementation

- Actual CRM status model and canonical storage location.
- Current campaign import schema and preview/persist contracts.
- Current segmentation use of CRM status in campaign audience filters.
- Status naming, slugging, active/inactive behavior and uniqueness rules.
- Current identity/normalization/deduplication mechanism.
- Existing contact update semantics for name and CRM status.
- Duplicate-row behavior in current import flows.
- Partial-success/failure semantics.
- Existing export/download infrastructure for operator import reports.

## CRA Classification

This is not part of the current approved outbound return destination delivery.

Current CRA order:

1. recipient B controlled Utility validation - done on Demo;
2. opt-out E2E - current owner gate;
3. reports / exports / billing;
4. CRM import/upsert/report with `Situação no CRM`;
5. acceptance package.
