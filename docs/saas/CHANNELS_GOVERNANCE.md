# Channels Governance

Status: current-state documentation based on code inspection. This document does not change channel runtime behavior.

## Common Concepts

The Converta channel model uses:

- `channel`: `whatsapp`, `messenger`, `instagram`
- `provider`: usually `meta`
- tenant/client identity through `Client`
- operational records in DB with `channel`, `provider`, `channelAccountId`, `externalUserHash`, `externalUserRef`, `legacyWaId`
- channel technical configuration in `TenantConfig.channelAccounts` for Messenger and Instagram

## WhatsApp

### Tenant Resolution

Primary resolution is DB-first:

- Meta webhook payload provides `phone_number_id`.
- `resolveTenant()` looks up `WaPhoneNumber.phoneNumberId`.
- The mapped `Client` becomes the tenant.

Compatibility/fallback still exists:

- `TenantConfig.metaPhoneNumberId` is used by bootstrap and some legacy/fallback paths.
- `getTenantByClientKeyOrPhoneNumberId()` can match by `metaPhoneNumberId`.

### Tokens

Outbound credentials are DB-first:

1. `TenantMetaConfig.businessToken` + `TenantMetaConfig.phoneNumberId`
2. fallback to global env token + tenant `metaPhoneNumberId`
3. fallback to global env token + env phone number

### Aliases

WhatsApp does not use `externalAccountIds` alias mapping in the same way as Meta passive channels. The canonical technical account is the phone number id.

### Dependencies

- `WaPhoneNumber`
- `TenantMetaConfig`
- `tenants.json` fallback
- Meta Cloud API webhook and send endpoints

## Messenger / Facebook

### Tenant Resolution

Messenger is resolved through passive Meta webhook processing and `TenantConfig.channelAccounts`.

- Incoming object is normalized by passive webhook code.
- Tenant match uses `channel`, `provider`, `channelAccountId`, and account flags.
- Matching code uses `tenant.channelAccounts`.

### Tokens

Messenger token material is stored in the tenant channel account structure and must never be returned by API/UI.

Admin channel tests assert token redaction for fields such as:

- `token`
- `accessToken`
- `pageAccessToken`
- `businessToken`

### Aliases

Messenger may use `externalAccountIds` if configured, but the main operational account id is `channelAccountId`.

### Dependencies

- `TenantConfig.channelAccounts`
- `metaWebhookPassive.ts`
- `messengerInboundPersistence.ts`
- Manual outbound service/path
- Meta Page token validity

## Instagram

### Tenant Resolution

Instagram uses two relevant ID families:

- Graph/asset account id as the main `channelAccountId`
- webhook/messaging actor id as alias in `externalAccountIds`

The current re7online pattern is:

- main `channelAccountId`: Instagram Graph/asset id
- `externalAccountIds`: callback/message_edit alias ids
- metadata includes Business Login id and username where available

Resolution must preserve alias matching and tenant isolation.

### Tokens

Instagram Business Login token is stored in the Instagram channel account as `instagramBusinessAccessToken`.

Token status and diagnostics are exposed only as redacted metadata/status. Raw token must not appear in logs, API responses, UI, screenshots or docs.

### Aliases

Aliases are required because Meta can deliver webhook events with IDs that differ from the Graph asset id.

Fields used:

- `channelAccountId`
- `externalAccountIds`
- `metadata.graphAccountId`
- `metadata.webhookAccountId`
- `metadata.instagramBusinessLoginId`
- `metadata.businessLoginUsername`
- `metadata.source`

### Runtime Policy

Current Instagram policy:

- inbound real messages persist when payload has sender/recipient/message text
- `message_edit` events without useful message text are ignored
- outbound is manual human-only where `outboundEnabled=true`
- no IA, no automatic handoff, no campaigns, no proactive messaging

### Dependencies

- `TenantConfig.channelAccounts`
- Instagram Business Login OAuth
- Meta app Live/Public state
- signed Meta webhook
- alias resolution
- inbound/outbound services

## Shared Governance Requirements

- Tokens are never exposed.
- Channel account edits are internal-admin controlled.
- App-facing Instagram connect screen writes to the same channel account structure.
- `channelAccounts` migration requires special care because it affects Messenger, Instagram, Meta Review and token safety.
- The migration design lives in `docs/saas/CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md`.
- Sprint 65B creates `ChannelAccount`, `ChannelAccountAlias` and `ChannelAccountSecret` plus offline backfill/shadow scripts, but runtime remains JSON-first.
- Sprint 65C adds optional runtime dual-read shadow with `CHANNEL_ACCOUNTS_RUNTIME_SHADOW=true`; JSON remains authoritative and only mismatches are logged by default.
- Sprint 65D allows Messenger-only DB-first runtime with `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=true`; Instagram remains JSON-first.
- Future DB-first work must keep a JSON fallback and dual-read shadow mode until Messenger and Instagram pass separate production smoke tests.
