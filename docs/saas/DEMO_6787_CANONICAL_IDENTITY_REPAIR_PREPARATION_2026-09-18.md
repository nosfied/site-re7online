# Demo `****6787` canonical identity repair

Status: HISTORICAL DUPLICATE / TRANSACTIONAL REPAIR EXECUTED / VALIDATED.

Date: 2026-09-18.

Scope:

- tenant: `demo-converta`
- target identity: WhatsApp canonical identity ending `****6787`
- production runtime audited: `04eb01ae2a044b993774dd21b37228b35bea11bc`
- canonical docs head audited: `7f3fd9293c49327422b069f493a72783b7f44743`
- mutation: transactional identity repair executed on 2026-09-18
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

## Repair semantics executed

The current resolver checks live Contact/Lead identity fields before the exclusion outcome can safely express a non-operational duplicate. Therefore, merely setting `operationallyExcludedAt` on the duplicate Contact is insufficient.

Prepared minimal repair:

1. Validate exact tenant and IDs.
2. Lock/read the two Contacts, two Leads and the involved `ContactChannelIdentity` rows.
3. Move the Meta identity `cmu44rnp700014s4qch0qm6lx` from duplicate Contact `97244912-0a78-48a7-8371-3c07b38dbf7b` to primary Contact `e96d8299-b36f-4118-a406-f2a365c5630d`.
4. Keep surviving Lead `cmtvhkeo902u74s38b4pf9heg` linked to the moved Meta identity and preserve status `QUALIFIED`.
5. Retain duplicate Contact `97244912-0a78-48a7-8371-3c07b38dbf7b` without live canonical identity selectors and set `operationallyExcludedAt`.
6. Retain duplicate Lead `cmta6bjio00jl4s045pf4rfna` without live canonical identity selectors and with `contactChannelIdentityId = NULL`.
7. Preserve Event, Campaign, OutboundMessage, provider message IDs, billing, opt-out, consent, assignment and transfer history.
8. Verify invariants before commit.

Hard delete: NO.

No schema/migration was used. No runtime deploy or PM2 reload was required.

## Execution artifact

Script:

`apps/whatsapp-agent/scripts/prepare-demo-6787-identity-repair.ts`

Modes:

- `--dry-run`
- `--execute --confirm-demo-6787-repair`
- requires exact tenant/contact/lead constants
- prints target, snapshot, operations, expected counts, blockers and post-transaction checks

Prepared/pushed script commits:

- `ce2c032065467e4726072f9c1b2c6bc38adfff06` - dry-run preparation
- `82ad33f3930b1d489f8199e415a3c560599e09a2` - transactional execute support
- `dc710888f9ac9a376bbf5074a8430a8d58a0a94d` - align receptive billing check to actual event naming
- `1a27fb8d214d4a9e428e9d1be73c2f8f09445446` - align handoff preservation check to actual schema field

Production backup/evidence package:

- `/opt/re7online/backups/demo-6787-identity-repair-20260918-121809`
- full DB dump: `pre-repair.dump`
- checksum: `pre-repair.dump.sha256`
- restore list: `pre-repair.restore-list.txt`
- dry-run/evaluate artifacts: `dry-run-before.json`, `dry-run-after-aborted-attempt.json`, `execute-result.json`, `dry-run-after.json`
- immutable-history comparisons: `counts-hashes.diff` and `billing-event-names.diff` are empty

Dry-run against production via SSH tunnel on 2026-09-18 before mutation:

- PASS
- blockers: none
- identities to move: 1
- expected active canonical Contacts: 1
- expected canonical Leads: 1
- expected billing change: 0
- expected outbound change: 0
- expected campaign history change: 0

Execution result:

- committed: YES
- moved Meta identity `cmu44rnp700014s4qch0qm6lx`: 1
- neutralized duplicate Contact `97244912-0a78-48a7-8371-3c07b38dbf7b`: 1
- neutralized duplicate Lead `cmta6bjio00jl4s045pf4rfna`: 1
- refreshed surviving Lead `cmtvhkeo902u74s38b4pf9heg`: 1
- canonical resolution for 12-digit, 13-digit and formatted phone variants resolves to Contact `e96d8299-b36f-4118-a406-f2a365c5630d` and Lead `cmtvhkeo902u74s38b4pf9heg`
- duplicate Contact identity count: 0
- open conversation count: 1
- `OutboundMessage` target count: 86
- delivered active-message billing count: 1
- receptive-session billing count: 1
- post-repair dry-run: `noop=true`, blockers=0

An earlier execution attempt aborted before commit because the validation used the obsolete field name `handoffState`; Prisma rolled the transaction back. A follow-up dry-run confirmed the original pre-repair graph was still unchanged before the successful execution.

Synthetic local regression:

- `canonicalIdentityRepairPlan.test.ts`: 2/2 PASS
- validates planned operations and rerun-as-NOOP semantics

## Post-repair invariants

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
