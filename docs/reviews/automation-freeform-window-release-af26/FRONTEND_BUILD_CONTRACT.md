# Frontend candidate build configuration

Date: 2026-10-02. Candidate `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`.
Review worktree branch `review/campaign-recovery-20260926`, HEAD
`ebbf8ddb8e88ea6c8f802b794989fcbf93027027` at preparation.
Status: BUILD CONFIGURATION RESOLVED / READY FOR SEPARATELY AUTHORIZED REMOTE
PREPARATION / NOT BUILT / NOT DEPLOYED. No mandatory value is missing.

This contract supersedes the requirement to recover the entire historical shell
build environment. It preserves active declared configuration and uses the pinned
candidate's existing fallbacks. It does not claim byte-identical historical builds.
All application/configuration sources were read at the candidate SHA, not HEAD.

## Consumer and provenance matrix

| Variable | Requirement and fallback | Phase and actual consumers | Active configuration and preserved evidence | Candidate decision |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Production mode required; Next supplies production build semantics | Build and server runtime; `next.config.ts`; login destination in `/sistemas`; onboarding, Inbox and realtime development diagnostics | PM2 declares production; final log records production Next build; routes manifest has production-only rewrites | Set production explicitly; preserve PM2 runtime |
| `NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL` | Optional: browser `/agent-api`; config production rewrite base `http://127.0.0.1:3001` | Build-inlined browser input: `appClientApi`, `whatsappAdminApi`, `/app/login`; build rewrite evaluation in `next.config.ts` | Absent from declared PM2; preserved routes manifest matches localhost fallback; topology documents VPS Nginx agent-api, unlike public Vercel site | Leave unset; preserve both code fallbacks. Do not insert localhost as browser URL or import Vercel settings |
| `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` | Optional for platform; required to render the `/converta` widget; missing/blank returns null | Build/prerender server component `ConvertaWebchatEmbed`, imported and rendered by `/converta`; provides widget `data-site-id` | Nonempty active PM2 value unchanged against historical private ecosystem; not found in preserved build JS/HTML/RSC/JSON/text scan | Preserve that exact active value privately; not unused. Historical build input/behavior is not inferred from PM2 |
| `NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL` | Optional `/agent-api`; only meaningful when widget is enabled | Build/prerender widget `data-api-base` | Nonempty active PM2 value unchanged; same bytes found in preserved JS | Preserve exact active value privately |
| `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_APP_ID` | Optional, existing code constant fallback | Build-inlined `metaEmbeddedSignup`; used by admin signup and tenant onboarding, SDK/OAuth app ID | Absent from declared PM2; candidate fallback constant found in preserved JS | Leave unset; retain existing default, no invented ID |
| `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` | Optional, existing code constant fallback | Build-inlined `metaEmbeddedSignup`; admin signup/onboarding. Browser query/localStorage override is separate runtime behavior, not a new env input | Nonempty active PM2 value unchanged; found in preserved JS | Preserve exact active value privately; preserve existing runtime override behavior |

These are all project-owned environment consumers found in frontend `src` and
`next.config.ts`; no dynamic env-key access or separate frontend dotenv loader was
found. The package build command is `next build`; the historical log used
`next build --webpack`. Neither was executed here. `NODE_ENV` references outside
the matrix are diagnostics/development branches, not additional required values.

`PATH` is required by the command environment, not a frontend code consumer;
preserve the reviewed Node/npm toolchain. `NEXT_TELEMETRY_DISABLED` is an optional
Next tooling control present in PM2, not an application setting; preserve it when
assembling the execution environment. No DB, auth, crypto, provider secret or
backend transport variable belongs in this frontend build-input file.

## Private minimum and isolation

Private directory, outside Git index:
`local-evidence/freeform-window-operational-20261002/window/frontend-candidate-contract/`.
`frontend.env.production.local` and `build-env.private.json` contain exactly:
`NODE_ENV`, `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID`,
`NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL`,
`NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`. Values come from the already captured
active frontend environment; private files are mode 600, directory mode 700.
No active file/configuration was changed. Source and private file hashes are in
the [sanitized provenance record](frontend-build-provenance.json).

For authorized preparation only: install the generated env file in the isolated
candidate source directory; ensure no inherited/other dotenv input overrides it.
Use an allowlisted child-process environment with production mode and the reviewed
toolchain controls; absent optional inputs above must remain absent. Do not source
the backend env or unrelated checkout env. Do not reuse frontend return artifacts
as candidate output. A future isolated build must verify public configuration,
rewrites and hashes before activation; current PM2 runtime values must still be
compared at fresh preflight. Changing runtime `NEXT_PUBLIC_*` is not a substitute
for rebuilding inlined/prerendered configuration.

## Scope of closure

The site ID is available from an existing declared setting: no external lookup,
new identifier or product decision is needed to preserve it in the candidate.
It controls the public widget, not campaign identity, Inbox tenants or authorization.
No provider/DB lookup or claim of live widget functionality was made. Since the
setting was not located in the old compiled artifacts, this contract explicitly
preserves declared configuration rather than promising identical old rendering.

The configuration blocker is closed. Executable builds/hashes, dependencies,
Prisma compatibility, fresh authorized backup/restore and process exit barriers
remain release gates, not missing frontend inputs. Production META_CLOUD pure
and API-to-WEB functional validation remains separate and pending. This document
does not authorize remote preparation or activation, and is not owner/CRA acceptance.
No tests, builds, remote reads, functional edits or deploy were performed for this
configuration closure. The owner subsequently authorized documentary publication;
contract publication does not authorize remote preparation or activation. The
runbook includes the isolated `/converta`, authentication, Inbox and Meta Embedded
Signup checks to perform against future isolated executables without real messages.
