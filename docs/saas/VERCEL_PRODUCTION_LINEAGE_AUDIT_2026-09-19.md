# Vercel Production Lineage Correction - 2026-09-19

Status: CLOSED / PRODUCTION CORRECTED / MAIN-BASED.

This record documents the Vercel-only correction for the public Re7Online site.
No VPS deploy, DB mutation, PM2 restart, Web Session action, Meta action or
Converta backend deploy was performed.

## Project

| Field | Value |
| --- | --- |
| Vercel project | `site-re7online` |
| Project ID | `prj_Ei43Wm38CyRWK4yaJHsQinQE7Lto` |
| Team | `team_I9ssuIuIMESmfBaoSnIkAZ25` |
| Connected repo | `nosfied/site-re7online` |
| Production Branch | `main` |

Production Branch was proven by Vercel Project Settings > Environments.

## Before

| Field | Value |
| --- | --- |
| Deployment | `dpl_F3CjH6eJRLsnriBVhP77o1ZXxz5R` |
| Commit | `bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9` |
| Branch | `ops-demo-9614-repair-readiness-20260918` |
| Message | `ops: add demo 9614 identity repair executor` |
| Source | `redeploy` |
| Target | `production` |

Classification: unsuitable operational lineage for the public Vercel site.
The rendered public-site tree was audited as equivalent/healthy, but production
provenance was wrong because canonical production must track `main`.

## Correction

`origin/vercel-deployment-hygiene-20260918` at
`1af24b54ee9261f75a8c9e69e9d87c20f33fd2db` was reviewed and classified as
contaminated for this gate because it contained unrelated app/backend/runtime,
migration and asset changes. It was not merged into `main`.

A clean commit was rebuilt from exact `origin/main`:

| Field | Value |
| --- | --- |
| Main before | `1df536cb0079897d60a6fc2bf04f9ee75ba058db` |
| Hygiene source | `597f2567b99f12aeaa63f192a970ce004174a008` |
| Clean main commit | `6fe957dfd7094299decf62923406bdd5e1b7d792` |

The clean commit added only:

- `vercel.json`
- `scripts/vercel-ignore-build.sh`
- `scripts/test-vercel-ignore-build.sh`
- deployment hygiene documentation

Local validation:

- `bash scripts/test-vercel-ignore-build.sh`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- public-site material diff against previous production scope: none

## After

| Field | Value |
| --- | --- |
| Deployment | `dpl_QSE5F2vAbXqTH6Esiir66aAKuGmD` |
| Commit | `6fe957dfd7094299decf62923406bdd5e1b7d792` |
| Branch | `main` |
| Message | `chore(vercel): add production deployment hygiene` |
| Source | `git` |
| Target | `production` |
| State | `READY` |

Effective alias resolution after correction:

- `re7online.com`: `dpl_QSE5F2vAbXqTH6Esiir66aAKuGmD`
- `www.re7online.com`: `dpl_QSE5F2vAbXqTH6Esiir66aAKuGmD`
- `teste.re7online.com`: `dpl_QSE5F2vAbXqTH6Esiir66aAKuGmD`
- `site-re7online.vercel.app`: `dpl_QSE5F2vAbXqTH6Esiir66aAKuGmD`

The old deployment remains retained historically and must not be deleted merely
for cleanup.

## Smoke

Post-fix public smoke:

- `https://re7online.com/`: HTTP 200
- `https://www.re7online.com/`: HTTP 200
- `https://teste.re7online.com/`: HTTP 200
- `https://site-re7online.vercel.app/`: HTTP 200
- `https://re7online.com/converta`: HTTP 200
- `https://re7online.com/sistemas`: HTTP 200
- `https://re7online.com/privacy`: HTTP 200
- `https://re7online.com/manifest.webmanifest`: HTTP 200
- Runtime errors in the last 30 minutes: none found

## Policy

Only `main` is canonical for public Vercel Production.

Manual production redeploy or promotion of previews/ops branches is prohibited
unless there is explicit owner emergency authorization and the exact deployment
is proven before mutation.

VPS production remains separate from Vercel public-site production.
