# CRM contacts list recovery — 19/10/2026

Status na criação: `LOCAL VALIDATED / NOT DEPLOYED`.

> Histórico superado quanto ao estado produtivo. A implantação foi concluída em
> 20/10/2026 e está registrada em
> [CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json).

## Productive observation

One navigation to `/app/crm` was performed in the already authenticated habitual
Chrome on 19/10/2026 from `10:33:01` to `10:33:21` America/Fortaleza. It was not
repeated. The `deploy` account could not read the Nginx access log (`errno=13`), so
HTTP status, response bytes and per-request duration are **not claimed**. In the same
interval, the readable API stdout/stderr contained no
`app.crm.contacts.error` or `app.crm.statuses.get.error` event. No environment,
token, cookie, UUID, phone or tenant data was read or published.

## Confirmed cause

The source audit found a compound failure mode:

- `requestAppJson` used a 10 second default timeout, while the CRM contacts route
  allows its repeatable-read transaction up to 15 seconds;
- the initial screen waited for statuses and contacts in one `Promise.all`, so a
  slow/failing statuses request could withhold a valid contacts response;
- on failure the screen could reach `contacts=null` and `loading=false`, which is
  now required to render a recoverable error rather than an empty list;
- the admin route built the same full contact projection for `filtered`, `active`
  and `excluded` scopes. Each projection scans in batches of 500 candidates.

The productive recarga did not yield timing evidence because the only log carrying
request status/size was not readable. The cause above is therefore confirmed by the
deployed source and its contracts, not by an invented production duration.

## Local correction

- statuses and contacts now settle independently; contacts alone control the list
  loading state;
- a latest-response guard prevents an older contacts response from replacing a
  newer filter/page request;
- missing or failed contacts always settles into the existing retryable error UI;
- contacts GET has an explicit 20 second timeout, greater than the backend
  transaction timeout;
- the unfiltered active response is reused as `activeScope`;
- admins receive a tenant-scoped `Contact.findFirst` exclusion probe before any
  excluded projection; when none exists, no full `excludedScope` is built;
- filtered, permitted and page totals retain their existing definitions; tenant,
  RBAC, filters, pagination and CSV recovery remain unchanged and no POST was added.

## Validation

- focused frontend/backend unit and contract tests: 47 PASS initially; the final
  combined run preserved 48 PASS and exposed one stale textual assertion, then the
  affected contract file passed 23/23 after requiring the new guarded loader;
- frontend production build: PASS;
- backend TypeScript build: PASS;
- `git diff --check`: PASS;
- focused ESLint has zero errors in files without inherited debt. The canonical
  baseline was reproduced in an isolated tracked-tree overlay, excluding preserved
  untracked evidence: 661 errors/246 warnings, within the existing ceiling of
  663/246. Errors observed in `routes.ts` are on untouched pre-existing lines;
- the PostgreSQL route test was not run locally because no local server was listening
  on `127.0.0.1:5432`; `csv-critical` in CI owns that clean Postgres proof.

No deploy, PM2 action, SQL, migration, import or POST was executed.
