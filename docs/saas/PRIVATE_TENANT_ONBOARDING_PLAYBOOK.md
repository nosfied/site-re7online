# Private Tenant Onboarding Playbook

## Regularização do App ID Meta

O caminho canônico é o Embedded Signup: uma conclusão bem-sucedida grava
`TenantMetaConfig.rawPayload.appId` e preserva token, WABA, número, `source` e as
demais propriedades. Para tenant existente, use somente a operação administrativa
tenant-scoped da tela de onboarding. Confirme a proveniência `embedded_signup`; não
use SQL manual, edição direta de JSON ou cópia entre tenants.

Em 24/10/2026, a regularização de `demo-converta` foi concluída pela operação
administrativa tenant-scoped. Uma consulta diagnóstica anterior a `GET /debug_token`
confirmou o vínculo atual entre o token armazenado e o aplicativo; a fonte já era
`embedded_signup`. Essa confirmação prova o vínculo atual e não deve ser descrita
como recuperação do histórico original do onboarding. O fallback global permaneceu
desativado e os demais tenants não foram alterados.

Na homologação, confirme antes da submissão que o tenant autorizado aparece como
“App ID configurado”, que tenants de outras proveniências permanecem inalterados e
que `META_APP_ID_FALLBACK_MODE` está `disabled`. A regularização não chama a Meta,
não sincroniza templates e não altera solicitações. Submissão, upload e envio exigem
autorização posterior própria.

Status: operational playbook. This document does not change runtime behavior.

## Objective

Transform the current multichannel technical capability into a repeatable operational process for activating new private-market tenants in Converta.

This playbook must be used with:

- `/admin/tenants/:tenantKey/channels` as the official internal channel console;
- `docs/saas/admin-ui.md` for admin console behavior;
- `docs/saas/CHANNELS_GOVERNANCE.md` for channel invariants;
- `docs/saas/MARKET_PROFILE_ARCHITECTURE.md` for Core, profiles, feature packs and tenant configuration rules;
- `docs/saas/RE7ONLINE_TENANT_OPERATIONS.md` for the internal `re7online` showcase tenant;
- `docs/saas/onboarding-form.md` for commercial/operational data collection.

## Scope

Allowed:

- tenant activation checklist;
- channel configuration checklist;
- smoke validation;
- rollback/deactivation procedure;
- activation report template.

Not allowed by this playbook:

- changing WhatsApp, Messenger or Instagram runtime code;
- changing schema or migrations;
- changing `channelAccounts` outside the approved admin console flow;
- exposing or copying tokens;
- enabling Messenger/Instagram AI, automation or automatic handoff by default;
- deleting channel history during rollback.

## Current Channel Baseline

After Sprints 66X and 66X.2:

- Meta approved `instagram_business_basic`;
- Meta approved `instagram_business_manage_messages`;
- Instagram Business Login is operational;
- Instagram real inbound is operational;
- Instagram manual outbound is operational in human-only mode;
- Messenger real inbound/manual outbound is operational in human-only mode;
- WhatsApp runtime remains the primary operational channel and was not changed by the admin consolidation;
- `/admin/tenants/:tenantKey/channels` is the official Re7online internal console for technical channel configuration;
- `/app` does not expose technical channel configuration to the customer operator;
- `/app/settings/channels/instagram` remains only as a temporary legacy fallback and must not be promoted in customer operations;
- `channels:shadow:compare` is globally healthy when `missing=0` and `mismatched=0`; anonymized drift warnings are non-blocking;
- Messenger and Instagram must remain with `aiEnabled=false`, `automationEnabled=false` and `handoffEnabled=false` unless a future sprint explicitly changes that policy.

## 1. Prerequisites

Before starting tenant activation, collect and confirm:

- tenant key and legal/customer name;
- customer domain and brand identity;
- initial tenant admin user;
- expected market profile and contracted feature packs;
- initial capabilities/features to enable;
- users, departments and RBAC model;
- channels requested for go-live: WhatsApp, Messenger, Instagram, Webchat or others;
- Meta Business Manager/Portfolio access, when applicable;
- WhatsApp WABA, phone number and `phoneNumberId`, when applicable;
- Facebook Page/account for Messenger, when applicable;
- Instagram Business account for Instagram, when applicable;
- operational owner at Re7online;
- customer technical contact;
- planned smoke window.

Do not start token or OAuth work until the customer confirms authorization over the relevant Meta assets.

## 2. Tenant Initial Configuration

Use the current tenant configuration flow. The tenant must remain a regular Converta tenant; do not create market-specific product forks.

Minimum checks:

1. Tenant exists and is visible in `/admin/tenants`.
2. Tenant profile is set according to commercial contract.
3. Capabilities/features reflect the contracted package.
4. Initial admin user exists.
5. Required departments and queues exist, if applicable.
6. RBAC is configured for admin, supervisor and operator users.
7. Health endpoint is OK before channel activation.

