# Dynamic CRM-filter Campaign Scheduling

Status: OWNER PASS / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.

This note records the implementation of the dynamic CRM-filter scheduling
front. It received owner pass in local validation and was deployed to production
on 2026-09-19 through the clean Contacts/Campaigns delivery at application HEAD
`5208de159dd11b94dd5db2382446c66b38705c52`. Production validation was
non-destructive: health, build, read-only campaign/list/detail payload checks
and mutation counters passed. No real dynamic execution, provider send or
customer acceptance evidence is claimed here.

Core invariant:

- before execution: the audience remains a dynamic CRM filter;
- at execution: one recipient snapshot is created from current same-tenant CRM
  data;
- after snapshot: the recipient population is immutable for that execution.

## Current Architecture

- `Campaign.scheduledAt` stores a scheduled campaign time.
- Static campaign drafts/scheduled campaigns continue to persist recipient
  selection before dispatch.
- Dynamic scheduled campaigns persist only a filter definition before execution.
- Existing campaign execution continues to use canonical contact identity,
  current opt-out checks, template validation, return destination validation and
  idempotent provider dispatch.
- CRM business statuses come from same-tenant operational configuration,
  primarily `TenantOperationalConfig.config.crmBusinessStatuses`, with the
  existing JSON fallback.

## Implemented Semantics

- Recipient selection is explicit:
  `STATIC_RECIPIENTS` or `DYNAMIC_CRM_FILTER`.
- Backward compatibility: campaigns without a mode are treated as
  `STATIC_RECIPIENTS`.
- Initial dynamic filter is `crmBusinessStatusId`, using the stable same-tenant
  CRM Situation id, never the display label.
- Schedule-time dynamic seed stores no final recipient population and creates no
  `OutboundMessage`, billing ledger, provider call or recipient snapshot.
- At scheduled execution claim, the scheduler resolves current same-tenant CRM
  status configuration, queries current Leads by status, deduplicates by
  canonical WhatsApp identity, builds per-recipient template components from
  current Lead fields when mappings exist, and persists one
  `campaign.dynamic_snapshot.created` event.
- If a snapshot event already exists, restart/retry reuses it and does not
  re-evaluate the CRM filter.
- After snapshot creation, the population is immutable for that execution.
- Current opt-out, operational exclusion, return destination revalidation,
  template/category validation, idempotent outbound `messageId`s, billing and
  result truth remain in the existing campaign runner path.
- Empty match is allowed: snapshot has zero recipients and the campaign can
  complete with provider calls = 0 and billing = 0.
- Guardrail: dynamic execution is bounded at 1000 matched CRM leads; overflow
  fails explicitly with `dynamic_match_limit_exceeded` instead of silently
  truncating recipients.

## UX

- The Campaigns creation area offers recipient mode:
  `Destinatários fixos` or `Filtro dinâmico do CRM`.
- Dynamic mode requires a CRM Situation and future date/time.
- The preview button becomes an estimate: `Correspondências neste momento`.
- The action creates and schedules a dynamic campaign without freezing preview
  recipients.
- Campaign detail displays mode, CRM filter, schedule time and snapshot state.

## Guardrails

- No cross-tenant CRM status or contact resolution.
- No unsafe fuzzy status matching.
- No silent recipient omission; exclusions need explicit counts/reasons.
- No shadow campaign-history model inside Contact.
- No schema or migration.
- No real send, provider call or dynamic execution occurred during production
  validation.
