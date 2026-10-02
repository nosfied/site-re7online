# Automation Freeform Window Release af26f48a

**ISOLATED PREPARATION / NOT DEPLOYED / ACTIVATION PREFLIGHT BLOCKED.** Functional
candidate: `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`. This document replaces the
conflicting recipes with one ordered sequence, shared by switch and return.
Preparation commands were executed only in isolated sources/releases; process
switch commands were not executed. The private script bindings described
below are mandatory preparation gates; historical scripts must not run against
their old preparation directory.

**Historical first attempt, 2026-10-02, BLOCKED before builds:** the pinned final worker patch
does not apply after the runbook's b66 predecessor patch. Its old blobs correspond
to the preserved base912 sources. Do not repeat that historical b66-stacked
recipe or overwrite the partial source tree. Use the corrected sequence below.
See the
[remote preparation result](REMOTE_PREPARATION_2026-10-02.md) for exact hashes,
failure locations, unchanged processes and the composition prerequisite to resume.
That first attempt produced no fresh backup/restore, candidate executable or smoke.
The corrected attempt is recorded separately in
[cumulative preparation](REMOTE_CUMULATIVE_PREPARATION_2026-10-02.md) and its
[executable registry](executables-manifest.json). Worker sources are 408/408
equal to the tested reference, and all 99 compiled files match that reference.
Active processes/releases remain unchanged. Current job/lease/config/session
counts no longer match the historical activation invariants; do not activate or
relax those checks based on this preparation.

## Evidence and unresolved divergences

Read-only inspection on 2026-10-01 recorded:

| Component | Observed active isolated release |
| --- | --- |
| API | `/opt/re7online/releases/b66bb89aca9112277463b7d2adbee0b9e7831157-api` |
| Frontend | `/opt/re7online/releases/ba66c24112ccb10f2dfdcced54350f513d399bc6` |
| Worker | `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a` |

The repo checkout was detached at `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`,
with worker `.data/` untracked. It does not identify the active executables and
must not supply candidate sources/builds/patches. Reconfirm active releases and
DB/auth realpaths at future preflight.

Reconciliation on 2026-10-02 corrects the initial manifest's mixed artifact
attribution: `Ywhs03ZOWIsb-IppyXqEJ` belongs to the older `5ee2de6b` frontend;
92 belongs to the worker before `runtimeWriteFence.js` was added. Preserved
deployment evidence and the bounded read agree on active frontend BUILD_ID
`l1eBvPioySXt7NLiuFMkg` and 93 worker files (all JS), with no file/hash drift.
This is not a counting-method change or evidence of an intervening rebuild.
See [operational preparation report](OPERATIONAL_PREPARATION_REPORT.md) and
[sanitized operational manifest](operational-manifest.json). Fresh preflight
must still compare exact lists/hashes and abort on unexplained drift. Candidate
executable hashes and its own BUILD_ID are now recorded in the cumulative registry.

Package `manifest.json` contains source/document/historical hashes, not final
candidate executable validation. API/frontend comparison patch SHA256:
`fb4de7d7a2922328c67cfc5e1169ef8a49815980d88d45ada3746e43f98e563f`.
Worker is **bf5 + f06 + 912 + final cumulative window patch**, independently
assembled. The final patch includes the b66 protections and atomic
`UPDATE ... RETURNING` fence; **never apply b66 separately before it**.

## Historical scripts actually inspected

On 2026-10-02, file reads/downloads confirmed the six scripts below at:

`/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z`

During that earlier script-inspection stage, no script, process operation,
backup, restore or build was executed. The subsequent authorized preparation
is recorded separately above. References:
[previous preparation](../../saas/AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md),
[executed rollout](../../saas/AUTOMATION_RUNTIME_FIX_ROLLOUT_2026-09-30.md),
[three-process procedure](../../saas/AUTOMATION_RELEASE_COMMANDS_2026-09-29.md),
[canonical runbook](../../RUNBOOK_WHATSAPP_AGENT.md).

