# Demo 9614 Campaign Identity Closure - 2026-09-18

Status: ROOT CAUSE CLOSED / HISTORICAL DATA REPAIR EXECUTED / HISTORY PRESERVED.

This started as a sanitized, read-only production audit. After explicit owner
authorization, the historical duplicate identity graph was repaired through one
bounded production DB transaction. It did not send a message, call a provider,
rewrite history, deploy code, reload PM2, or add a schema migration.

## Campaign truth

Campaign `0fb54d61-9f71-42ab-b89d-78ddb23bb694`, `Campanha teste set.2`, belongs
to `demo-converta` and used approved Utility template
`lembrete_vencimento_anuidade` (`pt_BR`). It completed with two intended
recipients:

- `****6787`: one `OutboundMessage`, one provider call, provider accepted and
  delivered;
- `****9614`: zero `OutboundMessage`, zero provider calls, blocked before the
  provider with `identity_conflict`.

The template, Utility category, 24-hour policy, opt-out, campaign schedule,
business hours and explicit Cobranca return destination did not cause the
block. The seed and `campaign.recipient.import_blocked` event preserve the
second intended recipient and the exact business-readable reason.

## Exact root cause

At campaign execution and at this audit, canonical forms for `****9614`
resolved to two active same-tenant Contacts and one Lead:

- primary Contact `77c780bf-3501-4a55-9261-673b2c6cbbc4`, created through the
  CRM path, owns the CRM and Web Session channel identities;
- secondary Contact `ee236657-cb12-467d-aac7-b35ed41ff421`, created by the
  historical campaign outbound bootstrap, owns the Meta channel identity;
- primary Lead `cmtg3jmq4011p4s7d4vhpk0sd`, attached to the primary Contact.

Therefore: `****9614` was blocked because `resolveCrmContactIdentity` found two
same-tenant canonical Contact candidates for the same phone identity and
refused to choose one. This is intentional fail-closed behavior, not a provider
or template failure.

The duplicate was created during prior campaign
`e715b417-672e-43ca-8be2-d486feed65ba` by the former exact-identity campaign
bootstrap. The secondary Contact and Meta identity were created on 2026-09-17
before Identity P1 commit `b8f43fcf` was authored later that day. That fix
replaced the bootstrap with the canonical resolver. Current manual CRM, API,
CSV, campaign bootstrap, Meta inbound, Web Session inbound and conversation
hydration coverage does not reproduce the duplicate factory.

Classification:

- historical duplicate residue: YES;
- active resolver bug: NO;
- active creation bypass found: NO;
- would the same recipient be blocked today without data repair: YES.

## Result-truth invariant

Every intended campaign recipient must have exactly one explainable current
result. Provider calls, `OutboundMessage` rows, reason and timestamp must
reconcile with that result; an intended recipient cannot disappear or acquire
contradictory current rows.

For this campaign the canonical summary is:

- total 2;
- processed 2;
- delivered 1;
- blocked 1;
- pending 0;
- technical failures 0.

`blocked` is an eligibility/identity outcome and is not double-counted as a
technical failure. Persisted campaign execution status remains `completed`;
the truthful business presentation is `Entrega parcial`. The authenticated,
same-tenant detail shows one row for each intended recipient and may show the
full phone. Draft/review, logs, docs and cross-tenant/public surfaces remain
masked or denied.

## Transactional repair package - executed

The executed repair remained inside the minimal owner-approved boundary:

1. lock and re-read the primary Contact, secondary Contact, primary Lead and
   their channel identities in one transaction;
2. assert that all known canonical forms still produce exactly the two Contact
   candidates and one Lead, and that no new live references appeared;
3. move Meta channel identity `cmu5rf8lp02lz4sawqc929bi1` from the secondary
   Contact to primary Contact `77c780bf-3501-4a55-9261-673b2c6cbbc4`;
4. preserve the primary Lead and its legitimate Web Session channel identity;
5. remove only live canonical selectors from secondary Contact
   `ee236657-cb12-467d-aac7-b35ed41ff421` and mark it operationally excluded,
   preserving the row and all historical event references;
6. assert after mutation that every supported form resolves to one Contact and
   one Lead, while campaign, outbound, billing, opt-out, consent and
   conversation history/counts remain unchanged.

