# Automation Freeform Window Release af26f48a

**PREPARED FOR REVIEW / NOT DEPLOYED.** This package prepares the release plan for
`af26f48a9c309b24ec4d23cfa97cc1e407c09d98` on branch
`review/campaign-recovery-20260926`. It does not authorize deployment,
activation, provider calls, real sends, process reloads, migrations, or
configuration changes.

## Current Productive Composition Read

Read-only VPS inspection on 2026-10-01 confirmed:

- Repo checkout: `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`, detached, dirty only
  for `apps/whatsapp-web-worker/.data/`.
- `re7-admin-front`: PM2 online, PID `1856062`, release
  `/opt/re7online/releases/ba66c24112ccb10f2dfdcced54350f513d399bc6`, BUILD_ID
  `Ywhs03ZOWIsb-IppyXqEJ`.
- `re7-whatsapp-agent`: PM2 online, PID `1880019`, release
  `/opt/re7online/releases/b66bb89aca9112277463b7d2adbee0b9e7831157-api`.
- `re7-whatsapp-web-worker`: PM2 online, PID `1880130`, release
  `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a`.
- `/health`: `ok=true`, `db=ok`.
- Worker dist file count read: `92`.

The productive runtime is release-based. Do not infer the active API/worker from
the repository checkout alone.

## Candidate Composition

API/frontend candidate:

- Functional target: `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`.
- Parent for this release preparation: `66b3dc5ce2413518103315eb0570b4553daa60da`.
- Base of the deployed API release line: `b66bb89aca9112277463b7d2adbee0b9e7831157`.
- Source patch prepared for reviewer comparison:
  `api-frontend-freeform-window-af26.patch`
  (`sha256=fb4de7d7a2922328c67cfc5e1169ef8a49815980d88d45ada3746e43f98e563f`,
  `1241` lines).

Worker candidate:

- Keep the production worker composition minimal:
  `bf5f1d76 + f06d49cb + 91230f88 + b66bb89a`.
- Apply the final audited worker patch:
  `../automation-worker-backport/worker-freeform-window-gate-20261001.patch`
  (`sha256=ab1080df3804b35479a179425bf664db79b0f0caec50f5dd00f97cdac0c1c566`,
  `660` lines).
- Do not replace the worker with the full API tree.
- Existing worker manifest:
  `../automation-worker-backport/manifest.json`
  (`sha256=3fa762b7f2c62e60b3291b44dbf562be731c0fd2437bd2be635a5abae28ecb55`).

## Source Hashes

See `manifest.json` for the source hashes included in this preparation. No
bundles, secrets, local fixtures, auth material, or private evidence are included.

## Isolated Assembly And Build Plan

Future release preparation must use isolated source and release directories. Do
not build API, frontend, or worker from the productive checkout
`/opt/re7online/site-re7online` while it remains at `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`.
That checkout is a Git working copy reference only; PM2 is currently serving the
isolated releases listed above.

Recommended future directory contract, to be created only during an authorized
release window:

```bash
umask 077
RELEASE_ROOT=/opt/re7online/releases
SOURCE_ROOT=/opt/re7online/release-sources/freeform-window-af26
EVIDENCE=/opt/re7online/release-evidence/freeform-window-af26-$(date -u +%Y%m%d-%H%M%S)
API_SRC="$SOURCE_ROOT/api-frontend-af26"
WORKER_SRC="$SOURCE_ROOT/worker-minimal-af26"
API_RELEASE="$RELEASE_ROOT/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api"
FRONT_RELEASE="$RELEASE_ROOT/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front"
WORKER_RELEASE="$RELEASE_ROOT/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window"
install -d -m 700 "$SOURCE_ROOT" "$EVIDENCE"
```

Source acquisition must clone or archive from the reviewed Git object, not reuse
the productive checkout contents:

