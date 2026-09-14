# Abandoned Automation / Bot Flow Lifecycle Audit - 2026-09-14

Status: READ-ONLY AUDIT / PRODUCT LIFECYCLE HARDENING / NO PRODUCT CHANGE / NO DEPLOY.

Correction: the earlier `WAITING_FOR_CUSTOMER 60m` interpretation as a human
waiting auto-close is superseded. Human conversations may remain open
indefinitely unless explicitly closed through the current lifecycle. The active
product front is abandoned customer-initiated automation/BOT flow lifecycle.

## Correct Product Front

Problem to harden:

- Citizen starts a chatbot/flow.
- Flow reaches a menu, consent prompt or capture/pending input.
- Citizen stops responding.
- Runtime can remain active/incomplete until a later inbound or until a flow
  policy performs handoff.

This is not a generic HUMAN inactivity close and must not close human services
that an attendant is manually holding.

## Current Bot State Matrix

| State | Meaning in BOT/flow context | Stored in | Entry | Exit | Timeout/cleanup | Restart-safe |
| --- | --- | --- | --- | --- | --- | --- |
| `mode=BOT` | Automation owns the conversation. | `ConversationRuntimeState.mode` | Entry flow selected, webchat/support starts in automation, or active runtime remains BOT. | Handoff, close path, invalid flow clear, terminal text, disabled automation. | No generic cleanup by itself. | Yes, because persisted in DB. |
| `chatbotActive=true` | Flow is waiting at a node for customer input or continuing automation. | `ConversationRuntimeState.chatbotActive` | `executeChatbotFlow` starts or keeps a node. | Terminal node, handoff, invalid definition, explicit clear. | `resetAfterMinutes` is applied only on later inbound; processor may do HANDOFF if `timeoutMinutes/action=HANDOFF`. | Yes, persisted. |
| `status=WAITING_USER` | In automation, means "automation/BOT is waiting for user input"; it is also shown in UI as "Aguardando cliente". | `ConversationRuntimeState.status` | Webchat/support start in automation; runtime state projections from active chatbot. | Handoff promotes to `WAITING`/HUMAN or flow finishes/clears. | Not a close trigger by itself. | Yes, persisted. |
| `handoffStatus=NONE` | No human handoff active. | `ConversationRuntimeState.handoffStatus` | BOT flow runtime. | Handoff request/activation. | Required by inactivity handoff processor scan. | Yes. |
| `flow=chatbot:<id>` | Which `ChatbotFlow` owns the runtime. | `ConversationRuntimeState.flow` | Flow start or continuation. | `clearChatbotRuntime`, handoff, terminal clear. | Used by scanner and executor. | Yes. |
| `chatbotNodeId` | Current pending node/menu/capture/consent. | `ConversationRuntimeState.chatbotNodeId` | Flow execution. | Node transition, reset to start, terminal clear, handoff. | Stale node restarts to start if definition changed/missing on later inbound. | Yes. |
| `answers.chatbotRuntime.lastInteractionAt` | Last BOT interaction timestamp used for inactivity. | `ConversationRuntimeState.answers` JSON | Each handled `executeChatbotFlow` result. | Updated on every handled inbound/result. | Drives `resetAfterMinutes` and `timeoutMinutes`. | Yes. |
| `answers.flowContext` / `answers.flowTags` | Captured answers/context/tags. | `ConversationRuntimeState.answers` JSON | Capture nodes and menu metadata. | Preserved across current inactivity reset; cleared by some closed reentry paths. | No generic stale cleanup. | Yes. |

## Flow Persistence

An in-progress automation is persisted in `ConversationRuntimeState`:

- `flow`: active chatbot id as `chatbot:<id>`.
- `chatbotNodeId`: current menu/capture/consent node.
- `chatbotActive`: whether the flow still owns the interaction.
- `answers.chatbotRuntime`: `lastInteractionAt`, `flowStructureHash`,
  `flowStartNodeId`, accepted consent data, invalid reply counters and
  inactivity handoff marker.
- `answers.flowContext` and `answers.flowTags`: captured business context.
- `lastInboundAt` / `lastOutboundAt`: channel-level activity timestamps.
- `mode`, `handoffStatus`, `assignedUserId`, `departmentId`, `queueId`,
  `status`, `closedAt`: operational projection.

