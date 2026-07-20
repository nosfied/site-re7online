# Re7online Tenant Operations

Status: operational runbook for the `re7online` tenant. This document does not change runtime behavior.

## Objective

Use `re7online` as the internal showcase and production tenant for private-market demonstrations of Converta, preserving the same Core Platform, multitenancy, RBAC, Tenant Configuration and channel account rules used by customer tenants.

## Architecture Rules

- `re7online` is a regular Converta tenant, not a product fork.
- WhatsApp, Messenger, Instagram and Webchat remain separate channel surfaces.
- Messenger and Instagram remain human-only until a future approved sprint changes AI, automation or handoff policy.
- Tokens and external identifiers must stay redacted in screenshots, reports and logs.
- Webchat uses public `/webchat/v1/*` endpoints and creates conversations with `channel=webchat`.
- Webchat operator responses use the existing Inbox and require `webchat=true` and `webchatOutbound=true`.

## Closed Incidents

### Instagram/Meta recipient mismatch legacy

Status: closed.

After the technical corrections delivered in Sprint 86E (`47b7e07`) and Sprint 86F (`37df319`), with production deploy and smoke approved, the old improper conversations that had been directed to a personal Instagram profile and persisted under the `re7online` tenant were closed and anonymized through the native UI function.

No hard delete, direct database update or manual script was used. This decision preserved the minimum operational audit trail while removing personal data from the Inbox, timeline and reports.

Final state:

- real Instagram DMs sent to `re7online` continue to enter the Inbox with sender identification and manual outbound support;
- Instagram events are accepted as operational inbound only when the supported DM event and recipient/account guard match the tenant channel account;
- legacy conversations from the previous permissive routing were neutralized through closure and anonymization, not physical deletion.

## Current Webchat Runtime Reuse

The existing Webchat runtime already provides:

- public session creation: `POST /webchat/v1/session`;
- public visitor inbound: `POST /webchat/v1/messages`;
- visitor polling: `GET /webchat/v1/messages`;
- session restore: `GET /webchat/v1/session/:token`;
- app management UI: `/app/webchat`;
- persistence in `Contact`, `ContactChannelIdentity`, `Conversation`, `ConversationRuntimeState`, `InboundMessage` and `OutboundMessage`;
- Inbox visibility and human outbound for `Conversation.channel=webchat`;
- embed script: `/webchat/widget.js`.

## Required Tenant Configuration

Before exposing the widget publicly, confirm:

| Item | Expected state |
| --- | --- |
| Tenant | `re7online` active |
| Profile | Keep current tenant profile; runtime falls back to `business` when absent. Do not change to `government` for public-sector qualification. |
| Capabilities/features | `webchat=true`, `webchatOutbound=true`, `chatbot=true`; effective capabilities should include `crm`, `protocols`, `sla`, `departments` and `reports` through profile defaults or tenant overrides |
| Webchat site | active site owned by `re7online` |
| Allowed domains | public Re7online domains and local validation domains as needed |
| Inbox users | at least one admin/supervisor/operator available for smoke |
| Departments/queues | commercial, suporte and governo/public-sector routing available or documented |
| Messenger/Instagram | human-only flags preserved |

## Public Site Embed

The `/converta` page loads the public widget only when the frontend build receives:

```bash
NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID=<webchat-site-id>
NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL=/agent-api
```

`NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` is not a secret, but it must point to an active `WebchatSite` for the `re7online` tenant. Do not commit tenant tokens, channel tokens or admin tokens.

The widget is positioned above the existing WhatsApp floating CTA to avoid overlap.

## Initial Intake Script

Use this initial welcome and routing script for Webchat and, when compatible with the active WhatsApp flow, for WhatsApp. The flow must be stored as a tenant-owned `ChatbotFlow`; do not hardcode `re7online` in channel runtime.

```text
Ola! Sou o assistente da Re7online.

1. Quero conhecer o Converta / apresentacao
2. Ja sou cliente e preciso de suporte
3. Sou orgao publico / licitacao / governo
4. Quero falar com atendimento
```

Configure the flow with the operational script below. The command is dry-run by default and requires an explicit `--execute` to write the tenant configuration.

```bash
cd apps/whatsapp-agent
npm run tenant:intake-flow:configure -- --tenant re7online --json
npm run tenant:intake-flow:configure -- --tenant re7online --execute --json
```

The script:

- validates the preset using the existing `ChatbotFlow` validator;
- creates or updates a single active entry-point flow named `Re7online Automated Intake`;
- enables `features.chatbot=true` for the selected tenant;
- deactivates other active entry-point flows for the same tenant only when `--execute` is used;
- does not change Webchat sites, WhatsApp phone numbers, channel accounts, Messenger, Instagram, tokens or secrets.

Current flow-engine behavior: this intake uses `capture` nodes for contact fields and menu nodes for intent, urgency and qualification. Captured name, e-mail, phone, company/organization, city/UF and service/interest are persisted into the existing Lead record without creating a parallel lead store. Additional structured answers remain in the conversation runtime context and in the handoff note for the human operator.

### Webchat Widget UX

The public widget on `/converta` uses polling. It does not use SSE/WebSocket and it does not have a real read-receipt signal from the backend.

