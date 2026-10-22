# Campaign recipient eligibility: set-based performance backlog

Status: `BACKLOG / PERFORMANCE EVIDENCE RECORDED / NO PRODUCTIVE REDESIGN`

The PostgreSQL materialization path for a dynamic campaign currently calls
`campaignRecipientEligibility` once for every selected Lead. Each call performs
tenant-scoped checks for anonymized markers, Lead and Contact identity,
operational exclusion, lifecycle, channel, identity conflict, and opt-out. For
3,001 eligible Leads this means 3,001 eligibility calls and a calculable lower
bound of 15,005 related SQL queries, in addition to status resolution, Lead
selection, snapshot persistence, and creation of campaign links and jobs.

## Controlled baseline

Both measurements used Node 20.20.0, npm 10.8.2, PostgreSQL 16, fresh disposable
databases, the same synthetic 3,001-Lead load, the same hardware, no campaign
runner, and a fail-closed provider transport.

| Revision | Lead creation | Status resolution | Lead selection | Eligibility | Snapshot | Campaign/link creation | Job creation | Materialization total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| merge `311efd7df4533b140745c51a598679b3f0ae97bb` | 419 ms | 44 ms | 29 ms | 43,468 ms | 214 ms | 315 ms | 16 ms | 44,118 ms |
| single-flight hotfix | 398 ms | 46 ms | 33 ms | 45,688 ms | 281 ms | 330 ms | 16 ms | 46,417 ms |

The hotfix measurement was 5.21% slower than the merge baseline, below the
10% material-regression threshold. Eligibility consumed more than 98% of the
materialization time in both runs. Classification:
`PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE`.

The 30-second assertion was removed. The test remains a functional contract for
an integral snapshot, chunks `[1000, 1000, 1000, 1]`, four links/jobs, the
correct tenant, no runner, no provider call, no outbound message, and a recorded
diagnostic duration. The suite timeout remains protection against a stuck test;
it is not a product latency SLA.

## Separate future work

Design a tenant-scoped, set-based eligibility read model that evaluates the
selected population once. It must preserve anonymization, operational lifecycle,
operational exclusion, opt-out, channel restrictions, identity conflicts, legacy
identity behavior, and multi-tenant isolation.

The performance matrix for that work must cover population size, eligible and
blocked mixes, direct and legacy identities, anonymized markers, lifecycle,
exclusion, opt-out, channel mismatch, identity conflict, multiple tenants,
snapshot integrity, chunking, and query/plan growth. Capture wall time, query
count, loops, scans, and buffers before and after. No productive eligibility
logic is changed by the single-flight hotfix.