The platform can tell that a BOT automation is idle when `chatbotActive=true`,
`mode=BOT`, `handoffStatus=NONE`, `assignedUserId=null`, `closedAt=null`,
`flow` starts with `chatbot:` and `answers.chatbotRuntime.lastInteractionAt` is
older than the configured flow policy.

## Existing Inactivity Behavior

There are two distinct mechanisms:

1. **Inline reset on later inbound**
   - Implemented in `executeChatbotFlow`.
   - Config source: `ChatbotFlow.definition.inactivityPolicy.resetAfterMinutes`.
   - If the customer returns after the threshold and the runtime is still BOT,
     unassigned and no handoff, the executor restarts from `definition.start`.
   - It records/logs `flow.inactivity_reset.applied`.
   - It preserves existing `flowContext`; this is useful for audit/context but
     may be undesirable for some fresh-restart UX.
   - It does not run in the background and does not send a timeout message at the
     moment the threshold is crossed.

2. **Background inactivity handoff processor**
   - Implemented in `chatbotInactivityProcessor`.
   - Started by backend bootstrap unless
     `CHATBOT_INACTIVITY_PROCESSOR_DISABLED=true`.
   - Cadence: default 60 seconds, override by
     `CHATBOT_INACTIVITY_PROCESSOR_INTERVAL_MS`.
   - Scan target: `ConversationRuntimeState` rows with `chatbotActive=true`,
     `mode=BOT`, `flow` starting `chatbot:`, `handoffStatus=NONE`,
     `assignedUserId=null`, `closedAt=null`.
   - Timestamp: `answers.chatbotRuntime.lastInteractionAt`.
   - Config source: `ChatbotFlow.definition.inactivityPolicy.timeoutMinutes`
     with `action=HANDOFF`.
   - Action: if due, consent is accepted and a concrete department+queue exists,
     claim the row and promote to HUMAN queue (`status=WAITING`,
     `handoffStatus=ACTIVE`, `chatbotActive=false`), optionally auto-assign,
     send handoff/protocol/queue position/off-hours messages.
   - It does not close, clear or reset abandoned BOT runtime unless the action is
     a valid handoff.

Although the type accepts `action=RESET_TO_ROOT` and `action=CLOSE`, the audited
background processor currently acts only on `HANDOFF`; reset is handled inline on
later inbound.

## Practical Abandonment Scenarios

| Scenario | Current behavior |
| --- | --- |
| Menu abandonment | If only `resetAfterMinutes` exists, nothing is sent or cleaned at 1h/24h/several days. On later inbound after threshold, the flow restarts from the start node. Inside threshold, the old menu/submenu handles the message. If `timeoutMinutes/action=HANDOFF` exists and consent/destination are valid, the background processor can hand off to human queue after the threshold. |
| Question/capture abandonment | Pending capture remains as `chatbotNodeId`; captured `flowContext` remains in `answers`. Later inbound inside threshold is treated as the answer to the old question. Later inbound after `resetAfterMinutes` restarts from the start node, but existing `flowContext` is preserved by current code. |
| Submenu abandonment | Same as menu. Existing focused test proves submenu resets to root after configured inactivity on later inbound and stays in submenu inside the window. |
| Automation to handoff before completion | Handoff clears active chatbot node and moves to HUMAN/WAITING when destination is valid. Incomplete `flowContext` may remain as context/tags for the handoff. |
| Backend/deploy restart | Persisted runtime survives. Background handoff scanning resumes on backend start. Inline reset still applies on the next inbound. |
| Webchat transport session expiry | Webchat has a 24h `WebchatSession.expiresAt`; expiration returns `webchat_session_expired`. That is a webchat transport/session rule, not a generic chatbot flow lifecycle for WhatsApp/Web Session. |

## Cleanup Semantics

Current code preserves historical/contextual data more than it cleans live
runtime:

- Live runtime fields: `flow`, `chatbotNodeId`, `chatbotActive`,
  `chatbotRuntime.lastInteractionAt`, invalid reply counters and current mode.
- Historical/context fields: `flowContext`, `flowTags`, service cycle and
  protocol runtime should not be deleted blindly.