| Script | SHA256 | Actual contract |
| --- | --- | --- |
| `close.cjs` | `efba29660bd91d5471c4d45c0ac7f827122f703a271b86510d51addffcf0f177` | Private return config; backup manifest; initially open guard; zero jobs/sending/scheduled; generation-based close and drain verification. |
| `stop-pair.py` | `e1eb8f273178a6c657fdda8bcebb20ce0169dac41b1ac333f0e0f10489a21fc5` | One-use; closed guard, window cron, disabled supervision, restore proof and fence. Captures API/worker trees/start ticks/sockets; stops both; requires old identities/sockets absent and zero other DB clients/advisory locks. Frontend identity/path must remain unchanged. Produces `old-exit-confirmed.json`. |
| `start-one.py` | `d069aa30da224ec9f6e9b37577552b974d535a8b73d685ed6f86da1c6fa60515` | API then worker only; fresh exit certificate, exact remaining PM2 apps and private candidate CJS; verifies cwd/script/executable/env/watch/restarts. |
| `read-state.py` | `bcd304cab7e74937fdb753a2631221d7ae7b65a726486ac6210eb8a8e4b90b5e` | Private state capture; fixed paths need binding; output stays private. |
| `validate.cjs` | `334c2ec0016568cb1c74ef3b80868c9dd57fb768d894a1361d9a4fe18253278c` | Read-only health/guard/frontend/worker/DB/process checks; hardcodes b66 build and historical counts. |
| `open.cjs` | `00326334383d61621bb906d1e143add1b51215cd40d171c168b478ef5b97d85e` | Generation-based reopen after closed/drained checks; hardcodes b66 build. |

Shell `PREP` does not override their hardcoded directory. Future private
preparation must preserve hash-verified originals and produce reviewed bound
copies for fresh `switch/` and `return/` directories, with original/bound hashes
and diffs. Bind only PREP, source/target configs, expected frontend path/build,
evidence-backed counts and release reason; preserve ownership, CAS, drain, exit
and single-use assertions. Never delete markers to repeat a partial stop.

`close.cjs` requires an open guard; an initially closed guard needs a reviewed
verification branch, without forced reopening. `open.cjs` is used only if initial
guard was open. The original pair stop requires all three PM2 apps online; a
partially started pair needs a separately reviewed barrier adaptation. Historical
`start-one.py` cannot start frontend. These are concrete preparation dependencies,
not demonstrated automatic recovery paths.

## 1. Freeze source and directory identities

Future commands are individual reviewed steps, after authorization:

```bash
set -euo pipefail
umask 077
DOC_SHA=db671f4f43aa6aaf2e1f874540ebef8d633515da
TARGET=af26f48a9c309b24ec4d23cfa97cc1e407c09d98
BASE_WORKER=bf5f1d7610ca3f8144faa6f7b7994598e4a4017b
ORIGIN_URL=https://github.com/nosfied/site-re7online.git
SOURCE_ROOT=/opt/re7online/release-sources/freeform-window-af26-cumulative-20261002
DOC_SRC="$SOURCE_ROOT/documental-db671f4f"
API_SRC="$SOURCE_ROOT/api-frontend-af26"
WORKER_SRC="$SOURCE_ROOT/worker-minimal-af26"
API_RELEASE=/opt/re7online/releases/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api
FRONT_RELEASE=/opt/re7online/releases/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front
WORKER_RELEASE=/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window
EVIDENCE=/opt/re7online/release-evidence/freeform-window-af26-$(date -u +%Y%m%d-%H%M%S)
HIST=/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z
PM=/home/deploy/.npm-global/bin/pm2
test ! -e "$SOURCE_ROOT"
test ! -e "$API_RELEASE"
test ! -e "$FRONT_RELEASE"
test ! -e "$WORKER_RELEASE"
install -d -m 700 "$SOURCE_ROOT" "$EVIDENCE"
git clone --no-checkout "$ORIGIN_URL" "$DOC_SRC"
git -C "$DOC_SRC" checkout --detach "$DOC_SHA"
test "$(git -C "$DOC_SRC" rev-parse HEAD)" = "$DOC_SHA"
PATCH_ROOT="$DOC_SRC/docs/reviews"
git clone --no-checkout "$ORIGIN_URL" "$API_SRC"
git -C "$API_SRC" checkout --detach "$TARGET"
install -d -m 700 "$WORKER_SRC"
git -C "$DOC_SRC" archive "$BASE_WORKER" apps/whatsapp-agent/src apps/whatsapp-agent/prisma apps/whatsapp-agent/package.json apps/whatsapp-agent/package-lock.json apps/whatsapp-agent/tsconfig.json apps/whatsapp-web-worker | tar -x -C "$WORKER_SRC"
git -C "$WORKER_SRC" init --quiet
```

