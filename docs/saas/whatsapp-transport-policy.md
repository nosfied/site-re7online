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

Tenant mode is derived from durable configured capability plus explicit routing enablement, not from transient runtime readiness and not from tenant hardcode.

Configured capability answers which transports are intentionally enabled for the tenant:

- Meta Cloud: tenant has an active Meta configuration or provider-confirmed legacy Meta phone mapping.
- Web Session: tenant has an enabled Web Session `ChannelAccount` and the `whatsappWebSession` feature enabled.

Routing enablement answers whether a configured transport is allowed to participate in product routing:

`TenantOperationalConfig.config.whatsappTransports = { meta: { enabledForRouting }, webSession: { enabledForRouting } }`

Tenants without this explicit policy keep backward-compatible defaults:

- Meta defaults to enabled for routing when Meta is durably configured and not administratively removed.
- Web Session defaults to enabled for routing only under the previous safe durable semantics, including `runtimeEnabled=true`.

After an internal admin explicitly changes a transport policy, that value is authoritative. A transport may remain technically configured and runtime-ready while disabled for routing.

Runtime readiness answers whether each configured transport is currently usable:

- Meta Cloud readiness depends on current Meta configuration/readiness evidence.
- Web Session readiness depends on connected lifecycle, auth, status, `outboundEnabled`, and worker/runtime state.

Modes:

- `WEB_ONLY`: Web Session is intentionally configured and Meta Cloud is absent or intentionally removed.
- `CLOUD_ONLY`: Meta Cloud is intentionally configured and Web Session is absent or intentionally disabled/removed.
- `HYBRID`: Meta Cloud and Web Session are both intentionally configured.
- `NONE`: no WhatsApp transport is enabled for routing.

Runtime failure does not change mode. A `HYBRID` tenant with Meta operational and Web Session `QR_REQUIRED` remains `HYBRID`; interactive Web-routed operations return a typed unavailable result instead of silently becoming Cloud-only.

Mode transitions are explicit administrative decisions. A tenant may move between `WEB_ONLY`, `CLOUD_ONLY` and `HYBRID` by enabling or disabling configured transports for routing, without tenant recreation, contact recreation, conversation migration, history loss, Meta re-onboarding or Web Session re-pairing when the underlying configuration remains valid.

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

If Meta Cloud is disabled for routing, templates, scheduled templates, campaigns and mass sends are unavailable even when Meta credentials still exist. The platform must return an explicit disabled or unavailable result and must not route those operations through Web Session.

## Template Category Policy

Template category authorization is tenant-scoped and independent from transport routing.

The canonical storage is:

`TenantOperationalConfig.config.whatsappTemplatePolicy = { allowedCategories: ["UTILITY", "MARKETING", "AUTHENTICATION"] }`

When `whatsappTemplatePolicy` is absent, the tenant keeps the previous unrestricted behavior for backward compatibility. When it is present, the allowlist is authoritative. An explicit empty allowlist means no template categories are enabled for sending.

The category used for authorization is the current provider-confirmed Meta category:

- `Template.category`: effective/current Meta category.
- `Template.submittedCategory`: category requested by the tenant or operator when submitted.
- `Template.wasRecategorized`: audit signal that Meta changed the category.

If Meta reclassifies a template from `UTILITY` to `MARKETING`, and the tenant only allows `UTILITY`, the template can remain approved and visible but must be disabled for use. The platform must block direct template send, campaign send, campaign test-send, scheduled campaign send and any other approved-template send path with `template_category_not_allowed`. It must not automatically expand the tenant allowlist and must not fall back to Web Session.

The internal admin console may edit the allowlist and must audit updates through `whatsapp.template_category_policy.updated`. Normal tenant users only see allowed categories for new template requests. Existing templates outside the allowlist remain visible with a user-facing blocked reason.

Category authorization is not the same as component-format support in the current editor. The generic tenant template editor supports freeform text templates for `UTILITY` and `MARKETING`. `AUTHENTICATION` remains a valid tenant policy category, but Meta authentication templates require the specialized OTP component model (`BODY` security recommendation, optional expiration footer and OTP buttons) and must not be faked as a freeform body with `{{1}}`.

Before submitting a generic text template to Meta, the platform validates common format failures locally: malformed placeholders, non-sequential variables, missing examples and dangling variables at the beginning or effective end of the body. A trailing variable followed only by punctuation or whitespace is treated as dangling. When Meta still rejects a submission, the platform stores only safe provider diagnostics, such as code, subcode, user message, details and trace id. Tokens, secrets and raw Authorization data must never be persisted.

## Hybrid Default

For `HYBRID` tenants:

- Inbound may arrive through Meta Cloud and/or Web Session and must converge to the canonical Conversation.
- Interactive replies prefer Web Session when policy and readiness allow it.
- Reactive freeform replies prefer Web Session when policy and readiness allow it.
- Flow/chatbot reactive replies use Web Session when technically compatible with the intent.
- Templates, campaigns and scheduled templates use Meta Cloud.
- Contact-start freeform is blocked by default.