Supported visitor feedback:

- local `enviando...` while the message POST is pending;
- `enviado` when the API accepts the message;
- `recebido` when the same visitor message appears in the polling result;
- `erro` when the API call fails;
- badge on the launcher when new bot/operator messages arrive while minimized;
- subtle visual pulse for unread messages;
- optional short sound after the visitor has interacted with the widget, with a mute toggle.

Unsupported by design in this version:

- do not show `lido`;
- do not promise delivery/read beyond what the backend actually confirms;
- do not play sound before browser/user interaction.

### Inbox Presence

Webchat conversations are created on the first valid visitor message. When an active `ChatbotFlow` handles the conversation, the runtime state remains visible in the Inbox as automation (`mode=BOT`, `WAITING_USER`) and does not count as urgent human unread work until handoff/assignment. When handoff is triggered, the conversation is promoted to human flow (`mode=HUMAN`, `WAITING`, `handoffStatus=PENDING`).

### Commercial Capture

For new commercial contacts, collect before handoff:

- nome;
- empresa;
- segmento: privado, publico, governo ou outro;
- cidade/UF;
- interesse principal;
- telefone/WhatsApp;
- e-mail;
- urgencia;
- melhor horario de contato.

### Public-Sector Capture

For public-sector or bidding conversations, collect before handoff:

- nome;
- orgao/entidade;
- municipio/UF;
- tipo de edital ou necessidade;
- prazo;
- link/documento/referencia, when available;
- e-mail;
- telefone/WhatsApp.

### Support Capture

For support conversations, collect before handoff:

- nome;
- tenant/empresa;
- canal afetado;
- tipo de problema;
- urgencia;
- descricao curta do problema;

Support handoff should preserve the protocol/timeline and prepare data for first-response and resolution-time reporting.

### Protocol Continuation

When a visitor selects "Ja tenho protocolo" and proves possession with the e-mail or phone collected in the original attendance, the new Webchat conversation is treated as a continuation of the original protocol.

Current runtime behavior:

- the lookup is always tenant-scoped;
- invalid protocol, protocol from another tenant and wrong confirmation return the same generic public response;
- no conversation history or personal data is shown before proof succeeds;
- after a valid match, the new conversation keeps its own timeline but stores a runtime link in `ConversationRuntimeState.answers.protocolContinuation`;
- the link contains only the protocol, original conversation id, link timestamp and reason `protocol_lookup`;
- the Inbox shows the continuation badge so the operator can identify the original protocol;
- routing reuses the original department/queue when available.

This is an operational link, not a new support-ticket entity. A future migration may introduce a first-class conversation relationship if reporting, merge or cross-channel continuity require it.

### Human Handoff Triggers

Route to human attendance when:

- the visitor chooses option 4;
- commercial qualification is complete;
- the visitor mentions edital, licitacao, orgao publico, prefeitura, camara, SAAE, SIMAE or autarquia;
- the visitor reports support/incident;
- qualification is complete enough for sales follow-up;
- fallback repeats or the visitor rejects automation.

Configured handoff routing uses tenant-owned department/queue names when present:

| Path | Target department | Target queue |
| --- | --- | --- |
| Commercial | `Comercial` | `Fila Comercial` |
| Support | `Suporte` | `Fila Suporte` |
| Public sector | `Governo e Licitações` | `Fila Governo` |
| Direct human | `Atendimento Geral` | `Fila Geral` |

If a target department or queue is not present, the runtime keeps the current/default routing and logs a safe `webchat.handoff.routing_not_found` warning. Do not hardcode tenant-specific IDs in channel runtime.

## Validation Checklist

1. Build frontend with `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` set.
2. Open `/converta`.
3. Confirm the Webchat launcher appears above the WhatsApp floating CTA.
4. Start a session from an allowed domain.
5. Send a visitor message.
6. Confirm a `webchat` conversation appears in `/app/inbox` for `re7online`.
7. Confirm `ConversationRuntimeState` is present for the conversation.
8. Reply from the operator Inbox.
9. Confirm the visitor receives the reply through widget polling.
10. Confirm no raw token, channel token or external ID is visible in UI/logs.
11. Confirm Messenger/Instagram flags remain human-only.
12. Confirm WhatsApp runtime remains unchanged.
13. Send a Webchat message and confirm the visitor receives the automated menu through polling.
14. Confirm the widget shows local send status and does not show fake read receipts.
15. Minimize the widget, receive an automated/operator response and confirm badge/visual signal.
16. Capture name, e-mail and phone, then confirm the Lead is recoverable even before handoff.
17. Complete a demo/support/government path and confirm the conversation is marked for human handoff.
18. For WhatsApp, validate only after confirming the tenant intentionally uses the same entry-point `ChatbotFlow`.

## Rollback

Use the least invasive rollback:

1. Remove `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` and rebuild the site, if the public widget must disappear.
2. Disable the Webchat site, if only that site should stop accepting sessions.
3. Set `webchatOutbound=false`, if operator outbound should stop but inbound should remain available.
4. Set `webchat=false`, if all Webchat runtime must stop for the tenant.

Do not delete Webchat conversation history during rollback.
