# Tendência handoff persistence loop — P00

Status: `MERGED / CI 4/4 PASS / PRODUCTION CHANGE PENDING CAPACITY`.

PR `#280` was merged as
`059ea95aaf73f3e143774d60a8fef4df88c7c0ba`, tree
`afae4a544f50e3516437e17c67fc5e48b894433d`, from tested head
`2d3634d5ff37daba8e804ae984bb3be532ab7c59` with CI run
`40981724130` at `4/4 PASS`. The active API release still predates this merge;
no package or inert release for this target has been produced. The next build
remains blocked until the fresh aggregate capacity contract passes. The P00
authorization below continues to waive only the static floor, never the real
coexistence budget, operational reserve or inode budget.

## Evidence and scope

The read-only audit of tenant `tendencia-modas`, controlled recipient ending
`3009`, found ten inbound and eight outbound messages. Recent inbound messages
had one automated response each, with no Meta retry, duplicate webhook or
provider failure. The user accepted human handoff and the system persisted
`handoff_confirmation.accepted` and `handoff_activated`, but the effective
runtime remained `BOT/NONE` without assignee, department or queue. The next
inbound re-entered AI and repeated the handoff offer.

The defect is platform-wide, not a Tendência-only branch. The accepted-handoff
path persisted the confirmation inbound and then attempted the human transition
with the pre-write `runtimeWriteToken`. The write fence correctly rejected the
stale token, while the caller continued to publish activation events.

## Required invariant

After an accepted handoff:

- the state returned by the confirmation write is the only input to the
  activation write;
- effective state is at least `HUMAN/PENDING|ACTIVE/WAITING`;
- missing attendant, department or queue cannot return the conversation to AI;
- `handoff_confirmation.accepted`, `handoff_activated`, realtime notification
  and the handoff reply are emitted only after the persisted state passes the
  invariant;
- a rejected transition emits only
  `handoff_activation.persistence_failed`.

No schema migration is required.

## Tenant configuration and visible flow

The September CRA incident was a UI hydration defect: a settings 404 prevented
an existing DB flow from rendering. That correction is already active. The
Tendência observation is different if PostgreSQL has no active entrypoint flow.
Do not recreate the CRA fix and do not clone Demo/CRA data implicitly.

Before a Tendência configuration write, an authenticated read-only plan must
prove:

- whether the intended behavior is AI-only or an active `ChatbotFlow`;
- the exact source definition and its hash if a flow is to be provisioned;
- tenant-owned department and operational queue;
- one active entrypoint after the operation;
- no mutation to Demo, CRA or any other tenant.

The operation must be dry-run first, tenant-scoped, idempotent and separately
authorized.

## Bounded capacity exception

The owner extended the P00 static-floor exception exclusively to this remaining
handoff/flow recovery front. It may waive only
`MINIMUM_BUILD_FREE_BYTES` for a time-bounded, target-bound build authorization.
It does not waive aggregate coexistence budget, operational reserve, inode
budget, immutable package verification, retirement preparation, global reviews,
single-build discipline or post-deploy retention. An external builder remains
preferred.

## Acceptance

Code acceptance:

- fresh write token reaches the activation write;
- stale/BOT/NONE result cannot emit activation;
- a route-less accepted handoff remains HUMAN/WAITING;
- other tenants and channels remain unchanged;
- backend build and directed regression pass.

Operational acceptance requires a separately authorized Tendência test proving
one acceptance, one human pending state, no AI re-entry and a visible
tenant-owned flow/route when configured. No Meta send is part of this PR.
