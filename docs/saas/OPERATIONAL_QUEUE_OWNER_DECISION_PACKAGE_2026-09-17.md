# Operational Queue Owner Decision Package - 2026-09-17

Status: OWNER DECISIONS COMPLETE / FINAL LOCAL CUTOVER PACKAGE PREPARED / NO
PRODUCTION MUTATION / NO PRODUCTION MIGRATION EXECUTION / NO DEPLOY.

Preflight:

- canonical local HEAD: `45726ef9154e8904e87189573b3c2ea7faa258bb`;
- origin canonical HEAD: `45726ef9154e8904e87189573b3c2ea7faa258bb`;
- production HEAD: `ed329ec8e778902d314ec84c2de3132b4f46b63a`;
- production health: PASS, `/agent-api/health` returned `ok=true`, `db=ok`
  at 2026-09-18T00:09:40Z;
- migration status: production has 58 migrations and is up to date; local
  `20260917213000_add_department_operational_queue` is not deployed.

This package covers only the 5 active blockers left after the complete
54-department reconciliation. The owner supplied explicit decisions on
2026-09-18. Queue names, creation order and usage count alone are not runtime
rules.

Final local package evidence:

- recovery artifact:
  `codex-recovery/operational-queue-domain-20260918-065730.tar.gz`;
- recovery SHA256:
  `20f947c4c61003b3b799d9a8a4b7b6d4f78e5e48a40dc8e4e83b605`;
- schema migration remains schema-only;
- reconciliation script:
  `apps/whatsapp-agent/scripts/reconcile-operational-queues.ts`;
- local test DB:
  `postgresql://deifson-oliveira@127.0.0.1:5432/re7_queue_cutover_test_20260918`;
- local migration apply: PASS, 59 migrations applied, no `prisma db push`;
- local reconciliation first run: 44 explicit mappings updated, 2 internal
  queues created and linked, active unresolved 0;
- local reconciliation second run: 44 explicit mappings noop, 2 internal
  queues noop, active unresolved 0.

## Owner Decision Table

| Tenant | Department | Current state | Owner decision | Operational target | Evidence | Owner decision required |
| --- | --- | --- | --- | --- | --- | --- |
| `demo-converta` | Setor Teste / `cmu1no78102cf4sxsndoqtemc` | ACTIVE / ZERO QUEUES | KEEP ACTIVE + create one internal operational queue and link it atomically | `queue-operational-cmu1no78102cf4sxsndoqtemc` / Atendimento interno | 1 active ADMIN membership, 5 business-hour rows, no active flows, no conversations, no runtime, no assignments, 2 generic events, last activity 2026-09-14T19:55:27Z | NO |
| `lab-websession` | Department Lunch / `cmsqrqwhp00054sefz4tgu5j1` | ACTIVE / ZERO QUEUES | KEEP ACTIVE + create one internal operational queue and link it atomically | `queue-operational-cmsqrqwhp00054sefz4tgu5j1` / Atendimento interno | no members, 2 business-hour rows, no active flows, no conversations, no runtime, no assignments, no events, last activity is creation at 2026-08-13T00:17:20Z | NO |
| `demo-converta` | Dúvidas Gerais - FUNDARPE / `cmsukc3vp00034s9pyfwbv7av` | ACTIVE / MULTI-QUEUE | select exact existing queue | `cmsukc3wa00094s9pa16davow` / Dúvidas Gerais - FUNDARPE | 1 active membership out of 5, 5 business-hour rows, no active flows, no conversations/runtime/assignments; one inactive flow reference per candidate, no explicit default/primary/current config | NO |
| `re7online` | Comercial / `cmraqfcly00014sisaysk2j9e` | ACTIVE / MULTI-QUEUE | select exact existing queue | `cmraqfcm800034sisboqazhtv` / Fila Comercial | 2 active memberships, no hours, no active flows, no conversations/runtime/assignments; 8 department transfer-related events and 4 queue transfer-related events on `cmsypjirp000l4sq617fz41yd`; no explicit default/primary/current config | NO |
| `re7online` | Governo e Licitações / `cmraqfcmn00094sisicjhc2l0` | ACTIVE / MULTI-QUEUE | select exact existing queue | `cmraqfcms000b4sis8s9wbqzs` / Fila Governo | no members, no hours, no active flows, no conversations/runtime/assignments/events/config; no explicit default/primary/current config | NO |

## Zero-Queue Details

### demo-converta / Setor Teste

- Department ID: `cmu1no78102cf4sxsndoqtemc`.
- Active: yes.
- Created at: 2026-09-14T19:48:26Z.
- Members: 1 active membership, ADMIN user Deifson Moseles Silva de Oliveira.
- Hours: 5 rows.
- Active flows: 0.
- Open conversations: 0.
- Historical conversations: 0.
- Campaign references: 0 direct campaign/config references found.
- Transfer/assignment references: 0 assignments; 2 generic events mention the
  department but do not prove current routing intent.
- Last activity: 2026-09-14T19:55:27Z, generic event reference.
- Business purpose: not documented in product docs or explicit config.

Owner options:

- A. KEEP ACTIVE: create one internal operational Queue under the same tenant
  and department, then set `Department.operationalQueueId` atomically. Future
  standard routing uses that new explicit queue ID; history remains unchanged.
- B. DEACTIVATE: leave `operationalQueueId=NULL`. The department becomes
  unavailable for new standard human routing; history remains unchanged.

### lab-websession / Department Lunch

