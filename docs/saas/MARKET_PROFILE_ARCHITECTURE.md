# Market Profile Architecture

Status: architectural direction. This document does not change runtime behavior.

## Decision

Converta is one product, not separate products per vertical.

The official product architecture is:

```text
Converta
├── Core Platform
├── Market Profiles
├── Feature Packs
└── Tenant Configuration
```

The central rule is:

```text
Core does not know the customer segment.
UI and runtime query capabilities.
Profile suggests default capabilities.
Tenant configuration can override capabilities according to contract and rollout.
```

Avoid:

```ts
tenant.profile === "government"
```

Prefer:

```ts
tenantCapabilities.protocols === true
tenantCapabilities.departments === true
tenantCapabilities.catalog === true
```

## Current State

The current implementation already contains the first version of this model:

- `Client.profile` stores a normalized profile (`business` or `government`).
- `Client.features` stores tenant-level feature overrides.
- Backend defaults live in `apps/whatsapp-agent/src/features/clientFeatures.ts`.
- Frontend defaults live in `src/lib/appFeatures.ts`.
- Current documentation lives in `FEATURE_FLAGS_MATRIX.md` and `PRODUCT_MAP_CURRENT.md`.

This sprint does not implement a new runtime layer. It formalizes the target architecture so future work evolves consistently.

## 1. Core Platform

Core Platform is the segment-agnostic foundation of Converta.

Core modules must not depend on whether a tenant is government, business, healthcare, legal or any other market. They must only enforce tenant isolation, RBAC, feature/capability availability, channel rules and product invariants.

Core Platform includes:

| Area | Examples |
| --- | --- |
| Channels | WhatsApp Cloud API, Messenger, Instagram, Webchat, Telegram |
| Inbox | Conversation list, timeline, claim, release, transfer, unread state |
| Identity and access | Multi-tenant, users, RBAC, sessions, MFA |
| Automation | Chatbot, handoff, supervised AI, knowledge base foundations |
| Data model | Contacts, leads, conversations, inbound/outbound messages, events |
| Reporting | Generic operational reports, exports and SLA metrics |
| APIs | Public API, webhooks, internal/admin APIs |
| Operations | Logging, metrics, alerts, health, backup/restore, load lab |
| Governance | Feature flags, tenant config, audit events, LGPD controls |

Core is allowed to ask:

```text
Is this capability enabled?
Does this user have permission?
Does this tenant own the data?
Is this channel/runtime allowed?
```

Core is not allowed to ask:

```text
Is this a government tenant?
Is this a retail tenant?
Is this a legal tenant?
```

## 2. Market Profiles

Market Profiles define the default experience and vocabulary for a segment. They are not separate products.

Profiles answer:

```text
For this market, which capabilities should usually start enabled?
Which labels, dashboards, flows and demo assets are most relevant?
```

Initial profile families:

| Profile | Typical tenants | Experience emphasis |
| --- | --- | --- |
| `business` | Retail, services, franchises, clinics, offices | CRM, pipeline, campaigns, catalog, conversion, customer service |
| `government` | Prefeituras, camaras, SAAE/SIMAE, autarquias, fundacoes | Departments, protocols, auditability, institutional SLA, administrative reports, public-service terminology |
| `healthcare` | Clinics, hospitals, medical groups | Appointments, patient intake, privacy, reminders, care workflows |
| `legal` | Law firms, legal departments | Clients, cases, parties, hearings, deadlines, document history |
| `education` | Schools, courses, universities | Enrollment, student support, announcements, scheduling |

Only `business` and `government` exist in the current runtime profile enum. Other profiles are architectural targets and must not be assumed implemented.

## 3. Feature Packs

Feature Packs are commercial or operational bundles of capabilities. They are independent from market profiles.

Two tenants with the same Market Profile can buy different packs.

Example for `government`:

```text
Government Base
+ Protocols
+ Advanced Reports
+ AI
+ Public API
+ Webhooks
+ Scheduling
```

Example for `business`:

```text
Business Base
+ CRM
+ Campaigns
+ Catalog
+ Sales Pipeline
+ Webchat
+ AI
```

Feature Packs should compile into tenant capabilities, not into profile conditionals.

## 4. Tenant Configuration

Tenant Configuration is the final and most specific layer.

It includes:

| Config type | Examples |
| --- | --- |
| Identity | Name, logo, colors, domains, sender identity |
| Access | Users, roles, MFA policy, department membership |
| Operations | Departments, queues, SLA targets, business hours |
| Channels | WhatsApp number, channel accounts, Webchat site, Telegram bot |
| Automation | Chatbot flows, prompts, handoff rules, templates |
| Reporting | Enabled dashboards, export preferences, report cadence |
| Integration | API keys, webhook endpoints, external systems |
| Compliance | Retention, redaction, audit and LGPD settings |

Tenant Configuration can override profile defaults when contract, rollout or operational reality requires it.

## Capability Catalog

The catalog below names capabilities in product terms. Some map directly to current feature flags; others are future capability names that should be mapped before implementation.

| Capability | Meaning | Current mapping |
| --- | --- | --- |
| `crm` | Commercial/customer relationship surfaces | target business capability; current CRM navigation still uses `profiles: ["business"]` until runtime extension |
| `dashboard` | App dashboard visibility | `dashboard` |
| `departments` | Department and queue management | `departments` |
| `users` | Tenant user management | `users` |
| `templates` | WhatsApp template management | `templates` |
| `sla` | SLA configuration/reporting surfaces | `sla` |
| `reports` | Operational reports and exports | `reports` |
| `campaigns` | Broadcast/campaign operations | `campaigns` |
| `chatbot` | Chatbot flow management/runtime | `chatbot` |
| `knowledgeBase` | Knowledge base surfaces | `knowledgeBase` |
| `scheduling` | Scheduling module | `scheduling` |
| `schedulingReminders` | Reminder management | `schedulingReminders` |
| `schedulingRemindersShadow` | Reminder shadow pipeline | `schedulingRemindersShadow` |
| `schedulingRemindersSend` | Controlled reminder send | `schedulingRemindersSend` |
| `schedulingConfirmation` | Appointment confirmation runtime | `schedulingConfirmation` |
| `satisfaction` | Satisfaction/NPS module | `satisfaction` |
| `audioTranscription` | Audio transcription records/UI | `audioTranscription` |
| `audioTranscriptionRuntime` | Controlled STT runtime | `audioTranscriptionRuntime` |
| `advancedSearch` | Search index/search UI | `advancedSearch` |
| `advancedSearchRuntime` | Operational search runtime/indexers | `advancedSearchRuntime` |
| `webchat` | Webchat settings/inbound | `webchat` |
| `webchatOutbound` | Human outbound via Webchat | `webchatOutbound` |
| `telegram` | Telegram settings | `telegram` |
| `telegramInbound` | Telegram inbound runtime | `telegramInbound` |
| `telegramOutbound` | Telegram human outbound runtime | `telegramOutbound` |
| `webhooks` | Webhook endpoint management | `webhooks` |
| `webhookDispatch` | Manual controlled webhook dispatch | `webhookDispatch` |
| `webhookDispatchExecute` | Real HTTP dispatch execution | `webhookDispatchExecute` |
| `mfa` | MFA enrollment/status | `mfa` |
| `mfaRequired` | MFA requirement policy | `mfaRequired` |
| `mfaEnforced` | MFA login enforcement | `mfaEnforced` |
| `protocols` | Public-service protocol display and lookup | currently implemented in Inbox, should become explicit capability if commercialized separately |
| `catalog` | Product/service catalog | future/reserved |
| `salesPipeline` | Sales pipeline/funnel | frontend future flag exists |
| `orders` | Order lifecycle and support context | future business capability; not implemented |
| `quotes` | Quotes/proposals in commercial workflow | future business capability; not implemented |
| `inventory` | Inventory/product availability context | future business capability; not implemented |
| `governmentReports` | Government-specific reporting pack | frontend future flag exists |
| `pocMode` | Demo/PoC tenant behavior | frontend future flag `poc` exists |

## Profile Default Matrix

This matrix is architectural. Current runtime defaults are still documented in `FEATURE_FLAGS_MATRIX.md`.

