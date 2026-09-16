# Campaign Import Requirements

Status: CRA CONTRACT ADHERENCE FOLLOW-UP / CAMPAIGN IMPORT ENHANCEMENT.

Last updated: 2026-09-16.

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

## Required Audit Before Implementation

- Actual CRM status model and canonical storage location.
- Current campaign import schema and preview/persist contracts.
- Current segmentation use of CRM status in campaign audience filters.
- Status naming, slugging, active/inactive behavior and uniqueness rules.
- Update-vs-create semantics when an imported phone/contact already exists.
- Whether assigning CRM status during import should update existing contacts or
  only seed new imported records.

## CRA Classification

This is not part of the current approved outbound return destination delivery.

Current CRA order:

1. deploy approved outbound return destination;
2. recipient B controlled Utility validation;
3. opt-out E2E;
4. reports / exports / billing;
5. CRM import `Situação no CRM`;
6. acceptance package.
