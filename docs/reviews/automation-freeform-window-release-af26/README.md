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
