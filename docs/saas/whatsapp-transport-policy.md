# WhatsApp Transport Policy

This document defines the Converta product policy for WhatsApp routing across Meta Cloud API, Web Session and hybrid tenants.

## Product Principles

End users work with product actions:

- Responder
- Iniciar conversa
- Enviar modelo
- Campanha

They should not need to understand provider names, phone number ids, primary transport or channel account internals. Provider diagnostics and transport switching belong to the internal admin console.

Routing follows this precedence:

1. Hard operation requirement.
2. Tenant intent policy.
3. Allowed operational override.
4. Real provider capability and readiness.

The platform must never silently fail over after a send failure. If the selected valid provider fails, the operation fails with a typed error and an auditable provider result.

## Tenant Modes

Tenant mode is derived from durable configured capability, not from transient runtime readiness and not from tenant hardcode.

Configured capability answers which transports are intentionally enabled for the tenant:

- Meta Cloud: tenant has an active Meta configuration or provider-confirmed legacy Meta phone mapping.
- Web Session: tenant has an enabled Web Session `ChannelAccount`, `runtimeEnabled=true`, and the `whatsappWebSession` feature enabled.

Runtime readiness answers whether each configured transport is currently usable:

- Meta Cloud readiness depends on current Meta configuration/readiness evidence.
- Web Session readiness depends on connected lifecycle, auth, status, `outboundEnabled`, and worker/runtime state.

Modes:

- `WEB_ONLY`: Web Session is intentionally configured and Meta Cloud is absent or intentionally removed.
- `CLOUD_ONLY`: Meta Cloud is intentionally configured and Web Session is absent or intentionally disabled/removed.
- `HYBRID`: Meta Cloud and Web Session are both intentionally configured.

Runtime failure does not change mode. A `HYBRID` tenant with Meta operational and Web Session `QR_REQUIRED` remains `HYBRID`; interactive Web-routed operations return a typed unavailable result instead of silently becoming Cloud-only.

Mode transitions are explicit administrative decisions. A tenant may move between `WEB_ONLY`, `CLOUD_ONLY` and `HYBRID` by enabling, disabling or removing configured transports, without tenant recreation, contact recreation, conversation migration or history loss.

CRA-PR may start in `HYBRID` to accelerate rollout with customer authorization and later move to `CLOUD_ONLY`. SECULT-PE must remain compatible with future `WEB_ONLY`, `HYBRID` or `CLOUD_ONLY` operation. These are operating examples, not code rules.

## Routing Intents

Canonical routing decisions should be made by intent rather than scattered provider checks. Current product intents include:

- `INTERACTIVE_REPLY`
- `CONTACT_START_FREEFORM`
- `TEMPLATE`
- `CAMPAIGN`
- `SCHEDULED_TEMPLATE`
- `FLOW_INTERACTIVE`
- `ADMIN_TEST`

## Hard Routing Rules

The following operations are Meta Cloud only:

- `TEMPLATE`
- `CAMPAIGN`
- `SCHEDULED_TEMPLATE`
- Mass or bulk send

Campaigns must never route through Web Session. A Meta campaign/template failure must never fall back to Web Session.

## Hybrid Default

For `HYBRID` tenants:

- Inbound may arrive through Meta Cloud and/or Web Session and must converge to the canonical Conversation.
- Interactive replies prefer Web Session when policy and readiness allow it.
- Reactive freeform replies prefer Web Session when policy and readiness allow it.
- Flow/chatbot reactive replies use Web Session when technically compatible with the intent.
- Templates, campaigns and scheduled templates use Meta Cloud.
- Contact-start freeform is blocked by default.

## Contact Start Via Web Session

An operational Web Session does not automatically allow `Contact -> Iniciar conversa` from CRM/Contacts.

This action is controlled by:

`TenantOperationalConfig.config.allowInteractiveContactStartViaWebSession`

Default:

`false`

When false:

- freeform Contact Start via Web Session is blocked;
- if Meta Cloud is operational, the product should guide the user to a permitted template/model flow;
- no Contact, Lead, CCI or historical Conversation data is changed.

