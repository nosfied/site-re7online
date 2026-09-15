# CRA Active Flow Tenant Visibility Audit - 2026-09-15

Status: `P1 / BUG CONFIRMED / ROOT CAUSE PROVEN`.

## Scope

Owner observation: `cra-pr` has a production active chatbot flow that executes correctly at runtime, but tenant users report that the active flow is not visible in the tenant-facing `/app` automation/chatbot area.

Safety contract:

- do not recreate, clone, deactivate, reactivate, delete or mutate the active CRA flow;
- do not change `entryPoint`, `isActive`, `clientId`, definition or runtime behavior during audit;
- do not use Demo as ownership/source for CRA production assets;
- prove the exact visibility path before any patch.

## Local Code Findings

Tenant app route:

- frontend: `/app/chatbot`;
- API: `GET /app/chatbot/flows`;
- backend predicate: `prisma.chatbotFlow.findMany({ where: { clientId: client.id } })`;
- frontend rendering: hydrates `flowResponse.items`, sorts by `entryPoint`, `isActive`, `updatedAt`, and renders all returned flows.

Admin route:

- frontend: `/admin/tenants/:tenantId/chatbot?clientKey=cra-pr`;
- API: `GET /admin/chatbot/flows?clientKey=cra-pr`;
- backend predicate: `prisma.chatbotFlow.findMany({ where: { clientId: client.id } })`;
- admin rendering: hydrates `flowResponse.items`, sorts by `entryPoint`, `isActive`, `updatedAt`, and renders all returned flows.

Runtime flow resolution:

- Meta webhook: active conversation flow by `id/clientId/isActive`, otherwise entrypoint by `clientId/isActive/entryPoint`;
- Web Session: active conversation flow by `id/clientId/isActive`, otherwise entrypoint by `clientId/isActive/entryPoint`;
- Webchat: active conversation flow by `id/clientId/isActive`, otherwise entrypoint by `clientId/isActive/entryPoint`.

`ChatbotFlow` schema currently has no archived/deleted/source/type/owner/profile/draft/published visibility fields. The model fields are `id`, `clientId`, `name`, `isActive`, `entryPoint`, `definition`, `createdAt`, `updatedAt`.

## Predicate Matrix

| Predicate | Runtime | Admin list | Tenant app list |
| --- | --- | --- | --- |
| `clientId` | yes | yes | yes |
| `isActive` | yes | no | no |
| `entryPoint` | entrypoint start only | no | no |
| archived/deleted | field absent | field absent | field absent |
| source/type/owner/profile | field absent | field absent | field absent |
| createdBy/current user | no | no | no |
| Guided-compatible only | no | no | no |
| feature flag | runtime uses automation flags; app list uses app feature enforcement | no tenant app feature enforcement in admin flow list | yes, `feature=chatbot` |
| RBAC | runtime not user-facing | platform admin | ADMIN/SUPERVISOR list; AGENT blocked |

Based on code alone, if a CRA ADMIN successfully reaches `GET /app/chatbot/flows` with effective `clientId` equal to the CRA `Client.id`, the existing active flow should be returned regardless of Guided/Advanced compatibility.

## Production Evidence

Production/API evidence collected on 2026-09-15:

- production HEAD: `56c4a392d1eb017ad8fcafffbad5fbd442e7152f`;
- PM2 online:
  - `re7-admin-front` PID `3094790`, cwd `/opt/re7online/site-re7online`;
  - `re7-whatsapp-agent` PID `3094768`, cwd `/opt/re7online/site-re7online/apps/whatsapp-agent`;
  - `re7-whatsapp-web-worker` PID `2504405`, cwd `/opt/re7online/site-re7online/apps/whatsapp-web-worker`;
- health: `3001 /` HTTP 200, `3001 /admin/health` HTTP 200, `3000 /` HTTP 200;
- migrations: 58 migrations, database schema up to date;
- CRA client:
  - id `a91ec8de-e80b-4cc6-9ef2-49dbd1b64bfa`;
  - key `cra-pr`;
  - status `ACTIVE`;
  - profile `government`;
  - `features.chatbot=true`;
- CRA ADMIN/SUPERVISOR users: 8 active users, all with effective
  `clientId=a91ec8de-e80b-4cc6-9ef2-49dbd1b64bfa`;
