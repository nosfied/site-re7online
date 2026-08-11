# WhatsApp web session transport design

Status: Sprint 88C executable foundation, not tenant-operational.

This document covers the WEB_SESSION foundation. It installs a pinned Baileys dependency and
adds storage, lifecycle, advisory lock and worker skeleton code. It does not create an admin QR
flow, create a real session, change PM2, enable a tenant, send messages or alter production.

## Decision summary

`provider=web_session` can proceed to a controlled 88C MVP using the current schema, with
strict limits:

- use `ChannelAccount` for tenant-scoped account metadata and lifecycle;
- use one encrypted `ChannelAccountSecret.secretKind=baileysAuthState.v1` snapshot for the
  first single-session MVP;
- use a dedicated single-instance worker process;
- use PostgreSQL advisory locks to guarantee one active owner per account;
- keep QR data transient and never persist it;
- keep Cloud API paths Meta-only;
- do not enable any real tenant until the worker, storage tests and operator controls pass.

This is not a final scale design. If auth state grows too large, needs high write frequency,
or must support many active sessions, move to a dedicated encrypted key/value auth-state table
before broad rollout.

## Current local foundation

The existing Prisma schema already has:

- `ChannelAccount`
  - `clientId`
  - `channel`
  - `provider`
  - `channelAccountId`
  - `metadata`
  - flags: `enabled`, `automationEnabled`, `runtimeEnabled`,
    `inboundPersistenceEnabled`, `outboundEnabled`, `aiEnabled`, `handoffEnabled`
  - `status`
  - `tokenStatus`
  - unique key: `clientId + provider + channel + channelAccountId`

- `ChannelAccountSecret`
  - `channelAccountId`
  - `secretKind`
  - `secretHash`
  - `secretCiphertext`
  - `encryptionKeyRef`
  - `status`
  - unique key: `channelAccountId + secretKind`

The current secret helper encrypts token material with AES-256-GCM derived from
`CHANNEL_ACCOUNT_SECRET_KEY`.

The 88A transport foundation already reserves:

- `channel=whatsapp`
- `provider=web_session`
- tenant feature `whatsappWebSession`, default `false`
- explicit failure for unknown providers
- no fallback from unsupported transport to Meta

## Baileys constraints

The current official Baileys package is `@whiskeysockets/baileys`. It is MIT licensed and
published as a WhatsApp Web / multi-device WebSocket library. It does not require Chromium or
Selenium.

Security notes from the upstream project materially affect this design:

- auth state is equivalent to a long-lived credential;
- auth state must be encrypted at rest;
- logs must be filtered because they can contain JIDs and message metadata;
- production should pin a release rather than tracking `master`;
- Baileys 7.x is the supported current major; older majors are not supported.

Baileys auth state is not a static token. Its keys can change on sent/received messages, so
the worker must persist key updates reliably and atomically.

## Persistence model for 88C

Recommended MVP:

1. Create a disabled `ChannelAccount`:
   - `clientId`: target tenant id
   - `channel`: `whatsapp`
   - `provider`: `web_session`
   - `channelAccountId`: internal stable account key, not a phone number until resolved
   - `enabled`: false until explicitly activated
   - `automationEnabled`: false by default
   - `runtimeEnabled`: false by default
   - `inboundPersistenceEnabled`: false by default
   - `outboundEnabled`: false by default
   - `status`: `pending`
   - `tokenStatus`: `missing` or `not_required`, depending on final readiness semantics

2. Store Baileys auth state only after successful pairing:
   - `ChannelAccountSecret.secretKind=baileysAuthState.v1`
   - `secretCiphertext`: encrypted JSON snapshot using the existing secret format
   - `secretHash`: hash of canonical snapshot for change detection only
   - `encryptionKeyRef=CHANNEL_ACCOUNT_SECRET_KEY`
   - `status=configured`

3. Store non-secret runtime metadata in `ChannelAccount.metadata`:
   - `webSession.status`
   - `webSession.lastConnectedAt`
   - `webSession.lastDisconnectedAt`
   - `webSession.lastDisconnectReason`
   - `webSession.workerId`
   - `webSession.lockOwner`
   - `webSession.phoneLast4`
   - `webSession.phoneLength`
   - `webSession.displayName`

