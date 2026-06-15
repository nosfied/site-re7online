# Channel Accounts Migration Design

Status: Sprint 65A design plus Sprint 65B schema/backfill/shadow plan.

Sprint 65B creates additive DB tables and comparison scripts only.
Sprint 65C adds optional runtime shadow comparison behind `CHANNEL_ACCOUNTS_RUNTIME_SHADOW`.
Sprint 65D adds optional Messenger DB-first runtime behind `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER`.
Sprint 65D.1 adds a runtime cache/performance guard for future Messenger DB-first reactivation.
Instagram resolution, OAuth and `tenants.json` remain JSON-authoritative.

## Scope

This preflight covers the future migration of `TenantConfig.channelAccounts` from `.data/tenants.json` to DB-first storage.

Out of scope for Sprint 65A/65B:

- changing webhook/runtime behavior;
- changing OAuth behavior;
- changing `tenants.json`;
- deploy.

Sprint 65B in scope:

- additive Prisma models/tables for future channel account storage;
- idempotent JSON-to-DB backfill;
- DB-vs-JSON shadow compare;
- redacted token presence/hash tracking;
- optional encrypted token material if `CHANNEL_ACCOUNT_SECRET_KEY` is configured.

Sprint 65C in scope:

- calculate DB channel-account resolution in parallel during Messenger/Instagram webhook processing;
- compare DB result with current JSON result;
- log only mismatches by default;
- keep JSON result as the only runtime decision.

Out of scope for Sprint 65C:

- DB-first runtime;
- DB token reads for outbound;
- OAuth writes to DB-first;
- any behavior change in inbound/outbound.

Sprint 65D in scope:

- Messenger tenant resolution DB-first only when `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=true`;
- JSON fallback when DB resolution is missing or fails;
- Messenger outbound reads `pageAccessToken` from `ChannelAccountSecret` only when the flag is enabled;
- logs `channel_accounts.db_first_messenger` and `channel_accounts.db_first_messenger_fallback`;
- rollback is immediate by setting `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=false`.

Out of scope for Sprint 65D:

- Instagram DB-first;
- Instagram aliases/OAuth changes;
- WhatsApp runtime changes;
- removing `channelAccounts` from JSON.

Sprint 65D.1 in scope:

- local in-memory cache for Messenger DB-first tenant resolution;
- local in-memory cache for Messenger outbound account lookup and decrypted `pageAccessToken`;
- 60s TTL through `CHANNEL_ACCOUNT_RUNTIME_CACHE_TTL_MS`;
- optional debug metrics through `CHANNEL_ACCOUNTS_RUNTIME_CACHE_LOGS=true`;
- no production flip: `CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER` and `CHANNEL_ACCOUNTS_RUNTIME_SHADOW` remain disabled until a separate activation sprint.

Out of scope for Sprint 65D.1:

- enabling Messenger DB-first in production;
- enabling runtime shadow in production;
- changing Instagram/OAuth/WhatsApp behavior.

## Current Inventory

### Core Type And Normalization

Current shape:

- `apps/whatsapp-agent/src/channels/tenantChannelAccount.types.ts`
- `apps/whatsapp-agent/src/channels/tenantChannelAccount.ts`

Fields currently supported:

- identity: `id`, `tenantKey`, `channel`, `provider`, `channelAccountId`
- aliases: `externalAccountIds`, `externalBusinessId`, `metadata`
- flags: `enabled`, `automationEnabled`, `runtimeEnabled`, `inboundPersistenceEnabled`, `outboundEnabled`, `aiEnabled`, `handoffEnabled`
- status: `status`, `tokenStatus`
- token material: `pageAccessToken`, `instagramBusinessAccessToken`
- audit timestamps: `createdAt`, `updatedAt`

Normalization currently:

- accepts only `whatsapp`, `messenger`, `instagram`;
- accepts only provider `meta`;
- sanitizes IDs and metadata;
- preserves existing tokens on admin updates when incoming payload omits token material;
- redacts tokens through `redactTenantChannelAccount()` and `redactTenantChannelAccounts()`.

### Reads

