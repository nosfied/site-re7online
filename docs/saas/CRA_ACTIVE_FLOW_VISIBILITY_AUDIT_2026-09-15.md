# CRA Active Flow Tenant Visibility Audit - 2026-09-15

Status: `PRODUCTION EVIDENCE PARTIAL / ROOT CAUSE NOT PROVEN`.

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

## Open Evidence Required

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

Remaining evidence required before classifying root cause:

- authenticated read-only `GET /app/chatbot/flows` as CRA ADMIN;
- tenant app frontend render proof after a safe CRA ADMIN session exists.

No CRA ADMIN/SUPERVISOR `AppAuthSession` was active and unrevoked at
`2026-09-15T12:05:22.866Z`. Calling `/app/chatbot/flows` without an existing
session would require login/session creation, and app session validation can
update `lastSeenAt`. That was intentionally not performed during this
read-only/no-mutation audit.

## Current Classification

Classification: `H. NOT PROVEN`.

Proven not root cause:

- flow ownership mismatch at DB level: the active flow belongs to the CRA client;
- chatbot feature disabled: CRA has `features.chatbot=true`;
- admin API exclusion: admin API returns the active flow;
- runtime entrypoint mismatch: runtime query resolves the same active flow.

Most likely areas to validate first when an authorized CRA app session is
available:

1. CRA app session effective `clientId` differs from the CRA flow `clientId`.
2. Authenticated app API returns the flow but frontend state/error path hides it.
3. User role/session is not actually `ADMIN`/`SUPERVISOR` in the CRA tenant.

These are hypotheses, not proven causes.

## Safe Fix Direction

No patch is authorized from the current evidence.

Expected safe correction after proof:

- make the same existing CRA `ChatbotFlow` visible to authorized CRA users;
- do not recreate the flow;
- do not mutate `ChatbotFlow.definition`;
- do not change `entryPoint`, `isActive`, `clientId` or runtime behavior unless a metadata ownership defect is proven and explicitly approved.

## Backlog

`CRA ACTIVE FLOW TENANT VISIBILITY`: `PRODUCTION EVIDENCE PARTIAL / APP SESSION PROOF REQUIRED`.

`CRA HOURS`: remains `CLOSED / CONFIGURED / OPERATIONALLY VALIDATED`.