Architecture rules:

- Core Platform does not know customer segment.
- Market Profile suggests defaults only.
- Feature Packs and Tenant Configuration decide effective capabilities.
- RBAC and multitenancy remain mandatory after capability resolution.

## 3. Official Channel Console

Use only the internal console for technical channel configuration:

```text
/admin/tenants/:tenantKey/channels
```

The console is the official place to:

- inspect channel status;
- connect/reconnect Instagram Business;
- configure or validate channel account identifiers;
- inspect aliases and safe metadata;
- inspect `tokenStatus`;
- validate flags;
- run operational checklists.

Tokens must never be copied into reports, screenshots, tickets or customer-facing messages.

## 4. Channel Checklist

### WhatsApp

Confirm:

- WABA is correct;
- `phoneNumberId` is correct;
- number is registered in Cloud API, when required;
- WABA is subscribed to the Converta app;
- webhook receives real messages;
- tenant resolution maps inbound to the correct tenant;
- inbound appears in `/app/inbox`;
- outbound follows the current WhatsApp policy for the tenant;
- timeline records inbound/outbound;
- no `webhook.message.discarded` appears for missing phone number id.

Smoke:

1. Send a real controlled message to the tenant WhatsApp number.
2. Confirm the conversation appears in the correct tenant.
3. Send the approved manual/template outbound when it is part of go-live.
4. Confirm the outbound reaches the external channel.
5. Confirm timeline and runtime state are coherent.

### Messenger

Confirm:

- Page/account belongs to the customer or authorized Meta asset;
- `channel=messenger`;
- `provider=meta`;
- `channelAccountId` and aliases are correct;
- `tokenStatus=configured`;
- webhook/subscription is active;
- `enabled=true`;
- `runtimeEnabled=true`;
- `inboundPersistenceEnabled=true`;
- `outboundEnabled` is enabled only after manual outbound smoke;
- `aiEnabled=false`;
- `automationEnabled=false`;
- `handoffEnabled=false`.

Smoke:

1. Send a controlled real message to the connected Facebook Page.
2. Confirm inbound in the correct tenant inbox.
3. Reply manually from the operator UI.
4. Confirm the reply arrives in Messenger.
5. Confirm timeline records inbound and outbound.

### Instagram

Confirm:

- Connect/Reconnect starts from `/admin/tenants/:tenantKey/channels`;
- OAuth return path is the same admin channel console;
- approved scopes are limited to:
  - `instagram_business_basic`;
  - `instagram_business_manage_messages`;
- connected username/account matches the customer asset;
- `channel=instagram`;
- `provider=meta`;
- `channelAccountId` and aliases are correct;
- `tokenStatus=configured`;
- `enabled=true`;
- `runtimeEnabled=true`;
- `inboundPersistenceEnabled=true`;
- `outboundEnabled` is enabled only after manual outbound smoke;
- `aiEnabled=false`;
- `automationEnabled=false`;
- `handoffEnabled=false`.

Smoke:

1. Send a real controlled Instagram DM to the connected Business account.
2. Confirm inbound in the correct tenant inbox.
3. Reply manually from the operator UI.
4. Confirm the reply arrives in Instagram Direct.
5. Confirm timeline records inbound and outbound.

Do not enable comments/private replies. `instagram_business_manage_comments` is outside the current operational scope.

### Webchat

Confirm:

- tenant feature `webchat=true`;
- tenant feature `webchatOutbound=true` only when human outbound through Inbox is intended;
- at least one active `WebchatSite` belongs to the tenant;
- allowed domains match the public site where the widget will be embedded;
- `/webchat/widget.js` is embedded without secrets;
- `/webchat/v1/session`, `/webchat/v1/messages` and polling are reachable from the allowed domain;
- visitor inbound creates `Conversation.channel=webchat`;
- operator outbound is handled through `/app/inbox`;
- rollback can be done by removing the public site id from the frontend build or disabling `webchat`/`webchatOutbound`.

Smoke:

1. Open the public page with the embedded widget.
2. Start a visitor session.
3. Send a controlled message.
4. Confirm the conversation appears in the correct tenant Inbox as Webchat.
5. Reply manually from the Inbox.
6. Confirm the visitor receives the reply by polling.
7. Confirm no tenant or token data is exposed in the public page.

## 5. Flag Governance

Use the flags below as operational gates:

| Flag | Rule |
| --- | --- |
| `enabled` | Channel can be used by the tenant. Disable first during rollback. |
| `runtimeEnabled` | Runtime can process the channel. Disable to stop processing while preserving configuration. |
| `inboundPersistenceEnabled` | Inbound messages can be persisted. Enable after webhook/tenant resolution is validated. |
| `outboundEnabled` | Manual outbound is allowed. Enable only after successful outbound smoke. |
| `aiEnabled` | Keep `false` for Messenger/Instagram by default. |
| `automationEnabled` | Keep `false` for Messenger/Instagram by default. |
| `handoffEnabled` | Keep `false` for Messenger/Instagram by default. |