No merge by name, creation order or usage was used. There was no secondary Lead
to relink. Current conversation runtime state and Cobranca routing remained
unchanged. No resend was part of the repair.

## Ops dry-run readiness - 2026-09-18

The production runtime checkout did not contain the previously prepared
`apps/whatsapp-agent/scripts/demo-9614-identity-repair-dry-run.ts` artifact, so
the readiness gate stopped before repair authorization. The tool is now
versioned on the separate ops branch
`ops-demo-9614-repair-readiness-20260918`, commit
`4425923041836ed05c7c37f571a3c3c14b0fd903`, without changing or deploying the
live application checkout.

Tool hashes:

- dry-run script:
  `155c21ba247bb4cba892b8968cd4c9db2b95e0fa50d392d989b3437b31431d49`;
- repair planner:
  `8018c92664affbc527554a4caaa0ec26d59cabeaa25b43d139be32f5fe1150cf`.

Validation:

- planner unit tests: 3/3 PASS;
- isolated test database:
  `127.0.0.1:5432/re7_ops_9614_test_20260918`, not production;
- test dry-run against seeded isolated graph: PASS, blockers 0;
- production dry-run from separate VPS worktree:
  `/opt/re7online/ops-worktrees/demo-9614-repair-readiness-20260918`;
- production dry-run result: PASS, blockers 0;
- graph counts: Contacts 2, Leads 1, Channel identities 3, open
  Conversations 0, open ConversationRuntimeStates 1;
- runtime state `91bc59ab-d6e8-41cc-bec8-ca00c6244217`: NOOP. It is already
  Web Session-scoped to the primary identity selectors and does not reference
  the secondary Meta identity;
- projected eligibility: identity PASS, opt-out PASS, template PASS, return
  destination PASS, 24h relevance `UTILITY_TEMPLATE_OK`;
- expected deltas: outbound 0, billing 0, campaign history 0, opt-out history
  0, provider call 0, hard delete NO.

Persistent snapshot package:

`/opt/re7online/backups/converta-persistent/demo-9614-repair-readiness-20260918`

Persistent PostgreSQL backup:

`/opt/re7online/backups/converta-persistent/postgres/demo-9614-repair-readiness-20260918/whatsapp_agent-pre-demo-9614-repair-20260918-212055.dump`

- SHA-256:
  `7a522196cec9ded7fd9d2c07cab9fac819ad1f707610144b7060cdbfce2ae44e`;
- size: 20,832,168 bytes;
- `pg_restore --list`: 596 lines.

Pre/post dry-run hashes after snapshot and backup were identical:

- graph:
  `818dd6d7bd6a1551b6e086031c04af722721207c50955106233e732d545c6c9d`;
- snapshots:
  `31f2a679cfbed216195e67765ec49c47f05989cf559679ac0879b695dad9f2b4`.

Status: SUPERSEDED BY OWNER-AUTHORIZED TRANSACTIONAL REPAIR BELOW. No provider
call, resend, schema, migration, PM2 reload or app deploy occurred during the
readiness phase.

## Owner-authorized transactional repair - 2026-09-18

Owner authorization: EXPLICIT PASS.

Production runtime stayed on HEAD
`4fbea0f78cad5080eac2773eb2c19e08f9b45e02`. The app checkout was not advanced,
rebuilt, deployed or reloaded. Repair ran only from the separate VPS ops
worktree on branch `ops-demo-9614-repair-readiness-20260918`, commit
`bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9`.

Executor tooling:

- execute script SHA-256:
  `f446db723cc548b7861d30ad3cda2c6192dc33fe7d0fbf97960ea9079e5e7d0a`;
- repair planner SHA-256:
  `36418dc4a369c354fd23be7366847372c29e698c4cf2edd19cdd932c90f42d77`;
- planner tests on VPS: 4/4 PASS.

Fresh final dry-run immediately before write:

- snapshot:
  `/opt/re7online/backups/converta-persistent/demo-9614-transactional-repair-20260918-213327`;
- blockers: 0;
- runtime impact: NOOP;
- projected eligibility: PROJECTED_ELIGIBLE;
- outbound/provider/billing counts for `****9614`: 0/0/0;
- campaign import block for `****9614`: 1.

Transaction result:

- status: COMMITTED;
- Meta `ContactChannelIdentity` `cmu5rf8lp02lz4sawqc929bi1` moved to primary
  Contact `77c780bf-3501-4a55-9261-673b2c6cbbc4`;
- secondary Contact `ee236657-cb12-467d-aac7-b35ed41ff421` retained and
  operationally excluded with archived selector
  `archived:demo-9614-repair:ee236657-cb12-467d-aac7-b35ed41ff421`;
- secondary Contact channel/provider/account/hash/ref selectors set to null;
- primary Lead `cmtg3jmq4011p4s7d4vhpk0sd` preserved;
- ConversationRuntimeState `91bc59ab-d6e8-41cc-bec8-ca00c6244217` preserved
  as `WAITING` / `HUMAN`, department `cmtg2g0zs00154sjgd1kez3iv`, queue
  `cmtg2g10000174sjgmir39vno`;
- campaign `0fb54d61-9f71-42ab-b89d-78ddb23bb694` preserved as
  `completed`, total 2, sent 1, blocked 1;
- provider calls: 0;
- resend: NO;
- hard delete: NO.

Fresh repair artifacts:

- pre-repair snapshot:
  `/opt/re7online/backups/converta-persistent/demo-9614-transactional-repair-execute-20260918-213342/demo-9614-pre-repair-snapshot.json`,
  file SHA-256
  `9677f37c762e0442206f4898a90eebc22db60c5a19d0e58fbe384779e6c75c7e`;
- post-repair snapshot:
  `/opt/re7online/backups/converta-persistent/demo-9614-transactional-repair-execute-20260918-213342/demo-9614-post-repair-snapshot.json`,
  file SHA-256
  `db2b031018ae9139ef03c156a7e0f97b249520ec9d73a3a40e7e7f171bf96c38`;
- manifest:
  `/opt/re7online/backups/converta-persistent/demo-9614-transactional-repair-execute-20260918-213342/demo-9614-repair-manifest.json`,
  file SHA-256
  `1b12924cfd442545aeb7f3a7699a5b89090b795f148b2c15268a5bd2e2a71261`.

Idempotency dry-run after commit:

- snapshot:
  `/opt/re7online/backups/converta-persistent/demo-9614-idempotency-20260918-213357`;
- blockers: 0;
- runtime impact: NOOP;
- planned action includes `noop: repair already applied`;
- eligibility: PROJECTED_ELIGIBLE;
- graph counts remain Contacts 2, Leads 1, Channel identities 3, open
  Conversations 0, open ConversationRuntimeStates 1;
- campaign checks remain outbound 0, provider 0, billing 0, import block 1.

Post-repair direct DB verification:

- primary Contact remains live with Web Session selectors;
- secondary Contact remains as historical retained record, operationally
  excluded and without live canonical selectors;
- Meta identity owner is the primary Contact;
- runtime state business status/mode/routing unchanged;
- historical campaign remains `completed` with total 2, sent 1, blocked 1.

The historical campaign result for `****9614` remains truthfully preserved as
`BLOCKED / identity_conflict`; it was not converted into sent/delivered and no
historical provider/outbound/billing event was invented.

Operational lesson: mutable integration tests must never run with the
production `DATABASE_URL`. Production readiness must use read-only SQL,
purpose-built non-mutating dry-run tools, health checks and projection logic.
Mutable tests belong only on isolated local/test databases.

## Validation

The first synthetic Result Truth validation did not reproduce the production
seed/outbound representation. The subsequent production gate exposed a
13-digit seed and historical 12-digit delivered outbound for `****6787`; the
literal projection added a false missing-history row. The gate stopped and the
P1 read-model corrective reused the established canonical identity candidate
set. An exact sanitized regression and a read-only replay of the actual records
now produce two rows only: `****6787` delivered and `****9614` blocked, with no
technical failure. This changes no conclusion or repair boundary for `****9614`.

- campaign backend suite: 118/118 PASS on dedicated local PostgreSQL;
- campaign frontend contract: 12/12 PASS;
- current canonical resolver synthetic `9614`-shaped 13/12-digit test: PASS;
- complementary frontend/import/identity/Queue matrix: 56/56 PASS;
- Contacts x Campaigns/channel/billing matrix: 72/72 PASS;
- actual production campaign projection replay, read-only: 2 rows, PASS;
- schema unchanged; migration none.

Production remained read-only throughout this gate.
