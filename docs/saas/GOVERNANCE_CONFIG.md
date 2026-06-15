# Governance Config

Status: current-state documentation based on code inspection. No migration is executed by this document.

## Current Configuration Sources

The Converta configuration layer is split across Postgres and `.data/tenants.json`.

- Postgres stores tenant identity, users, sessions, departments, campaigns, templates, flows, retention, SLA, Meta onboarding, operational data and first-stage operational config.
- `.data/tenants.json` still stores tenant technical configuration, channel accounts, several automation settings and commercial limits.
- `apps/whatsapp-agent/src/config/tenantConfig.ts` remains the canonical loader/writer for `tenants.json`.
- `TenantOperationalConfig` is the DB-first holder for low-risk tenant operational settings migrated in phases.

## Mandatory Matrix

| Configuração | Fonte Atual | Fonte de Verdade | Equivalente DB | Plano Futuro |
| --- | --- | --- | --- | --- |
| Tenant key/name/status | DB + `tenants.json` | DB for app auth/runtime identity; JSON still used by config loader | `Client.clientKey`, `Client.name`, `Client.status` | Move remaining reads to DB-first and keep JSON fallback during transition |
| Business/government profile | DB | DB | `Client.profile` | Keep DB-first |
| App feature flags | DB | DB | `Client.features` | Keep DB-first; consider shared defaults package |
| WhatsApp phone mapping | DB + JSON fallback | DB for webhook resolution; JSON still used by bootstrap/fallback | `WaPhoneNumber.phoneNumberId`, `TenantMetaConfig.phoneNumberId` | Make `WaPhoneNumber` mandatory for all tenants |
| WhatsApp business/WABA credentials | DB | DB-first | `TenantMetaConfig.businessToken`, `wabaId`, `businessId`, `businessPortfolioId` | Keep DB-first; avoid duplicating token in JSON |
| Messenger channel account | `tenants.json` | `tenants.json` | none | Migrate with `channelAccounts` as dedicated config table or secure JSON |
| Instagram channel account | `tenants.json` | `tenants.json` | none | Migrate with `channelAccounts`; preserve aliases and token redaction |
| Channel aliases/metadata | `tenants.json` | `tenants.json` | none | Dedicated channel account model recommended |
| Channel tokens | `tenants.json` / `TenantMetaConfig` depending channel | Split | partial: `TenantMetaConfig` for WhatsApp | Move non-WhatsApp channel tokens to secure DB storage with redacted APIs |
| Chatbot flows | DB | DB | `ChatbotFlow` | Keep DB-first |
| Chatbot/automation locks | `tenants.json` | `tenants.json` | none | Migrate after governance, likely tenant operational config |
| AI assistant prompts/topics/intents | `tenants.json` | `tenants.json` | none | Migrate after evaluation guardrails are documented |
| AI qualification schema | `tenants.json` | `tenants.json` | none | Migrate with automation settings |
| Media handoff policy | `tenants.json` | `tenants.json` | none | Migrate as tenant automation config |
| Handoff lead notification recipients | DB-first with JSON fallback | `TenantOperationalConfig.config.handoffLeadNotification` | `TenantOperationalConfig` | Keep fallback until tenants are backfilled and verified |
| Follow-up settings | DB-first with JSON fallback | `TenantOperationalConfig.config.followUp` | `TenantOperationalConfig` | Keep fallback until tenants are backfilled and verified |
| CRM status catalog | DB-first with JSON fallback | `TenantOperationalConfig.config.crmBusinessStatuses` | `TenantOperationalConfig`, operational records in `Lead.status` | Keep fallback until tenants are backfilled and verified |
| Leads/CRM records | DB | DB | `Lead`, `LeadNote`, `Contact`, `Conversation` | Keep DB-first |
| Campaigns | DB | DB | `Campaign` | Keep DB-first |
| Templates | DB-first for manual handoff pointer with JSON fallback | `TenantOperationalConfig.config.templates.manualHandoff` for pointer; DB for catalog | `Template`, `TemplateRequest`, `TenantOperationalConfig` | Keep fallback until tenants are backfilled and verified |
| Departments/queues | DB | DB | `Department`, `Queue` | Keep DB-first |
| Users/RBAC/sessions | DB | DB | `User`, `AppAuthSession`, `PasswordResetToken` | Keep DB-first |
| Push subscriptions | DB | DB | `PushSubscription` | Keep DB-first |
| Retention/LGPD | DB | DB | `RetentionConfig` | Keep DB-first |
| SLA/metrics | DB | DB | `SLAConfig`, `ConversationMetrics` | Keep DB-first |
| Plan/quota limits | `tenants.json` | `tenants.json` | usage is computed from DB records | Migrate to billing/plan config after product pricing stabilizes |
| Company/legal/contract fields | `tenants.json` | `tenants.json` | partial tenant identity in `Client` | Migrate to tenant profile/contract table if commercial ops require it |

## Duplications

- `Client.name` vs `TenantConfig.name`.
- `Client.clientKey` vs tenant object key and `TenantConfig.id`.
- `WaPhoneNumber.phoneNumberId` and `TenantMetaConfig.phoneNumberId` vs `TenantConfig.metaPhoneNumberId`.
- `ChatbotFlow` in DB vs automation flags and AI schema in `tenants.json`.
- `Lead.status` in DB vs `crmBusinessStatuses` catalog now DB-first in `TenantOperationalConfig`, with `tenants.json` fallback during transition.
- `Template` catalog in DB vs `templates.manualHandoff` pointer now DB-first in `TenantOperationalConfig`, with `tenants.json` fallback during transition.

