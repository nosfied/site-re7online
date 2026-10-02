# Cumulative preparation - 2026-10-02

**ISOLATED BUILDS / RESTORE / SMOKE VALIDATED; NOT DEPLOYED. ACTIVATION BLOCKED.**
Functional candidate: `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`.
Documentary starting HEAD: `c1f3b29db27e29108d33dfb0c52ff42d57d52c59` on
`review/campaign-recovery-20260926`. Preparation resumed under the owner's
existing authorization. No activation, productive migration or send was authorized
or performed. The [first failed attempt](REMOTE_PREPARATION_2026-10-02.md) remains
historical evidence and its isolated directory was not overwritten.

## Corrected composition and reused proof

The final patch is cumulative from **bf5 + f06 + 912**, not incremental from b66.
Its resulting sources include the b66 own-write protection and atomic
`UPDATE ... RETURNING` fence. No separate b66 patch was applied, no patch was
forced, and no sources were substituted after comparison.

| Input | Identity |
| --- | --- |
| Worker source base | `bf5f1d7610ca3f8144faa6f7b7994598e4a4017b` |
| f06 persistence patch SHA256 | `9ce907c09adce3f196953a25780760de2c186c901585b5527ae9c584c3010dc1` |
| 912 automation patch SHA256 | `a265d491677562c2587394cf071f72bc9d9a5b699d5441fc986beabfa5ccaa4f` |
| Final cumulative patch SHA256 | `ab1080df3804b35479a179425bf664db79b0f0caec50f5dd00f97cdac0c1c566` |

[Full source comparison](worker-source-equivalence.json): **408/408 equal**,
zero added/missing/changed. Scope includes every agent source and worker
source/script in the preserved minimal package, not just patched files. API-only
operational scripts are not inputs to that package. All **99/99 compiled worker
files also match** the previously exercised `worker-minimal-final/source` dist.
The directed `compiled-worker-proof.mjs` and `runtime-fence-race-proof.mjs` evidence
is reused because the complete compiled tree is identical; neither script was
rerun. This preserves the distinction between build success and behavioral proof.
The approved API handler proofs remain 4/4 plus the recorded 21/21 regression;
no broad suite was repeated.

## Isolated builds and final registry

New source root:
`/opt/re7online/release-sources/freeform-window-af26-cumulative-20261002`.
The prior `/opt/re7online/release-sources/freeform-window-af26/` remains untouched.
Checksum-verified pinned archives supplied sources, never the productive checkout.
API/frontend use exact af26 sources; worker uses the verified minimal composition.
No candidate API/worker process was started or connected to DB/auth/providers.

| Candidate isolated release | Files hashed | Tree SHA256 |
| --- | --- | --- |
| `af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api` | 425 dist files | `6e92592b41ba0a67565c3c2f62f332807a297e8f52fb884db569bbadcbead611` |
| `af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front` | 1645 .next files | `76e0f9f4723ec74fb4d6c5b76551b5f8517739b2ed2d82127612d7a9e7a8392d` |
| `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window` | 99 dist files | `7d57c73c7769948fc5123479827358e8b4759e872bb7e33358fad06724670d60` |

All live under `/opt/re7online/releases/` but none is active. The worker directory
name records included protections, not an instruction to apply b66 separately.
API/frontend/worker builds PASS. First API build failed with default V8 heap
exhaustion; retry with compiler-only `--max-old-space-size=1536` and niceness 10
passed. An intervening misspelled compiler flag exited before compilation and was
corrected. No PM2 environment was changed. Lockfiles equal active counterparts.
Prisma client 6.19.2 was generated/copied locally in each isolated build; generated
schema equals the active schema byte-for-byte, SHA256
`75c32a1d4fa67626d991d89d0327749c7ca65edea02e969c5733fd2b2c0dc594`.
No migration or `db push` was run.

Frontend candidate BUILD_ID: `J5cHyVKiKEI5xxiGBY5If`.
The [complete executable registry](executables-manifest.json) defines hash
serialization, lists every file hash and records full relative-path deltas:
API +2/-0/changed8; worker +6/-0/changed3; frontend +952/-169/changed634.
API dist includes compiled tests; frontend scope includes cache/build metadata,
maps and runtime, not just deployable JS. These counts are not counts of functional
changes. The worker's six added modules are the verified canonical CRM/bootstrap
dependencies, not a complete API tree copied into the worker.

## Fresh backup and actual isolated restore

Persistent private preparation root:
`/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26`.
Backup interval: **13:56:20-13:59:47 UTC on 2026-10-02**.

- `database.dump`: **24,015,200 bytes**, SHA256
  `14f6c8fe0cdca3525350a31e5a371fcd7987c0fb8f271840dbef60b655bdb53e`.
