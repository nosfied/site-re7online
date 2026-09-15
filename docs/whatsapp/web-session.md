# WhatsApp web session transport design

Status: Sprint 88D administrative connection management, not tenant-operational.

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

88C.2 isolates:

- `@whiskeysockets/baileys@7.0.0-rc13`, pinned exactly, in `apps/whatsapp-web-worker`;
- the transitive `libsignal` runtime tree in `apps/whatsapp-web-worker`;
- no direct Baileys/libsignal runtime dependency in `apps/whatsapp-agent`.

Operational constraints:

- prefer `@whiskeysockets/baileys` pinned to a stable tagged release;
- do not use `github:WhiskeySockets/Baileys` in production;
- do not install `whatsapp-web.js`, WPPConnect, Puppeteer or Chromium for this transport;
- set Baileys logger to silent or a strict sanitizer;
- treat 7.x as the supported line.

Local audit at 88C/88C.2 found:

- Baileys isolated in the Web Session worker package;
- no Chromium/Puppeteer dependency added by this work;
- Node local version `v22.13.0`;
- app TypeScript/runtime is ESM-compatible.

This isolation is technical only. It does not resolve the legal review required for production
use of the Web Session runtime or its dependency tree.

## Disconnect alert mail delivery

Web Session disconnect alerts use the canonical transactional mail delivery
layer at `apps/whatsapp-agent/src/mail/canonicalMail.ts`.

Business policy stays in `webSessionDisconnectAlerts`:

- recipients are tenant-scoped from
  `TenantOperationalConfig.config.webSessionAlertEmails`;
- ADMIN/SUPERVISOR/AGENT users are not implicit alert recipients;
- terminal incidents alert immediately;
- recoverable incidents keep the 3-minute grace;
- retryable transport failures retain bounded retry;
- permanent auth/recipient failures are not retried;
- a successful alert is deduped by incident fingerprint.

The canonical mail layer owns provider/config/TLS/timeouts. This preserves the
historical fix for Resend SMTP port `2465`, which must use TLS, and prevents Web
Session alerts from reinterpreting SMTP settings separately from other
transactional email classes.

## 88D connection management

88D adds the first controlled administrative surface for a laboratory WEB_SESSION account.

Backend endpoints, all tenant-scoped from the authenticated session:

- `GET /app/settings/channels/whatsapp/web-session`
- `POST /app/settings/channels/whatsapp/web-session`
- `POST /app/settings/channels/whatsapp/web-session/connect`
- `GET /app/settings/channels/whatsapp/web-session/qr`
- `POST /app/settings/channels/whatsapp/web-session/disconnect`
- `POST /app/settings/channels/whatsapp/web-session/reset`

RBAC:

- `ADMIN` can prepare, connect, disconnect and reset.
- `SUPERVISOR` can view status and QR state.
- `AGENT` receives `403`.

The frontend page is:

- `Configurações -> Canais -> WhatsApp`
- `/app/settings/channels/whatsapp`

The frontend never sends `provider` or `channel` as authority. The backend always writes:

- `channel=whatsapp`
- `provider=web_session`

`connect` remains blocked unless the authenticated tenant has `features.whatsappWebSession=true`.
The default remains disabled.

### QR handling

QR strings remain ephemeral:

- not stored in `ChannelAccount.metadata`;
- not stored in `ChannelAccountSecret`;
- not written to `Event`;
- not logged;
- not exposed through public URLs.

The worker keeps QR values in process memory. For the normal PM2 split, the worker can expose a
local-only control bridge when configured:

- worker env: `WHATSAPP_WEB_WORKER_CONTROL_PORT`
- worker env: `WHATSAPP_WEB_WORKER_CONTROL_HOST`, default `127.0.0.1`
- shared secret env: `WHATSAPP_WEB_WORKER_CONTROL_TOKEN`
- agent env: `WHATSAPP_WEB_WORKER_CONTROL_URL`
- agent env: `WHATSAPP_WEB_WORKER_CONTROL_TOKEN`

The bridge endpoint is intentionally narrow:

- `GET /web-session/accounts/:accountId/qr`

