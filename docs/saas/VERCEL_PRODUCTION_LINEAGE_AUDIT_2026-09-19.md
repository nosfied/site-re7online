# Vercel Production Lineage Audit - 2026-09-19

Status: AUDITED / CORRECTION PENDING.

This is a read-only audit of the public Re7Online Vercel project. No deploy,
promotion, redeploy, alias change, Vercel config mutation, VPS change, PM2
change or database mutation was performed.

## Scope

- Vercel project: `site-re7online`
- Project ID: `prj_Ei43Wm38CyRWK4yaJHsQinQE7Lto`
- Team: `team_I9ssuIuIMESmfBaoSnIkAZ25`
- Public site: `re7online.com`
- Operational VPS domains: `converta.re7online.com`, `api.re7online.com`,
  `admin.re7online.com`

The public site is Vercel. The Converta runtime, API, channels and Web Session
worker are VPS concerns and were not touched.

## Current Production Evidence

Current production deployment observed through read-only Vercel tooling:

| Field | Value |
| --- | --- |
| Deployment | `dpl_F3CjH6eJRLsnriBVhP77o1ZXxz5R` |
| Created | `2026-09-18T22:17:22.193Z` |
| Commit | `bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9` |
| Branch | `ops-demo-9614-repair-readiness-20260918` |
| Message | `ops: add demo 9614 identity repair executor` |
| Source | `redeploy` |
| Target | `production` |
| State | `READY` |

Production aliases on that deployment:

- `re7online.com`
- `www.re7online.com`
- `teste.re7online.com`
- `site-re7online.vercel.app`
- `site-re7online-nosfieds-projects.vercel.app`
- `site-re7online-git-ops-demo-9614-repai-69a1ed-nosfieds-projects.vercel.app`

Classification: OPERATIONAL/UNSUITABLE LINEAGE. The branch purpose is an
operations repair front, not a public-site release line. The site currently
serves successfully, but the production provenance is operationally wrong.

## Public Site Health

Read-only HTTP smoke on 2026-09-19:

- `https://re7online.com/`: HTTP 200
- `https://re7online.com/converta`: HTTP 200
- `https://re7online.com/sistemas`: HTTP 200
- `https://re7online.com/privacy`: HTTP 200
- homepage title: `Re7Online | Comunicação, Marketing e Tecnologia`
- response headers include `x-vercel-cache` and `x-vercel-id`, confirming the
  public response path is Vercel, not the VPS.

## Production Branch And Project Settings

Read-only project listing exposed the project ID/name/framework but did not
expose the Vercel Production Branch, Root Directory, Build Command, Install
Command, Ignored Build Step or Git integration settings.

Result:

- Production Branch: UNKNOWN
- Root Directory: UNKNOWN
- Build Command: UNKNOWN
- Install Command: UNKNOWN
- Ignored Build Step setting: UNKNOWN from project settings

Do not infer these as proven facts from repository files alone.

## Recent Production Deployments

| Deployment | Created | Commit | Branch | Message | Source | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `dpl_T3J66noLSWHgYMKzUsaqVXpFTRc6` | `2026-09-18T12:36:57.784Z` | `a51c4a4c85e50abd28510bcf07e7c6348768519a` | `operational-queue-domain-rollout-20260918` | `docs: close demo 6787 identity repair` | `redeploy` | UNKNOWN / operational branch, public tree equivalent |
| `dpl_3d6dNKEu2kbQUEBabLxJQcEj3cdX` | `2026-09-18T13:56:52.876Z` | `e7ab58167d85ee2e280fe8be891dfb8fe3780bf4` | `contacts-campaigns-clean-delivery-20260918` | `docs: record contacts campaigns production deploy` | `redeploy` | UNKNOWN / operational branch, public tree equivalent |
| `dpl_9mCeU9EhjQXqnF1nf16bpPsTDjXa` | `2026-09-18T19:24:29.905Z` | `2e043f67c39e492d8d9994775af7a6e1615309ba` | `campaign-result-truth-12-13-hotfix-20260918` | `docs: close campaign result and composer validation` | `redeploy` | UNKNOWN / operational branch, public tree equivalent |
| `dpl_F3CjH6eJRLsnriBVhP77o1ZXxz5R` | `2026-09-18T22:17:22.193Z` | `bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9` | `ops-demo-9614-repair-readiness-20260918` | `ops: add demo 9614 identity repair executor` | `redeploy` | OPERATIONAL/UNSUITABLE LINEAGE |

All four were production redeploys from operational branches. None of these
proves a canonical public-site production branch.

## Public-Site Tree Comparison

