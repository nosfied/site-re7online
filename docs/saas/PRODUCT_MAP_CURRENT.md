# Product Map Current

Status: current-state documentation based on code inspection. No runtime behavior is defined here.

## Scope

This document maps the Converta product as implemented today in the repository. The main code surfaces are:

- Backend: `apps/whatsapp-agent/src`
- Database schema: `apps/whatsapp-agent/prisma/schema.prisma`
- App frontend: `src/app/app`
- Internal admin frontend: `src/app/admin`
- Shared frontend API/types: `src/lib`

## Product Profiles

Profiles are stored in `Client.profile` and normalized as `business` or `government`.

- Backend source: `apps/whatsapp-agent/src/features/clientFeatures.ts`
- Frontend source: `src/lib/appFeatures.ts`
- Admin tenant creation/editing supports selecting `business` or `government`.
- Architecture direction: `MARKET_PROFILE_ARCHITECTURE.md`
- Business capability contract: `BUSINESS_CAPABILITY_DESIGN.md`

The official long-term product model is:

```text
Converta
├── Core Platform
├── Market Profiles
├── Feature Packs
└── Tenant Configuration
```

Current runtime uses `Client.profile` plus `Client.features`. Future work should treat profile as default capability selection, not as direct product branching. Core modules should ask for capabilities/features and preserve RBAC and tenant isolation.

As of Sprint 81E, the remaining legitimate business-profile navigation filter is CRM. The target replacement is a future `crm` capability. Until that runtime capability exists, the current `profiles: ["business"]` guard for CRM is documented as transitional, not architectural debt.

### Business

Default business profile favors commercial operations:

- CRM: business-only navigation today; target `crm` capability
- dashboard: off by default
- departments: on
- users: on
- templates: on
- SLA: on
- reports: on
- campaigns: on
- chatbot: on

### Government

Default government profile favors oversight and reporting:

- dashboard: on
- departments: on
- users: on
- templates: off
- SLA: on
- reports: on
- campaigns: off
- chatbot: on

## Implemented Modules

| Module | Status | Primary Surface | Main Backend/DB Evidence | Dependencies |
| --- | --- | --- | --- | --- |
| Inbox omnichannel | Operational | `/app/inbox` | `Conversation`, `Message`, `InboundMessage`, `OutboundMessage`, `ConversationRuntimeState` | WebSocket, channel persistence, auth, tenant resolution |
| WhatsApp runtime | Operational | webhook/runtime | `whatsapp/webhook.controller.ts`, `WaPhoneNumber`, `TenantMetaConfig` | Meta Cloud API, tenant config, DB |
| Messenger/Facebook | Operational human messaging | `/app/inbox` | `metaWebhookPassive.ts`, `messengerInboundPersistence.ts`, channel accounts | `channelAccounts`, Page token |
| Instagram | Operational inbound/outbound manual, human-only | `/app/inbox`, `/app/settings/channels/instagram` | `instagramInboundPersistence.ts`, `instagramBusinessLogin.service.ts`, channel accounts | Instagram Business Login token, aliases, app review |
| Chatbot flows | Operational with tenant locks | `/app/chatbot` | `ChatbotFlow`, `chatbot/chatbotFlow.ts`, `TenantOperationalConfig` | `Client.features.chatbot`; follow-up, handoff notification, media handoff policy, plan limits, automation disable flags and scoped assistant config are DB-first with `tenants.json` fallback |
| AI supervised fallback | Partial/tenant-configured | runtime/admin | `controlledAssistant.ts`, `TenantOperationalConfig.config.aiAssistantConfig`, `TenantOperationalConfig.config.aiIntentQualification` | OpenAI config; prompt/topic/profile, intent catalog and qualification schema are DB-first with `tenants.json` fallback |
| Campaigns | Operational | `/app/campaigns` | `Campaign`, `campaignRunner.ts` | templates, contacts/leads, feature flag |
| Templates | Operational | `/app/templates`, admin routes | `Template`, `TemplateRequest`, `meta/template.service.ts` | WABA token, feature flag |
| CRM/timeline | Operational | `/app/crm`, `/app/inbox` | `Lead`, `LeadNote`, conversation/message models | CRM status catalog is DB-first in `TenantOperationalConfig` with `tenants.json` fallback |
| Knowledge Base | Structural MVP, controlled rollout | `/app/knowledge-base` | `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, feature `knowledgeBase` | runtime consumption by IA/chatbot is designed but not enabled |
| Scheduling | Structural MVP, controlled rollout | `/app/scheduling` | `SchedulingService`, `SchedulingResource`, `SchedulingAvailability`, `Appointment`, `AppointmentReminder`, feature `scheduling` | no chatbot/IA/API/calendar/reminder runtime integration yet |
| Satisfaction/NPS | Structural MVP, controlled rollout | `/app/satisfaction` | `SatisfactionQuestion`, `SatisfactionSurvey`, `SatisfactionResponse`, feature `satisfaction` | no automatic sending, chatbot/IA trigger, public form or reports yet |
| Dashboard | Available by profile/flag | `/app/dashboard` | feature-gated routes | `Client.features.dashboard` |
| Reports | Operational | `/app/reports` | report routes, `ConversationMetrics`, SLA/retention reads | feature flag, operational data |
| Departments/queues | Operational | `/app/departments`, admin | `Department`, `Queue` | feature flag, inbox assignment |
| Users/RBAC | Operational | `/app/users`, auth routes | `User`, `AppAuthSession`, `PasswordResetToken` | auth/session governance |
| Feature flags | Operational | app/admin | `Client.features`, `Client.profile` | backend/frontend defaults |
| LGPD/privacy | Operational | `/app/settings/privacy` | `RetentionConfig`, privacy retention service | retention job |
| Push/PWA notifications | Operational with platform limits | app shell/inbox | `PushSubscription`, `webPushService.ts`, service worker | browser permission/support |
| Demo/POC data | Internal/demo | scripts | `seed-demo.mjs`, `seed-re7-demo-screenshots.mjs` | local/demo only |
| Internal admin console | Operational | `/admin` | admin routes, tenant/channel/onboarding pages | `X-Admin-Token`, `tenants.json`, DB |

## Main Runtime Dependencies

- Postgres/Prisma for operational data and many tenant-owned entities.
- `TenantOperationalConfig` for migrated operational config: CRM status catalog, manual handoff template pointer, follow-up settings, handoff lead notification settings, media handoff policy, plan/quota limits, automation disable flags and scoped AI assistant config.
- `.data/tenants.json` for tenant technical configuration not yet migrated.
- Meta Cloud API for WhatsApp, Messenger and Instagram.
- WebSocket bridge for realtime inbox.
- Web Push/VAPID for native notifications.
- OpenAI for AI fallback where enabled/configured.

## Current Product Classification

- Operational: yes.
- Sellable for business tenants: yes, especially WhatsApp-first omnichannel operations.
- Government-ready: partial, with profile/feature defaults and reporting foundations.
- Scalable: operationally improving, but configuration governance is still limited by `tenants.json`.
