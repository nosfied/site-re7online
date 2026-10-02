# Operational preparation evidence - 2026-10-02

Status: PRIVATE PACKAGE SIMULATION VALIDATED / NOT EXECUTED / NOT DEPLOYED.
Review base: `8b2466db51837384d0b2142e9cad19c8fde4c25f`; functional candidate:
`af26f48a9c309b24ec4d23cfa97cc1e407c09d98`. No functional code changed here.

## Observation provenance

The initial release manifest, introduced in `44962503`, attributed older values
to the active isolated releases. The preserved 27/09 activation report and
`docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md` explicitly associate
`Ywhs03ZOWIsb-IppyXqEJ` with the former `5ee2de6b` checkout frontend, not `ba66`.
The preserved worker comparison records 92 base files, 93 candidate files,
and one added file: `whatsapp-agent/src/conversation/runtimeWriteFence.js`.
The command responsible for the erroneous initial summary was not preserved;
the artifact provenance is established, not its author's intent or a rebuild.

The preserved deployment snapshot (30/09 00:02:45 UTC) and bounded read already
performed on 02/10 11:34:15 UTC agree: active ba66 frontend BUILD_ID
`l1eBvPioySXt7NLiuFMkg`; worker bf5+f06+912+b66 has 93 files, all JS.
All 781 frontend server/static hashes match the saved deployment; the complete
worker file/hash set matches the b66 compiled manifest (zero added/missing/changed).
No new production query was needed for this follow-up. These observations do not
identify the candidate's still-unbuilt executables.

## Effective frontend configuration and remaining blocker

Subsequent closure on 2026-10-02: the historical-input blocker described below
is superseded by the [candidate build contract](FRONTEND_BUILD_CONTRACT.md).
The minimal private configuration preserves existing PM2 values plus code
fallbacks; all required values are available. Historical-input uncertainty is
retained as a limit, not a requirement to reconstruct an old shell environment.

The existing assembly script reused the preserved final local `.next` build
and checked source identity; the final log records `next build --webpack`.
That build's BUILD_ID matches the active release. Its routes manifest contains
only the production public-api rewrite to `http://127.0.0.1:3001/public-api/:path*`.
There is no Next production agent-api rewrite. The active PM2 process runs
`next start -p 3000` in the ba66 isolated release. Its declared environment is
unchanged from the historical configuration; values stay private.

The PM2 values of `NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL` and
`NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` occur in the preserved JS bundle.
The PM2 `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` value does not. That absence does
not establish whether the input was unused, different, or absent during build.
The active `.env.production.local` does not exist; neither does one in the
preserved local build directory. The exact original shell build environment
was not found in the reviewed records. Therefore a complete candidate build-input
set remains BLOCKED, not reconstructed from assumptions. Resolve the original
build inputs or explicitly review the intended allowlisted configuration before
building/activation. Do not invent a site ID or install a nonexistent env file.

## Private operational package and reused simulation proof

Persistent private evidence is under the review worktree's
`local-evidence/freeform-window-operational-20261002/`, outside the Git index.
Configurations/auth/snapshots and operational scripts are not published.
The [sanitized manifest](operational-manifest.json) lists exact script hashes,
test names, evidence hashes and limitations. Hashes of private configuration
files identify bytes only; their contents remain private.

Bound switch/return/partial-recovery helpers preserve closed admissions, CAS
generation checks, drain/fault gates, cron/fence/supervision checks, one-use
exit certificates, PID/start-tick/child/socket barriers and pair DB-owner checks.
Frontend has a separate exit barrier. Recovery requires a fresh certificate;
API starts before worker; no intermediate PM2 save represents an incomplete
recoverable set. Auth is current shared state, never restored from old copies.
Guard/cron/supervision restore only the captured initial state.

Reused local evidence: Python simulated process/command driver **42/42 PASS**;
Node VM guard/verifier **16/16 PASS**; final integrity subset **3/3 PASS**.
These are mocks, not live OS exit, firewall, PM2, DB, Prisma or release proofs.
No tests/builds were repeated in this documentary follow-up.

## Execution gates and return

Frontend configuration is now ready for separately authorized remote preparation;
see the contract and sanitized provenance record. Other execution gates below
remain pending and closed.

All operational execution gates remain closed. Return targets remain the
isolated active b66 API, ba66 frontend and bf5+f06+912+b66 worker with current
DB/auth, not the productive repo checkout. Final candidate executable hashes,
dependencies/Prisma equality, fresh preflight, authorized backup and isolated
restore verification are pending. Preparation is not release authorization.
META_CLOUD pure and hybrid API-to-WEB productive functional proofs remain
separate and pending; no owner/CRA acceptance is inferred.

No active artifact rebuilt/replaced; no containment, stop/restart, backup/restore,
DB/provider access, message, configuration change or deploy in this follow-up.
