# Campaign recipient eligibility: set-based performance backlog

Status: `DRAFT PR #364 / ELIGIBILITY PARITY VALIDATION`

At the production reference `b8d284b6`, dynamic campaign materialization calls
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

## Bounded set-based candidate

[PR #364](https://github.com/nosfied/site-re7online/pull/364) evaluates dynamic
multibatch eligibility in groups of 500, preserves the positional decisions,
and retains scalar revalidation immediately before each send. The group size
bounds SQL bind usage. A single call for 3,001 Leads was rejected at 36,014
binds against the observed limit of 32,767.

| Leads | Scalar eligibility | Groups of 500 | Scalar SQL queries | Batched SQL queries |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 6,644 ms | 226 ms | 5,000 | 12 |
| 3,001 | 15,247 ms | 601 ms | 15,006 | 45 |

These are local measurements from disposable PostgreSQL 16 with synthetic data,
a simulated provider, and network access to Meta blocked. The end-to-end
materialization of 3,001 Leads took 3,012 ms, including 656 ms for eligibility.
It persisted one snapshot, four links, and four jobs with chunk sizes
`[1000, 1000, 1000, 1]`, with zero active runners, outbounds, or provider
calls. The measured eligibility decisions matched the scalar path for the tested
fixtures.

At code revision `a4283c528085e2f49a97bcf8a2ffeb348e3297d5`, the local
affected suite passed 45/45 and
[CI 42516121815](https://github.com/nosfied/site-re7online/actions/runs/42516121815)
passed 4/4. The anonymization regression expects snapshot counts
`matchedCount=1`, `eligibleCount=1`, `blockedCount=0`, and `blocked=[]`.
The fixture still has six stored Leads, and only the non-anonymized Lead
reaches the simulated provider. The counts describe the selected audience.

Production volume acceptance remains a separate step for an actual tenant
need and an approved execution scope. The 3,001-Lead proof covers
materialization. Send and recovery behavior was exercised with smaller
fixtures.

## Legacy anonymization alias parity

A source-level probe using the candidate code and simulated Prisma queries
reproduced a positional decision that depends on batch composition. With a
stored anonymization marker whose digits match only the legacy (no ninth digit)
alias, scalar eligibility returns `anonymized_contact` for the modern
recipient. Batched eligibility returns `null` for that same recipient in
isolation and `anonymized_contact` when the legacy alias is also an input.
The SQL marker lookup uses the union of raw input digits while the scalar
lookup expands the supported identity before querying.

The correction uses the scalar lookup candidates for each recipient, including
expanded aliases for supported identities and raw digits for unsupported inputs.
The PostgreSQL regression covers the modern recipient alone, with the legacy
alias in the same group, and across the 500-recipient boundary. The earlier
timings and CI describe the tested revision and fixtures.

## Separate future work

Any follow-up to the bounded candidate must preserve anonymization, operational lifecycle,
operational exclusion, opt-out, channel restrictions, identity conflicts, legacy
identity behavior, and multi-tenant isolation.

The performance matrix for that work must cover population size, eligible and
blocked mixes, direct and legacy identities, anonymized markers, lifecycle,
exclusion, opt-out, channel mismatch, identity conflict, multiple tenants,
snapshot integrity, chunking, and query/plan growth. Capture wall time, query
count, loops, scans, and buffers before and after. No productive eligibility
logic is changed by the single-flight hotfix.