Compared public-site-relevant files across:

- `a51c4a4c85e50abd28510bcf07e7c6348768519a`
- `e7ab58167d85ee2e280fe8be891dfb8fe3780bf4`
- `2e043f67c39e492d8d9994775af7a6e1615309ba`
- `bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9`
- `65af4f0873347394a946592178441bbb656287b9`
- `086f0fb798c2ef8f14482288d19d23f11447908d`

Public-site relevant scope:

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/converta/**`
- `src/app/privacy/**`
- `src/app/sistemas/**`
- `public/**`
- root `package.json`, `package-lock.json`
- `next.config.ts`
- root Tailwind/PostCSS/TS config

Result: PUBLIC SITE OUTPUT DIFFERENCE = NONE for the audited production and
recent preview commits in that scope. The current `bf8ca4d` production lineage
is operationally wrong, but no material public-site rendering difference was
found against the audited candidates.

The Converta VPS HEAD must not be treated as automatically canonical for
Vercel. Its current public-site tree may be equivalent, but VPS runtime commits
are not public-site release authority.

## Ignore Command Audit

The hygiene commit `597f2567b99f12aeaa63f192a970ce004174a008` introduced:

- `vercel.json`
- `scripts/vercel-ignore-build.sh`
- `scripts/test-vercel-ignore-build.sh`
- documentation updates

The current operational/public production candidates audited above do not have
`vercel.json` or `scripts/vercel-ignore-build.sh` in ancestry. The current
local worktree based on `bd655e91348ac0429b45ad683391c89efe020531` also lacks
those files.

Reason docs-only and ops-related commits still produced READY Preview
deployments: CONFIG NOT PRESENT IN BRANCH for the audited recent branches. No
evidence was found that Vercel executed an ignoreCommand and ignored its result;
the required config was absent in those branch lineages.

IgnoreCommand status: ISSUE until the Vercel public-site production source is
corrected to a branch/commit that contains the hygiene files and the project
setting is verified.

## Candidate For Future Correction

Best technical candidate found for a future correction:

- Branch: `origin/vercel-deployment-hygiene-20260918`
- Commit: `1af24b54ee9261f75a8c9e69e9d87c20f33fd2db`
- Evidence:
  - contains `vercel.json`;
  - contains `scripts/vercel-ignore-build.sh`;
  - public-site tree, excluding Vercel hygiene files and docs, is equivalent to
    current production `bf8ca4d`;
  - explicitly documents Vercel deployment hygiene.

This is not recorded as the canonical production branch because the Vercel
Production Branch setting was not exposed by available tooling. Treat it as the
safe correction candidate, not as already-proven production policy.

## Safe Future Correction Options

| Option | Available | Risk | Evidence required before use |
| --- | --- | --- | --- |
| Promote an existing verified Preview from the canonical site commit | NO for `1af24b54`; no deployment was found for that commit in the audited window | Low if found later | Deployment ID, commit, branch, public tree match, aliases preview smoke |
| Redeploy a verified historical deployment | UNKNOWN | Medium | Need proof the deployment includes the intended public-site source and Vercel hygiene; current historical production deployments do not |
| Deploy a clean canonical public-site commit from `origin/vercel-deployment-hygiene-20260918` | YES, later, if owner authorizes mutation | Low/Medium | Clean worktree at `1af24b54`, local build, Vercel project settings, post-deploy alias verification |
| Update Vercel Production Branch setting | UNKNOWN | Medium | Need read/write access and proof of intended branch; do not set an ops branch |

No correction was executed in this audit gate.

## Required Next Action

Before any production mutation:

1. Open or access Vercel project settings and prove the current Production
   Branch value.
2. Decide the canonical public-site branch. If using the audited candidate,
   use `origin/vercel-deployment-hygiene-20260918` at
   `1af24b54ee9261f75a8c9e69e9d87c20f33fd2db`.
3. Build/smoke the exact candidate.
4. Execute a Vercel-only correction gate: deploy or promote only the verified
   candidate.
5. Verify aliases moved away from `bf8ca4d`.
6. Verify docs-only changes are skipped after `ignoreCommand` is active.

## Final Read-Only Classification

- Vercel Production Source Proven: ISSUE / unresolved
- Old bad lineage removed: NO, correction not executed
- Public site health: PASS
- Public-site output difference vs current: NONE
- Production Branch: UNKNOWN
- IgnoreCommand: ISSUE
- OPS branch production risk: ISSUE until production branch and hygiene are
  corrected
- VPS: UNCHANGED
- DB: UNCHANGED
- PM2: UNCHANGED
- Vercel Production: UNCHANGED
