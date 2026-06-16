# Config Migration Plan

Status: planning document only. No migration is executed by this file.

## Goal

Move Converta tenant configuration from split JSON/DB ownership toward DB-first governance without breaking WhatsApp, Messenger, Instagram, automation, inbox or onboarding.

## Current State

- DB already owns operational data and many product modules.
- `.data/tenants.json` still owns technical tenant configuration and several module settings.
- `TenantOperationalConfig` now owns the first DB-first operational config blocks:
  `crmBusinessStatuses`, `templates.manualHandoff`, `followUp*`, `handoffLeadNotification*`
  `mediaHandoffPolicy`, plan/quota limits, automation disable flags and the scoped AI assistant
  prompt/topic/profile configuration.
- `getTenants()` and `saveTenants()` remain active compatibility helpers.
- Existing backfill scripts target multichannel operational records, not full tenant configuration migration.

## Low Risk

These can be migrated first because they are less coupled to external providers or tokens.

1. CRM status catalog
   - Current: `TenantConfig.crmBusinessStatuses`
   - Implemented destination: `TenantOperationalConfig.config.crmBusinessStatuses`
   - Existing DB relation: `Lead.status`
   - Status: DB-first with `tenants.json` fallback
   - Risk: low/medium because reports/campaigns may depend on labels/eligibility

2. Manual handoff template pointer
   - Current: `TenantConfig.templates.manualHandoff`
   - Implemented destination: `TenantOperationalConfig.config.templates.manualHandoff`
   - Existing DB relation: `Template`, `TemplateRequest`
   - Status: DB-first with `tenants.json` fallback
   - Risk: low if fallback remains

3. Company/legal/contract metadata
   - Current: `TenantConfig.company*`, contact and contract fields
   - Candidate destination: tenant profile/contract table
   - Risk: low if not used in runtime decisions

4. Quota plan metadata
   - Current: tenant quota fields
   - Implemented destination: `TenantOperationalConfig.config.planLimits`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium if hard-cap enforcement remains active

## Medium Risk

These affect runtime behavior but do not usually contain external-provider tokens.

1. Chatbot/automation flags
   - Current: `disableChatbot`, `disableAiFallback`, `disableIntentClassifier`, `disableLegacyFlows`
   - Implemented destination: `TenantOperationalConfig.config.automationFlags`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium because runtime behavior changes immediately when values change

2. AI assistant configuration
   - Current: prompt/topic/profile subset is DB-first in `TenantOperationalConfig.config.aiAssistantConfig`
   - Current: intent catalog and qualification schema are DB-first in `TenantOperationalConfig.config.aiIntentQualification`
   - Risk: medium/high because tenant-specific automation quality depends on it

3. Media handoff policy
   - Current: `mediaHandoffPolicy`
   - Implemented destination: `TenantOperationalConfig.config.mediaHandoffPolicy`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium because inbound media handling and notification behavior depend on it

4. Follow-up settings
   - Current: follow-up enablement, delay, count and template fields
   - Implemented destination: `TenantOperationalConfig.config.followUp`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium because scheduler behavior depends on it

5. Handoff notification recipients
   - Current: `handoffLeadNotificationRecipients`
   - Implemented destination: `TenantOperationalConfig.config.handoffLeadNotification`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium because notification fan-out must remain tenant-scoped and compliant

## High Risk

These should not be migrated until the governance layer and tests are explicit.

1. `channelAccounts`
   - Affects Messenger, Instagram, aliases, flags and tokens.
   - Requires token redaction, DB encryption/secret strategy, audit trail and rollback.
   - Must preserve Instagram alias support and Business Login metadata.

2. WhatsApp phone fallback removal
   - Current DB-first exists through `WaPhoneNumber`, but `TenantConfig.metaPhoneNumberId` is still used by bootstrap/fallback flows.
   - Removing fallback requires all tenants to have formal `WaPhoneNumber` mappings.

3. Token storage unification
   - WhatsApp token already has `TenantMetaConfig`.
   - Messenger/Instagram tokens still live in channel account config.
   - Unified storage must not expose token material through admin/app APIs.

## Recommended Sequence

### Sprint 55 Candidate: Governance Guardrails

No runtime migration.

- Add a rule in docs and PR review: no new `TenantConfig` fields without destination and owner.
- Add a checklist to tenant config changes.
- Optionally add tests that assert redaction and known field list, without changing behavior.

### Sprint 56: CRM Settings DB-First

Small functional migration with fallback.

- Added `TenantOperationalConfig`.
- Reads DB first, fallback to `tenants.json`.
- `/app/crm/settings` writes to DB only.
- Backfill script copies JSON -> DB without removing JSON.
- `channelAccounts` remains untouched.

### Sprint 57 Candidate: Expand Tenant Operational Config

Incremental expansion only after CRM settings are stable.

