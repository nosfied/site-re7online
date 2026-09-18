# Operational Queue Domain Design - 2026-09-17

Status: CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.

Implementation was prepared from canonical HEAD `45726ef9154e8904e87189573b3c2ea7faa258bb`
in `/tmp/re7-operational-queue`. Owner local UX validation passed on
2026-09-17, which opened the read-only production mapping audit gate. On
2026-09-18 the owner supplied the five remaining decisions. Production advanced
by FF-only from `ed329ec8e778902d314ec84c2de3132b4f46b63a` to
`b166bcac8bf443d34ba7f3821016b6bae8069728`; backup
`/opt/re7online/backups/operational-queue-rollout-20260918-104054` passed;
migration `20260917213000_add_department_operational_queue` applied; and
production reconciliation resolved 54/54 departments with no active unresolved
department.

## Decision

Normal tenant UX selects a `Department`; `Queue` remains an internal routing
primitive. The recommended model is a nullable explicit
`Department.operationalQueueId` relation to `Queue`. The relation must use a
composite foreign key so the selected queue is provably owned by the same
tenant and department. Runtime must never infer this relationship from queue
name, creation order, reference count or usage frequency.

Implemented Prisma shape:

```prisma
model Department {
  id                 String  @id @default(cuid())
  clientId           String  @db.Uuid
  operationalQueueId String?
  operationalQueue   Queue?  @relation(
    "DepartmentOperationalQueue",
    fields: [clientId, id, operationalQueueId],
    references: [clientId, departmentId, id],
    onDelete: Restrict
  )
}

model Queue {
  operationalForDepartments Department[] @relation("DepartmentOperationalQueue")
  @@unique([clientId, departmentId, id])
}
```

The database invariant uses `ON DELETE RESTRICT` and `ON UPDATE CASCADE`: the three source
values `(clientId, departmentId, operationalQueueId)` reference the same three
values on `Queue`. One field on one Department permits at most one operational
queue. It remains nullable during rollout and for an inactive draft department.

## Alternatives

### `Department.operationalQueueId` - recommended

- Referential integrity and same-tenant/same-department ownership can be
  enforced by the composite FK above.
- One pointer naturally enforces zero-or-one operational queue per department;
  product validation enforces exactly one before activation/routing.
- Campaign and human routing perform one direct relation lookup and continue
  persisting concrete `departmentId` plus `queueId`.
- Replacing the pointer affects future routing only. Existing conversation,
  campaign, transfer and report references keep their historical queue IDs.
- Queue deletion is blocked while selected. Department deletion must use the
  existing authorized lifecycle after clearing the pointer in the same
  transaction; no implicit reassignment is allowed.
- It adds one nullable field, one composite candidate key and one FK. This is
  the smallest explicit aggregate-owned contract, but it requires a migration.

### `Queue.isOperationalDefault`

- Same-tenant ownership follows the Queue row, but one default per department
  requires a filtered unique index for `true` or a more intrusive uniqueness
  design; Prisma cannot express the desired partial uniqueness alone.
- It permits invalid active states with no default unless every write path is
  guarded, and replacement requires coordinated two-row updates.
- Runtime lookup remains simple, but the invariant belongs less clearly to the
  Department aggregate. It is not preferred.

### `TenantOperationalConfig` department-to-queue mapping

- It avoids a Department column, but a JSON mapping has no database FK,
  uniqueness or same-tenant/same-department enforcement.
- Deletion, replacement and provisioning integrity would depend entirely on
  application code and stale JSON cleanup.
- This is appropriate for compatibility configuration, not a core routing
  relationship. It is rejected as the canonical model.

### Separate `DepartmentOperationalQueue` relation model

- Composite FKs can enforce the same invariants without a circular pointer,
  and the model could carry future lifecycle metadata.
- It adds a table, an additional join and a second lifecycle entity for a
  relationship that currently has no attributes.
- It becomes preferable only if future audited requirements add effective
  dates, history or multiple named routing roles. That requirement does not
  exist now.

## Required invariants

1. An inactive draft Department may have no operational queue.
2. Activating a human-routing Department and creating its internal Queue and
   explicit relation is one transaction. Failure leaves it non-operational.
3. Every active Department used by human or campaign routing resolves exactly
   one explicit Queue ID.
4. Campaign HUMAN return destinations persist both IDs; runtime verifies the
   queue still belongs to the selected department and tenant.
5. Replacing the pointer changes only future routing. Historical rows retain
   their Queue IDs.
6. The selected Queue cannot be deleted/deactivated without an atomic
   replacement or a blocked/deactivated Department.
7. Additional queues may remain for history or a future explicitly authorized
   advanced capability. They are invisible in normal customer UX.
8. Queue display name is diagnostic only and never controls routing.

Transfers to a specific existing Queue continue to persist that concrete
destination; reporting continues to group historical records by their stored
Queue IDs. Standard handoff, campaign return and newly activated departments
use the explicit operational pointer.

## Production inventory

