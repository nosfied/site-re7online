# Channels Governance

Status: current-state documentation based on code inspection. This document does not change channel runtime behavior.

## Common Concepts

The Converta channel model uses:

- `channel`: currently operational `whatsapp`, `messenger`, `instagram`, plus `webchat` for the Webchat MVP
- `provider`: usually `meta`; Webchat uses Converta-owned runtime
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

## Webchat

Webchat is a Converta-owned channel, not a third-party provider integration.

Current Webchat state:

- site/settings/domain configuration in DB;
- public session bootstrap;
- inbound visitor message persisted into Inbox/timeline;
- controlled human outbound persisted in timeline;
- visitor polling endpoint;
- minimal embeddable widget;
- no IA/chatbot integration yet;
- no media/upload yet;
- no websocket/SSE yet.

Feature flags:

- `webchat`;
- `webchatOutbound`.

## Telegram

Telegram has a configuration foundation after Sprint 74C, a webhook shadow endpoint after Sprint 74D, and text-only inbound persistence after Sprint 74E. Sprint 74B defines the target design in `docs/saas/TELEGRAM_DESIGN.md`.

Target model:

- `channel=telegram`;
- `provider=telegram`;
- bot/account stored as `ChannelAccount`;
- bot username/id stored as metadata and/or aliases;
- bot token stored only as encrypted `ChannelAccountSecret.secretKind=telegramBotToken`;
- shadow webhook through `POST /telegram/webhook/:tenantOrAlias`;
- inbound text persistence through Telegram Bot API webhook;
- outbound through Bot API `sendMessage`;
- text-only human 1:1 MVP;
- no groups, media, IA/chatbot or automation in the first runtime phase.

Feature flags:

- `telegram=false`;
- `telegramInbound=false`;
- `telegramOutbound=false`.

Governance requirements before implementation:

- keep all Telegram secrets encrypted and redacted;
- validate webhook secret token;
- dedupe by `update_id`;
- resolve tenant through `ChannelAccount`, never by payload trust alone;
- keep rollback by flags and account `enabled/runtime/outbound` controls.

Implemented in Sprint 74C:

- tenant-scoped CRUD in `/app/telegram`;
- bot display name, username/id and status metadata;
- encrypted token creation/rotation;
- placeholder diagnostics.

Implemented in Sprint 74D:

- public shadow endpoint `POST /telegram/webhook/:tenantOrAlias`;
- tenant/account resolution by `ChannelAccount` or `ChannelAccountAlias`;
- validation of `telegram`, `telegramInbound`, account flags and token presence;
- safe parsing of `update_id`, `chat.id`, `message_id`, `from.id` and text metadata;
- in-memory replay protection by `update_id`;
- redacted shadow events.

Implemented in Sprint 74E:

- text-only inbound persistence through `POST /telegram/webhook/:tenantOrAlias`;
- tenant/account resolution from `ChannelAccount`/`ChannelAccountAlias`;
- in-memory replay protection by `accountId:update_id`;
- creation/resolution of `Contact`, `ContactChannelIdentity`, `Lead`, `Conversation`, `ConversationRuntimeState` and `InboundMessage`;
- Inbox/timeline support for `channel=telegram`;
- redacted events `telegram.inbound.persisted`, `telegram.contact.created` and `telegram.conversation.created`;
- no Bot API calls and no outbound.

Not implemented:

- webhook registration in Telegram;
- Bot API calls;
- outbound;
- media/groups;
- IA/chatbot.

## Shared Governance Requirements

- Tokens are never exposed.
- Channel account edits are internal-admin controlled.
- App-facing Instagram connect screen writes to the same channel account structure.
- `channelAccounts` migration requires special care because it affects Messenger, Instagram, Meta Review and token safety.
- The migration design lives in `docs/saas/CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md`.
- Sprint 65B creates `ChannelAccount`, `ChannelAccountAlias` and `ChannelAccountSecret` plus offline backfill/shadow scripts, but runtime remains JSON-first.
- Sprint 65C adds optional runtime dual-read shadow with `CHANNEL_ACCOUNTS_RUNTIME_SHADOW=true`; JSON remains authoritative and only mismatches are logged by default.
- Sprint 65D allows Messenger-only DB-first runtime with `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=true`; Instagram remains JSON-first.
- Sprint 65D.1 adds a 60s in-memory runtime cache for Messenger DB-first resolution and decrypted outbound token lookup; both runtime flags remain off until a separate activation smoke.
- Sprint 65D.2 proved Messenger DB-first with cache works functionally, but rollback was required because UX latency was still perceptible.
- Sprint 65D.3 adds opt-in profiling with `CHANNEL_LATENCY_PROFILING=true` and `CHANNEL_LATENCY_PROFILING_SAMPLE_RATE`; default production behavior remains JSON-first.
- Future DB-first work must keep a JSON fallback and dual-read shadow mode until Messenger and Instagram pass separate production smoke tests.
- Sprint 67 adds the DB-authoritative guardrails for channel account management:
  - `ENABLE_TENANTS_JSON_FALLBACK=false` prevents silent JSON fallback in DB-first channel paths.
  - `ALLOW_TENANTS_JSON_WRITE=false` blocks production writes to `.data/tenants.json`.
  - `/admin/tenants/:tenantKey/channel-accounts` now manages DB channel accounts/secrets/aliases.
  - Instagram Business Login persists the account and encrypted token in DB, not in `tenants.json`.
  - `npm run tenants-json:retirement:check` reports remaining runtime blockers before final JSON removal.
- Sprint 67B removes the remaining runtime-critical JSON reads from Meta webhook processing, WhatsApp outbound credential resolution and bootstrap checks. JSON can still be used only when `ENABLE_TENANTS_JSON_FALLBACK=true`.

Latency profiling rules:

- logs are redacted and must not contain message content, raw PSID, tokens or ciphertext;
- backend events are `channel_latency.messenger_inbound` and `channel_latency.messenger_outbound`;
- frontend inbox debug is browser-local through `INBOX_LATENCY_DEBUG=1`;
- profiling is for short observation windows only and must be disabled after diagnosis.
