# Contacts Campaign Relationship View

Status: CANONICALLY INTEGRATED / TEST VALIDATED / OWNER PASS / CLEAN DELIVERY
PREPARED / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP.

Last updated: 2026-09-18.

This document defines the product contract and current local implementation.
It does not authorize real sends, production deployment, schema changes or
campaign/billing history rewrites.

Clean delivery note, 2026-09-18: a production-base delivery branch was prepared
from exact production HEAD `04eb01ae2a044b993774dd21b37228b35bea11bc` with only
the Contacts campaign relationship delta. Repair tooling, identity repair
deltas, queue-domain deltas, schema changes and migrations are not part of this
delivery.

## Goal

Expose campaign-related history and state inside the Contacts/CRM area without
duplicating campaign source-of-truth data.

For each contact, when applicable, show:

- campaign count;
- last campaign;
- last campaign send timestamp;
- template used;
- delivery status;
- read status, if available;
- failed reason, if applicable;
- opt-out status;
- skipped/blocked reason;
- CRM Situation;
- campaign/history detail navigation.

## Canonical Source

Use campaign, outbound, billing, opt-out and event records already persisted by
the platform.

Do not create a shadow campaign-history model inside Contact.

Opt-out state must be projected from canonical events
`contact.opt_out.recorded` / `contact.opt_out.revoked`; campaign blocked/skipped
history must use existing campaign events such as
`campaign.recipient.opt_out_blocked`.

The Contacts surface may expose a projection/read model, but campaign source of
truth remains in the existing campaign/outbound/billing/opt-out records.

Current implementation uses a read-only projection from:

- `Campaign`;
- `OutboundMessage`;
- `campaign.seed.saved`;
- `campaign.recipient.opt_out_blocked`;
- `campaign.recipient.import_blocked`.

No Contact-owned campaign-history table, denormalized status field, schema
change or migration was introduced.

## Multitenant Rules

Mandatory:

- same tenant only;
- no cross-tenant campaign aggregation;
- no cross-tenant opt-out lookup;
- no cross-tenant contact matching;
- never expose another tenant's campaign, template, billing or delivery data.

## Performance Contract

Avoid N+1 per contact row.

Preferred shape:

- aggregate/list projection for the contact list;
- on-demand expanded detail for campaign history;
- reuse existing indexes and query patterns where possible;
- defer heavy detail joins until the operator expands or navigates.

Current implementation performs one bounded same-tenant projection for the
current Contacts page and loads the recent campaign history on contact detail.
The focused regression validates same-tenant aggregation without cross-tenant
leakage.

## UX Contract

Use the approved expandable administrative-row pattern where appropriate:

- compact contact row with high-signal campaign summary;
- expanded/detail area for campaign history;
- one-row expansion rules where consistent with existing CRM UX;
- navigation from contact to campaign/history detail.

Do not duplicate full campaign management UI inside Contacts.

Current UX:

- Contacts list includes a compact `Campanhas` column with campaign count,
  latest campaign, latest date and translated status;
- contact detail includes `Campanhas` with latest summary and recent history;
- campaign navigation reuses `/app/campaigns?campaignId=<id>`;
- customer-facing Contacts UX does not display `R$`, `USD`, provider cost,
  Meta rate, contract price or billing amount.

UX refinement on 2026-09-19:

- Contacts rows are clickable and open the contact detail; compact row actions
  remain buttons and do not double-trigger row click.
- Final owner rule: Delete is available only from the Contact list row. Contact
  detail keeps close/back, edit, save/cancel as applicable and has no Delete
  action.
- Authenticated same-tenant CRM list/detail shows the full normalized phone
  number for authorized users. Sanitized evidence, exports and public/support
  surfaces remain outside this change.
- Redundant top-level CRM Situation, active-send block and template-eligibility
  fields were removed from the contact summary. CRM Situation remains in its
  dedicated selector; active-send remains in its dedicated operational section.
- Active-send block uses an ON/OFF switch: ON blocks active outbound; OFF
  allows active outbound subject to the existing canonical channel/template
  rules. The switch preserves `recordContactOptOut` / revoke semantics.
- Campaign relationship detail is grouped under one expandable line,
  `Campanhas relacionadas`, with a count badge and compact summary. Individual
  campaign rows render only inside the expanded section.
- Campaign result detail now supports view-only recipient filters and reuses the
  existing campaign composer path to start a draft from filtered canonical
  contacts. Rows without a current reusable contact are excluded explicitly; no
  Contact-owned campaign history or real send is created.
- Contact exclusion remains the existing guarded operational-exclusion path.
  Active/open conversations still block exclusion; the UI only clarifies the
  instruction and does not auto-close, transfer or delete history.

## CRA Relevance

This supports campaign/contact traceability and acceptance evidence:

- proving which campaigns touched a contact;
- seeing delivery/read/failure/skipped/blocked context;
- reconciling opt-out and CRM Situation;
- navigating from contact evidence to campaign evidence.

This is separate from:

- approved outbound return destination delivery;
- Recipient B controlled Utility validation;
- opt-out E2E, now Demo-validated as product capability on 2026-09-16;
- reports / exports / billing closure;
- CRM import/upsert/report with `Situação no CRM`.

## Validation

Local validation on 2026-09-18:

- safe local DB: `re7_queue_domain_test_20260917`;
- backend focused regression: `crmCapabilityRoutes.test.ts` 19/19 PASS;
- covered no campaign, one/multiple campaigns through existing CRM fixtures,
  delivered status, opt-out blocked, identity conflict, same-tenant scope,
  cross-tenant leakage guard, campaign detail link, CRM Situation and no
  financial strings;
- backend build PASS;
- frontend build PASS;
- `git diff --check` PASS.

Owner visual review PASS; production deployment and CRA customer acceptance remain
pending.

## Shared campaign identity projection follow-up - 2026-09-18

Campaign Detail production validation exposed a 13-digit seed associated with a
historical 12-digit outbound for one canonical recipient. The P1 correction is
confined to Campaign Result Truth and reuses the same
`buildCrmWhatsappIdentityCandidates` semantics already used by this Contacts x
Campaigns read model. Contacts data, relationship storage and API contracts are
unchanged. Focused `crmCapabilityRoutes.test.ts` coverage remains green inside
the 72/72 Contacts/channel/billing matrix, including same-tenant scope and
cross-tenant denial. No shadow history, schema, migration or deploy was added.