Read-only production inventory on 2026-09-17 covered all 54 Department rows in
10 tenants. The complete reconciliation matrix is recorded in
`docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md`.

| Queue cardinality | Departments | Active | Inactive |
| --- | ---: | ---: | ---: |
| 0 | 9 | 2 | 7 |
| 1 | 34 | 32 | 2 |
| more than 1 | 11 | 10 | 1 |

Single-queue rows are auto-safe for audited one-time ID mapping, not runtime
inference. Every multi-queue row requires an explicit migration decision even
when historical activity strongly indicates a likely choice. Active zero-queue
rows require owner-approved repair or deactivation before strict activation
enforcement.

Complete audit classification:

| Classification | Count |
| --- | ---: |
| exactly-one queue / auto-safe explicit mapping | 34 |
| inactive null-allowed | 8 |
| active zero-queue blocker | 2 |
| multi-queue resolved by audit | 7 |
| active multi-queue ambiguous blocker | 3 |

Production cutover is **not executed**. The five previously unresolved active
departments have explicit owner decisions recorded in
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`; the local
cutover package resolves all active departments explicitly. Production still
has no schema migration, data mutation or deploy from this gate.

| Tenant / department | Department ID | Owner decision |
| --- | --- | --- |
| `demo-converta` / Setor Teste | `cmu1no78102cf4sxsndoqtemc` | keep active; create/link internal queue `queue-operational-cmu1no78102cf4sxsndoqtemc` |
| `lab-websession` / Department Lunch | `cmsqrqwhp00054sefz4tgu5j1` | keep active; create/link internal queue `queue-operational-cmsqrqwhp00054sefz4tgu5j1` |
| `demo-converta` / Dúvidas Gerais - FUNDARPE | `cmsukc3vp00034s9pyfwbv7av` | select existing queue `cmsukc3wa00094s9pa16davow` |
| `re7online` / Comercial | `cmraqfcly00014sisaysk2j9e` | select existing queue `cmraqfcm800034sisboqazhtv` |
| `re7online` / Governo e Licitações | `cmraqfcmn00094sisicjhc2l0` | select existing queue `cmraqfcms000b4sis8s9wbqzs` |

For Demo `Atendimento Geral`, the evidence supports proposing the one-time
mapping to queue `cmsiyb2k200n94sdpu5khkee0`: it carries current runtime and
campaign/assignment references, while `cmsiwk1ok00074sdzyazpzd7z` has no
meaningful references. This is an audited migration proposal only. Once
approved, the selected ID must be persisted; `Fila Geral` must never become a
runtime rule.

For Demo `Setor Teste` and Lab Web Session `Department Lunch`, the read-only
audit found active departments with zero queues but no current runtime/flow
use. They must not be auto-repaired by assumption: the next gate must either
approve exact internal queue creation and atomic linkage or deactivate the
department until configured. The inactive null-allowed rows remain nullable.
No production row was changed.

## Audited mapping manifest

The migration/backfill plan maps all 34 exactly-one rows structurally and seven
multi-queue rows by audited exact IDs. It must leave the five active unresolved
rows blocked until explicit owner decisions are recorded. The seven audited
multi-queue targets are:

| Tenant / department | Operational Queue ID | Evidence |
| --- | --- | --- |
| `demo-prefeitura` / Saude | `cmookf7xl00074sqbtwwbi02j` | dominant runtime references |
| `re7online` / Suporte | `cmraqfcmj00074siskfe5j2lh` | runtime plus active flow reference |
| `secult-pe` / Mapa | `cmsrfhcu2000l4swiyjsxpdg1` | runtime, flow and snapshots |
| `demo-converta` / Atendimento Geral | `cmsiyb2k200n94sdpu5khkee0` | runtime and campaign references; no contradiction |
| `demo-converta` / SECULT | `cmsukc3w400074s9pw9rv1yxi` | runtime, flow and snapshots |
| `demo-converta` / Mapa | `cmsukc3wf000b4s9psxgb1ju0` | active flow references |
| `demo-converta` / Registro | `cmtg2g0uo00034sjgh37pwiy1` | flow and snapshot majority |

Five active rows were previously unresolved and now have explicit owner
decisions. Runtime fails closed with `operational_queue_unavailable` if a future
active department lacks an explicit pointer and never chooses a candidate:

| Tenant / department ID | Operational target | State |
| --- | --- | --- |
| `re7online` Comercial / `cmraqfcly00014sisaysk2j9e` | `cmraqfcm800034sisboqazhtv` | owner-selected existing queue |
| `re7online` Governo e Licitacoes / `cmraqfcmn00094sisicjhc2l0` | `cmraqfcms000b4sis8s9wbqzs` | owner-selected existing queue |
| `demo-converta` FUNDARPE / `cmsukc3vp00034s9pyfwbv7av` | `cmsukc3wa00094s9pa16davow` | owner-selected existing queue |
| `demo-converta` Setor Teste / `cmu1no78102cf4sxsndoqtemc` | `queue-operational-cmu1no78102cf4sxsndoqtemc` | owner-approved internal queue creation |
| `lab-websession` Department Lunch / `cmsqrqwhp00054sefz4tgu5j1` | `queue-operational-cmsqrqwhp00054sefz4tgu5j1` | owner-approved internal queue creation |

`demo-converta` Projetos e Editais / `cmsiwk1o800034sdzdhd603l7` is inactive
with multiple queues and is intentionally nullable until/unless it is activated.

## Local implementation

- Department create/activate creates and links the internal Queue in one
  transaction; queue failure rolls the Department back.
- Deactivation and metadata edits preserve the pointer and all Queue/history
  rows. Consolidation clears only the source pointer before its existing queue
  move and requires an operational target.
- Reactivation reuses a preserved operational queue and does not create a
  duplicate queue. Explicit replacement validates same tenant and same
  department; the prior queue remains for history.
- Campaign, chatbot handoff, manual transfer, Meta pending handoff, support and
  webchat standard routing read the explicit pointer. Existing concrete Queue
  IDs remain valid for historical/specialized records.
- Campaign and Guided Builder expose only `Setor`; their internal resources
  project at most the explicitly selected operational Queue. No multi-queue
  selector, queue badge or queue name is shown in the standard flow.
- Missing mapping blocks before provider/runtime mutation with: "Este setor
  ainda não está disponível para receber atendimentos."

## Production rollout package - not executed

1. Reconfirm the owner-approved final package and production preflight. Do not
   deploy if production inventory diverges from the 54-row reconciliation.
2. Capture encrypted PostgreSQL backup and immutable preflight inventory; prove
   current production HEAD, migration status, PM2 health and DB health.
3. Deploy the schema/runtime release together, stop automatic traffic restart,
   run `prisma migrate deploy`, and verify the composite FK, 59 applied
   migrations and the exact mapping counts. Never use `prisma db push`.
4. Validate that every active routing Department has one pointer, every pointer
   joins the same client/department, Atendimento Geral points to
   `cmsiyb2k200n94sdpu5khkee0`, and only approved inactive rows remain null.
5. Build backend/frontend, reload only the WhatsApp agent and frontend PM2
   processes. The Web Worker has no schema consumer change and requires no
   targeted reload unless its deployed artifact changed.
6. Smoke Department create/deactivate/reactivate, Campaign draft destination,
   chatbot handoff resources, inbox transfer, outside-hours queueing, SECULT
   hours and tenant isolation. No real campaign send is part of this rollout.
7. Rollback constraint: code may be rolled back before new relation-dependent
   writes; the nullable migration should remain forward-applied. Do not drop the
   column/FK or rewrite historical queue IDs during an incident. Restore the DB
   backup only for a proven migration-level failure under a separate gate.

Local validation on 2026-09-18:

- local schema migration: PASS, 59 migrations applied, no `prisma db push`;
- reconciliation first run: 44 explicit mappings updated, 2 internal queues
  created/linked, active unresolved 0;
- reconciliation second run: 44 explicit mappings noop, 2 internal queues
  noop, active unresolved 0;
- domain tests: `operationalQueue.test.ts` 8/8 PASS;
- runtime routing tests: `outboundReturnDestination.test.ts`,
  `departmentAwareHandoff.test.ts`, `webchatInboundService.test.ts` 30/30 PASS;
- identity tests: `canonicalRuntimeIdentity.test.ts`,
  `crmWhatsappIdentity.test.ts`, `crmConversationStartRoutes.test.ts` 12/12
  PASS;
- campaigns/routes regression: `campaignsFeatureRoutes.test.ts` 114/114 PASS;
- frontend guided builder regression: `ChatbotFlowBuilder.test.ts` 53/53 PASS;
- backend build PASS; frontend build PASS.

Production rollout on 2026-09-18:

- production backup PASS: `/opt/re7online/backups/operational-queue-rollout-20260918-104054`,
  dump `20,664,912` bytes, 578 objects, SHA256
  `a5898b277a82e5d0317314c9decaeb75dede023f76a8d55afc2044c4da230ddf`;
- production migration: `20260917213000_add_department_operational_queue` PASS,
  no `prisma db push`;
- production reconciliation first run: 44 explicit mappings updated, 2 internal
  queues created/linked, active unresolved 0;
- production reconciliation second run: 44 explicit mappings noop, 2 internal
  queues noop, active unresolved 0;
- post-verify: 54 departments, 44 active resolved, 0 active unresolved, 8
  inactive null, 2 inactive with queue, 0 cross-tenant/department links;
- production backend build PASS; frontend build PASS; targeted PM2 reload PASS;
  HTTP smoke PASS.

Campaign UX owner PASS remains valid for progress, background execution,
`Enviando`, `Agendadas`, recipient-result truth, mobile behavior and absence of
customer pricing. Queue-dependent delivery is deployed. Demo `****6787` was not
mutated or repaired in this gate.