- CRA `ChatbotFlow` rows: exactly 1 row;
- active flow:
  - id `cmtkhhxtq002p4spns3fp0yux`;
  - name `CRA-PR - Atendimento Institucional`;
  - clientId `a91ec8de-e80b-4cc6-9ef2-49dbd1b64bfa`;
  - `isActive=true`;
  - `entryPoint=true`;
  - createdAt/updatedAt `2026-09-02T19:23:31.838Z`;
  - definition hash `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`;
  - start `consent`;
  - node count `31`;
- runtime entrypoint query resolves the same flow id and definition hash;
- admin API `GET /admin/chatbot/flows?clientKey=cra-pr` returned HTTP 200,
  count 1, with the same flow id and definition hash.

Additional real CRA ADMIN trace collected after customer validation:

- Eduardo Emilio Gunha Ceza reproduced the issue as a real CRA ADMIN: the active
  flow did not appear in tenant-side `Fluxos cadastrados`;
- user id `cmtkhhxpg000t4spnht121555`;
- masked email `ed***@cra-pr.org.br`;
- role `ADMIN`;
- `isActive=true`;
- user `clientId=a91ec8de-e80b-4cc6-9ef2-49dbd1b64bfa`;
- client key `cra-pr`;
- session `cmu2n3...49cv` was active/unrevoked, with session clientId equal to
  CRA clientId;
- nginx access log at `2026-09-15T12:20:10Z` shows Eduardo's `/app/chatbot`
  page load fired:
  - `GET /agent-api/app/chatbot/flows` -> HTTP 200, response size 18369;
  - `GET /agent-api/app/chatbot/settings` -> HTTP 404, response size 66;
  - `GET /agent-api/app/chatbot/resources` -> HTTP 200;
  - `GET /agent-api/app/tenant` -> HTTP 200.

The same pattern also appeared in an earlier Eduardo session at
`2026-09-15T12:17:56Z`.

## Current Classification

Classification: `I. MULTIPLE CAUSES`.

Proven not root cause:

- flow ownership mismatch at DB level: the active flow belongs to the CRA client;
- chatbot feature disabled: CRA has `features.chatbot=true`;
- admin API exclusion: admin API returns the active flow;
- runtime entrypoint mismatch: runtime query resolves the same active flow.

Root cause boundary:

- `GET /agent-api/app/chatbot/flows` fires and returns HTTP 200 for Eduardo;
- the tenant app UI still shows no active flow;
- the first missing layer is frontend hydration/state;
- in `src/app/app/chatbot/page.tsx`, `loadFlows()` uses one `Promise.all()` for
  flows, settings and resources;
- `hydrateFlows(flowResponse.items)` runs only after all three requests succeed;
- in Eduardo's real request, `/app/chatbot/settings` returns 404, so the
  `Promise.all()` rejects and `hydrateFlows()` is never called.

Underlying trigger:

- production `.data/tenants.json` exists but has no `cra-pr` entry;
- production route `GET /app/chatbot/settings` still reads `getTenants()` and
  returns `tenant_not_found` when `tenants[client.clientKey]` is absent;
- this is the tenant-app equivalent of the already closed internal-admin
  settings DB-backed bug.

Therefore the active flow is present in DB, runtime, admin API and app flows API,
but is lost in the app UI because settings 404 aborts the shared load.

## Safe Fix Direction

No patch was applied in this audit.

Smallest safe fix proposal:

- make `/app/chatbot/settings` DB-backed for `Client` tenants without requiring
  a legacy `.data/tenants.json` entry, matching the already validated admin
  settings behavior;
- decouple app flow hydration from non-critical settings failure so
  `flowResponse.items` still renders when flows/resources succeed and settings
  is unavailable;
- do not recreate the flow;
- do not mutate `ChatbotFlow.definition`;
- do not change `entryPoint`, `isActive`, `clientId` or runtime behavior.

Focused regression tests for the patch phase:

- CRA-like DB-backed tenant with no `tenants.json` entry;
- ADMIN sees active flow in `/app/chatbot`;
- SUPERVISOR sees active flow according to current RBAC;
- AGENT remains blocked;
- active/entryPoint/Advanced definition is visible and not filtered out;
- tenant isolation preserves other tenants;
- admin route remains preserved;
- settings 404/fallback failure must not prevent flow list hydration.

## Backlog

`CRA ACTIVE FLOW TENANT VISIBILITY`: `P1 / BUG CONFIRMED / ROOT CAUSE PROVEN / PATCH REQUIRED`.

`CRA HOURS`: remains `CLOSED / CONFIGURED / OPERATIONALLY VALIDATED`.