- Department ID: `cmsqrqwhp00054sefz4tgu5j1`.
- Active: yes.
- Created at: 2026-08-13T00:17:20Z.
- Members: 0.
- Hours: 2 rows.
- Active flows: 0.
- Open conversations: 0.
- Historical conversations: 0.
- Campaign references: 0.
- Transfer/assignment references: 0.
- Last activity: creation timestamp only.
- Classification: likely lab/test infrastructure, but not proven currently
  used. No runtime, flow, event, membership or assignment evidence was found.

Owner options:

- A. KEEP ACTIVE: create one internal operational Queue under the same tenant
  and department, then set `Department.operationalQueueId` atomically. Future
  standard routing uses that new explicit queue ID; history remains unchanged.
- B. DEACTIVATE: leave `operationalQueueId=NULL`. The department becomes
  unavailable for new standard human routing; history remains unchanged.

## Multi-Queue Details

### demo-converta / Dúvidas Gerais - FUNDARPE

Department ID: `cmsukc3vp00034s9pyfwbv7av`.

Department evidence:

- active: yes;
- created at: 2026-08-15T16:00:58Z;
- members: 5 total, 1 active;
- hours: 5 rows;
- active flows: 0;
- open conversations: 0;
- historical conversations: 0;
- assignments/transfers: 0 assignments;
- campaign return destinations/current runtime references: none found;
- explicit default/primary/current config: none found;
- department flow references: 2 non-active flow references.

Queue candidates:

| Queue ID | Name | Created at | Evidence classification | Evidence |
| --- | --- | --- | --- | --- |
| `cmsukc3wa00094s9pa16davow` | Dúvidas Gerais - FUNDARPE | 2026-08-15T16:00:58Z | HISTORICAL ONLY / AMBIGUOUS | 1 inactive flow reference, no runtime, no conversations, no assignments, no snapshots, no config |
| `cmsze5h8d00174sl98ehwpsvt` | Fila Geral | 2026-08-19T01:06:41Z | HISTORICAL ONLY / AMBIGUOUS | 1 inactive flow reference, no runtime, no conversations, no assignments, no snapshots, no config |

Owner selected `cmsukc3wa00094s9pa16davow` for future standard routing. No
destructive merge/delete/rewrite is part of the decision.

### re7online / Comercial

Department ID: `cmraqfcly00014sisaysk2j9e`.

Department evidence:

- active: yes;
- created at: 2026-07-07T14:16:21Z;
- members: 2 active;
- hours: 0 rows;
- active flows: 0;
- open conversations: 0;
- historical conversations: 0;
- assignments/transfers: 0 assignments; 8 transfer-related department events;
- campaign return destinations/current runtime references: none found;
- explicit default/primary/current config: none found.

Queue candidates:

| Queue ID | Name | Created at | Evidence classification | Evidence |
| --- | --- | --- | --- | --- |
| `cmraqfcm800034sisboqazhtv` | Fila Comercial | 2026-07-07T14:16:21Z | NO USE / AMBIGUOUS | no runtime, conversations, assignments, snapshots, flows, config or events |
| `cmsypjirp000l4sq617fz41yd` | Fila Geral | 2026-08-18T13:37:46Z | HISTORICAL TRANSFER ONLY / AMBIGUOUS | 4 transfer-related event references, no runtime, conversations, assignments, snapshots, flows or config |

Owner selected `cmraqfcm800034sisboqazhtv` for future standard routing.
Historical transfer evidence alone is not treated as a default/primary
configuration.

### re7online / Governo e Licitações

Department ID: `cmraqfcmn00094sisicjhc2l0`.

Department evidence:

- active: yes;
- created at: 2026-07-07T14:16:21Z;
- members: 0;
- hours: 0 rows;
- active flows: 0;
- open conversations: 0;
- historical conversations: 0;
- assignments/transfers: 0;
- campaign return destinations/current runtime references: none found;
- explicit default/primary/current config: none found.

Queue candidates:

| Queue ID | Name | Created at | Evidence classification | Evidence |
| --- | --- | --- | --- | --- |
| `cmraqfcms000b4sis8s9wbqzs` | Fila Governo | 2026-07-07T14:16:21Z | NO USE / AMBIGUOUS | no runtime, conversations, assignments, snapshots, flows, config or events |
| `cmrarax7g01874sa5l3l5imlb` | Fila Geral | 2026-07-07T14:40:54Z | NO USE / AMBIGUOUS | no runtime, conversations, assignments, snapshots, flows, config or events |

Owner selected `cmraqfcms000b4sis8s9wbqzs` for future standard routing.

## Effect Of Each Decision

KEEP ACTIVE + INTERNAL QUEUE:

- creates one future operational routing target for that department;
- sets `Department.operationalQueueId` to the new Queue ID in the future
  migration/remediation gate;
- historical conversation, campaign, transfer and assignment references remain
  unchanged.

DEACTIVATE:

- makes the department unavailable for new standard human routing;
- leaves `operationalQueueId=NULL`;
- historical records remain unchanged.

SELECT EXISTING QUEUE:

- future standard routing points to the selected Queue ID;
- all other queues remain intact for historical or specialized references;
- no queue is deleted, merged or renamed;
- historical conversation, campaign, transfer and assignment references remain
  unchanged.

## Cutover Simulation

Resolved before owner decisions: 49/54.
Resolved after owner decisions: 54/54 in the local cutover package.

- all active departments resolved in local reconciliation: yes;
- production mapping package ready: yes, pending controlled production gate;
- production migration executed: no;
- production data mutation executed: no;
- production deploy executed: no;
- owner decisions: complete.