## Current Risks

- Split source of truth between DB and JSON.
- JSON writes are atomic with backup, but not relationally transactional.
- Process-local cache in `getTenants()` can hide external file edits until reload or explicit write path.
- Channel tokens in JSON require strict redaction in every API/UI path.
- New fields may be added to `tenants.json` without a migration plan unless governance is enforced.

## What Still Depends On tenants.json

- `channelAccounts`
- Instagram Business Login account/token metadata
- Messenger token/account metadata
- AI assistant configuration
- Chatbot/automation locks
- `handoffLeadNotification*` fallback for tenants not yet backfilled
- Media handoff policy
- `followUp*` fallback for tenants not yet backfilled
- Quotas and plan fields
- `templates.manualHandoff` fallback for tenants not yet backfilled
- Some onboarding/bootstrap fallback fields

## DB-First Areas

- Client identity/profile/features
- WhatsApp phone resolution via `WaPhoneNumber`
- WhatsApp onboarding credentials via `TenantMetaConfig`
- Users/auth/sessions/reset
- Push subscriptions
- Departments/queues
- Campaigns
- Templates catalog and manual handoff pointer via `TenantOperationalConfig.config.templates.manualHandoff`, with JSON fallback
- Follow-up settings via `TenantOperationalConfig.config.followUp`, with JSON fallback
- Handoff lead notification settings via `TenantOperationalConfig.config.handoffLeadNotification`, with JSON fallback
- CRM status catalog via `TenantOperationalConfig.config.crmBusinessStatuses`, with JSON fallback
- Chatbot flows
- SLA/retention/metrics
- Conversations/messages/leads/timeline

## Governance Rule

Until a config migration is implemented, no new production configuration field should be added to `tenants.json` without documenting:

1. why DB is not used;
2. expected owner;
3. read/write routes;
4. future destination;
5. rollback behavior.

## Sprint 56 DB-First Rule

`crmBusinessStatuses` is the first migrated operational config block.

Read path:

1. `TenantOperationalConfig.config.crmBusinessStatuses`
2. fallback to `TenantConfig.crmBusinessStatuses`
3. normalization defaults

Write path:

- `/app/crm/settings` writes to `TenantOperationalConfig`.
- `tenants.json` is not modified by this write path.

Backfill:

- `npm run tenant-config:backfill -- --dry-run --json`
- `npm run tenant-config:backfill -- --json`

Do not use `TenantOperationalConfig` for tokens, channel accounts, OAuth data or raw provider payloads.

## Sprint 57 DB-First Rule

`templates.manualHandoff` is the second migrated operational config block.

Read path:

1. `TenantOperationalConfig.config.templates.manualHandoff`
2. fallback to `TenantConfig.templates.manualHandoff`
3. `null`/empty if neither exists

Write/backfill path:

- `npm run tenant-config:backfill -- --dry-run --json`
- `npm run tenant-config:backfill -- --json`
- The backfill copies JSON -> DB and does not modify `tenants.json`.

The admin tenant read endpoint returns the effective DB-first `templates.manualHandoff` value for compatibility with existing runtime scripts.

## Sprint 58 DB-First Rule

`followUp*` settings are the third migrated operational config block.

DB shape:

```json
{
  "followUp": {
    "enabled": true,
    "delayMinutes": 60,
    "maxCount": 3,
    "useTemplate": true,
    "templateName": "re7_followup_v1",
    "templateLang": "pt_BR"
  }
}
```

Read path:

1. `TenantOperationalConfig.config.followUp`
2. fallback to `TenantConfig.followUp*`
3. environment defaults for safe missing values

Write/backfill path:

- `/admin/chatbot/settings` writes follow-up fields to `TenantOperationalConfig`.
- `findEligibleFollowUps()` resolves follow-up settings DB-first before evaluating eligibility.
- `npm run tenant-config:backfill -- --dry-run --json`
- `npm run tenant-config:backfill -- --json`
- The backfill copies JSON -> DB and does not modify `tenants.json`.

## Sprint 59 DB-First Rule

`handoffLeadNotification*` settings are the fourth migrated operational config block.

DB shape:

```json
{
  "handoffLeadNotification": {
    "enabled": true,
    "recipients": [
      {
        "id": "wa_5511999999999",
        "waId": "5511999999999",
        "label": "Atendente",
        "isActive": true
      }
    ]
  }
}
```

Read path:

1. `TenantOperationalConfig.config.handoffLeadNotification`
2. fallback to `TenantConfig.handoffLeadNotificationEnabled` and `TenantConfig.handoffLeadNotificationRecipients`
3. disabled with empty recipients if neither exists

Write/backfill path:

- `/app/chatbot/settings` writes handoff notification settings to `TenantOperationalConfig`.
- `/admin/chatbot/settings` writes handoff notification settings to `TenantOperationalConfig`.
- WhatsApp webhook handoff notification runtime resolves settings DB-first before sending notifications.
- `npm run tenant-config:backfill -- --dry-run --json`
- `npm run tenant-config:backfill -- --json`
- The backfill copies JSON -> DB and does not modify `tenants.json`.
