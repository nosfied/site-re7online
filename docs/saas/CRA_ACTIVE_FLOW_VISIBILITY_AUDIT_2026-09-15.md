# CRA Active Flow Tenant Visibility Audit - 2026-09-15

Status: `AUDIT IN PROGRESS / ROOT CAUSE NOT PROVEN`.

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

Production/API evidence is still required before classifying root cause:

- current production DB read for all CRA `ChatbotFlow` rows, definition hash and ownership;
- current CRA `Client.features`, profile and app feature resolution;
- current CRA ADMIN/SUPERVISOR/AGENT users and roles;
- authenticated read-only `GET /app/chatbot/flows` as CRA ADMIN;
- comparison with `GET /admin/chatbot/flows?clientKey=cra-pr`;
- runtime resolver read proving exact active row selected in production at the audit time;
- resource reference audit against current CRA department/queue IDs.

The 2026-09-15 attempt to collect this evidence was blocked by network errors to the production host (`ssh root@64.225.18.191` timed out / network unreachable). No production mutation was performed.

## Current Classification

Classification: `I. NOT PROVEN`.

Most likely areas to validate first when production access is available:

1. CRA app session effective `clientId` differs from the CRA flow `clientId`.
2. CRA `Client.features.chatbot` or profile/capability projection disables the app route/API.
3. Authenticated app API returns the flow but frontend state/error path hides it.
4. User role/session is not actually `ADMIN`/`SUPERVISOR` in the CRA tenant.

These are hypotheses, not proven causes.

## Safe Fix Direction

No patch is authorized from the current evidence.

Expected safe correction after proof:

- make the same existing CRA `ChatbotFlow` visible to authorized CRA users;
- do not recreate the flow;
- do not mutate `ChatbotFlow.definition`;
- do not change `entryPoint`, `isActive`, `clientId` or runtime behavior unless a metadata ownership defect is proven and explicitly approved.

## Backlog

`CRA ACTIVE FLOW TENANT VISIBILITY`: `AUDIT BLOCKED / PRODUCTION EVIDENCE REQUIRED`.

`CRA HOURS`: remains `CLOSED / CONFIGURED / OPERATIONALLY VALIDATED`.

