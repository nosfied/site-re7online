# Canonical Identity P1 Delivery - 2026-09-17

Status: IMPLEMENTED / TEST VALIDATED / READY FOR CONTROLLED DEPLOY / NOT DEPLOYED.

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
Its repair remains a separate owner-authorized transactional gate after this
code delivery is deployed and validated.
