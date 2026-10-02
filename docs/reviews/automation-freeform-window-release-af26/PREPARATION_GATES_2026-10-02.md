# Remaining preparation gates, 2026-10-02

Status: PREPARATION COMPLETE / NOT DEPLOYED / ACTIVATION WINDOW REQUIRED.
Review HEAD at inspection: `aaad298febcda5375ff21c6bfce74824423fcbde`.
Functional candidate remains `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`.

## Work classification

Bounded read at 14:59:55 UTC found three jobs, not the two in the earlier
14:16 observation. One further campaign had completed in the intervening period.
All three jobs were completed with started/finished timestamps and attempt=1;
the two linked campaigns were also completed. This is durable execution evidence,
not a claim that every recipient was delivered or billed.

The one tenant lease had jobId=null and expired at 14:27:48.215 UTC. Its stored
owner matched the latest completed job. The owner PID still existed in the active
API release. The row is a released lease, not evidence that the API has exited.
Exact tenant/job/campaign/lease IDs and owners remain in private evidence, not Git.

The guard was available/open, generation=9, tasks=0, ledgerFault=null and
drained=false. An open guard with zero tasks is not quiescence. No containment,
guard mutation, cancellation, scheduler change or process exit was performed.

## Private bindings

Private package root remains
`/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26`.
Each of switch/return/return-partial/return-front-missing now binds its
backup-manifest.json; window/restore-result.json binds the verified restoration.
The original package files and failed binding staging attempts were preserved.

- Dump: 24,015,200 bytes; SHA-256
  `14f6c8fe0cdca3525350a31e5a371fcd7987c0fb8f271840dbef60b655bdb53e`.
- Catalog: 614 objects, as already validated. Restore was not repeated.
- Exact remote backup manifest SHA-256:
  `cf2c4da6cf171d15e400783c2d3c9880327f918613d409794917fce582bbce03`.
- Restore proof SHA-256:
  `1d1423c7c653bc0c4f23cf0583ac358477df1e197ec6f735f0922915ed495c69`.

The previously captured local manifest included one extra final newline (2379
versus 2378 bytes). Parsed objects were equal and byte comparison proved this
exact difference. Bindings use the actual remote bytes; the dump did not change.

Validators no longer equate total job/lease count with unfinished work. They
block every job other than completed-with-finishedAt, every linked or unexpired
lease, any group and any sending/scheduled campaign. Unknown/paused/review/pending
states fail closed until individually reconciled. This is an operational check,
not a change to campaign execution rules.

Operational flag tenants, connected account IDs and auth row IDs are bound
privately, not merely by totals: 2/4/5. Equal counts with substituted identities
fail. BUILD_ID binds the actual prepared frontend `J5cHyVKiKEI5xxiGBY5If` and
the original return frontend `l1eBvPioySXt7NLiuFMkg` separately.

## Validation and unchanged barriers

Only the changed binding checks were exercised: test-bindings.cjs 9/9 and
test-guard.cjs 16/16 with simulated filesystem/commands/HTTP. After fixing the
manifest byte binding, only test-bindings.cjs was rerun: 9/9.
String assertions about SQL are not behavioral SQL proof: the final exported SQL
was also executed once against production in a bounded READ ONLY transaction;
blocking jobs/groups/leases/sendingScheduled were 0/0/0/0, and exact baseline
identities matched. Pure proof/baseline checks passed for all four private modes.
No operational entrypoint was executed.

Hashes were checked for all private bound files. ops.py, stop-pair.py,
start-one.py, stop-front.py, contain.py, unfence.py, restore-controls.py,
recover-partial.py and execution-check.cjs were unchanged against the original
private package. PID/start ticks, descendants, sockets, DB backends/advisory locks,
CAS guard and sequential start/return requirements remain intact. All five
execution approval gates remain false. Builds, frontend smoke and restoration
were reused; none was repeated.

Private evidence: local-evidence/freeform-window-operational-20261002/
classification.private.json and binding-validation-20261002.json;
remote binding-validation-20261002.json under the private package root.
Configurations, identifiers and credential-bearing snapshots remain private.

## Activation is separate

There is no unresolved preparation binding blocker. This does not authorize
switching processes or assert that a future activation window is drained.
Reconfirm current identities/work/guard/processes and take a fresh verified backup
at that window; rebind its proof only after the prescribed verification.
Contain and close admissions by the runbook, then prove both old executors and
their descendants/sockets/DB ownership are absent before any successor starts.
The same exit barrier applies on return. Preserve current DB/auth and isolated
return releases. META_CLOUD pure and API-to-WEB productive validation remain
separate pending items; no owner or CRA acceptance is inferred.