- Reuse `TenantOperationalConfig`.
- Add one low-risk block at a time.
- Sprint 57 migrated `templates.manualHandoff` to `TenantOperationalConfig.config.templates.manualHandoff`.
- Sprint 58 migrated `followUp*` settings to `TenantOperationalConfig.config.followUp`.
- Sprint 59 migrated `handoffLeadNotification*` settings to `TenantOperationalConfig.config.handoffLeadNotification`.
- Sprint 60 migrated `mediaHandoffPolicy` to `TenantOperationalConfig.config.mediaHandoffPolicy`.
- Sprint 61 migrated plan/quota limits to `TenantOperationalConfig.config.planLimits`.
- Sprint 62 migrated automation disable flags to `TenantOperationalConfig.config.automationFlags`.
- Sprint 63 migrated the scoped AI assistant config to `TenantOperationalConfig.config.aiAssistantConfig`.
- Sprint 64 migrated intent catalog and qualification schema to `TenantOperationalConfig.config.aiIntentQualification`.
- Keep DB-first loader with JSON fallback.
- Do not migrate `channelAccounts` yet.

### Current Remaining High-Risk Block: Channel Accounts Secure Storage

Dedicated high-risk project. It touches WhatsApp, Messenger, Instagram, aliases, inbound/outbound credentials, OAuth and tenant resolution. Do not start it without a separate preflight and rollback plan.

- Design secure token storage.
- Add channel account table/model.
- Migrate aliases and metadata.
- Keep redaction tests.
- Smoke WhatsApp/Messenger/Instagram separately.

Sprint 65A produced the design in `docs/saas/CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md`.

Sprint 65B adds the additive schema and offline tooling only:

- `ChannelAccount`
- `ChannelAccountAlias`
- `ChannelAccountSecret`
- `npm run channel-accounts:backfill`
- `npm run channel-accounts:shadow:compare`

Runtime remains JSON-first. Webhooks, OAuth, outbound and tenant resolution do not read these tables yet.

Sprint 65C adds optional runtime shadow comparison only:

- controlled by `CHANNEL_ACCOUNTS_RUNTIME_SHADOW`;
- default `false`;
- JSON remains authoritative;
- DB resolution is computed in parallel for Messenger/Instagram webhook traffic;
- mismatches are logged redacted as `channel_accounts.runtime_shadow_mismatch`;
- DB shadow failures do not block webhook processing.

Sprint 65D starts the first controlled runtime flip for Messenger only:

- controlled by `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER`;
- default `false`;
- Messenger webhook resolution uses DB first only when enabled;
- Messenger outbound reads `pageAccessToken` from `ChannelAccountSecret` only when enabled;
- JSON fallback remains for missing/failed DB resolution;
- Instagram, OAuth and WhatsApp stay unchanged.

Sprint 65D.1 is a performance guard after the first Messenger DB-first smoke:

- runtime remains JSON-first in production;
- `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=false`;
- `CHANNEL_ACCOUNTS_RUNTIME_SHADOW=false`;
- Messenger DB-first code now uses a 60s in-memory cache for account resolution and outbound secret lookup;
- cache metrics are optional with `CHANNEL_ACCOUNTS_RUNTIME_CACHE_LOGS=true`;
- fallback remains JSON if DB/cache lookup fails;
- next activation must happen in a separate controlled Sprint 65D.2.

Sprint 65D.2 reactivated Messenger DB-first with cache and validated inbound/outbound functionally, but it was not approved for permanent production use because the inbox still had perceptible latency. Rollback was performed by flag and the runtime returned to JSON-first.

Sprint 65D.3 adds diagnosis before any further flip:

- `CHANNEL_LATENCY_PROFILING=false` by default;
- `CHANNEL_LATENCY_PROFILING_SAMPLE_RATE=1` controls sampling when enabled;
- backend emits redacted `channel_latency.messenger_inbound` and `channel_latency.messenger_outbound` events;
- `npm run channel-latency:summary` calculates p50/p95/max by stage from a short log window;
- no DB-first or runtime shadow flag is reactivated by this sprint.

The next implementation sprint must not jump directly to DB-first runtime. The safe sequence is:

1. create schema and token secret storage; status: Sprint 65B
2. implement redacted, idempotent backfill dry-run; status: Sprint 65B
3. keep runtime JSON-first; status: Sprint 65B
4. add DB-vs-JSON shadow compare; status: Sprint 65B
5. add optional runtime dual-read shadow while keeping JSON authoritative; status: Sprint 65C
6. enable Messenger DB-first behind channel-specific flag; status: Sprint 65D
7. add runtime cache/performance guard before reactivation; status: Sprint 65D.1
8. reactivate Messenger DB-first with cache; status: Sprint 65D.2 functional but rolled back for latency
9. measure hot path with latency profiling; status: Sprint 65D.3
10. only then evaluate a new Messenger flip, and later Instagram DB-first

## Documentation To Treat Carefully

Partially current:

- `docs/onboarding.md`: still correctly documents DB + `tenants.json`, but should be updated after any config migration.
- `docs/saas/tenant-contract.md`: current for quotas, but explicitly JSON-based.
- `docs/whatsapp-agent/10-multichannel-staging-migration-runbook.md`: useful for operational multichannel backfill, not a tenant config migration plan.

Should be archived or clearly labeled before a config migration:

- old staging-only multichannel migration review/runbooks if they refer to draft SQL or future scripts as pending.
- any runbook that suggests manual edits to `.data/tenants.json` as the primary path after DB-first config is introduced.

## Retrabalho Risk If Sprint 55 Starts Now

If Sprint 55 is another documentation/governance sprint: low risk.

If Sprint 55 starts by migrating `channelAccounts`: high risk.

If Sprint 55 creates a generic `TenantConfig` JSON table without mapping fields first: medium/high risk.

The safest next implementation is a small, low-coupling config block with DB-first read and JSON fallback.