All source/release destinations must be absent; abort instead of replacing an
existing candidate. Fixed documental checkout contains the required patches;
never use a moving branch or productive checkout for them.
The corrected directory now exists; these commands are not an overwrite recipe.
Use another exclusive directory for any later assembly. The recorded preparation
transferred checksum-verified `git archive` inputs instead of clones, with the
same pinned sources. Minimal packaging includes all sibling agent sources and
worker sources/scripts, not API-only operational scripts, matching the tested
408-file source set and 99-file compiled set.

Capture live hostname, Node/PM2, configs/env privately, cwd/exe/PIDs/start ticks,
descendants/listeners, supervision enabled/active state, cron content/metadata,
guard generation/open/scheduler/tasks/fault, sessions and auth/data realpaths.
Require supported Node20 lineage, unambiguous ownership and compatible return
releases. Current DB/auth must remain current through switch and return.

## 2. Isolated assembly, configuration and builds

```bash
cd "$PATCH_ROOT"
sha256sum -c <<'HASHES'
9ce907c09adce3f196953a25780760de2c186c901585b5527ae9c584c3010dc1  secult-worker-persistence/worker-persistence.patch
a265d491677562c2587394cf071f72bc9d9a5b699d5441fc986beabfa5ccaa4f  automation-worker-backport/worker-automation-91230f88.patch
ab1080df3804b35479a179425bf664db79b0f0caec50f5dd00f97cdac0c1c566  automation-worker-backport/worker-freeform-window-gate-20261001.patch
3fa762b7f2c62e60b3291b44dbf562be731c0fd2437bd2be635a5abae28ecb55  automation-worker-backport/manifest.json
HASHES
for patch in secult-worker-persistence/worker-persistence.patch automation-worker-backport/worker-automation-91230f88.patch automation-worker-backport/worker-freeform-window-gate-20261001.patch; do
  git -C "$WORKER_SRC" apply --check "$PATCH_ROOT/$patch"
  git -C "$WORKER_SRC" apply "$PATCH_ROOT/$patch"
done
git -C "$API_SRC" diff --check
git -C "$WORKER_SRC" diff --check
```

Before transfer/build, compare every resulting source/script relative path and
SHA256 with the tested minimal tree, not merely the changed modules. Any
added/missing/changed source blocks continuation. The corrected attempt passed
all 408 files; see `worker-source-equivalence.json`.

Before builds, prepare private frontend build environment from the actually
active frontend and effective API/worker environment from current PM2 configs
and resolved files. Produce private candidate/return ecosystem CJS as in the
previous preparation, binding only cwd/script/build identity. Preserve DB URL,
crypto keys, control credentials, tenant/transport settings, scheduler, shared
guard, auth/session/media/data realpaths. Record allowlisted equality privately;
no secret values in console/Git, no `eval` or PM2 metadata copied wholesale as env.
Historical CJS files point at older releases and cannot be reused unchanged.

The existing configuration routine was also read in `$HIST/prepare.py`, SHA256
`4640521a84b7cf5de754086afc904bf18dbccb8caef483b71d282c57a4f190d2`.
It clones an existing ecosystem CJS, checks each app against live cwd/script and
`/proc/<pid>/environ`, then writes exclusive-create private candidate/return CJS
with mode 600. Reuse that routine after binding all three new paths and target
build. Do not execute the whole historical `prepare.py`: it copies old releases,
substitutes old modules and hardcodes 93. Preserve its auth realpath and generated
Prisma equality checks in the new private preparation.