4. Do not store:
   - QR string
   - pairing code
   - full phone number in logs/events
   - raw Baileys payloads
   - message bodies in operational events
   - session material in local files, screenshots or support tickets

Why not use a file directory for 88C:

- local files are easier to leak and harder to restore consistently with the DB;
- PM2/process migration can point two workers at the same state unless additional locking exists;
- backup/restore must include a second secret store.

Why not create a new table now:

- current schema is enough for one encrypted auth snapshot and account metadata;
- the first MVP should validate lifecycle, disconnect handling and tenant isolation before adding
  permanent schema surface;
- a later migration is justified only if snapshot size/write frequency becomes operationally
  unsafe.

## Worker topology

Target process split:

- `re7-whatsapp-agent`: HTTP API, admin endpoints, existing Meta runtime.
- `re7-whatsapp-web-worker`: WEB_SESSION socket lifecycle.
- `re7-admin-front`: UI.

The worker is single-instance in the first release. It polls/loads only accounts where:

- client is active;
- `channel=whatsapp`;
- `provider=web_session`;
- tenant feature `whatsappWebSession=true`;
- `enabled=true`;
- `runtimeEnabled=true`;
- `status` permits connection.

The worker must not read frontend-provided tenant ids as authority. Tenant/account must be
resolved from `ChannelAccount.clientId`.

## Locking and concurrency

Required before any real connection:

- acquire a PostgreSQL advisory lock keyed by `ChannelAccount.id` before opening a socket;
- keep one in-process socket per account;
- refuse second ownership attempts with an explicit `web_session_already_owned` result;
- release lock on graceful shutdown;
- rely on PostgreSQL session lock release on process crash;
- update heartbeat metadata periodically, but do not use heartbeat alone as ownership.

If multiple PM2 instances are introduced later, the advisory lock remains mandatory.

## Lifecycle states

Recommended account status mapping:

- `pending`: account created, no successful auth yet.
- `connected`: auth exists and socket is currently healthy or eligible to reconnect.
- `error`: last connect attempt failed and requires operator action.
- `disabled`: operator disabled or logout requested.

Recommended metadata sub-status:

- `qr_pending`
- `pairing_pending`
- `connecting`
- `connected`
- `reconnecting`
- `logged_out`
- `stale`
- `error`

Disconnect handling:

- network/transient disconnect: keep encrypted auth state, reconnect with backoff;
- explicit logout from WhatsApp/device: mark `status=error`, `tokenStatus=expired`, stop worker;
- operator disconnect: mark disabled and stop worker;
- operator forget session: delete only the web-session secret for that account after explicit
  confirmation and audit event.

## Health model

Global health must remain independent from WEB_SESSION. A broken web session must not fail
`/health` for the Cloud API backend.

Expose a channel-scoped status through admin/readiness endpoints:

- tenant key redacted or tenant-scoped;
- channel/provider/account id sanitized;
- current lifecycle state;
- last heartbeat age;
- last disconnect reason category;
- QR pending true/false, never QR value;
- no phone full value;
- no auth material.

## Inbound path

WEB_SESSION inbound should reuse the existing Conversation/RuntimeState/Contact/Lead model.

Required adaptations for 88C:

- introduce a `persistWebSessionInboundMessage` helper or extend the existing normalized
  channel persistence path;
- preserve `channel=whatsapp` and `provider=web_session`;
- set `channelAccountId` from `ChannelAccount.channelAccountId`;
- use a web-session provider message id, not `metaMessageId`;
- keep `waId` compatibility only where existing Inbox expects it;
- preserve LGPD anonymized guard before any identity rehydration;
- publish realtime events through the current hub.

Do not feed WEB_SESSION messages through Meta webhook code.

## Outbound path

Before enabling outbound text:

- stop passing `provider="meta"` statically in Inbox WhatsApp sends;
- resolve provider from the server-side Conversation/channel account;
- keep unknown/disabled providers failing explicitly;
- add a `web_session` adapter only for free text after tests pass;
- keep templates and campaigns blocked for WEB_SESSION.

`metaMessageId` must remain null for WEB_SESSION outbound. Store provider-specific ids in
metadata, for example:

```json
{
  "source": "admin_inbox",
  "provider": "web_session",
  "webSession": {
    "messageIdHash": "..."
  }
}
```

