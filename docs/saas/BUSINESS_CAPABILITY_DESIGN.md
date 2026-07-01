# Business Capability Design

Status: architectural contract. Runtime adoption for `crm` began in Sprint 82A; backend app-route enforcement began in Sprint 82B.

Sprint: 81E - Business Capability Design.

## Purpose

This document formalizes the business-market capabilities that will replace the remaining legitimate frontend dependency on `profile` for business-only surfaces.

The objective is narrow:

- define the private-market capability vocabulary;
- preserve Converta as a single platform;
- avoid `tenant.profile === "business"` in product logic;
- prepare future implementation without changing current UX.

This is the last purely documentary sprint in the Market Profiles / Capabilities trail. Future work should implement capabilities or business functionality directly.

## Architectural Position

Business capabilities are not a separate product.

They are optional capabilities resolved through the same Converta Platform model:

```text
TenantCapabilities
=
Core
+
Profile Defaults
+
Feature Packs
+
Tenant Overrides
-
Kill Switches
```

Business capabilities must follow the same invariants already defined in `MARKET_PROFILE_ARCHITECTURE.md`:

- Core remains segment-agnostic.
- Market Profile only suggests defaults.
- Feature Pack groups sellable capabilities.
- Tenant Configuration is the effective source of behavior.
- RBAC and tenant isolation continue to apply after capability resolution.

## 1. Business Capability Catalog

| Capability | Default for `business` | Purpose | Description | Dependencies | Relationship with Core | Relationship with Feature Packs |
| --- | --- | --- | --- | --- | --- | --- |
| `crm` | on | Commercial relationship management | Enables CRM-oriented navigation and customer/opportunity surfaces. In Sprint 82A, it replaced the previous `profiles: ["business"]` filter for `/app/settings/crm`; in Sprint 82B, app CRM/lead routes started enforcing the capability in the backend. | Contacts, Leads, Inbox timeline, users/RBAC | Uses Core contacts, leads, conversations, notes and RBAC. Core does not know the market. | Base capability for `CRM Pack`, often bundled with `salesPipeline`, `catalog`, `quotes` and `campaigns`. |
| `catalog` | off by default until runtime adoption | Product/service catalog | Enables catalog surfaces for products, services, SKUs, descriptions and commercial reference data. | Templates, campaigns, CRM context | Uses Core tenant storage and message/template composition. | Belongs to `Catalog Pack` or `Business Pack`. May be bundled with campaigns and quotes. |
| `salesPipeline` | off by default until runtime adoption | Sales funnel management | Enables pipeline stages, opportunities, qualification and conversion reporting. | CRM, users, contacts/leads, reports | Uses Core Lead and reporting foundations. | Belongs to `Sales Pack` or `CRM Pack`. |
| `campaigns` | on | Commercial outbound campaigns | Enables campaign planning and execution for business tenants. | Templates, contacts/leads, channel rules, Meta policy | Uses Core message governance, templates, contacts and channel restrictions. | Can be sold as `Campaign Pack`; may remain enabled in business base where contract includes campaigns. |
| `orders` | off | Order tracking | Enables order lifecycle views and customer-service context for commerce operations. | CRM, catalog, external integrations or manual entry | Uses Core contacts, conversations and integration surfaces. | Future `Commerce Pack`; not implemented as a runtime module today. |
| `quotes` | off | Commercial quotes/proposals | Enables quote creation, tracking and follow-up in conversation context. | CRM, catalog, templates, possible PDF/export support | Uses Core contacts, timeline and template/message surfaces. | Future `Sales Pack`; should not be assumed implemented. |
| `inventory` | off | Inventory/product availability | Enables inventory-aware support and sales workflows. | Catalog, external system integration or tenant-managed stock | Uses Core integration and tenant config foundations. | Future `Commerce Pack`; not implemented today. |

### Default Rationale

Current behavior must be preserved.

Therefore:

- `campaigns` remains enabled by default for `business`, because this is already the current runtime default.
- `templates` remains enabled by default for `business`, because this is already the current runtime default.
- `crm` should become enabled by default for `business` when implemented, because the current CRM navigation is business-only.
- `catalog`, `salesPipeline`, `orders`, `quotes` and `inventory` should remain disabled until each has an explicit runtime implementation or feature pack.

## 2. Business Profile Default Matrix

This matrix is a contract for future implementation. It does not change the current defaults.

| Capability | Business default target | Current runtime equivalent | Implementation status |
| --- | --- | --- | --- |
| `crm` | on | `feature: "crm"` in `AppShell` for `/app/settings/crm` | Runtime/frontend capability adopted in Sprint 82A |
| `campaigns` | on | `campaigns` feature/capability | Implemented |
| `templates` | on | `templates` feature/capability | Implemented |
| `catalog` | off | reserved capability in runtime | Structural capability only |
| `salesPipeline` | off | reserved/future frontend capability | Structural capability only |
| `orders` | off | none | Not implemented |
| `quotes` | off | none | Not implemented |
| `inventory` | off | none | Not implemented |

## 3. Mapping Existing Capabilities

### `campaigns`

Decision: keep the name.

Reason:

- It already exists in backend and frontend feature defaults.
- It represents a real implemented module.
- Renaming would create compatibility risk without product value.

Future relationship:

- `campaigns` can be included in `Business Base`, `Campaign Pack` or another commercial pack.
- Government tenants may still enable it by tenant override or contract. The capability is not business-exclusive.

### `templates`

Decision: keep the name.

Reason:

