# WhatsApp transports

This document records the transport boundary for WhatsApp in Converta.

## Current runtime

The only operational WhatsApp transport is Meta Cloud API:

- `channel=whatsapp`
- `provider=meta`
- outbound text, media, contextual replies, templates, campaigns, delivery status webhooks and Meta usage ledger remain Meta-only.

`TenantMetaConfig`, WhatsApp templates, campaign sends, webhooks and usage ledger continue to describe Meta Cloud API state. They must not be used for non-Meta session state.

## Future transport placeholder

`provider=web_session` is reserved for a future WhatsApp Web style transport. In this sprint it is a disabled foundation only:

- no library is installed;
- no QR code flow exists;
- no session is created;
- no worker process exists;
- no tenant is enabled automatically;
- no outbound send falls back from `web_session` to Meta.

The tenant feature flag is `whatsappWebSession`, default `false`. Even when present, `web_session` remains unavailable until a real runtime is implemented.

## Capability model

The capability resolver is pure and tenant-scoped through caller-provided tenant features:

- Meta: text, media, contextual replies, templates, campaigns, Meta delivery status and Meta usage ledger are available.
- Web session: all capabilities are unavailable in the current implementation.
- Unknown providers fail explicitly with `unsupported_whatsapp_transport`.

Frontend input is not an authority for provider selection. Runtime code must resolve the provider from server-side tenant/channel state.

## Outbound text boundary

Inbox text sends call a WhatsApp transport resolver before reaching the Meta sender. The only real adapter is Meta. Unsupported providers fail safely and do not default to Meta.

Media, templates and campaigns still use their existing Meta Cloud API paths. They should move behind the same transport boundary only when a real non-Meta transport exists and the behavior is separately tested.

## Identity and message IDs

Do not create a `whatsapp_web` channel. WhatsApp remains `channel=whatsapp`, with transport expressed by `provider`.

Do not rename `metaMessageId`. It is still the Meta provider message id. A future web session transport must use provider-specific fields or metadata without faking `metaMessageId`.

## Future process model

If a web session runtime is added later, the intended process split is:

- `re7-whatsapp-agent`: HTTP API, webhooks, existing Meta runtime.
- `re7-whatsapp-web-worker`: isolated future web session worker.
- `re7-admin-front`: frontend.

This sprint does not add or configure any PM2 process.

## Web session design status

Sprint 88B documents the persistence and worker design for `provider=web_session` without
making it operational. See [web-session.md](./web-session.md).

Current decision:

- `ChannelAccount` remains the tenant-scoped account metadata record.
- `ChannelAccountSecret` may hold the encrypted auth snapshot for the first controlled MVP.
- A dedicated `re7-whatsapp-web-worker` must own the socket lifecycle.
- The HTTP backend must never create a fallback from `web_session` to Meta.
- QR, pairing and session material must be ephemeral in the UI and encrypted at rest if stored.
- Templates, campaigns, Meta usage ledger and Meta webhooks remain Meta-only.