Compare candidate Prisma schema with active DB-compatible generated schema,
structurally if formatting differs. Abort on a migration requirement. Minimal
worker needs sibling API dependencies/schema/generated client; retain them in
its release. Its runtime sources remain minimal. Resolve shared auth/data paths
from active realpaths; never start against a new empty `.data` or duplicate auth
ownership. Record private symlink/config bindings for final release paths.

```bash
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size=1536
install -m 600 "$EVIDENCE/frontend.env.production.local" "$API_SRC/.env.production.local"
install -m 600 "$API_SRC/apps/whatsapp-agent/prisma/schema.prisma" "$WORKER_SRC/apps/whatsapp-agent/prisma/schema.prisma"
cd "$API_SRC"
npm ci --include=dev
npm --prefix apps/whatsapp-agent ci --include=dev
npm --prefix apps/whatsapp-agent run db:generate
npm --prefix apps/whatsapp-agent run build
npm run build
cd "$WORKER_SRC"
npm --prefix apps/whatsapp-agent ci --include=dev
npm --prefix apps/whatsapp-web-worker ci --include=dev
npm --prefix apps/whatsapp-agent run db:generate
node apps/whatsapp-web-worker/scripts/copy-prisma-client.mjs
npm --prefix apps/whatsapp-web-worker run build
install -d -m 700 "$API_RELEASE" "$FRONT_RELEASE" "$WORKER_RELEASE"
rsync -a --exclude .git --exclude .data --exclude local-evidence "$API_SRC/" "$API_RELEASE/"
rsync -a --exclude .git --exclude .data --exclude local-evidence "$API_SRC/" "$FRONT_RELEASE/"
rsync -a --exclude .git --exclude .data --exclude local-evidence "$WORKER_SRC/apps/" "$WORKER_RELEASE/apps/"
```

The environment-file install above uses the private minimum derived from the
candidate contract, not a file copied from the active release. Configuration
is now RESOLVED: see [frontend build contract](FRONTEND_BUILD_CONTRACT.md).
The private source file is
`local-evidence/freeform-window-operational-20261002/window/frontend-candidate-contract/frontend.env.production.local`;
bind it to `$EVIDENCE/frontend.env.production.local` only during separately
authorized preparation. Use an allowlisted build environment, without unrelated
dotenv inputs or inherited overrides. The preserved compiled rewrite is
`/public-api/:path* -> http://127.0.0.1:3001/public-api/:path*`; production
`/agent-api` is not a Next rewrite. See the report for bounded configuration proof.
`npm ci` installs fixed lockfiles in isolated sources;
no productive dependency update. Start worker through its compiled Node entry in
the private CJS, avoiding unreviewed `npm start`/Prisma prestart generation.
Verify final config/data bindings before containment.
The heap option applies only to isolated compiler subprocesses, never to PM2 or
business configuration. The first isolated API compile exhausted its default
heap; the successful retry used this limit and niceness 10.

### Isolated frontend verification before activation

This gate was exercised by the cumulative preparation's bounded simulated smoke;
it is not a productive session/provider validation. For a later run, start only
the isolated candidate frontend on a free
loopback port with its resolved build inputs. Do not connect a candidate API or
worker to active DB/auth/providers for this check. Use the existing local fixture
and response-simulation infrastructure, a fresh browser profile and deny-by-default
egress. Intercept requests before navigation; any unhandled API/Meta/provider
request must fail the check, not fall through to production. The built localhost
rewrite is not permission to reach the active backend. If server-side requests
cannot be isolated, do not start the candidate until that isolation is prepared.

Record private configuration comparisons and sanitized screenshots/request
summaries; exclude values, tokens and response PII from Git. Verify:

- `/converta`: widget script loads and launcher renders; `data-site-id` equals
  the private contract value, and `data-api-base`/resolved request destination
  equal the intended private API base. Confirm the actual widget consumer reads
  those attributes. Record equality results, not the identifiers. No missing-site
  fallback or accidental production/domain-relative destination is accepted.
- Opening the widget invokes `POST /webchat/v1/session`; fulfill it with an
  isolated synthetic response only. Capture the requested site and URL privately.
  Any message-history polling also uses simulated replies. Never submit text,
  click a response option or allow `POST /webchat/v1/messages`. Close the profile
  afterward; no real visitor/session/contact creation or provider call.