## Events and logs

Required event names:

- `whatsapp.web_session.account_created`
- `whatsapp.web_session.qr_requested`
- `whatsapp.web_session.qr_emitted`
- `whatsapp.web_session.paired`
- `whatsapp.web_session.connected`
- `whatsapp.web_session.disconnected`
- `whatsapp.web_session.reconnect_scheduled`
- `whatsapp.web_session.auth_state_saved`
- `whatsapp.web_session.logout_detected`
- `whatsapp.web_session.operator_disabled`
- `whatsapp.web_session.secret_deleted`
- `whatsapp.web_session.inbound_persisted`
- `whatsapp.web_session.outbound_sent`
- `whatsapp.web_session.outbound_failed`

Sanitized payload rules:

- allowed: tenant-scoped account id, status, reason category, phoneLast4, phoneLength,
  message type, provider message id hash;
- forbidden: QR string, full phone, JID raw, auth state, token, bodyText, raw payload.

## Admin actions for future sprint

Allowed actions after backend safeguards exist:

- create disabled web-session account;
- request QR;
- connect/pair;
- disable runtime;
- disconnect;
- forget session;
- view status.

Not allowed initially:

- enabling for SECULT or another production tenant without explicit approval;
- bulk enable;
- auto-migration from Meta;
- fallback to Meta;
- template/campaign sending via WEB_SESSION.

## Encryption, backup and restore

`CHANNEL_ACCOUNT_SECRET_KEY` becomes critical for WEB_SESSION restore. Losing it means encrypted
auth state cannot be recovered.

Backup policy:

- DB backup must include `ChannelAccount` and `ChannelAccountSecret`;
- key backup must be managed outside the DB;
- restore runbook must validate that encrypted snapshot can be decrypted before starting worker;
- logs and backup evidence must not print decrypted state.

Rotation:

- current helper has a single `encryptionKeyRef`; real rotation needs a controlled re-encrypt
  job before multiple key versions are introduced.

## Dependency decision

88C installs:

- `@whiskeysockets/baileys@7.0.0-rc13`, pinned exactly.

Operational constraints:

- prefer `@whiskeysockets/baileys` pinned to a stable tagged release;
- do not use `github:WhiskeySockets/Baileys` in production;
- do not install `whatsapp-web.js`, WPPConnect, Puppeteer or Chromium for this transport;
- set Baileys logger to silent or a strict sanitizer;
- treat 7.x as the supported line.

Local audit at 88C found:

- Baileys installed as a direct backend dependency;
- no Chromium/Puppeteer dependency added by this work;
- Node local version `v22.13.0`;
- app TypeScript/runtime is ESM-compatible.

## SECULT impact

SECULT must remain unaffected in 88B and 88C unless separately authorized:

- do not enable `whatsappWebSession`;
- do not create `ChannelAccount whatsapp/web_session`;
- do not create QR/session;
- do not change WABA/Meta config;
- do not route campaigns/templates to WEB_SESSION.

## 88C implementation status

Implemented foundation:

1. Shared AES-256-GCM helper for `ChannelAccountSecret` encryption/decryption.
2. `ChannelAccountSecret.secretKind=baileysAuthState.v1` storage helper for encrypted auth
   snapshots.
3. Tenant/provider-scoped lookup for `channel=whatsapp` and `provider=web_session`.
4. PostgreSQL advisory lock helper keyed by `ChannelAccount.id`.
5. Lifecycle metadata helper for desired/observed state, reconnect counters and safe backoff.
6. In-memory QR store with TTL; QR is intentionally not durable.
7. Dedicated worker entrypoint `worker:whatsapp-web-session`.
8. Eligibility gates requiring active tenant, `whatsappWebSession=true`, enabled account,
   runtime enabled, supported account status and `desiredState=CONNECTED`.
9. Minimal Baileys socket factory with terminal QR disabled and silent logging.

Still not implemented:

- production PM2 worker activation;
- admin QR endpoint/UI;
- real pairing against a tenant;
- inbound persistence;
- outbound sending;
- media/replies;
- templates/campaigns;
- billing/ledger integration;
- tenant rollout.

Readiness after 88C: ready for a first administrative connection endpoint/smoke in 88D after
explicit tenant and environment approval; not ready for production traffic.