### Real-World Hybrid Homologation

Status: CLOSED / REAL VALIDATED.

Validation baseline:

- production HEAD: `08598293c1cc15360b5cfe02a21a779c8a040dec`;
- controlled tenant: `demo-converta`;
- mode: `HYBRID`;
- primary override: `AUTO` / null;
- approved Meta template: `data_exame`.

The validated real sequence was:

1. Inbox template outbound used Meta Cloud.
2. Recipient reply was delivered by both Meta Cloud and Web Session.
3. Hybrid inbound dedupe produced exactly one canonical inbound message.
4. Post-reply Inbox freeform used Web Session.

Validated matrix:

```text
HYBRID + template
-> META_CLOUD

recipient reply
-> Meta Cloud and Web Session may both deliver
-> logical dedupe = 1

HYBRID + post-reply freeform
-> WEB_SESSION

Meta usage:
template = 1 logical Meta usage event stream
Web Session freeform = 0 Meta usage
```

Observed controls:

- canonical template outbound count: 1;
- template timeline entries: 1;
- Meta status reached `read`;
- Web Session template outbound: no;
- Web Session echo observed for the Meta template: yes;
- Web Session echo duplicate: no;
- recipient reply canonical inbound count: 1;
- recipient reply timeline entries: 1;
- duplicate flow/bot effect after reply: no;
- freeform canonical outbound count: 1;
- freeform timeline entries: 1;
- freeform duplicate outbound: no;
- freeform Meta echo: no;
- freeform recipient receipt observed through Web Session;
- conversation continuity: pass;
- service cycle/protocol continuity: pass;
- multitenant isolation: pass.

The literal freeform body used in the real validation is not a product requirement. The requirement closed by this validation is provider selection: post-reply freeform in `HYBRID` / `AUTO` used Web Session.

### Real-World Hybrid Fresh-Flow Validation

Status: CLOSED / REAL VALIDATED END-TO-END.

Validation baseline:

- production HEAD: `5f07d7ad5c688029a5a44ff1cf4ab6ad8238364a`;
- controlled tenant: `demo-converta`;
- controlled protocol: `CVT-F8E9904B8352`;
- contact identity: masked `****6787`;
- mode: `HYBRID`;
- Web Session: connected and outbound-ready.

The validated real sequence was:

1. Existing flow runtime resumed at `registro_pf_menu`.
2. Back navigation returned to `registro_menu`.
3. The flow returned to `registro_pf_menu`.
4. Handoff moved the conversation to `HUMAN` / `WAITING`, department `Registro`,
   queue `Registro`.
5. Inbox claim moved the conversation to `HUMAN` / `IN_PROGRESS`.
6. Human freeform outbound used Web Session.
7. Normal Inbox close created one completed-service snapshot and cleared the
   assignee/handoff state.
8. Close notice, CSAT survey, CSAT comment offer, comment prompt and thank-you
   used Web Session.

Provider result:

```text
passive/reactive bot messages -> WEB_SESSION
human freeform inside HYBRID/AUTO -> WEB_SESSION
passive Meta outbound count -> 0
Hybrid inbound duplicates -> suppressed after logical claim
```

This validation proves the exercised passive/reply lifecycle. It does not change
the active/template policy: templates and campaigns remain Meta Cloud.

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

Configured mode template matrix:

- `META_ONLY` / `CLOUD_ONLY` + template -> Meta Cloud.
- `WEB_ONLY` + template -> blocked.
- `HYBRID` + template -> Meta Cloud.
- `NONE` + template -> blocked.

There is no Meta-to-Web fallback for template sends.

## Primary Transport

`TenantOperationalConfig.config.whatsappPrimaryTransport` remains supported, but it is an operational override, not a universal routing law.

It is used for diagnostics, contingency, controlled switching and temporary Cloud-first/Web-first operation.

The override values are:

- `AUTO`: no `whatsappPrimaryTransport` value. Interactive routing follows the configured tenant mode.
- `META_CLOUD`: stored as `whatsappPrimaryTransport="meta"`.
- `WEB_SESSION`: stored as `whatsappPrimaryTransport="web_session"`.

Selecting an explicit override is allowed only when that transport is enabled for routing. Returning to `AUTO` must be available from the internal admin console without manual backend intervention.

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
- technical configuration: whether assets or sessions exist;
- enabled for routing: explicit policy toggles;
- WhatsApp Business App state where relevant;
- Meta Cloud readiness;
- Web Session state;
- interactive routing;
- template/campaign routing;
- Contact Start via Web policy;
- operational primary override.

The admin console should group actions by intent:

- Policy, non-destructive: transport routing toggles, primary override and Contact Start via Web policy.
- Technical: Meta onboarding/reconfigure and Web Session pair/reconnect.
- Destructive: Meta binding removal, Web identity release and channel account removal.

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