- Current inline inactivity reset resets the active node to root but preserves
  `flowContext`.
- Current background inactivity handoff preserves context and creates/uses
  service-cycle protocol for handoff messaging.
- No current background job silently closes abandoned BOT cycles or creates
  `CompletedServiceSnapshot` for BOT abandonment alone.

## User-Facing Behavior

- No automatic "session expired" message is sent for chatbot flow abandonment
  when only `resetAfterMinutes` applies.
- On later inbound after reset threshold, the citizen sees the start node/menu.
- With `timeoutMinutes/action=HANDOFF`, the citizen may receive handoff,
  protocol and queue-position/off-hours messages if the policy/destination allow
  it.
- Webchat session expiration is user-facing as `webchat_session_expired`, but it
  is scoped to the webchat session token.

## Existing Coverage

Already covered:

- Submenu reset after `resetAfterMinutes` on later inbound.
- Submenu remains active inside the inactivity window.
- Inactivity handoff claim rejects stale answers/new inbound.
- Only one concurrent inactivity processor winner.
- Handoff claim refuses missing department/queue.
- Due persisted row can be processed after restart.
- Consent pending blocks inactivity handoff and records/dedupes skip event.

Missing or partial:

- Explicit menu/capture abandonment after days with no later inbound.
- Whether `flowContext` should be cleared on stale reset.
- `RESET_TO_ROOT` as background action.
- `CLOSE` as background action.
- User-facing timeout copy for abandoned automation.
- Provider-independent test matrix for WhatsApp Web Session, webchat and support.
- End-to-end local validation of current abandoned automation behavior.

## Reuse Matrix

| Capability | Exists | Reuse as-is | Extend | Gap |
| --- | --- | --- | --- | --- |
| Flow waiting state | Yes | Partial | Yes | Clarify BOT `WAITING_USER` vs human label. |
| Last activity timestamp | Yes | Yes | Maybe | Uses JSON `lastInteractionAt`; enough for current scan. |
| Timeout config | Yes, flow-level | Partial | Yes | `resetAfterMinutes` and `timeoutMinutes/action=HANDOFF`; no generic abandoned cleanup policy. |
| Persistent scanner | Yes | Yes | Yes | Current scanner only handles HANDOFF. |
| Atomic claim | Yes | Yes | Yes | Guarded by expected answers/current state. |
| Runtime cleanup | Partial | No | Yes | Reset preserves `flowContext`; no background cleanup-only action. |
| Later inbound reset | Yes | Yes | Yes | Needs product decision about context clearing/copy. |
| New cycle creation | Partial | No | Maybe | Human/Web Session closed reentry creates cycles; BOT abandonment does not. |
| Audit event | Partial | Yes | Yes | Reset logs event; skip events persisted for some cases. |
| History preservation | Yes | Yes | Yes | Avoid deleting `flowContext` unless product-approved. |
| Restart resilience | Yes/partial | Yes | Yes | Persisted scanner resumes; inline reset waits for inbound. |
| Tenant scoping | Yes | Yes | Yes | Scans by `clientId` and flow by same tenant. |
| Provider independence | Partial | No | Yes | Core executor is shared; some outbound actions are Web Session specific. |
| Tests | Partial | Yes | Yes | Add E2E/coverage for actual abandonment scenarios. |

## Product Classification

D. INFRA EXISTS / LIFECYCLE GAP REMAINS.

The platform already has persisted BOT runtime, last-interaction timestamp,
flow-level inactivity config, inline reset on later inbound and a restart-safe
background handoff processor. It does not yet have a complete product contract
for abandoned automation cleanup/expiry across menus, captures, context clearing
and user-facing timeout UX.

## Minimal Next Step

Validate the current behavior with a local authenticated E2E using one flow with
`resetAfterMinutes` and one with `timeoutMinutes/action=HANDOFF`, then add
focused tests for:

- menu abandonment with no later inbound,
- capture abandonment and stale context handling,
- later inbound after threshold,
- processor duplicate run,
- tenant isolation,
- provider-specific persistence for Web Session/webchat/support.

Only after that, extend the existing executor/processor. Do not add a new
scheduler and do not introduce HUMAN waiting auto-close.