WhatsApp follows its existing tenant policies and runtime gates. Messenger and Instagram remain human-only until a future approved sprint changes the policy.

## 6. Mandatory Smoke Tests

Before customer handoff:

1. Backend health:

```bash
curl -sS https://converta.re7online.com/agent-api/health
```

2. Inbound per activated channel.
3. Manual outbound per activated channel where `outboundEnabled=true`.
4. Inbox visibility.
5. Timeline registration.
6. Runtime state coherence.
7. Token redaction in admin/API/UI.
8. Flags match the activation report.
9. `channels:shadow:compare` when WhatsApp shadow health is relevant to the activation.

Expected acceptance:

- customer can send a controlled message;
- operator can see the message in the correct tenant;
- operator can reply manually when outbound is enabled;
- external channel receives the reply;
- timeline records inbound and outbound;
- no token is visible;
- no other tenant is affected.

## 7. Rollback And Safe Deactivation

Use the least destructive step that stops the risk:

1. Disable `outboundEnabled` to stop manual sends.
2. Disable `runtimeEnabled` to stop runtime processing.
3. Disable `enabled` to fully disable the channel for operations.
4. Preserve history and timeline records.
5. Do not delete tokens without a specific decision and backup/rotation plan.
6. Do not delete channel accounts as a first response.
7. Register reason, timestamp, operator and evidence.

Rollback must not delete customer conversation history.

## 8. Activation Report Template

Use this template in the operational ticket or customer activation record. Keep all identifiers redacted where needed.

```text
Tenant activation report

tenantKey:
customer:
marketProfile:
featurePacks/capabilities:
activationDateTime:
responsible:
customerContact:

Channels activated:
- WhatsApp: yes/no
- Messenger: yes/no
- Instagram: yes/no
- Webchat: yes/no

Final flags:
- channel:
  enabled:
  runtimeEnabled:
  inboundPersistenceEnabled:
  outboundEnabled:
  aiEnabled:
  automationEnabled:
  handoffEnabled:
  tokenStatus:
  aliasCount:

Smoke results:
- health:
- inbound WhatsApp:
- outbound WhatsApp:
- inbound Messenger:
- outbound Messenger:
- inbound Instagram:
- outbound Instagram:
- public Webchat widget:
- Webchat bot intake:
- Webchat handoff:
- inbox:
- timeline:
- runtime state:
- shadow compare, if applicable:

Evidence:
- screenshot references:
- log references, redacted:
- admin console references, redacted:

Pending items:
- item:
- owner:
- due date:

Rollback notes:
- safe disable path:
- token rotation needed: yes/no
- customer communication needed: yes/no

Approval:
- Re7 responsible:
- customer responsible:
- approved for go-live: yes/no
```

## 9. Documentation Audit Result

Documents audited during Sprint 66Y:

- `docs/saas/admin-ui.md`: current and contains the internal channel console, Instagram post-approval flow and flag governance. This playbook links to it instead of duplicating UI details.
- `docs/meta/01-app-review-package.md`: current for Meta review evidence and now treated as post-approval historical/evidence package for the approved Instagram permissions.
- `docs/meta/02-instagram-readiness.md`: current for Instagram Business Login readiness and operational limitations.
- `docs/saas/CHANNELS_GOVERNANCE.md`: current for channel invariants and token/channelAccount rules.
- `docs/saas/MARKET_PROFILE_ARCHITECTURE.md`: current for Core/Profile/Feature Pack/Tenant Configuration invariants.
- `docs/saas/onboarding-form.md`: partially current; useful for data collection, but not sufficient as the operational activation playbook.
- `docs/onboarding.md`: partially current; useful for WhatsApp-specific onboarding and Cloud API registration details.
- `docs/saas/go-live-checklist.md`: partially current; overlaps with go-live, but predates the consolidated multichannel admin console.

Decision: create this document as the canonical private-tenant activation playbook and reference it from the documentation index/admin docs.

## 10. Remaining Operational Gaps

- Decide when to remove or internally flag the legacy route `/app/settings/channels/instagram`.
- Create a future token rotation runbook for Meta channel tokens.
- Create a future private-tenant activation report repository/process outside git for customer-specific evidence.
- Keep `instagram_business_manage_comments` out of scope until comments/private replies receive their own sprint.
- Keep Messenger/Instagram AI, automation and handoff disabled until a formal multichannel automation sprint.
- For Webchat onboarding, confirm minimized-widget badge/status behavior and document that read receipts are limited to local `sent/received` states until a future backend read-receipt capability exists.
