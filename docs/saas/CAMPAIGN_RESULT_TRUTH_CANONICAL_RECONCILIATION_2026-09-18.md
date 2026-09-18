# Campaign Result Truth - Canonical Reconciliation - 2026-09-18

Status: P1 CORRECTIVE VALIDATED LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY.

## Chronology

The initial Campaign Result Truth implementation passed its synthetic regression
but production validation of Demo campaign
`0fb54d61-9f71-42ab-b89d-78ddb23bb694` exposed an uncovered persisted shape.
The intended `****6787` recipient was stored with 13 digits in the campaign seed
and its delivered `OutboundMessage` used the historical 12-digit form. Literal
projection identity did not converge them and added a false missing-history
failure. The production hard gate stopped further delivery validation.

The corrective remains a read-model change. It reuses
`buildCrmWhatsappIdentityCandidates`, the canonical identity primitive already
used by Contact resolution, CRM upsert and Identity P1. Campaign seed recipients,
real outbound attempts and blocked-result evidence are associated by candidate
intersection, scoped to the campaign tenant. No campaign-specific phone rule,
historical rewrite, schema change or migration was added.

## Projection Contract

- one current summary row is rendered per canonical campaign recipient;
- real attempts remain persisted and inspectable; multiple attempts are not
  deleted or rewritten;
- the best current outcome is selected only after attempts are associated with
  the canonical recipient;
- a missing-history fallback is created only when no canonically matching real
  attempt or result evidence exists;
- blocked-before-provider remains `blocked`, not technical `failed`;
- authorized same-tenant Campaign Detail keeps full-phone visibility; logs,
  docs and evidence stay masked.

## Real Production Shape Replay

A read-only replay used the actual persisted seed, outbound and import-blocked
records. It made no provider call and no database write:

- seed recipients: 2;
- real outbound attempts: 1;
- import-blocked events: 1;
- `****6787`: seed 13 digits, outbound 12 digits, canonical match, delivered;
- `****9614`: blocked by `identity_conflict`, zero provider attempts;
- visible rows: 2;
- total 2, delivered 1, blocked 1, pending 0, technical failures 0;
- business label: `Entrega parcial`.

The exact sanitized 13-to-12 shape, reverse 12-to-13 shape, same-tenant and
cross-tenant boundaries, multiple real attempts and genuine missing-history
fallback are regression-covered.

## Validation

- campaign backend integration: 118/118 PASS;
- frontend/import/identity/Operational Queue matrix: 56/56 PASS;
- Contacts x Campaigns/channel/billing matrix: 72/72 PASS;
- corrected projection against actual production records, read-only: 2 rows,
  PASS;
- authenticated local owner-review fixture: 2 visible rows, full authorized
  numbers, delivered 1, blocked 1, pending 0, technical failures 0 and `Entrega
  parcial`, PASS;
- focused frontend lint: PASS; whole backend-file lint remains blocked only by
  two pre-existing baseline findings outside the changed projection
  (`routes.ts:6776` and `routes.ts:26307`); backend TypeScript build PASS;
- schema unchanged; migration none;
- real send none; `****6787` repair none; `****9614` repair none;
- Campaign Composer Cleanup preserved and remains deployed with production
  validation pending.

Production still runs HEAD
`6f63133d7c3bb09097a11c0b49eefa7b9f8383c3`; this P1 corrective is not deployed
until the owner delivery gate is approved.
