# Operational Queue Domain Design - 2026-09-17

Status: APPROVED DESIGN / PENDING OWNER SCHEMA AUTHORIZATION / NOT IMPLEMENTED / NO MIGRATION / NO DATA MUTATION / NO DEPLOY.

The Canonical Identity P1 production deploy on 2026-09-17 did not alter this
status. Its target diff contained no Queue schema/runtime implementation, and
read-only pre/post snapshots of Demo departments and queues matched exactly.

## Decision

Normal tenant UX selects a `Department`; `Queue` remains an internal routing
primitive. The recommended model is a nullable explicit
`Department.operationalQueueId` relation to `Queue`. The relation must use a
composite foreign key so the selected queue is provably owned by the same
tenant and department. Runtime must never infer this relationship from queue
name, creation order, reference count or usage frequency.

Proposed Prisma shape, subject to a separate owner-approved implementation
gate:

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
  operationalFor Department? @relation("DepartmentOperationalQueue")
  @@unique([clientId, departmentId, id])
}
```

The exact Prisma referential-action form must be validated in the migration
gate. The database invariant is the important contract: the three source
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
10 tenants:

| Queue cardinality | Departments | Active | Inactive |
| --- | ---: | ---: | ---: |
| 0 | 9 | 2 | 7 |
| 1 | 34 | 32 | 2 |
| more than 1 | 11 | 10 | 1 |

Single-queue rows are candidates for audited one-time ID mapping, not runtime
inference. Every multi-queue row requires an explicit migration decision even
when historical activity strongly indicates a likely choice. Active zero-queue
rows require repair or deactivation before strict activation enforcement.

For Demo `Atendimento Geral`, the evidence supports proposing the one-time
mapping to queue `cmsiyb2k200n94sdpu5khkee0`: it carries current runtime and
campaign/assignment references, while `cmsiwk1ok00074sdzyazpzd7z` has no
meaningful references. This is an audited migration proposal only. Once
approved, the selected ID must be persisted; `Fila Geral` must never become a
runtime rule.

For Demo `Setor Teste`, the preferred remediation is to create an internal
Queue and set `operationalQueueId` atomically if the owner confirms that the
department should receive routing. Otherwise it must be deactivated until an
operational queue is assigned. No production row was changed.

## Rollout

1. Add nullable `operationalQueueId`, composite Queue candidate key and
   same-tenant/same-department FK. Do not switch runtime reads.
2. Produce a reviewed mapping manifest. Auto-propose only one-queue rows;
   manually decide all zero/multi-queue rows. Back up before any write.
3. Backfill exact IDs transactionally and verify every active routable
   Department. Keep unresolved rows blocked from the next phase.
4. Switch standard handoff/campaign routing to the explicit relation, with
   telemetry and fail-closed validation. Do not fall back to names.
5. Make create/activate atomically ensure the internal queue and pointer;
   enforce replacement/block behavior for deletion and deactivation.
6. Remove legacy name-based default resolution only after all providers and
   tenants pass validation. Rollback before this phase may restore old runtime
   reads while retaining the nullable relation; backfill reversal must restore
   pointers only, never rewrite historical queue references.

Current campaign queue selector/badges are not approved for delivery. Campaign
UX owner PASS remains valid for progress, background execution, `Enviando`,
`Agendadas`, recipient-result truth, mobile behavior and absence of customer
pricing; the complete candidate remains undeployed until the queue contract is
approved and implemented.