```bash
ORIGIN_URL="$(git -C /opt/re7online/site-re7online remote get-url origin)"
git clone --no-checkout "$ORIGIN_URL" "$API_SRC"
git -C "$API_SRC" fetch origin review/campaign-recovery-20260926
git -C "$API_SRC" checkout --detach af26f48a9c309b24ec4d23cfa97cc1e407c09d98
git -C "$API_SRC" diff --check
```

API and frontend candidate build sequence:

```bash
cd "$API_SRC"
scripts/deploy-impact-matrix.sh b66bb89aca9112277463b7d2adbee0b9e7831157 af26f48a9c309b24ec4d23cfa97cc1e407c09d98 | tee "$EVIDENCE/impact-api-front.txt"
npm ci --include=dev
npm --prefix apps/whatsapp-agent run db:generate
npm --prefix apps/whatsapp-agent run build
npm run build
cat .next/BUILD_ID | tee "$EVIDENCE/frontend.BUILD_ID"
install -d -m 755 "$API_RELEASE" "$FRONT_RELEASE"
rsync -a --delete --exclude .git --exclude apps/whatsapp-web-worker/.data "$API_SRC/" "$API_RELEASE/"
rsync -a --delete --exclude .git --exclude apps/whatsapp-web-worker/.data "$API_SRC/" "$FRONT_RELEASE/"
```

Worker minimal source must be composed separately from the worker line, not from
the full API tree. The final freeform-window patch must be read from this reviewed
package path, not from a productive checkout. The prerequisite patches are fixed
by SHA-256 before application:

```bash
ORIGIN_URL="$(git -C /opt/re7online/site-re7online remote get-url origin)"
git clone --no-checkout "$ORIGIN_URL" "$WORKER_SRC"
git -C "$WORKER_SRC" checkout --detach bf5f1d7610ca3f8144faa6f7b7994598e4a4017b

PATCH_ROOT=/opt/re7online/site-re7online/docs/reviews
sha256sum -c <<'EOF'
9ce907c09adce3f196953a25780760de2c186c901585b5527ae9c584c3010dc1  /opt/re7online/site-re7online/docs/reviews/secult-worker-persistence/worker-persistence.patch
a265d491677562c2587394cf071f72bc9d9a5b699d5441fc986beabfa5ccaa4f  /opt/re7online/site-re7online/docs/reviews/automation-worker-backport/worker-automation-91230f88.patch
bb187244008d3d567dfc9a1aabb79f98229eae0e5b432a3e59111fc6d2f7b42c  /opt/re7online/site-re7online/docs/reviews/runtime-self-write-backport/worker-runtime-self-write.patch
ab1080df3804b35479a179425bf664db79b0f0caec50f5dd00f97cdac0c1c566  /opt/re7online/site-re7online/docs/reviews/automation-worker-backport/worker-freeform-window-gate-20261001.patch
3fa762b7f2c62e60b3291b44dbf562be731c0fd2437bd2be635a5abae28ecb55  /opt/re7online/site-re7online/docs/reviews/automation-worker-backport/manifest.json
EOF

git -C "$WORKER_SRC" apply --check "$PATCH_ROOT/secult-worker-persistence/worker-persistence.patch"
git -C "$WORKER_SRC" apply "$PATCH_ROOT/secult-worker-persistence/worker-persistence.patch"
git -C "$WORKER_SRC" apply --check "$PATCH_ROOT/automation-worker-backport/worker-automation-91230f88.patch"
git -C "$WORKER_SRC" apply "$PATCH_ROOT/automation-worker-backport/worker-automation-91230f88.patch"
git -C "$WORKER_SRC" apply --check "$PATCH_ROOT/runtime-self-write-backport/worker-runtime-self-write.patch"
git -C "$WORKER_SRC" apply "$PATCH_ROOT/runtime-self-write-backport/worker-runtime-self-write.patch"
git -C "$WORKER_SRC" apply --check "$PATCH_ROOT/automation-worker-backport/worker-freeform-window-gate-20261001.patch"
git -C "$WORKER_SRC" apply "$PATCH_ROOT/automation-worker-backport/worker-freeform-window-gate-20261001.patch"

cd "$WORKER_SRC/apps/whatsapp-web-worker"
npm ci --include=dev
npm run db:generate
npm run build
install -d -m 755 "$WORKER_RELEASE/apps/whatsapp-web-worker"
rsync -a --delete \
  "$WORKER_SRC/apps/whatsapp-web-worker/" \
  "$WORKER_RELEASE/apps/whatsapp-web-worker/"
```

