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

Additional local hardening on 2026-09-19 made the shared CRM WhatsApp identity
parser the entry gate for new manual Contact phones, Contact CSV import rows and
Campaign CSV recipient rows. Permanent invariant: NO NEW CONTACT/RECIPIENT PHONE
MAY BE PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION. Missing DDD,
unsupported/non-Brazil numbers, impossible lengths and structurally invalid
Brazilian subscriber numbers are rejected before persistence; approved 12/13
Brazilian identity equivalence remains preserved through the same canonical
candidate set.

Contacts/Campaigns CSV convergence on 2026-09-19 keeps this invariant at the API
boundary: Contact CSV and Campaign CSV both parse through the shared CSV parser
and pass phones through the canonical CRM WhatsApp identity path before any
domain-specific persistence. Contacts-specific CRM status updates remain in CRM
upsert; Campaign-specific seed/send behavior remains in Campaigns.

Production closeout on 2026-09-19 deployed commit
`1f8304f8624e76ba3efc507b9eccd80060447adb` after backup and fast-forward-only
ancestry audit. Non-destructive Demo validation confirmed Contact CSV/Campaign
CSV preview rejects invalid phones before persistence and preserves 12/13-digit
canonical identity resolution for known Demo contacts `****9614` and `****6787`.
Historical invalid data was not claimed cleaned.

Contacts CSV complete lot addendum, 2026-09-20: OWNER PASS / DEPLOYED /
PRODUCTION NON-DESTRUCTIVE VALIDATED. Contact CSV import keeps the same canonical identity boundary and
adds a preview-mapping invariant: a preview is valid only for the exact phone,
name and CRM Situation column mapping that produced it. If any mapping changes,
the stale preview remains visible for comparison, import is blocked, and the
operator must refresh the preview before persistence can proceed. This preserves
the permanent rule that no Contact or campaign recipient phone may persist
without canonical normalization and validation. Production validation for
deployed commit `9bb5f88f6a10ff3280e5adcdc777e9df0b0f7657` used only Demo
preview/read-only paths and left Contact, ContactChannelIdentity, Lead,
Campaign, OutboundMessage and Event counts unchanged.

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