It returns only the current in-memory QR for that worker account. If the bridge env is absent,
the admin QR endpoint can only see QR values generated in the same process, which is useful for
tests but not enough for a separated PM2 worker.

### Worker behavior

When an eligible account is requested:

- worker acquires the PostgreSQL advisory lock for `ChannelAccount.id`;
- loads encrypted `baileysAuthState.v1` when present;
- starts Baileys socket inside `apps/whatsapp-web-worker`;
- updates lifecycle to `CONNECTING`, `QR_REQUIRED`, `CONNECTED`, `RECONNECTING` or `ERROR`;
- saves credential updates back to encrypted `ChannelAccountSecret`;
- clears QR when connected or disconnected;
- writes sanitized events without QR, full phone, auth state, token or raw Baileys payload.

### Reset

Reset is explicit and destructive for the WEB_SESSION credential only:

- disables runtime;
- clears current QR;
- deletes `ChannelAccountSecret.secretKind=baileysAuthState.v1`;
- sets desired/observed state back to disconnected/pending.

It does not delete the `ChannelAccount` and does not alter Meta/WABA configuration.

### Demo channel continuity audit - 2026-09-15

Read-only production audit for `demo-converta` confirmed that Meta Cloud and Web
Session incidents must remain classified separately.

- Web Session current state: `CONNECTED` for `****5328`.
- Last connected: 2026-09-15T07:10:17.127Z.
- Historical QR_REQUIRED: 2026-09-13T22:40:23Z, event
  `whatsapp.web_session.disconnected`, classification `qr_required`,
  `action=auth_clear`.
- Re-pairing evidence: QR requested on 2026-09-14T16:31Z; connected on
  2026-09-14T16:32:15Z; disconnect alert closed after connection.
- Auth material: `ChannelAccountSecret.secretKind=baileysAuthState.v1` is
  configured; `.data/` was preserved and was not cleared by the audit.
- Worker: PM2 process online from `/opt/re7online/site-re7online/apps/whatsapp-web-worker`;
  no logout/reset/session clear was executed during this audit.
- Ownership conflict: not proven by current evidence. Recent worker logs show
  credential/key updates and device add/remove notifications, but no explicit
  `logout`, `connectionReplaced` or ownership conflict proof in the audited
  window.

## SECULT impact

SECULT must remain unaffected in 88B, 88C and 88D unless separately authorized:

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
7. Dedicated worker package `apps/whatsapp-web-worker` with `worker`/`start` entrypoints.
8. Eligibility gates requiring active tenant, `whatsappWebSession=true`, enabled account,
   runtime enabled, supported account status and `desiredState=CONNECTED`.
9. Minimal Baileys socket factory inside `apps/whatsapp-web-worker`, with terminal QR disabled
   and silent logging.

Implemented in 88D:

- admin status/prepare/connect/QR/disconnect/reset endpoints;
- admin WhatsApp channel settings page;
- worker-to-agent local QR bridge option;
- Baileys auth-state adapter with encrypted snapshot persistence;
- sanitized lifecycle events for connecting, QR, connected, reconnecting and disconnected states.

Still not implemented:

- production PM2 worker activation;
- real pairing against a tenant;
- inbound persistence;
- outbound sending;
- media/replies;
- templates/campaigns;
- billing/ledger integration;
- tenant rollout.

Readiness after 88D: ready for a separately authorized laboratory pairing attempt after
environment, local worker bridge and PM2 worker setup are reviewed; not ready for inbound or
production customer traffic.

## Inbound media normalization

Incident reference: SECULT-PE reported frequent `Mensagem nao suportada` entries between
2026-08-31 and 2026-09-03. Production audit found 85 `UNKNOWN` inbound rows across 29
conversations, all from `WEB_SESSION`. In the same window, top-level media remained healthy:
49 images, 5 documents and 1 audio were recognized and persisted with media references.

Root cause: Web Session inbound normalization handled the common top-level Baileys shapes but
did not unwrap known technical containers such as `ephemeralMessage` and
`documentWithCaptionMessage`. Historical `UNKNOWN` rows preserved only sanitized structural
metadata, so their exact original subtype cannot be recovered without guessing.

Current policy:

- unwrap only explicit known Baileys wrapper keys with a depth limit;
- route wrapped text/image/audio/video/document through the existing normalizer, downloader,
  storage and timeline paths;
- preserve stanza/provider message identity so exactly-once semantics are unchanged;
- store only safe structural diagnostics for future `UNKNOWN` messages;
- do not persist or download view-once content as an ordinary retained attachment;
- do not store raw Baileys payloads, media bytes, media keys, tokens, signed URLs, phone
  numbers, contacts, coordinates or captions solely for diagnostics.

Status:

- fix deployed in `13acec7e`;
- supported wrapper unwrapping includes explicit known wrappers such as ephemeral media and
  `documentWithCaptionMessage`;
- media download/storage path preserved;
- exactly-once preserved;
- view-once privacy semantics preserved;
- no backfill for the 85 historical `UNKNOWN` rows; organic long-term validation continues
  passively.

### Non-content Web Session control events - 2026-09-04

SECULT-PE later reported additional organic `Mensagem nao suportada` bubbles during normal
human service. Production audit correlated two customer screenshots from 2026-09-04:

- around 15:30 local: human service active, visible `UNKNOWN` bubble, no screenshot evidence
  of lost media;
- around 15:58 local: human service active, visible `UNKNOWN` bubble, and valid images
  received/rendered in the same minute.

The 15:58 evidence showed the image path was healthy and the `UNKNOWN` row was compatible
with a separate grouping/control event, not a failed image normalization.

Patch deployed:

```text
c308198aa97ea6a4233761eac9da9cbc945cbed6
fix(whatsapp): suppress non-content web session events
```

Current policy after `c308198a`:

- suppress control-only `protocolMessage`;
- suppress standalone `reactionMessage`;
- suppress standalone `messageContextInfo`;
- suppress grouping-only `albumMessage`;
- preserve standalone real content, including supported text and media;
- preserve valid media download/storage;
- preserve view-once privacy behavior;
- preserve Hybrid exactly-once semantics;
- do not alter historical `UNKNOWN` rows.

Deployment result:

- backend build: PASS;
- worker build: PASS;
- worker source/dist aligned: PASS;
- frontend change: NO;
- schema/migration: NO;
- status: DEPLOYED / TESTED / WATCH. Organic validation remains passive; do not
  reopen this as an active front without new representative evidence.

### Hybrid claim-before-downstream recovery - 2026-09-10

Web Session and Meta Cloud share the same hybrid logical inbound claim keyed by tenant,
canonical sender and WhatsApp stanza identity. The 2026-09-10 hardening keeps that claim
as the provider election point and adds explicit downstream lifecycle evidence:

- `whatsapp.hybrid.inbound.logical_message.completed` marks successful canonical processing;
- `whatsapp.hybrid.inbound.logical_message.failed_retryable` marks a downstream failure after
  a provider already won the logical claim;
- retry is allowed only for the same winning provider while failure exists and completion is
  absent;
- cross-provider duplicates remain suppressed and cannot become implicit fallback;
- Web Session replay can continue downstream when the inbound row already exists from the
  failed prior attempt.

The Web Session path awaits its bot/handoff outbound operations before marking the logical
message complete. The Meta path marks completion when the canonical handler reaches its normal
terminal path; Meta passive outbound callbacks may still complete asynchronously after that
marker.

Production validation later on 2026-09-10 exercised the Web Session winner path in
`demo-converta` with the controlled `****9614` contact. The observed sequence was:

- `whatsapp.hybrid.inbound.logical_message.claimed`;
- `whatsapp.hybrid.inbound.logical_message.completed` for the same logical hash;
- `whatsapp.hybrid.inbound.cross_provider_deduped` when Meta delivered the same logical message;
- `whatsapp.meta.inbound.duplicate` with `reason=hybrid_logical_message_exists`;
- one canonical inbound and one canonical Web Session outbound.

The follow-up new-service choice advanced the runtime back into the active chatbot flow and
sent the menu over Web Session, without duplicate processing.

Status after the 2026-09-13 documentation sync: Hybrid routing, identity,
claim-before-downstream recovery and exactly-once coexistence remain
CLOSED / REAL VALIDATED. They are not active backlog fronts.