The generic `apps/whatsapp-agent/scripts/deploy-vps.sh` is allowed as a dry-run
impact reference only (`--dry-run <target>`). It performs pull/build/reload in a
single checkout and therefore must not be used as the isolated release switch for
this package. The concrete impact script reused here is
`scripts/deploy-impact-matrix.sh`; backup scripts reused here are
`apps/whatsapp-agent/scripts/backup-postgres.sh` and
`apps/whatsapp-agent/scripts/backup-postgres-with-alert.sh`; health smoke helper is
`apps/whatsapp-agent/scripts/deploy-check.sh` after the candidate process is
already started in the isolated release.

## BUILD_ID And 92/93 Worker Count Reconciliation

The productive frontend `BUILD_ID` read-only observation
`Ywhs03ZOWIsb-IppyXqEJ` identifies the currently active isolated frontend release
`ba66c241...`; it is not a hash of `af26f48a` and must not be carried forward as
the candidate build identifier. The future candidate `BUILD_ID` must be read from
`$FRONT_RELEASE/.next/BUILD_ID` after the authorized isolated frontend build and
recorded in `$EVIDENCE/frontend.BUILD_ID`.

The productive worker read counted `92` compiled files in the currently active
worker release. The reviewed worker backport manifest records
`baseCompiledCount=92`, `candidateCompiledCount=93`, `changedCompiled` as
`dualWriteStorage.js`, `assignmentPolicy.js`, `webSessionInbound.js`, and
`addedCompiled` as `whatsapp-agent/src/conversation/runtimeWriteFence.js`. That
is the documented explanation for the candidate-side 93 count. It is not enough
for release execution by itself: future preflight must regenerate the active and
candidate file lists and confirm that the only added compiled file is still
`runtimeWriteFence.js`. If the regenerated lists differ, treat the 92/93
reconciliation as pending and abort before process swap.

```bash
(cd /opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a/apps/whatsapp-web-worker && find dist -type f -name "*.js" | sort) > "$EVIDENCE/active-worker-dist-js-files.txt"
(cd "$WORKER_RELEASE/apps/whatsapp-web-worker" && find dist -type f -name "*.js" | sort) > "$EVIDENCE/candidate-worker-dist-js-files.txt"
wc -l "$EVIDENCE/active-worker-dist-js-files.txt" "$EVIDENCE/candidate-worker-dist-js-files.txt" | tee "$EVIDENCE/worker-dist-js-counts.txt"
comm -3 "$EVIDENCE/active-worker-dist-js-files.txt" "$EVIDENCE/candidate-worker-dist-js-files.txt" | tee "$EVIDENCE/worker-dist-js-list-delta.txt"
```

## Executable Hash Registry

Final executable hashes are still pending because this step did not build
artifacts. During a future authorized preparation, write final hashes and deltas
to private evidence first, then publish a sanitized follow-up manifest if needed:

```bash
find "$API_RELEASE/apps/whatsapp-agent/dist" -type f -name "*.js" -print0 | sort -z | xargs -0 sha256sum > "$EVIDENCE/api-dist.sha256"
(cd "$WORKER_RELEASE/apps/whatsapp-web-worker" && find dist -type f -name "*.js" -print0 | sort -z | xargs -0 sha256sum) > "$EVIDENCE/worker-dist.sha256"
find "$FRONT_RELEASE/.next" -type f -print0 | sort -z | xargs -0 sha256sum > "$EVIDENCE/frontend-next.sha256"
# Compare against active release hash snapshots recorded in manifest.json:
diff -u "$EVIDENCE/active-api-dist.sha256" "$EVIDENCE/api-dist.sha256" > "$EVIDENCE/api-dist.delta" || true
diff -u "$EVIDENCE/active-worker-dist.sha256" "$EVIDENCE/worker-dist.sha256" > "$EVIDENCE/worker-dist.delta" || true
```