- Authentication: login UI, intended `/agent-api` destination and session/error
  handling with existing local fixtures/simulated responses; no production login
  or fabricated production session. Page 200 is not authenticated proof.
- Inbox: authenticated local fixture loading, RBAC, missing/invalid/expired
  window UI, lifecycle display and template readiness remain available; no claim,
  manual/pronta/media send, template send or CRM mutation.
- Meta Embedded Signup: intended App/Config ID resolution against the private
  contract/code fallbacks, loading/error/recovery UI and existing runtime override
  behavior. Intercept SDK/network responses; do not launch actual signup/OAuth,
  exchange a code, approve a template or change an account.

These checks establish candidate wiring/rendering under isolation, not production
widget identity validity, provider readiness or owner acceptance. Preserve approved
behavioral evidence; repeat only a check justified by the newly built executable.

### Final remote preparation order (separate authorization required)

1. Fresh read-only preflight: active isolated release identities, ownership,
   private config/auth bindings, prerequisites and reviewed source/patch hashes.
   Preserve originals as return; no active rebuild or config change.
2. Assemble pinned API/frontend and minimal worker sources in the isolated
   directories defined above. Apply only verified packaged patches; use the
   four-entry private frontend contract and unchanged API/worker configuration.
3. Resolve pinned dependencies and generated Prisma/schema compatibility in
   those isolated trees; build API, frontend and worker there. No migration.
4. Register full executable hashes, BUILD_ID, relative file lists and complete
   deltas against each active release, plus dependency/Prisma/config identities.
   Review differences; exercise the isolated frontend checklist above and reuse
   approved source/compiled proofs only for matching composition.
5. Prepare fresh bound private switch/return/partial-recovery helpers and review
   hashes/initial controls. Take a fresh persistent backup under the canonical
   procedure and verify isolated restoration, equivalence and manifests. Retention
   cleanup permission failure remains separate; no improvised chmod/delete.
6. Deliver the preparation evidence for review. Builds and backup/restore need
   their preparation authorization; neither authorizes process replacement.
   Admissions/containment, stop barriers, sequential starts and exact control
   restoration remain a separate, explicitly authorized activation stage below.

## 3. Executable registry, backup and script preparation gates

```bash
for pair in "api:$API_RELEASE/apps/whatsapp-agent/dist" "worker:$WORKER_RELEASE/apps/whatsapp-web-worker/dist" "frontend:$FRONT_RELEASE/.next"; do
  label=${pair%%:*}
  directory=${pair#*:}
  (cd "$directory" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$EVIDENCE/$label.executables.sha256"
done
cat "$FRONT_RELEASE/.next/BUILD_ID" > "$EVIDENCE/frontend.candidate.BUILD_ID"
(cd "$WORKER_RELEASE/apps/whatsapp-web-worker" && find dist -type f | sort) > "$EVIDENCE/worker.candidate.files"
```

Use identical relative-path commands on confirmed active releases; record full
deltas, dependency/lockfile and Prisma identities. Resolve BUILD_ID and 92/93
before proceeding. Executable hashes are in `executables-manifest.json`; source
and documentary hashes remain separate. Reuse approved compiled
proofs only when sources/composition match; build alone is not behavioral proof.

Fresh persistent backup and isolated restore follow the canonical runbook and
previous `backup-manifest.json`/`restore-result.json` contracts: dump path/size/
hash/catalog, config/auth snapshot paths, restore equivalence, temporary DB
removal, initial release/config identity. Preserve snapshots and the retention
permission incident. Historical backup is not the fresh activation-window backup.
The cumulative preparation report records the actual preparation backup and
isolated restore; activation still requires current evidence.

Before containment, privately prepare and review:

- `switch/`: old pair as return CJS; candidate pair as candidate CJS; current
  frontend path; fresh one-use markers.
- `return/`: candidate pair as return CJS; original pair as candidate CJS; actual
  frontend path; fresh stop certificate generated during return, never copied.
- Bound six historical scripts, original/bound hashes and diffs, fresh manifests,
  shared `WINDOW` initial-state/cron/fence evidence, checked nft file, auth paths.
