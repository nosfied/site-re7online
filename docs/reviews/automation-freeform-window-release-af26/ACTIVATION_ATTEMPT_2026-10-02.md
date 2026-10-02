# Authorized activation attempt, 2026-10-02

Status: ACTIVATION BLOCKED BEFORE CONTAINMENT / NOT DEPLOYED.
Reviewed preparation: `9947af777433305760dba9b4e8a9d3f45489fae0`.
Authorized functional candidate: `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`.
Branch: `review/campaign-recovery-20260926`.

## Window and exact blocker

- Immediate preflight: 12:30:34 America/Fortaleza (15:30:34 UTC).
- Final bounded preservation check: 12:34:57 America/Fortaleza (15:34:57 UTC).
- Containment start/end: NOT STARTED / NOT APPLICABLE.

The live host remained re7online-api-01. The repository remained detached at
`5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`, with only the preserved worker
.data/ entry untracked. Active release/configuration/PID and artifact comparisons
matched preparation evidence; cron and supervision also matched.

Before taking the fresh activation backup, the mandatory command
`sudo -n nft -j list tables` failed with exit 1: `sudo: a password is required`.
The bounded diagnostic `sudo -n -l` failed identically. Therefore this session
cannot prove or operate the required privileged fence/control steps using the
reviewed noninteractive scripts. The effective sudo policy could not be listed;
no claim about its individual allowed commands is made.

This is an operational authentication prerequisite, not a missing owner
authorization. Switch and prescribed return remain authorized, but execution
needs an authenticated privileged context compatible with the existing scripts.
No sudoers/permissions were changed, no credentials were guessed and no alternate
privileged mechanism was substituted. The exit/fence assertions were not waived.

## Active versions and preservation proof

| Component | Actual active isolated release | PID | Files | Relative-file manifest SHA-256 |
| --- | --- | --- | --- | --- |
| API | b66bb89aca9112277463b7d2adbee0b9e7831157-api | 1880019 | 423 | efcd11c7fae3f20ed4d665fc54899ef94cb1872967a2c2106ff2212f3af90146 |
| Worker | worker-bf5f1d76-f06d49cb-91230f88-b66bb89a | 1880130 | 93 | 00ad2634a9b95f6deaf69cd95c2a364aabf71838639d1a2a3339b1c03fbf6995 |
| Frontend | ba66c24112ccb10f2dfdcced54350f513d399bc6 | 1856062 | 862 | 349a94844ecd10cbe25949f1c98254bf8fcf14648aea957f9868f163bce6603e |

Manifest hashes above use SHA-256 of sorted JSON relative-path-to-file-hash maps
from dist/ or .next/ in the immediate read. They are not commit hashes or hashes
of a single executable. Active frontend BUILD_ID: `l1eBvPioySXt7NLiuFMkg`.
There was no artifact delta against preserved active releases.

The final bounded check confirmed all three original PIDs online, zero restart
counts, local backend ok=true/db=ok, exact initial cron/system cron/supervision,
guard open/generation=9/tasks=0/ledgerFault=null, all five execution gates false,
and absence of stop/start/exit certificates. Guard open/tasks=0 is not drain.

Prepared candidate API/frontend af26 and cumulative minimum worker remain
isolated/inactive. Their approved hashes and behavior proofs remain in
[executable registry](executables-manifest.json) and
[preparation closure](PREPARATION_GATES_2026-10-02.md). Candidate hash/config/work
checks that follow the privileged preflight were not reached in this attempt;
do not present prior preparation proof as completed activation proof.

## Stage results

| Stage | Result |
| --- | --- |
| Read active releases/configuration/control baseline | PASS |
| Required privileged preflight | BLOCKED: sudo authentication unavailable |
| Fresh activation backup and isolated restoration | NOT EXECUTED |
| Rebind fresh backup/restore proofs and enable execution gates | NOT EXECUTED |
| Close admissions, contain, stop/barriers/start successors | NOT EXECUTED |
| Save/fallback and restore controls | NOT EXECUTED; originals unchanged |
| Return | NOT USED; no process or release had been replaced |

The dated preparation dump/restore remains preserved, not promoted to the fresh
activation-window backup. Only an unused private activation directory was created;
no operational journal/certificate, backup or runtime/config change was made by
this attempt. Natural production activity was not suspended.
No application build, behavioral suite, frontend smoke or restoration was repeated.
No migration, auth cleanup, replay, tenant activation, provider send or test send.

## Resume conditions

Resolve the authenticated privilege prerequisite without weakening scripts.
Then reconfirm active identities/configuration/artifacts and work in a fresh
preflight, use a new private capture/journal as required, take and restore the
fresh backup, bind its exact proofs and execute the authorized runbook.
Both switch and return require old executor/descendant/socket/DB/lock exit proof
before successors. Preserve current DB/auth, initial controls and isolated return
releases; no migration or historical DB/auth restore is implied.

Private evidence remains under local-evidence/freeform-window-operational-20261002/
activation-preflight-20261002/ and activation-20261002T153229Z/. Configurations,
credential-bearing snapshots and detailed identity records are not published.
META_CLOUD pure and hybrid API-to-WEB functional validation remain pending and
separate. No owner validation, CRA acceptance or closure of those items is claimed.
