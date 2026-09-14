# Inactivity / Automation Lifecycle Audit - 2026-09-14

Status: READ-ONLY AUDIT / NO PRODUCT CHANGE / NO DEPLOY.

This audit maps existing lifecycle, scheduler, close and reporting infrastructure
before any implementation of a 60-minute `WAITING_FOR_CUSTOMER` timeout. The
future rule must not be a generic human-conversation inactivity close.

## Required Product Contract

- An attendant must explicitly mark the service as waiting for the citizen.
- Only that explicit waiting-for-citizen state starts the timeout.
- A citizen/customer reply must cancel or resume the service before timeout close.
- Human conversations without that explicit state may remain open indefinitely.
- Timeout close must reuse the canonical close/service-cycle pipeline and must
  preserve protocol, completed-service snapshot, satisfaction behavior, audit and
  realtime updates.

## Current State Matrix

| State | Current meaning | Current owner/assignment semantics | Queue/capacity behavior | Can be reused directly? |
| --- | --- | --- | --- | --- |
| `WAITING` | Human queue waiting for assignment/handoff. | Usually unassigned or pending assignment. | Drives queue position and automatic assignment; counts in active assignment capacity when assigned. | No. It means waiting in service queue, not waiting for citizen. |
| `IN_PROGRESS` | Human service in progress. | Assigned human owner. | Counts in active assignment capacity and presence summaries. | No. This is active service, not paused for citizen. |
| `WAITING_USER` | Existing UI/reporting label for "Aguardando cliente", but also used by BOT/webchat automation before human handoff. | Can be assigned or unassigned depending producer. | Reported separately; not counted by current active-assignment capacity; only projects to human inbox reliably when assigned. | Partial only. Needs explicit metadata and transition rules before it can represent the requested lifecycle. |
| `CLOSED` | Terminal closed service/conversation state. | Assignment/handoff cleared by close pipeline. | Removed from active queue; contributes to closed metrics/snapshots. | Yes as target state, only via canonical close pipeline. |

## Existing Automation Infrastructure

Existing infrastructure should be reused instead of adding a duplicate scheduler:

- `chatbotInactivityProcessor` runs from the backend process unless disabled by
  `CHATBOT_INACTIVITY_PROCESSOR_DISABLED`. It scans DB runtime state on an
  interval, uses tenant/flow policy, applies consent precedence, claims with
  guarded `updateMany`, and performs handoff. It is BOT-only and must not be
  repurposed as generic human close without a new explicit eligibility layer.
- `campaignRunner` uses persisted scheduled campaign rows plus atomic claim from
  `scheduled` to `sending`. It is useful as a scheduler/claim pattern.
- `followupService` scans eligible BOT/chatbot states, resolves DB-first
  `TenantOperationalConfig.config.followUp`, and deduplicates sends. It is
  useful for config/idempotency patterns, not for closing human services.
- Scheduling reminders and retention jobs are domain-specific DB scanners. They
  confirm the platform already favors persisted due-work over transient UI timers.

## Existing Close Pipeline

The close path already has canonical responsibilities that a timeout must not
duplicate:

- App status updates accept `WAITING`, `IN_PROGRESS`, `WAITING_USER` and `CLOSED`
  via `/app/conversation/:waId/status`.
- Web Session human close delegates to `closeWebSessionHumanService`, which
  closes the service cycle, records completed-service snapshot/events, applies
  close notice policy and triggers satisfaction survey behavior.
- Non-Web Session app close currently performs similar service-cycle close logic
  inside the route. A future automatic close should extract/reuse a shared close
  service or call the canonical channel-specific service instead of duplicating
  route-local logic.
- `closeCurrentServiceCycle`, `recordServiceCycleEvent` and
  `CompletedServiceSnapshot` already provide the durable completed-service
  record used by reports.

## Race And Idempotency Requirements

The future implementation needs a claim that protects customer reply vs timeout:

- Store an explicit waiting marker such as `waitingForCustomer.startedAt`,
  `timeoutAt`, `actorUserId`, `reason` and current owner context.
- Timeout worker must only claim rows still in the explicit waiting state, not
  closed, still assigned/owned as expected, and with no inbound after
  `startedAt`.
- Customer inbound must atomically clear the waiting marker and resume the
  previous human state before the worker can close it.
- Timeout close must be idempotent by request/event key and service-cycle
  snapshot compatibility, following existing event and close patterns.
- The existing `restoreCloseConfirmationState` path does not restore
  `WAITING_USER`; this is a known compatibility check before implementation.

## Configuration Recommendation

Use `TenantOperationalConfig` as the DB-first home for the future policy, with a
safe runtime default of 60 minutes only after product approval. A tenant-level
policy is the minimum viable scope. Department-level override is a separate
product decision because it affects SLA, workload, reporting and operator copy.

Do not add tenant hardcode to `tenants.json`. Do not use frontend timers as the
source of truth.

Schema decision is not closed by this audit. A JSON marker in
`ConversationRuntimeState.answers` could prove the MVP, but an indexed persisted
`timeoutAt`/`waitingForCustomerAt` field is likely safer for production-scale
scans. Decide during implementation design, with migration only if justified.

## Operator UX And Reporting Decisions Still Open

- Whether to reuse `WAITING_USER` after separating BOT automation semantics, or
  introduce a more explicit enum/state name.
- Whether a waiting-for-citizen conversation still counts against attendant
  active capacity.
- Whether SLA clocks pause, continue or move to a separate waiting metric.
- Exact action label, confirmation, undo/resume behavior and timeout warning copy.
- Whether timeout close sends the normal close notice and satisfaction survey for
  every channel.
- How dashboards, Inbox filters, Operations board and reports should classify the
  state.

## Reuse Matrix

| Need | Existing infrastructure | Reuse decision |
| --- | --- | --- |
| Persistent scanner | `chatbotInactivityProcessor`, campaign runner, reminders | Reuse pattern; do not create UI timer or ad hoc loop. |
| Explicit status | `WAITING_USER` enum exists | Partial; requires semantic cleanup/metadata. |
| Human close | `closeWebSessionHumanService`, service-cycle helpers | Reuse/extract; do not duplicate close side effects. |
| Protocol/snapshot | `ensureActiveServiceCycle`, `closeCurrentServiceCycle`, `CompletedServiceSnapshot` | Reuse. |
| Satisfaction after close | Web Session close service | Reuse where applicable; define non-Web Session parity. |
| Config | `TenantOperationalConfig` DB-first pattern | Reuse. |
| Race guard | `updateMany` claims, event request IDs, snapshot compatibility | Reuse and extend for reply-vs-timeout. |

## Audit Conclusion

`WAITING` cannot be reused. `WAITING_USER` exists but is overloaded and incomplete
for the requested rule. The correct next implementation should add an explicit
operator-driven waiting-for-citizen transition, persisted timeout metadata,
customer-reply cancellation/resume, and a DB-backed worker that reuses the
canonical close/service-cycle path.