- Frontend barrier/start adapter from the historical three-process procedure:
  capture PID/start ticks/tree/socket identities; stop only frontend; verify all
  captured identities/sockets absent; then start selected private CJS entry and
  verify cwd/script/env/BUILD_ID. Pair `start-one.py` cannot perform this step.
- Partial-start recovery barrier for actual surviving processes: the original
  pair script requires all apps online and cannot recover that case unchanged.

**Bound helpers/configs/frontend adapter have local simulation proof and were
copied privately to the preparation directory, but never executed operationally.**
Their exact paths, arguments, hashes and reviewed contracts must be added to the
private window manifest before execution. The final count read found 2 jobs,
1 lease, 2 automation flags, 4 connected WEB accounts and 5 auth records;
historical validator constants and zero-work prerequisites are not satisfied.
These are activation blockers, not permission to remove jobs or change controls.
No invented script path is presented
as existing. Without these artifacts the runbook is not execution-ready. Do not
replace barriers with raw delete/start, superficial `ps -p`, copied certificates
or generic reload. This gate applies equally to deployment and return.

## 4. Single containment, exit and start sequence

Choose fresh bound `PREP=switch/` or `PREP=return/`; `WINDOW` is their shared
initial-state/cron/fence directory. Assign absolute reviewed paths before these
commands. Neither variable redirects unbound historical scripts.

```bash
test -s "$PREP/scripts.sha256"
(cd "$PREP" && sha256sum -c scripts.sha256)
python3 "$PREP/read-state.py" > "$PREP/immediate-before.private.json"
node "$PREP/close.cjs"
```

Require closed/drained guard, current generation, tasks=0, fault=null and no
unexpected work. Initially closed state uses the reviewed verification branch,
not forced reopening. Campaign drain does not prove worker/inbound/auth drain;
in-flight interruption requires assessment in the authorized window, never replay
of uncertain submissions.

When entering containment from the initial state:

```bash
sudo nft --check --file "$WINDOW/automation-fence.nft"
sudo nft list tables
crontab -l | cmp - "$WINDOW/deploy.crontab.before"
cmp /etc/cron.d/re7-converta-backup "$WINDOW/re7-converta-backup.before"
sudo install -o root -g root -m 0644 "$WINDOW/re7-converta-backup.window" /etc/cron.d/re7-converta-backup
(cd "$WINDOW" && crontab deploy.crontab.window)
sudo systemctl disable pm2-deploy.service
sudo nft --file "$WINDOW/automation-fence.nft"
sudo nft list table inet re7_campaign_transition
systemctl show pm2-deploy.service --property=ActiveState,UnitFileState
```

Require checked fence for ports 3000/3001, table absent before installation,
unchanged unrelated rules, initial enabled/inactive supervision contract, no
third-party/root PM2 or concurrent initiator. Cron `.window` is a reviewed minimal
diff from `.before`; suspending cron does not terminate an existing job.

Return while containment is still active verifies nft table, cron `.window` and
disabled supervision; it does not add a duplicate table or compare active window
cron to `.before`. Return after restoration repeats the full containment entry.
Both directions then execute the same stop/start sequence:

```bash
python3 "$PREP/stop-pair.py"
test -s "$PREP/old-exit-confirmed.json"
python3 "$PREP/start-one.py" re7-whatsapp-agent
python3 "$PREP/start-one.py" re7-whatsapp-web-worker
```

The fresh certificate must prove both old API/worker identities, descendants and
sockets absent, zero unknown DB clients/locks, unchanged frontend and no respawn,
**before any pair successor**. Failure maintains containment and forbids new
processes, extra kill, lock deletion, logout or auth clear. API starts first, then
worker. Verify local API and worker control health with private credentials;
public checks occur after fence removal. Pair verifier does not support partially
started return without the separately reviewed recovery barrier.

Under the same containment, use the reviewed frontend barrier/start adapter from
section 3, with its exact private-manifest command, selecting candidate frontend
for switch or original frontend for return. Require its old-process/socket exit
certificate before its successor. If this adapter is absent, stop before the
frontend action; do not improvise reload. A second independent release recipe is
not permitted.