When true:

- Contact Start may use canonical identity resolution;
- it may create or continue the canonical Conversation;
- it may send freeform through Web Session when Web Session is the selected valid transport.

Only the internal admin console should change this flag. Changes must be audited with previous value, new value, actor and timestamp.

## Mode Policies

### WEB_ONLY

- Interactive reply: Web Session.
- Contact-start freeform: Web Session only if `allowInteractiveContactStartViaWebSession=true`.
- Template: unavailable.
- Campaign: unavailable.
- Mass send: unavailable.

### CLOUD_ONLY

- Inbound: Meta Cloud.
- Interactive reply: Meta Cloud under Meta rules.
- Freeform inside the customer-service window: allowed only when Meta permits it.
- Freeform outside the window: template required.
- Contact Start: Meta/template policy.
- Template and campaign: Meta Cloud.

### HYBRID

- Interactive reply: Web Session by default where allowed.
- If Web Session is transiently unavailable, the tenant remains `HYBRID` and the interactive operation fails explicitly.
- Contact-start freeform: blocked unless explicitly enabled.
- Template and campaign: Meta Cloud.
- Explicit primary transport may influence only intents where policy allows provider choice.

## Primary Transport

`TenantOperationalConfig.config.whatsappPrimaryTransport` remains supported, but it is an operational override, not a universal routing law.

It is used for diagnostics, contingency, controlled switching and temporary Cloud-first/Web-first operation.

Hard operation requirements have precedence. For example:

- `primary=WEB_SESSION` and `CAMPAIGN` still routes to Meta Cloud.
- `primary=WEB_SESSION` and `TEMPLATE` still routes to Meta Cloud.
- `primary=META_CLOUD` does not permit Web fallback after Meta failure.

## User-Facing Transparency

Normal `/app` UI should speak in product terms:

- Responder
- Iniciar conversa
- Enviar modelo
- Campanha

It should not expose provider pickers, phone number ids, WABA ids, ChannelAccount ids, `waId`, transport names or readiness internals.

The internal `/admin` console may display:

- mode: `WEB_ONLY`, `CLOUD_ONLY`, `HYBRID`;
- WhatsApp Business App state where relevant;
- Meta Cloud readiness;
- Web Session state;
- interactive routing;
- template/campaign routing;
- Contact Start via Web policy;
- operational primary override.

## Meta Billing Readiness

Meta Cloud billing evidence is separate from operational messages and from RE7 customer selling price.

The current implementation records sanitized, tenant-scoped usage evidence in `Event` through:

- `meta.usage.estimated`
- `meta.usage.updated`
- active-message delivery billing events
- receptive session events

Provider status/pricing metadata is authoritative when available. Repeated `sent`, `delivered` and `read` webhooks must not charge the same provider message more than once.

Web Session outbound must not create Meta cost events.

## October 1, 2026 Pricing Readiness

Starting October 1, 2026, the working product assumption is that Meta Cloud outbound service messages may become billable per message even inside the 24-hour customer-service window.

The 24-hour window remains important for eligibility and freeform policy, but it must not be used as a blanket suppression for Meta outbound billing evidence after the effective date.

The system must be able to report, by tenant and period:

- outbound Meta service messages;
- utility, marketing and authentication messages;
- non-billable/free messages;
- estimated Meta cost where known;
- unknown cost counts where rates are not available;
- cost by Conversation, department and tenant where data is available.

## Rate Card

Rates must be versioned by:

- market;
- category;
- currency;
- effective date range;
- source;
- version.

Do not hardcode unofficial October 2026 rates. If a financially authoritative cost ledger requires rate version tables, implement it as an additive schema migration in a separate gated change.

## First Utility Template

Do not submit a template as part of this policy work.

Prepared future template:

- name: `retomar_atendimento`
- category: `UTILITY`
- language: `pt_BR`
- body: `Olá, {{1}}. Estamos entrando em contato para dar continuidade ao seu atendimento referente a {{2}}. Para continuar, responda a esta mensagem.`
