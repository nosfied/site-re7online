# Config Migration Plan

Status: planning document only. No migration is executed by this file.

## Goal

Move Converta tenant configuration from split JSON/DB ownership toward DB-first governance without breaking WhatsApp, Messenger, Instagram, automation, inbox or onboarding.

## Current State

- DB already owns operational data and many product modules.
- `.data/tenants.json` still owns technical tenant configuration and several module settings.
- `TenantOperationalConfig` now owns the first DB-first operational config block: `crmBusinessStatuses`.
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
   - Candidate destination: billing/plan config
   - Risk: medium if hard-cap enforcement remains active

## Medium Risk

These affect runtime behavior but do not usually contain external-provider tokens.

1. Chatbot/automation flags
   - Current: `disableChatbot`, `disableAiFallback`, `disableIntentClassifier`, `disableLegacyFlows`
   - Risk: medium because runtime behavior changes immediately when values change

2. AI assistant configuration
   - Current: prompts, topics, blocked terms, intent catalog, qualification schema
   - Risk: medium/high because tenant-specific automation quality depends on it

3. Media handoff policy
   - Current: `mediaHandoffPolicy`
   - Risk: medium because inbound media handling and notification behavior depend on it

4. Follow-up settings
   - Current: follow-up enablement, delay, count and template fields
   - Implemented destination: `TenantOperationalConfig.config.followUp`
   - Status: DB-first with `tenants.json` fallback
   - Risk: medium because scheduler behavior depends on it

5. Handoff notification recipients
   - Current: `handoffLeadNotificationRecipients`
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
- Keep DB-first loader with JSON fallback.
- Do not migrate `channelAccounts` yet.

### Later Sprint: Channel Accounts Secure Storage

Dedicated high-risk project.

- Design secure token storage.
- Add channel account table/model.
- Migrate aliases and metadata.
- Keep redaction tests.
- Smoke WhatsApp/Messenger/Instagram separately.

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
