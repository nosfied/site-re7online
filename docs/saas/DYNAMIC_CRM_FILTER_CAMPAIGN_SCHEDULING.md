# Dynamic CRM-filter Campaign Scheduling

Status: NEW FEATURE / NOT YET IMPLEMENTED.

This note records the next-front design only. The 2026-09-19 Contacts +
Campaigns UX refinement did not change scheduler/runtime semantics and did not
add dynamic recipient evaluation.

## Current Architecture

- `Campaign.scheduledAt` stores a scheduled campaign time.
- Campaign drafts/scheduled campaigns persist recipient selection before
  dispatch.
- Existing campaign execution must continue to use canonical contact identity,
  current opt-out checks, template validation, return destination validation and
  idempotent provider dispatch.
- CRM business statuses come from the same-tenant operational configuration,
  primarily `TenantOperationalConfig.config.crmBusinessStatuses`.

## Desired Future Semantics

At scheduling time, save the tenant-scoped CRM filter definition, not a frozen
recipient list.

At execution time:

- evaluate the saved filter against current same-tenant CRM contacts;
- resolve recipients through canonical identity;
- apply current opt-out and active-send eligibility;
- validate template and return destination;
- create an auditable recipient snapshot/result for that execution;
- dispatch once with restart/retry idempotency.

## Guardrails

- No cross-tenant CRM status or contact resolution.
- No unsafe fuzzy status matching.
- No silent recipient omission; exclusions need explicit counts/reasons.
- No shadow campaign-history model inside Contact.
- No real send or runtime behavior change until a separate controlled
  implementation gate is approved.