- `pg_restore --list`: **614 objects**. Config/content/current auth and all three
  active return builds archived separately, with hashes and archive readback
  recorded in the registry. No retention/latest-link/permission cleanup executed.
- Same dump hash restored with `pg_restore --exit-on-error --no-owner --no-acl`
  into a new **local** database at `127.0.0.1:55432`; restore took 3.953 seconds.
- **60 migrations**, zero checksum mismatches against candidate migration SQL;
  snapshot jobs/groups/leases 0, auth records 5. No app connected. Temporary
  database removed and absence verified. No restore touched productive DB/auth.

DB dump is consistent; live filesystem/auth snapshots are not claimed atomic
with DB or proven offsite. A preparation-specific lock and bounded process check
avoided observed competing backup work; this is not a universal cron lock.
Fresh capture/current-auth ownership are still required at the activation window.
The backup-retention permission incident stays pending separately.

## Compiled frontend isolated smoke

The actual remote-built frontend and Node20 binary were transferred to a private
local directory. Next and Chrome ran in a new user/network namespace with loopback
only, **no external route**, read-only host filesystem except private smoke output,
fresh browser profile, service-worker bypass and deny-by-default request interception.
Server-side fallback at port 3001 cannot reach the active backend from this namespace.

| Case | Result and limit |
| --- | --- |
| `/converta` | PASS: widget appears/opens; DOM site identity and simulated session request match private build configuration/API destination. No message submitted. |
| Authentication + Inbox | PASS: protected navigation redirects to login; simulated login loads fixture list/detail; closed-window notice, no Assumir action and disabled freeform textarea. No productive session or authorization validation claimed. |
| Meta Embedded Signup | PASS: configured value checked, page rendered and SDK initialized with local stub. No popup/signup/code exchange/provider call. |

Chrome/CDP plus agent-browser accessibility snapshot used. Final run: **3/3 PASS**,
zero unexpected requests, zero uncaught browser exceptions, zero provider calls.
All **1642 non-cache .next files** used by the isolated smoke match the remote
build hashes; the three cache entries are explicitly excluded from this comparison.
Earlier harness attempts required correction of relative-URL comparison, mock
read-state shape, accessible selectors and simulated console context; no candidate
source was changed. Screenshots inspected locally and kept private. This is a
bounded artifact/config smoke, not owner acceptance, backend auth proof or a new
META_CLOUD/hybrid productive proof.

## Active preservation, return and activation blockers

At **14:16:18 UTC**, read-only recapture showed all three active configurations,
full captured executable hashes, guard, cron and supervision equal to preflight.
Active PIDs remain API **1880019**, worker **1880130**, frontend **1856062**.
Active frontend BUILD_ID remains `l1eBvPioySXt7NLiuFMkg`; active worker has 93 JS
files (not candidate 99). Return remains API b66, worker bf5+f06+912+b66 and
frontend ba66 isolated releases with **current DB/auth**, not the old checkout or
historical auth snapshot. Backend health at 14:21:03 UTC: `ok=true`, `db=ok`.

The final bounded read found **jobs=2, groups=0, leases=1, sendingScheduled=0,
flagsTrue=2, webConnected=4, webAuth=5**. These are total counts; job state,
ownership or an in-flight submission is not inferred. The earlier backup had
jobs/leases=0. Production is live; these later counts do not prove that preparation
created anything or caused a fault. No campaign operation was invoked.

Private switch/return/partial-recovery helpers were copied and checksum-verified;
their original simulated barrier proofs remain applicable because code was not
changed. However, historical zero-work gates and validator constants **1/3/4**
do not match the final read. **Operational activation is blocked pending reviewed
immediate preflight/work reconciliation and justified private validator rebinding.**
No assertion was weakened, no job/lease deleted and no guard/cron changed.
Backup/restore proofs currently reside at the private root; before operations,
bind the verified restore result at `window/restore-result.json` and fresh backup
manifests at each mode's expected path. All execution-gate booleans remain false.
Do not copy journals/exit certificates or restore stale auth.

No containment, process stop/restart/release switch, migration or real send occurred.
Worker and existing services were preserved; no rollback was needed. Productive
**META_CLOUD pure and API-to-WEB remain separate pending validations**. Owner/CRA
acceptance is not inferred. Campanhas, media templates, Guided Builder and repair
6683 are not reopened.

Private evidence remains outside Git under the persistent review worktree's
`local-evidence/freeform-window-operational-20261002/remote-cumulative-preparation/`
and `remote-preservation-final/`; remote input/build/private package paths above
retain the corresponding evidence. Git publishes only sanitized documents,
source hash comparison and executable registry, never env/configs/dumps/bundles.
