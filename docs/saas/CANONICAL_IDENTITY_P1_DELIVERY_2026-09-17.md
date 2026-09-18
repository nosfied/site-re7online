# Canonical Identity P1 Delivery - 2026-09-17

Status: DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.

## Scope

This delivery closes two exact-`waId` identity bypasses without changing the
database schema:

- Meta inbound and capture through `ensureLeadForConversation`;
- campaign outbound CRM bootstrap.

Both now reuse `resolveCrmContactIdentity`, the same side-effect-free canonical
resolver used by manual/API and CSV CRM upsert. Its input is tenant `clientId`
plus a phone representation. Its result contains the canonical WhatsApp ID,
confirmed candidate representations, and existing tenant-scoped Contact/Lead
matches derived from phone normalization, CRM and multichannel external hashes,
and `ContactChannelIdentity` evidence.

No second identity engine was introduced. Exact matching remains only as a
compatibility fallback for synthetically invalid non-phone identifiers, for
which canonical phone equivalence is undefined.

## Invariants and validation

- confirmed 13/12-digit variants converge to one Contact and one Lead;
- Web Session and Meta identities may remain distinct provider identities but
  attach to the same canonical Contact;
- an external-hash-only match is reused;
- the same person in another tenant remains separate;
- campaign provider execution and transport behavior are unchanged;
- no tenant hardcode, schema, migration, backfill or historical rewrite.

The clean delivery passed 119 focused tests: 88 identity/CRM/import/Web Session,
7 selected Meta/campaign/opt-out routes, 5 campaign runner, 2 campaign
lifecycle, 2 campaign seed privacy, 8 return-destination and 7 CRM conversation
start tests. Backend build, focused lint and `git diff --check` passed.

## Separation

Campaign UX owner validation remains PASS, but no Campaign frontend/runtime UX
delta is included in this delivery. Progress modal, `Enviando`, `Agendadas`,
recipient result detail, no-price presentation and mobile refinements remain in
the preserved source worktree. Queue-dependent UI is not deliverable until the
explicit operational Queue relation is authorized and implemented.

Operational Queue design is documented separately in
`OPERATIONAL_QUEUE_DOMAIN_DESIGN_2026-09-17.md`. It is not implemented here.

Production Demo `****6787` was not readjusted, merged, archived or relinked.
Its repair remains a separate owner-authorized transactional gate.

## Production deployment

On 2026-09-17 production advanced by FF-only from `cad9489c` to `ed329ec8`.
The persistent PostgreSQL backup is
`/opt/re7online/backups/converta-persistent/postgres/identity-p1-20260917-205632`
with verified dump SHA-256
`61a4b7e09bd47576650e263adb5fa91ea7b3bf1d107ca30c5da2ae065917918e`.

The production backend build passed and only `re7-whatsapp-agent` was reloaded.
The frontend and Web Worker retained their prior PID/restart counters, and Web
Session `.data` remained present. Backend health and DB returned `ok`, frontend
returned HTTP 200, changed modules loaded, and unauthenticated CRM, campaign and
opt-out checks returned the expected 401 rather than 5xx. No post-deploy errors
or crash loop were observed.

Read-only pre/post snapshots matched exactly for both historical Demo
`****6787` Contacts and Leads and for all Demo departments/queues. No schema,
migration, Queue data, Setor Teste, Atendimento Geral mapping or historical
identity data changed. These checks are non-destructive production evidence;
duplicate prevention has not yet been exercised by a real post-deploy identity
event.

## Demo `****6787` repair preparation - 2026-09-18

Identity factory remains CLOSED / DEPLOYED. A later read-only production
preparation gate re-enumerated the historical Demo `****6787` duplicate graph
and produced a dry-run-only repair plan in
`DEMO_6787_CANONICAL_IDENTITY_REPAIR_PREPARATION_2026-09-18.md`.

Status: HISTORICAL DUPLICATE / REPAIR PREPARED / NOT EXECUTED.

The prepared plan preserves all historical Event, Campaign, OutboundMessage,
provider message ID, billing, opt-out, consent, assignment and transfer history.
It does not rewrite campaign `e715b417-672e-43ca-8be2-d486feed65ba` and does not
claim that any production repair has already happened.