| Area | Files | Current usage |
| --- | --- | --- |
| Tenant loader | `src/config/tenantConfig.ts` | normalizes and validates `channelAccounts` in `getTenants()` / `saveTenants()` |
| Tenant resolution | `src/channels/tenantChannelResolution.ts` | resolves Messenger/Instagram tenant by `channelAccountId` or alias from `tenants.json` |
| Passive Meta webhook | `src/http/metaWebhookPassive.ts` | resolves tenant/account, builds runtime gate, persistence plan, dry-run |
| Inbound persistence | `src/channels/messengerInboundPersistence.ts`, `src/channels/instagramInboundPersistence.ts` | checks account flags and IDs before persistence |
| Outbound UI gate | `src/http/routes.ts` | checks if Messenger/Instagram composer can send for a conversation |
| Manual outbound | `src/http/routes.ts`, `src/channels/messengerOutbound.ts`, `src/channels/instagramOutbound.ts` | retrieves account token and flags before sending |
| Instagram OAuth/status | `src/meta/instagramBusinessLogin.service.ts` | finds Instagram account, validates identity, stores Business Login token in account |
| Readiness | `src/channels/channelRuntimeReadiness.ts` | reports account flags, blockers and observed/dry-run activity |
| Persistence planning | `src/channels/channelPersistencePlan.ts` | uses tenant/channel account context for multichannel plans |
| Admin UI/API | `src/http/routes.ts` | redacts account list, writes account list to JSON |

### Writes

| Writer | Path / Function | Current behavior |
| --- | --- | --- |
| Internal admin channel console | `PUT /admin/tenants/:tenantKey/channel-accounts` in `src/http/routes.ts` | validates via `normalizeTenantChannelAccountsForTenant()` and writes `channelAccounts` to `tenants.json` through `saveTenantPatch()` |
| General tenant edit | `PUT /admin/tenants/:tenantKey` in `src/http/routes.ts` | can still include `channelAccounts` in the raw tenant patch |
| Instagram Business Login | `completeInstagramBusinessLogin()` in `src/meta/instagramBusinessLogin.service.ts` | updates/inserts the Instagram channel account and stores `instagramBusinessAccessToken` in `tenants.json` |
| Demo seed | `scripts/seed-re7-demo-screenshots.mjs` | seeds demonstration `channelAccounts` in tenant JSON |

### Tests Depending On Current JSON Shape

- `src/channels/tenantChannelAccount.test.ts`
- `src/channels/tenantChannelResolution.test.ts`
- `src/channels/channelRuntimeReadiness.test.ts`
- `src/channels/channelRuntimePreflight.test.ts`
- `src/channels/messengerInboundPersistence.test.ts`
- `src/channels/instagramInboundPersistence.test.ts`
- `src/http/metaWebhookPassive.test.ts`
- `src/http/channelAccountsAdminRoutes.test.ts`

### Channel Split

WhatsApp:

- primary runtime resolution is already DB-first through `WaPhoneNumber.phoneNumberId`;
- credentials are DB-first through `TenantMetaConfig.businessToken` with env fallbacks;
- `channelAccounts` can contain WhatsApp-like entries for demos/staging, but current production webhook resolution does not rely on this block the way Messenger/Instagram do.

Messenger:

- tenant resolution is JSON-first through `TenantConfig.channelAccounts`;
- main identity is Page ID in `channelAccountId`;
- token is `pageAccessToken`;
- outbound uses `graph.facebook.com/{version}/me/messages`.

Instagram:

- tenant resolution is JSON-first through `TenantConfig.channelAccounts`;
- main identity is Graph/asset account ID in `channelAccountId`;
- webhook actor/callback IDs are aliases in `externalAccountIds`;
- Business Login metadata lives under `metadata`;
- token is `instagramBusinessAccessToken`;
- outbound uses `graph.instagram.com/{version}/me/messages`.

## Proposed DB Model

Implemented Sprint 65B Prisma model:

```prisma
model ChannelAccount {
  id                        String   @id @default(cuid())
  clientId                  String   @db.Uuid
  channel                   String
  provider                  String
  displayName               String?
  channelAccountId          String
  externalAccountIds        Json?
  externalBusinessId        String?
  metadata                  Json?
  enabled                   Boolean  @default(false)
  automationEnabled         Boolean  @default(false)
  runtimeEnabled            Boolean  @default(false)
  inboundPersistenceEnabled Boolean  @default(false)
  outboundEnabled           Boolean  @default(false)
  aiEnabled                 Boolean  @default(false)
  handoffEnabled            Boolean  @default(false)
  status                    String   @default("pending")
  tokenStatus               String   @default("missing")
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  client                    Client                 @relation(fields: [clientId], references: [id], onDelete: Cascade)
  aliases                   ChannelAccountAlias[]
  secrets                   ChannelAccountSecret[]

  @@unique([clientId, provider, channel, channelAccountId])
  @@index([channel, provider, channelAccountId])
  @@index([clientId, channel, provider])
}
```