## 5. Validate and restore exact initial controls

Only after all selected processes pass identity/hash/env checks:

```bash
"$PM" save
install -m 600 /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
cmp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
sudo nft list table inet re7_campaign_transition
sudo nft delete table inet re7_campaign_transition
node "$PREP/validate.cjs"
```

Verifier must use selected build and justified preflight invariants, not historic
counts. Confirm health/DB, worker ownership/auth/sessions, frontend BUILD_ID and
read-only authenticated UI when legitimate session exists. Page 200 alone is
insufficient; unavailable smoke is NOT EXERCISED. On failure keep admissions
closed and re-enter the same containment/exit sequence for return.

Restore guard to initial open/closed condition: bound `open.cjs` only if initially
open, after health/identity checks, using current generation. Otherwise leave
CLOSED. Never replace current guard JSON with saved state. Scheduler/business
flags must remain equal to initial configuration.

```bash
cmp /etc/cron.d/re7-converta-backup "$WINDOW/re7-converta-backup.window"
crontab -l | cmp - "$WINDOW/deploy.crontab.window"
sudo install -o root -g root -m 0644 "$WINDOW/re7-converta-backup.before" /etc/cron.d/re7-converta-backup
(cd "$WINDOW" && crontab deploy.crontab.before)
cmp /etc/cron.d/re7-converta-backup "$WINDOW/re7-converta-backup.before"
crontab -l | cmp - "$WINDOW/deploy.crontab.before"
```

Restore boot enabled state from initial evidence: `sudo systemctl enable
pm2-deploy.service` only if initially enabled; leave disabled if initially
disabled. Require initial inactive state still inactive; no start/reload of unit.
Compare ActiveState/UnitFileState, cron content/metadata, guard/scheduler,
compatible saved/fallback and process identities after switch or return. No
intermediate/incomplete `pm2 save`.

## Abort, return and acceptance

Abort for unexplained active artifact/BUILD_ID/count drift, missing bound scripts
or frontend/recovery barrier, dependency/schema/config drift, wrong auth paths,
failed fresh backup/restore, ambiguous ownership or concurrent operation. During
containment, any surviving executor/socket/DB owner or uncertain call prevents a
successor. Deadline does not waive the barrier.

Return uses the three isolated originals above, freshly verified with current
DB/auth, through the same sequence and fresh exit proof. No Git reset alone, old
DB/auth restore, shared restart or replay. It reintroduces gaps fixed by candidate
and does not close the incident. Candidate-attributable fatal, health/auth/session
or readiness regression triggers reviewed return; partial-start recovery must
use its actual-composition barrier before successors.

Source/patch recipe and historical script contracts are reviewed. Bound private
helpers/configs and frontend/recovery adapters are prepared with simulation proof;
frontend build configuration is resolved by the candidate contract. Final isolated
builds/hashes, schema/lockfile equality and fresh backup/restore are recorded in
the cumulative preparation report. Activation still requires a fresh bounded
preflight and reviewed work/invariant reconciliation. No activation readiness
or owner acceptance is claimed.
META_CLOUD pure and hybrid API-to-WEB
remain pending, with real interactions requiring separate exact-ID authorization.
Campanhas, template media, Guided Builder and repair 6683 remain preserved.

## Documentary command review, 2026-10-02

Reviewed all nine Bash blocks in order; `bash -n` passed for each without executing
their contents. Relative document links and all five patch/manifest hashes were
checked. Verified the Prisma-copy helper exists at the fixed worker base. Order:
fixed checkouts -> patch verification/application -> private environment/schema
gate -> isolated dependencies/Prisma/builds -> executable registry -> fresh
backup/restore and bound helpers -> admissions/containment -> pair exit proof ->
sequential pair start -> frontend exit/start proof -> technical checks -> exact
initial-control restoration. The same exit guarantees apply to return.

This is syntax/source-contract review, not a shell dry-run, deployment rehearsal
or runtime validation. Blocks depending on private environment, bound helpers,
frontend/partial-recovery adapters and initial-state evidence remain blocked
until those prerequisites are concretely prepared and reviewed. No command in
this document was used for productive mutation during the review.
