# Chatbot Flow Active vs Entrypoint Semantics Audit - 2026-09-15

Status: `CLOSED / READ-ONLY AUDIT / P2 UX CLARIFICATION + P2 DOMAIN HARDENING`.

## Scope

This audit answers what `ChatbotFlow.isActive` and `ChatbotFlow.entryPoint`
mean today. No flow, tenant config, schema, migration or runtime state was
changed.

Preflight:

- canonical branch: `flow-executor-quote-hardening`;
- canonical HEAD: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`;
- production HEAD: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`;
- production PM2: `re7-admin-front`, `re7-whatsapp-agent` and
  `re7-whatsapp-web-worker` online;
- production health: frontend root HTTP 200, agent root HTTP 200;
- migrations: 58 migrations, database schema up to date.

## Schema

`ChatbotFlow` fields relevant to lifecycle:

- `id`;
- `clientId`;
- `name`;
- `isActive Boolean @default(false)`;
- `entryPoint Boolean @default(false)`;
- `definition Json`;
- `createdAt`;
- `updatedAt`.

There is no archived/deleted/status/source/profile/version field. The model has
indexes on `[clientId, createdAt]` and `[clientId, isActive, entryPoint]`, but no
unique constraint for one entrypoint per tenant and no database check enforcing
`entryPoint => isActive`.

Therefore lifecycle invariants are currently application-only or missing.

## Runtime Semantics

`isActive` means the flow is eligible to execute. Runtime loaders reject inactive
flows even when a conversation already has `flow=chatbot:<id>`.

`entryPoint` means the active flow is the tenant default for a new chatbot cycle.
The default selector used by Meta inbound, Web Session and Webchat is:

```ts
where: { clientId, isActive: true, entryPoint: true }
```

with a latest-updated/latest-created order where present.

Runtime paths:

- Meta Cloud inbound loads the active conversation flow by id when
  `state.chatbotActive && flow=chatbot:<id>`; otherwise it loads the active
  entrypoint.
- Web Session uses the same pattern: active conversation flow by id, otherwise
  active entrypoint.
- Webchat uses the same pattern for existing runtime state and starts new
  sessions from the active entrypoint.
- The inactivity processor only processes runtime states whose stored
  `flow=chatbot:<id>` still points to an active flow.
- Inbox consent-node detection scans all active flows, not only entrypoints.

If a tenant has no active entrypoint, the normal inbound default selector returns
no configurable chatbot flow. The runtime does not promote another active flow,
does not choose the newest active flow and does not fall back to an inactive
entrypoint.

## Explicit Non-Entrypoint Execution

Active non-entrypoint flows are executable today through at least one real
product path:

- Support Hub routing can use
  `TenantOperationalConfig.config.supportChannel.chatbotFlowId`.
- The resolver checks `{ id: supportChannel.chatbotFlowId, clientId, isActive:
  true }`.
- It does not require `entryPoint=true`.
- When resolved, the Support Hub creates runtime state with
  `flow=chatbot:<id>` and `chatbotActive=true`.
- Existing BOT conversations with `flow=chatbot:<id>` also continue through that
  explicit id as long as the flow remains active.

This is documented current capability, not merely future architecture.

No evidence was found that campaigns, templates, URL/QR/referral routing,
departments, intents, Webchat embeds, Telegram or outbound automations can start
an arbitrary active non-entrypoint flow today. Campaign/template usage should
not be confused with chatbot flow execution.

No flow-to-flow transition schema was found: definitions route between nodes
inside one `definition`; they do not call another `ChatbotFlow`.

## Production Data

Representative production tenants:

| Tenant | Total | Active | Entrypoint | Active non-entrypoint | Inactive entrypoint |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cra-pr` | 1 | 1 | 1 | 0 | 0 |
| `secult-pe` | 1 | 1 | 1 | 0 | 0 |
| `demo-converta` | 4 | 1 | 1 | 0 | 0 |
| `syer-rodrigues` | 6 | 1 | 1 | 0 | 0 |

Global production counts:

| `isActive` | `entryPoint` | Count |
| --- | --- | ---: |
| true | true | 8 |
| true | false | 2 |
| false | false | 11 |
| false | true | 0 |

Global active non-entrypoint flows:

- `re7online` / `Converta Platform Support`
  (`cmsmcl41u00014s1ui3d2ap3h`): configured as
  `supportChannel.chatbotFlowId`;
- `lab-websession` / `88H.2 Lab Queue Chatbot Parity`
  (`cmsqf1fka000b4soy3top96fk`): lab tenant.

No production tenant currently has multiple `entryPoint=true` rows. No
production flow currently has `isActive=false` and `entryPoint=true`.

## State Matrix

| State | DB allowed | API/UI allowed | Runtime meaning | Product validity |
| --- | --- | --- | --- | --- |
| inactive / non-entrypoint | yes | yes | stored draft/disabled flow; not executable | valid |
| active / non-entrypoint | yes | yes | executable only by explicit id paths, currently Support Hub/runtime continuation | valid but uncommon |
| active / entrypoint | yes | yes | default initial flow for new chatbot cycles | valid |
| inactive / entrypoint | yes | yes | contradictory; default selector ignores it because it also requires `isActive=true` | should be invalid/hardened |

Zero entrypoint is allowed by DB/API/UI. Runtime behavior is no configurable
chatbot starts by default; existing explicit active flow runtime may continue.

Multiple entrypoints are not prevented by DB. The create/update endpoints clear
other entrypoints inside a Prisma transaction before setting the requested row,
scoped to the same tenant. This is application-only and partially atomic for a
single request, but not race-safe without a database uniqueness constraint.

## UI Semantics

Current UI exposes two checkboxes:

- `Ativo`;
- `Entrada principal`.

Guided Builder copy says: "Ativo permite execução. Entrada principal permite
receber novas conversas como fluxo de entrada do tenant."

That copy is technically coherent with the Support Hub explicit-flow path, but
it is incomplete for normal tenant admins because most flows have no visible
mechanism to be explicitly invoked. The UI can also allow contradictory
combinations, especially inactive entrypoint, because there is no client/server
rule deriving one flag from the other.

## Product Model

Current model: `MODEL D - PARTIAL/FUTURE CAPABILITY`.

Why:

- Multiple active flows are not redundant; an active non-entrypoint flow can be
  executed by explicit id in Support Hub and by continuation of existing runtime
  state.
- The default public/tenant inbound path still uses a single active entrypoint.
- There is no general product surface for campaigns, departments, links,
  referrals, intents, channels or flow-to-flow transitions to select a secondary
  active flow.
- DB invariants do not fully protect the semantics.

## Recommendations

UX:

- Keep both fields internally.
- Keep both visible in Advanced/Admin where Support Hub and explicit routing are
  relevant.
- Rename or explain in normal tenant UI:
  - `Ativo`: "Pode ser executado por rotas explicitas ou conversas ja em
    andamento";
  - `Entrada principal`: "Fluxo padrao para novas conversas do tenant".
- Consider hiding `Ativo` from normal Guided creation or deriving it from
  publish/apply actions unless an explicit invocation route is shown.

Domain invariants:

- one entrypoint per tenant: currently application-only; recommend DB partial
  unique hardening;
- `entryPoint => isActive`: missing; recommend API validation and DB check or
  transactional normalization;
- inactive implies not entrypoint: missing; recommend clearing `entryPoint` when
  deactivating;
- zero entrypoint: product decision. It is currently allowed and means no default
  chatbot starts;
- principal switch: currently transactional but not DB race-safe.

Backlog classification:

- `P2 UX CLARIFICATION`: make `Ativo` vs `Entrada principal` understandable in
  tenant-facing UI.
- `P2 DOMAIN HARDENING`: add race-safe/domain invariant enforcement after product
  decision on whether zero entrypoint remains allowed.

No P1 was opened because production data has no duplicate entrypoints, no
inactive entrypoints and existing active non-entrypoint production usage is a
valid Support Hub path.