Secret model is separate:

```prisma
model ChannelAccountSecret {
  id               String   @id @default(cuid())
  channelAccountId String
  secretKind       String
  secretHash       String?
  secretCiphertext String?
  encryptionKeyRef String?
  status           String   @default("configured")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  channelAccount   ChannelAccount @relation(fields: [channelAccountId], references: [id], onDelete: Cascade)

  @@unique([channelAccountId, secretKind])
}
```

Alias model is recommended instead of relying only on JSON array indexing:

```prisma
model ChannelAccountAlias {
  id               String   @id @default(cuid())
  channelAccountId String
  alias            String
  aliasType        String   @default("externalAccountId")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  channelAccount   ChannelAccount @relation(fields: [channelAccountId], references: [id], onDelete: Cascade)

  @@unique([channelAccountId, alias])
  @@index([alias])
}
```

Rationale:

- `ChannelAccount` keeps non-secret operational identity and flags.
- `ChannelAccountSecret` isolates secret material for encryption, redaction and rotation.
- `ChannelAccountAlias` makes webhook resolution indexable and auditable.
- JSON metadata remains acceptable for provider-specific IDs that are not used as high-volume lookup keys.

## Token Strategy

Token material must not stay in the same DB row as public/admin-readable account metadata.

Secret kinds:

- `pageAccessToken` for Messenger/Page messaging;
- `instagramBusinessAccessToken` for Instagram Business Login;
- future provider tokens as new `secretKind` values.

Storage requirements:

- store a hash for redacted shadow comparison;
- store `secretCiphertext` only when `CHANNEL_ACCOUNT_SECRET_KEY` is configured;
- use envelope-friendly design: `secretCiphertext`, `encryptionKeyRef`, future `expiresAt`/`lastValidatedAt` if needed;
- never return ciphertext or token material through admin/app APIs;
- never log token, token hash, ciphertext or full authorization header;
- diagnostics may expose only `tokenStatus`, `tokenPresent`, approximate `tokenLength` and very short prefix only in tightly controlled internal logs if needed. Prefer no prefix in production logs.

Runtime access:

- token decryption should be behind a narrow resolver, for example `resolveChannelAccountToken(accountId, tokenType)`;
- outbound services should receive token only in memory;
- logs from outbound services must keep current redaction behavior.

Current Sprint 65B behavior:

- `scripts/channel-accounts-backfill.ts` never prints token material.
- If `CHANNEL_ACCOUNT_SECRET_KEY` is missing, token presence/hash is backfilled and reversible token material is reported as not encrypted.
- Real backfill aborts by default when JSON contains token material and `CHANNEL_ACCOUNT_SECRET_KEY` is missing.
- `--allow-hash-only-secrets` exists only for an explicit shadow-only run that records presence/hash without reversible token material.
- A later runtime sprint must require encrypted material before DB-first outbound is enabled.

## Aliases And Meta IDs

IDs currently used:

- `channelAccountId`: primary operational account id.
- `externalAccountIds`: webhook aliases and callback/messaging actor IDs.
- `externalBusinessId`: provider-side business/container id.
- `metadata.graphAccountId`: Instagram Graph/asset account id.
- `metadata.webhookAccountId`: Instagram webhook actor id.
- `metadata.facebookPageId`: connected Page ID.
- `metadata.instagramBusinessLoginId`: Instagram Business Login identity id.
- `metadata.businessLoginUsername`: username validated through Business Login.
- `metadata.source`: connection/source marker.

Indexes needed:

- unique account: `(clientId, channel, provider, channelAccountId)`;
- lookup account: `(channel, provider, channelAccountId)`;
- lookup alias: `(alias)` with join back to account;
- collision prevention: an active alias must not resolve to multiple enabled accounts for the same `(channel, provider)`.

Collision policy:

- if one enabled account matches, use it;
- if multiple enabled accounts match, return `ambiguous` and do not persist/send;
- if only disabled/pending/error accounts match, surface the same resolution classifications currently used: `matched_disabled`, `matched_pending`, `matched_error`;
- aliases must remain tenant-scoped for admin display, but webhook resolution must detect global active collisions.

## Future Tenant Resolution