- It is an implemented operational feature.
- It is not business-only; government tenants may need templates by contract.
- It should remain a capability, not become part of `catalog` or `crm`.

Future relationship:

- `templates` can be a dependency for campaigns, quotes, chatbot and channel operations.
- It should not be renamed to a business-specific term.

### `crm`

Decision: use `crm` as the capability that replaces the previous business-profile navigation filter.

Reason:

- The frontend previously had a legitimate `profiles: ["business"]` filter for `/app/settings/crm`.
- Sprint 82A introduced `crm` in the capability runtime and replaced that filter with `feature: "crm"`.
- Profile remains valid for terminology and tenant configuration, but no longer drives CRM navigation visibility.

### `catalog`

Decision: keep as a reserved capability.

Reason:

- It already exists as an additional capability in the capabilities runtime foundation.
- It should not be conflated with templates or campaigns.
- A catalog can support sales, quotes, chatbot answers and support workflows.

### `salesPipeline`

Decision: keep as a reserved capability.

Reason:

- It already exists as a future capability in frontend defaults and backend capability runtime.
- It should not replace `crm`; it is a more specific sales capability layered on top of CRM.

### `orders`, `quotes`, `inventory`

Decision: define now, implement later only when a business sprint requires them.

Reason:

- They are common private-market capabilities.
- They are not evidenced as implemented modules today.
- Marking them now prevents future ad hoc naming.

## 4. CRM Transitional State

Previous transitional state:

```ts
profiles: ["business"]
```

Location:

```text
src/components/app/AppShell.tsx
```

Current target state:

```ts
feature: "crm"
```

This is the expected frontend navigation model after Sprint 82A.

Rules preserved by the replacement:

- Do not change the visible CRM behavior for current business tenants.
- Default `crm=true` for `business` when the capability is introduced.
- Default `crm=false` for `government`, unless explicitly enabled by tenant override or feature pack.
- Preserve RBAC and tenant isolation.
- Do not remove profile from terminology, tenant admin configuration or commercial positioning.

## 5. Classification Criteria

Every new business-market feature must answer four questions before implementation.

### Core Platform

Classify as Core when the capability is segment-agnostic and required by the platform foundation.

Examples:

- tenant isolation;
- RBAC;
- inbox timeline;
- channels;
- audit events;
- operational metrics.

Core must not know market profile.

### Capability

Classify as Capability when the behavior can be enabled, disabled or sold independently per tenant.

Examples:

- `crm`;
- `catalog`;
- `salesPipeline`;
- `campaigns`;
- `quotes`.

A capability must be optional, tenant-scoped and compatible with existing tenants.

### Feature Pack

Classify as Feature Pack when the business decision is to bundle capabilities for sale or rollout.

Examples:

- `CRM Pack`: `crm`, `salesPipeline`, `quotes`;
- `Catalog Pack`: `catalog`, `inventory`;
- `Campaign Pack`: `campaigns`, `templates`;
- `Commerce Pack`: `catalog`, `orders`, `inventory`, `quotes`.

Feature Packs compile into capabilities. They must not create product forks.

### Tenant Override

Classify as Tenant Override when the behavior differs for a specific contract, rollout or operational exception.

Examples:

- business tenant without campaigns;
- government tenant with templates;
- pilot tenant with catalog enabled;
- tenant with emergency kill switch for a runtime capability.

Tenant override wins over profile default, subject to safety/kill-switch policy.

## 6. Roadmap To Remove Profile Dependency

### Phase 1 - Contract

Status: this document.

Outcome:

- `crm` selected as the replacement for the last business-profile navigation filter.
- business capability vocabulary defined.
- existing `campaigns` and `templates` names preserved.

### Phase 2 - Runtime Extension

Add `crm`, `orders`, `quotes` and `inventory` to the typed capability contracts.

Rules:

- no schema migration unless required by a later storage sprint;
- preserve current defaults;
- set `crm=true` for business defaults;
- set `crm=false` for government defaults;
- keep reserved capabilities disabled until implemented.

Status: `crm` was implemented in Sprint 82A. `orders`, `quotes` and `inventory` remain future capabilities.

### Phase 3 - Frontend Adoption

Replace:

```ts
profiles: ["business"]
```

with:

```ts
feature: "crm"
```

or equivalent capability field.

Do this only after Phase 2 exists and tests prove current business tenants still see CRM.

Status: completed for `crm` in Sprint 82A.

### Phase 4 - Backend Adoption

Use `hasCapability(client, "crm")` only for backend routes that truly need capability gating.

Rules:

- do not duplicate RBAC;
- do not weaken tenant isolation;
- do not gate shared Core data behind business-only assumptions.

Status: started in Sprint 82B for app CRM settings, CRM campaign-recipient export and app lead edit/status/notes routes.

### Phase 5 - Feature Pack Mapping

Only after runtime adoption, document which commercial packs enable which business capabilities.

## 7. Explicit Non-Goals

This sprint does not:

- implement `crm` runtime capability;
- add database fields;
- create migrations;
- change navigation;
- change tenant defaults;
- rename existing features;
- remove profile from terminology or tenant admin;
- implement orders, quotes or inventory.

## 8. Exit Criteria For Phase V

After this document, the Market Profiles / Capabilities architecture track is considered closed for now:

```text
81A Market Profile Architecture
81B Runtime Design
81C Capabilities Runtime
81D Frontend Capability Adoption
81E Business Capability Design
```

Future work should be implementation-first:

- implement a capability;
- implement a business feature;
- or create a new ADR only when a real architectural decision is required.
