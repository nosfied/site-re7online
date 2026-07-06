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
| Profile | `business` unless contract/governance changes |
| Capabilities/features | `webchat=true`, `webchatOutbound=true`, `chatbot=true` only if the WhatsApp chatbot flow is intentionally active |
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

Use this initial welcome and routing script for Webchat and, when compatible with the active WhatsApp flow, for WhatsApp:

```text
Ola! Sou o assistente da Re7online. Posso te ajudar com o Converta, demonstracao, suporte ou informacoes para orgaos publicos.

1. Conhecer o Converta
2. Solicitar demonstracao / POC
3. Atendimento para orgao publico / licitacao
4. Suporte para cliente
5. Falar com atendimento humano
```

### Lead Capture

For commercial leads, collect:

- nome;
- empresa;
- segmento;
- telefone/WhatsApp;
- interesse principal;
- quantidade aproximada de atendentes;
- canal preferido para retorno.

### Public-Sector Capture

For government or bidding conversations, collect:

- orgao/entidade;
- municipio/UF;
- edital ou contexto;
- prazo;
- canais exigidos;
- contato responsavel;
- necessidade de demonstracao/PoC.

### Support Capture

For support conversations, collect:

- tenant/empresa;
- usuario ou contato;
- canal afetado;
- descricao curta do problema;
- urgencia percebida;
- evidencia ou horario aproximado.

### Human Handoff Triggers

Route to human attendance when:

- the visitor chooses option 5;
- the visitor requests a demo/PoC;
- the visitor mentions edital, licitacao, orgao publico, prefeitura, camara, SAAE, SIMAE or autarquia;
- the visitor reports support/incident;
- qualification is complete enough for sales follow-up;
- fallback repeats or the visitor rejects automation.

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

## Rollback

Use the least invasive rollback:

1. Remove `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` and rebuild the site, if the public widget must disappear.
2. Disable the Webchat site, if only that site should stop accepting sessions.
3. Set `webchatOutbound=false`, if operator outbound should stop but inbound should remain available.
4. Set `webchat=false`, if all Webchat runtime must stop for the tenant.

Do not delete Webchat conversation history during rollback.