Current:

- WhatsApp: DB-first through `WaPhoneNumber`, with JSON fallback for legacy/bootstrap.
- Messenger: JSON-first through `TenantConfig.channelAccounts`.
- Instagram: JSON-first through `TenantConfig.channelAccounts`, including alias matching.

Target:

- WhatsApp remains on `WaPhoneNumber` / `TenantMetaConfig`; do not force WhatsApp into `ChannelAccount` until there is a separate reason.
- Messenger resolves DB-first from `ChannelAccount` and `ChannelAccountAlias`, fallback JSON.
- Instagram resolves DB-first from `ChannelAccount` and `ChannelAccountAlias`, fallback JSON.
- Fallback must preserve exact current behavior until shadow comparison is clean.

Resolver design:

1. Normalize `(channel, provider, channelAccountId)`.
2. Query DB primary match.
3. Query DB alias match.
4. Classify status and flags using current resolution vocabulary.
5. Independently compute JSON resolution.
6. In shadow mode, log differences without changing behavior.
7. In DB-first mode, return DB match; if no DB match, return JSON fallback.

## Dual-Read / Shadow Plan

### Phase 1: Backfill Only, Runtime JSON

- Create DB models and backfill from JSON.
- Runtime continues using JSON.
- No behavior change.

### Phase 2: Shadow Compare In Production

For every Messenger/Instagram webhook and outbound eligibility check:

- compute JSON result;
- compute DB result;
- use JSON result;
- log redacted diff.

Runtime shadow flag:

```bash
CHANNEL_ACCOUNTS_RUNTIME_SHADOW=true
```

Default is `false`. When enabled, webhook tenant resolution still uses JSON. The DB result is calculated only for comparison. Matches are logged only when `CHANNEL_ACCOUNTS_RUNTIME_SHADOW_LOG_MATCHES=true`; mismatches and DB shadow failures are always logged.

Log event examples:

- `channel_accounts.shadow.missing_db`
- `channel_accounts.shadow.missing_json`
- `channel_accounts.shadow.mismatched_primary_id`
- `channel_accounts.shadow.alias_mismatch`
- `channel_accounts.shadow.status_mismatch`
- `channel_accounts.shadow.flags_mismatch`
- `channel_accounts.shadow.token_status_mismatch`
- `channel_accounts.shadow.ambiguous_db`
- `channel_accounts.runtime_shadow_mismatch`
- `channel_accounts.runtime_shadow_failed`

Never log:

- `pageAccessToken`;
- `instagramBusinessAccessToken`;
- decrypted tokens;
- full external user IDs.

### Phase 3: DB-First With JSON Fallback

- Use DB result when present and unambiguous.
- Fallback to JSON when DB result is missing.
- Keep shadow compare for at least one release.

Messenger is the first controlled DB-first channel:

```bash
CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER=true
```

Default is `false`. When disabled, Messenger behavior remains JSON-first. When enabled, Messenger webhook resolution uses DB first and falls back to JSON if DB is unavailable or missing. Messenger manual outbound uses the DB account and decrypted `pageAccessToken` only under this flag.

Sprint 65D.1 adds a performance guard before the next activation attempt:

- `src/channels/channelAccountRuntimeCache.ts` stores resolution and outbound secret lookups in process memory;
- cache key includes provider/channel/channel account id and tenant key for secret lookups;
- TTL is 60 seconds;
- secret cache may hold the decrypted token in memory, but never logs token or ciphertext;
- cache is invalidated by TTL, process reload, or `clearChannelAccountRuntimeCache()` in tests;
- cache hit/miss logs are gated by `CHANNEL_ACCOUNTS_RUNTIME_CACHE_LOGS=true`;
- DB failures still fall back to JSON in the caller.

### Phase 4: JSON Removal

- Stop writing `channelAccounts` to `tenants.json`.
- Keep a read-only JSON fallback for one emergency release if feasible.
- Remove JSON token material only after backup/rollback window is complete.

## Backfill Design

Implemented Sprint 65B scripts:

```bash
npm run channel-accounts:backfill -- --dry-run --json
npm run channel-accounts:backfill -- --json
npm run channel-accounts:backfill -- --json --allow-hash-only-secrets
npm run channel-accounts:backfill -- --tenant re7online --dry-run --json
npm run channel-accounts:shadow:compare -- --json
```

Requirements:

- idempotent;
- dry-run by default for pre-release;
- filter by tenant;
- do not modify `tenants.json`;
- preserve token status;
- store secret hash for comparison;
- store reversible secret material only in `ChannelAccountSecret.secretCiphertext` when `CHANNEL_ACCOUNT_SECRET_KEY` is configured;
- abort real backfill with secrets when `CHANNEL_ACCOUNT_SECRET_KEY` is missing, unless `--allow-hash-only-secrets` is explicitly passed;
- upsert aliases;
- upsert metadata;
- report only redacted summaries.

Report shape:

- tenant key;
- channel;
- provider;
- primary id;
- alias count;
- secret kind count;
- encrypted secret kind count;
- unencrypted secret kind count;
- action: `would_upsert`, `upserted`, `skipped_missing_client`.

## Rollback

Rollback must be possible without data loss.

Immediate rollback:

- set env/feature flag `CHANNEL_ACCOUNTS_DB_READ=false` or equivalent;
- runtime returns to JSON-first;
- keep DB rows untouched;
- keep encrypted tokens untouched;
- do not delete backfilled rows during incident response.

Per-channel rollback:

- disable DB-first for one channel: Messenger or Instagram.
- keep WhatsApp untouched.

Per-tenant rollback:

- force tenant to JSON-first while investigating.

Problematic account rollback:

- set DB account `enabled=false` or `status=error`;
- JSON fallback can still be used if feature flag allows.

Validation after rollback:

- health;
- Messenger inbound smoke;
- Messenger outbound smoke;
- Instagram inbound smoke;
- Instagram outbound smoke if enabled;
- `channels:shadow:compare -- --json`;
- no token exposure in logs.

## Smoke Tests

### WhatsApp

- inbound webhook resolves tenant through `WaPhoneNumber`;
- outbound text works for a known conversation;
- approved template send works;
- tenant resolution ignores channel account migration changes;
- `channels:shadow:compare` remains `ok=true`.

### Messenger

- webhook inbound resolves tenant by Page ID;
- alias resolution if configured;
- inbound persists under correct tenant/account;
- manual outbound sends through Page token;
- token stays redacted in admin/API/UI/logs;
- disabled or pending account blocks runtime/outbound.

### Instagram

- signed webhook inbound resolves primary and alias IDs;
- `message_edit` without text remains ignored;
- real Direct message persists with sender/recipient/message text;
- manual outbound sends through Instagram Business token when `outboundEnabled=true`;
- OAuth connect updates the same DB account and encrypted token;
- account mismatch protection still blocks wrong Instagram login;
- app review/review screen still shows safe status.

## Risk Register

| Risk | Level | Why | Mitigation |
| --- | --- | --- | --- |
| Token leakage | High | current tokens are embedded in config shape and multiple admin paths exist | separate encrypted token table, redaction tests, no token in API/UI/logs |
| Wrong tenant resolution | High | webhook IDs can collide or differ by alias | dual-read shadow, unique constraints, ambiguous resolution blocking |
| Account mismatch | High | Instagram Business Login can authenticate a different account | preserve existing mismatch checks and metadata validation |
| OAuth regression | High | Instagram connect currently writes channel account directly | adapt OAuth only after DB model has tests and rollback |
| Meta App Review regression | High | Instagram Direct flow depends on published app, aliases and token source | keep current JSON runtime until DB shadow is clean |
| Outbound failure | Medium/High | Messenger and Instagram use different token types/endpoints | separate smoke per channel and token type |
| Inbound persistence failure | Medium/High | persistence gates depend on account flags | parity tests for flags/status/tokenStatus |
| Alias mismatch | Medium/High | Instagram uses Graph ID and webhook actor alias | alias table and shadow logs |
| Admin UI confusion | Medium | internal UI edits can omit tokens and preserve old secret | explicit tokenStatus, token-preservation tests |
| Backfill drift | Medium | JSON can change between dry-run and real run | hash JSON before/after, rerun dry-run, idempotent upsert |

## Sprint 65B Readiness

Sprint 65B may create model/migration only if the following are ready:

- approved Prisma model names and relations;
- agreed token encryption key source;
- explicit feature flags for JSON-first, shadow and DB-first;
- backfill design accepted;
- shadow diff taxonomy accepted;
- rollback runbook accepted;
- tests identified above are implemented or planned in the same sprint.

If token encryption/key management is still undecided, Sprint 65B should not migrate runtime. It may only add schema and redacted backfill dry-run.