The public `manifest.json` keeps only source, package, active-read hashes and the
location where future executable hashes must be recorded. Do not add bundles,
credentials, database dumps, auth files or private evidence to Git.

## Containment, Sequential Start And Return

Use the containment model already documented in `docs/RUNBOOK_WHATSAPP_AGENT.md`
for the 29/09 and 30/09 automation releases. The future operator must preserve
supervision/admission evidence, stop both API and worker, prove both exit, and
only then start successors sequentially. Do not use `pm2 save` while the process
set is intentionally incomplete; that would make the incomplete state look
recoverable.

```bash
install -m 600 /home/deploy/.pm2/dump.pm2 "$EVIDENCE/dump.pm2.before"
install -m 600 /home/deploy/.pm2/dump.pm2.bak "$EVIDENCE/dump.pm2.bak.before" || true
/home/deploy/.npm-global/bin/pm2 jlist > "$EVIDENCE/pm2.before.json"
ss -ltnp > "$EVIDENCE/listeners.before.txt"
crontab -l > "$EVIDENCE/crontab.deploy.before" || true
systemctl is-enabled pm2-deploy.service > "$EVIDENCE/pm2-deploy.enabled.before" 2>&1 || true
systemctl is-active pm2-deploy.service > "$EVIDENCE/pm2-deploy.active.before" 2>&1 || true
if [ -n "${CAMPAIGN_OPERATIONS_FILE:-}" ] && [ -f "$CAMPAIGN_OPERATIONS_FILE" ]; then
  install -m 600 "$CAMPAIGN_OPERATIONS_FILE" "$EVIDENCE/campaign-operations.before.json"
fi
```

If privileged supervision is present, follow the previously used supervisor gate:
`sudo systemctl disable pm2-deploy.service` without `--now`, confirm
`systemctl is-enabled pm2-deploy.service` and `systemctl is-active
pm2-deploy.service`, and abort on any state drift instead of improvising
`restart` or `reload all`. Preserve cron and PM2 resurrect evidence; do not edit
cron lines during this package step.

Process replacement must be explicit and sequential, not a generic reload:

```bash
API_OLD_PID=$(/home/deploy/.npm-global/bin/pm2 jlist | jq -r '.[] | select(.name=="re7-whatsapp-agent") | .pid')
WORKER_OLD_PID=$(/home/deploy/.npm-global/bin/pm2 jlist | jq -r '.[] | select(.name=="re7-whatsapp-web-worker") | .pid')
/home/deploy/.npm-global/bin/pm2 delete re7-whatsapp-agent
/home/deploy/.npm-global/bin/pm2 delete re7-whatsapp-web-worker
ps -p "$API_OLD_PID" > "$EVIDENCE/api-old-pid-after-delete.txt" 2>&1 && exit 72 || true
ps -p "$WORKER_OLD_PID" > "$EVIDENCE/worker-old-pid-after-delete.txt" 2>&1 && exit 73 || true
ss -ltnp > "$EVIDENCE/listeners.after-api-worker-delete.txt"
/home/deploy/.npm-global/bin/pm2 jlist > "$EVIDENCE/pm2.after-api-worker-delete.json"
# Abort if old API PID, old worker PID, API listener, worker descendants or a
# supervisor-respawned process remain visible. Do not start a successor yet.

cd "$API_RELEASE/apps/whatsapp-agent"
/home/deploy/.npm-global/bin/pm2 start ecosystem.config.cjs --only re7-whatsapp-agent --env production --update-env
curl --fail --silent --show-error http://127.0.0.1:3001/health
apps/whatsapp-agent/scripts/deploy-check.sh

cd "$WORKER_RELEASE/apps/whatsapp-web-worker"
/home/deploy/.npm-global/bin/pm2 start npm --name re7-whatsapp-web-worker -- start
/home/deploy/.npm-global/bin/pm2 jlist > "$EVIDENCE/pm2.after-api-worker-start.json"

# Frontend only after API and worker checks are stable.
FRONT_OLD_PID=$(/home/deploy/.npm-global/bin/pm2 jlist | jq -r '.[] | select(.name=="re7-admin-front") | .pid')
/home/deploy/.npm-global/bin/pm2 delete re7-admin-front
ps -p "$FRONT_OLD_PID" > "$EVIDENCE/front-old-pid-after-delete.txt" 2>&1 && exit 74 || true
cd "$FRONT_RELEASE"
/home/deploy/.npm-global/bin/pm2 start npm --name re7-admin-front -- start
```