| Capability | Business default | Government default | Notes |
| --- | --- | --- | --- |
| `dashboard` | off | on | Government demos and operations rely on oversight dashboards. |
| `departments` | on | on | Core operational segmentation for both profiles. |
| `users` | on | on | RBAC is core. |
| `templates` | on | off | Business usually needs commercial templates; government may enable by contract. |
| `sla` | on | on | SLA is useful for both, more formal in government. |
| `reports` | on | on | Both profiles require reporting. |
| `campaigns` | on | off | Government campaigns should be explicit, not default. |
| `chatbot` | on | on | Both profiles use triage/automation. |
| `crm` | on | off | Target replacement for the remaining business-profile CRM navigation filter. |
| `knowledgeBase` | off | off | Controlled rollout. |
| `scheduling` | off | off | Enable by pack/contract. |
| `satisfaction` | off | off | Enable by pack/contract. |
| `advancedSearch` | off | off | Enable by pack/contract. |
| `audioTranscription` | off | off | Enable by pack/contract and LGPD review. |
| `webchat` | off | off | Enable by channel pack. |
| `telegram` | off | off | Enable by channel pack. |
| `webhooks` | off | off | Enable by integration pack. |
| `mfa` | off | off | Enable/enforce by security policy. |
| `protocols` | optional | on | Government default should expose protocol once modeled as capability. |
| `catalog` | optional/on | off | Business pack. |
| `salesPipeline` | optional/on | off | Business pack. |
| `orders` | off | off | Future commerce pack. |
| `quotes` | off | off | Future sales pack. |
| `inventory` | off | off | Future commerce pack. |
| `governmentReports` | off | optional/on | Government pack. |

For the detailed private-market capability contract, use `BUSINESS_CAPABILITY_DESIGN.md`.

## Override Rules

Capability resolution should follow this order:

1. Start with Core defaults.
2. Apply Market Profile defaults.
3. Apply purchased Feature Packs.
4. Apply tenant-specific overrides from `Client.features` or future capability storage.
5. Apply emergency/safety flags when required by operations.

Rules:

- Tenant override wins over profile default.
- Safety/kill switches must be able to disable runtime even if a pack enables it.
- RBAC still applies after capability resolution.
- Tenant isolation always applies before returning or mutating data.
- Capabilities should be boolean unless a clear need for tier/limit/quantity exists.
- Limits belong to Tenant Configuration or contract/plan configuration, not profile conditionals.

## Frontend Guidelines

Frontend should ask for capabilities, not market profiles.

Preferred:

```ts
if (features.departments) {
  showDepartments();
}

if (features.campaigns) {
  showCampaigns();
}
```

Avoid:

```ts
if (profile === "government") {
  showDepartments();
}
```

Allowed profile use:

- default terminology selection before tenant-specific labels exist;
- demo kit or sales collateral selection;
- initial capability defaults in admin tenant creation.

Not allowed:

- bypassing RBAC;
- showing sensitive data because a profile matches;
- hard-coding product behavior by segment when a capability should exist.

## Backend Guidelines

Backend must preserve:

- multi-tenant isolation;
- RBAC;
- explicit feature/capability enforcement;
- audit events;
- redaction and LGPD rules;
- no cross-tenant data leakage.

Backend should prefer:

```ts
enforceCapability("reports")
enforceCapability("webchatOutbound")
```

over:

```ts
if (client.profile === "government") ...
```

Current backend uses `enforceAppFeature` and `Client.features`. Future work can rename or wrap features as capabilities, but should not weaken existing guards.

## Demo Kit Implication

The permanent sales/demo asset should be:

```text
Converta Demo Kit v1.0
├── Core
├── Business Edition
├── Government Edition
│   ├── SIMAE
│   ├── Prefeitura
│   ├── Camara
│   └── SAAE
├── Legal Edition
├── Retail Edition
└── Healthcare Edition
```

Government is an edition/profile of Converta, not a separate product.

## Roadmap

### 81B - Capability Catalog Alignment

- Compare `ClientFeatureKey`, `AppFeatureKey`, future frontend flags and this capability catalog.
- Decide which future flags become real capabilities.
- Identify naming mismatches (`poc` vs `pocMode`, `governmentReports`, `salesPipeline`).
- No runtime behavior change unless explicitly scoped.

### 81C - Tenant Profile Configuration Design

- Define how profile defaults, feature packs and tenant overrides should be represented in admin UX.
- Decide whether `Client.profile` remains `business/government` only or expands.
- Define migration path without breaking existing tenants.

### 81D - Capability Resolver Design

- Design a shared resolver contract for backend/frontend to avoid duplicated defaults.
- Preserve current `Client.features` behavior during transition.
- Define audit/logging for capability denials.

### 81E - Demo Kit Core

- Produce reusable `Converta Demo Kit v1.0` with Core, Business and Government editions.
- Keep edition-specific materials separate from product architecture.

## Non-Goals

This document does not:

- add runtime capabilities;
- change `Client.profile`;
- change `Client.features`;
- alter frontend menus;
- alter backend authorization;
- create new database fields;
- redefine commercial pricing.
