# Demo `****6787` canonical identity repair preparation

Status: HISTORICAL DUPLICATE / REPAIR PREPARED / NOT EXECUTED.

Date: 2026-09-18.

Scope:

- tenant: `demo-converta`
- target identity: WhatsApp canonical identity ending `****6787`
- production runtime audited: `04eb01ae2a044b993774dd21b37228b35bea11bc`
- canonical docs head audited: `7f3fd9293c49327422b069f493a72783b7f44743`
- mutation: none
- deploy: none
- provider call/send: none

## Current graph

Read-only production audit found exactly two relevant Contacts and two relevant Leads.

Contacts:

- primary survivor candidate: `e96d8299-b36f-4118-a406-f2a365c5630d`
  - original CRM/Web Session record
  - `ACTIVE`
  - 4 linked `ContactChannelIdentity` records
  - owns the current open human conversation graph through Web Session identity
- duplicate Contact: `97244912-0a78-48a7-8371-3c07b38dbf7b`
  - created by historical campaign bootstrap
  - `ACTIVE`
  - 1 linked Meta `ContactChannelIdentity`: `cmu44rnp700014s4qch0qm6lx`

Leads:

- surviving canonical CRM read-model Lead: `cmtvhkeo902u74s38b4pf9heg`
  - status `QUALIFIED`
  - linked to the Meta identity created during campaign bootstrap
  - preserves the current CRM situation established after the controlled campaign
- duplicate historical Lead: `cmta6bjio00jl4s045pf4rfna`
  - status `NEW`
  - original Web Session/CRM-era Lead
  - should be retained for chronology but not remain a live canonical identity pointer after repair

Conversation/runtime:

- `Conversation`: 1 related row, open window.
- `ConversationRuntimeState`: 1 related row, `HUMAN` / `IN_PROGRESS` / `ACTIVE`.
- Assignments/transfers: 8 assignment rows plus transfer events; all must be preserved.

Messages/events:

- `InboundMessage`: 58 related rows.
- `OutboundMessage`: 86 related rows.
- `Message`: 0 rows for the related Conversation table path.
- Target active-message billing event for B `****6787`: 1.
- Receptive-session billing event for `****6787`: 1.
- Campaign-related target events for `****6787`: preserved as immutable history.

Campaign evidence:

- `bb1d30e2-3a98-471a-9531-1f5e5d76a214`: B-only controlled Utility campaign for `****6787`, `data_exame`, completed, 1 sent, delivered billing persisted.
- `d260bdc6-326f-4487-8d15-21c2a98dd741`: opt-out E2E blocked campaign, completed, 1 blocked.
- `e715b417-672e-43ca-8be2-d486feed65ba`: historical seed includes `****6787`, but actual submit/provider/billing evidence is for `****9614`; do not rewrite it to invent a persisted result for `****6787`.

Consent/opt-out:

- `ContactConsent`: 2 rows.
- Opt-out events: `contact.opt_out.recorded` followed by `contact.opt_out.revoked`; effective state remains not opted out after the prior controlled reversal.
- Future repair must not rewrite historical opt-out/consent events.

Direct FK references:

- `Appointment`: 0
- `SatisfactionSurvey`: 0
- `SatisfactionResponse`: 0
- `ContactConsent`: 2

## Repair semantics prepared

The current resolver checks live Contact/Lead identity fields before the exclusion outcome can safely express a non-operational duplicate. Therefore, merely setting `operationallyExcludedAt` on the duplicate Contact is insufficient.

Prepared minimal repair:

1. Validate exact tenant and IDs.
2. Lock/read the two Contacts, two Leads and the involved `ContactChannelIdentity` rows.
3. Move the Meta identity `cmu44rnp700014s4qch0qm6lx` from duplicate Contact `97244912-0a78-48a7-8371-3c07b38dbf7b` to primary Contact `e96d8299-b36f-4118-a406-f2a365c5630d`.
4. Keep surviving Lead `cmtvhkeo902u74s38b4pf9heg` linked to the moved Meta identity and preserve status `QUALIFIED`.
5. Retain duplicate Contact `97244912-0a78-48a7-8371-3c07b38dbf7b` without live canonical identity selectors and set `operationallyExcludedAt`.
6. Retain duplicate Lead `cmta6bjio00jl4s045pf4rfna` without live canonical identity selectors and with `contactChannelIdentityId = NULL`.
7. Preserve Event, Campaign, OutboundMessage, provider message IDs, billing, opt-out, consent, assignment and transfer history.
8. Verify invariants, then commit only in a future owner-authorized execution gate.

Hard delete: NO.

No schema/migration is expected. If execution finds a new FK/unique blocker, stop before mutation.

## Dry-run artifact

Script:

`apps/whatsapp-agent/scripts/prepare-demo-6787-identity-repair.ts`

Current mode:

- `--dry-run` only
- `--execute` is intentionally unsupported
- requires exact tenant/contact/lead constants
- prints target, snapshot, operations, expected counts and blockers

Dry-run against production via SSH tunnel on 2026-09-18:

- PASS
- blockers: none
- identities to move: 1
- expected active canonical Contacts: 1
- expected canonical Leads: 1
- expected billing change: 0
- expected outbound change: 0
- expected campaign history change: 0

Synthetic local regression:

- `canonicalIdentityRepairPlan.test.ts`: 2/2 PASS
- validates planned operations and rerun-as-NOOP semantics

## Future execution gate

Required before any mutation:

- owner authorization for production repair
- persistent production DB backup
- backup SHA256
- restore-list/object count
- pre-repair identity snapshot
- pre-repair billing snapshot
- pre-repair conversation snapshot
- bounded DB transaction
- no provider calls inside transaction

Post-repair invariants:

- canonical active Contact count for identity: 1
- canonical CRM Lead count: 1
- identity conflict for new resolution: NO
- open conversation preserved: YES
- campaign history preserved: YES
- outbound count unchanged: YES
- billing event count unchanged: YES
- opt-out history unchanged: YES
- effective opt-out unchanged: YES
- provider IDs unchanged: YES
- cross-tenant impact: 0