After all selected successors are healthy, restore the saved-state chain and
supervision explicitly:

```bash
/home/deploy/.npm-global/bin/pm2 jlist > "$EVIDENCE/pm2.after-all-start.json"
/home/deploy/.npm-global/bin/pm2 save
install -m 600 /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
# Re-enable pm2-deploy.service only if it was enabled before the window, and do
# not start/reload the unit as part of this command.
sudo systemctl enable pm2-deploy.service
systemctl is-enabled pm2-deploy.service > "$EVIDENCE/pm2-deploy.enabled.after" 2>&1 || true
```

Return must use the isolated active releases recorded in this package and the
current DB/auth state, not `git checkout` alone. If the candidate is not accepted,
stop successors first, prove exit, then start the previously active isolated
releases. Do not save PM2 until all three active successors are healthy.

```bash
/home/deploy/.npm-global/bin/pm2 delete re7-whatsapp-agent || true
/home/deploy/.npm-global/bin/pm2 delete re7-whatsapp-web-worker || true
/home/deploy/.npm-global/bin/pm2 delete re7-admin-front || true
cd /opt/re7online/releases/b66bb89aca9112277463b7d2adbee0b9e7831157-api/apps/whatsapp-agent
/home/deploy/.npm-global/bin/pm2 start ecosystem.config.cjs --only re7-whatsapp-agent --env production --update-env
curl --fail --silent --show-error http://127.0.0.1:3001/health
cd /opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a/apps/whatsapp-web-worker
/home/deploy/.npm-global/bin/pm2 start npm --name re7-whatsapp-web-worker -- start
cd /opt/re7online/releases/ba66c24112ccb10f2dfdcced54350f513d399bc6
/home/deploy/.npm-global/bin/pm2 start npm --name re7-admin-front -- start
/home/deploy/.npm-global/bin/pm2 jlist > "$EVIDENCE/pm2.after-return.json"
/home/deploy/.npm-global/bin/pm2 save
install -m 600 /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
# Restore pm2-deploy.service enabled state only if the before file proves it was enabled.
```

Re-run health and smoke checks after return and record new PIDs; do not restore
old database/auth dumps unless the owner separately authorizes data rollback.

## Commands For Future Release Review

These commands are for review only. Execute only after explicit deploy
authorization and fresh preflight.

```bash
cd /opt/re7online/site-re7online
git fetch origin
git rev-parse HEAD
git status --short
git log -5 --oneline
/home/deploy/.npm-global/bin/pm2 jlist | jq -r '.[] | [.name,.pid,.pm2_env.status,.pm2_env.pm_cwd,.pm2_env.pm_exec_path] | @tsv'
curl -fsS http://127.0.0.1:3001/health
```

Gate before mutation:

- only authorized dirt: `?? apps/whatsapp-web-worker/.data/`;
- productive releases still match this document or the divergence is explained;
- rollback releases are present and readable;
- fresh backup and restore check are complete;
- no concurrent deploy, backup, or operational incident is active.

Build/release preparation, after authorization:

```bash
# API/backend candidate release
npm --prefix apps/whatsapp-agent run build

# Frontend candidate release, because src/app/app/inbox and src/lib changed
npm run build

# Worker minimal candidate only from the minimal composition plus audited patch
npm --prefix apps/whatsapp-web-worker run build
```

Reload only after successful builds and containment gates:

- `re7-whatsapp-agent`;
- `re7-admin-front`;
- `re7-whatsapp-web-worker` only if the minimal worker artifact was rebuilt and
  selected for activation.

Do not run `prisma db push`, `migrate reset`, data repair, auth clear, logout,
provider sends, campaign sends, test-send, or tenant activation as part of this
release.

## Dependencies, Prisma And Configuration

- Runtime expected from current VPS lineage: Node 20/PM2. Previous rollout recorded Node v20.20.0; future preflight must re-read `node -v` and PM2 before mutation.
- No lockfile or dependency installation is part of this preparation. If future preflight finds dependency drift, stop and document before build.
- Prisma schema/migration: unchanged for this release scope; no `prisma db push`, `migrate reset`, repair, or data mutation.
- Configuration: preserve existing production environment, auth/session material, guard/scheduler settings, backup cron and PM2 saved state unless the runbook step explicitly changes them during an authorized window.
- Secrets are intentionally absent from this package; future operators must read them only from the existing server environment.

## Backup And Rollback

Before any future mutation:

1. Create a fresh persistent PostgreSQL backup using the established backup
   procedure.
2. Record path, size, SHA-256, object count, previous functional head, PM2
   process paths and PIDs, frontend BUILD_ID, API/worker release paths, auth/config
   snapshot locations, and restore result.
3. Verify restore in an isolated local or temporary database before proceeding.

Rollback must restore code **and built artifacts** compatible with current DB/auth.
Returning only Git HEAD is insufficient because production uses isolated release
directories. Preferred rollback target is the currently active composition:

- API: `/opt/re7online/releases/b66bb89aca9112277463b7d2adbee0b9e7831157-api`;
- frontend: `/opt/re7online/releases/ba66c24112ccb10f2dfdcced54350f513d399bc6`;
- worker:
  `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a`.

Rollback to that composition preserves DB/auth state but reintroduces the gaps
closed after `b66bb89a`. It is a technical return, not functional incident
closure.

## Containment And Abort Criteria

Containment must follow the existing runtime-fix runbook model:

- fresh read of processes, sessions, guard/scheduler and health;
- close guard/admission only when the runbook requires it;
- establish an outbound/inbound barrier before stopping paired API/worker
  processes if worker ownership could overlap;
- confirm old process exit by PID/start tick/descendants/sockets before starting
  successors;
- never start a successor while an old API/worker process may still submit work;
- keep frontend restart separate from API/worker restart.

Abort before mutation if:

- productive composition differs without explanation;
- backup or restore verification fails;
- unexpected dirty files appear;
- process ownership is ambiguous;
- old processes or sockets survive the exit barrier;
- worker minimal patch cannot be reconciled by hash;
- Prisma schema/migration review finds a pending migration;
- health or DB is degraded before release.

Rollback if post-release health fails, logs show new fatal request errors,
unexpected PM2 restart, auth/session regression, worker session regression, or
provider-readiness regression attributable to the release.

## Post-Release Technical Checks

Use read-only checks unless the owner explicitly authorizes a real interaction:

- PM2 online and only expected PIDs changed;
- `/health` ok/db ok;
- `/app/inbox`, `/app/crm`, and settings reachable with legitimate session;
- Inbox UI shows window status correctly and does not offer WEB_ONLY template path
  when unavailable;
- logs contain no new `unhandledRejection`, Prisma fatal error, QR/auth clearing,
  or unexpected 5xx;
- worker health/session state preserved;
- no provider sends, campaign sends, test-send, flow activation, or tenant setting
  change caused by validation.

Technical validation is not owner functional acceptance. META_CLOUD pure and
hybrid API-to-WEB remain pending and require separate authorization with exact
tenant/account/conversation IDs and real interaction scope.
