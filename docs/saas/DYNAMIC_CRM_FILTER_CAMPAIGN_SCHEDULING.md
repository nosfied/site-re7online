# Dynamic CRM-filter Campaign Scheduling

Status: DEPLOYED / REAL DYNAMIC EXECUTION: DEMO E4 VALIDATED.

This note records the implementation and validation of the dynamic CRM-filter
scheduling front. It received owner pass in local validation, was deployed with
the Campaigns/Contacts delivery, and has one controlled real execution
validated on `demo-converta`. This is Demo product evidence only; it does not
claim CRA customer acceptance.

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
- Local validation used no real send or provider call. The later controlled
  Demo E4 validation used exactly one real Meta Utility send from
  `demo-converta`.

## Controlled Demo E4 Validation - 2026-09-19

Evidence level: `REAL DYNAMIC EXECUTION: DEMO E4 VALIDATED`.

Scope:

- tenant: `demo-converta`;
- campaign: `c621ee16-d9b5-4805-bbec-365d8bd22e98`;
- campaign name:
  `DEMO E4 dynamic CRM filter - dynamic-crm-e4-2026-09-19T18-10-27-011Z`;
- template: `data_exame`, Utility, `pt_BR`;
- dynamic filter: CRM Situation `QUALIFIED` / `Qualificado`;
- return destination: `Atendimento Geral` / `Fila Geral`;
- scheduled for: `2026-09-19T18:12:32.328Z`.

Validated contract:

- pre-schedule match existed for `****6787`, with no snapshot, outbound or
  billing rows for the new campaign;
- before execution, `****6787` was moved out of the filter and `****9614` was
  moved into the filter;
- the scheduler evaluated the CRM filter at execution time and created one
  immutable snapshot;
- snapshot event id: `c3a4d089-58b0-4083-863f-d9c80ba9f27d`;
- snapshot time: `2026-09-19T18:12:49.373Z`;
- matched recipients: 1;
- eligible recipients: 1;
- blocked recipients: 0;
- snapshot recipient: `****9614`;
- snapshot hash:
  `b6c78d6ae8936966dc9c9ae842327305edea67506f58cf2bc2791dd8299ee6a5`;
- after snapshot, the CRM statuses were restored and the snapshot remained
  unchanged;
- replay/polling after completion created no second snapshot, no duplicate
  outbound and no duplicate billing.

Provider and billing evidence:

- provider calls: 1;
- Meta message id:
  `wamid.HBgMNTU4NDk5MDQ5NjE0FQIAERgUQ0U4NTAzNTUzMjYxMDZGNUMxNDMA`;
- final campaign status: `completed`;
- result totals: total 1, sent/delivered evidence 1, blocked 0, failed 0,
  pending 0;
- canonical billing event: one `billing.active_message.delivered`;
- duplicate recipient rows: 0;
- no CRA tenant send, no Vercel action, no Web Session restart and no transport
  configuration change.
