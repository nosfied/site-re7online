# CRA/SECULT Business Hours Audit - 2026-09-14

Status: canonical audit complete; CRA operational configuration applied and validated.

## Scope

Initial audit performed on canonical HEAD `56c4a392d1eb017ad8fcafffbad5fbd442e7152f`, matching production HEAD. The follow-up operational configuration changed production tenant data only for `cra-pr`; no runtime code, schema, migration, deploy or service reload was performed.

## Current Architecture

- Hours source: `DepartmentBusinessHour` and `DepartmentBusinessHourException`, scoped by `clientId` and `departmentId`.
- Timezone source: `TenantOperationalConfig.config.timezone`, normalized with fallback to `America/Fortaleza`.
- Runtime resolver: `getDepartmentAvailability`, used by `resolveDepartmentAwareHandoff`.
- Flow-aware behavior: menu options can use `visibilityCondition.departmentAvailability`, and handoff nodes/options can carry `departmentId` and `queueId`.
- `NO_SCHEDULE` is an intentional compatibility state and is treated as open for handoff routing.

## SECULT Production Contract

Production tenant `secult-pe` has `timezone=America/Recife`. Its three active departments have regular hours Monday-Friday 08:00-17:00 and no exceptions at audit time.

Resolver probe using production code:

- Monday 2026-09-14 12:00 BRT: all SECULT audited departments returned `OPEN`.
- Monday 2026-09-14 20:00 BRT: all SECULT audited departments returned `CLOSED`.

SECULT active entry flow uses `closedHandoffPolicy.action=QUEUE_FOR_NEXT_OPEN`. Outside hours, the approved behavior remains: preserve self-service routes that remain available, and when a human handoff is selected, create a shared `WAITING` handoff with concrete department/queue, protocol and queue position, without autoassign while closed.

This is a hard compatibility contract and was not changed.

## CRA Production Contract

Before 2026-09-15, production tenant `cra-pr` had no timezone override and fell back to `America/Fortaleza`. Its six active departments each had one queue named `Fila Geral` and no department business hours configured.

Resolver probe using production code:

- Monday 2026-09-14 12:00 BRT: all CRA audited departments returned `NO_SCHEDULE`.
- Monday 2026-09-14 20:00 BRT: all CRA audited departments returned `NO_SCHEDULE`.

Under the current domain rule, `NO_SCHEDULE` means open/legacy-compatible handoff behavior. Therefore CRA's current production state does not enforce the 09:00-17:00 copy in `closedHandoffPolicy.offHoursMessage`; that message only becomes relevant when the selected department resolves as `CLOSED`.

## CRA Operational Configuration - 2026-09-15

Status: `CLOSED / EXISTING PRODUCT CAPABILITY / OPERATIONALLY VALIDATED`.

Persistent backup before mutation:

- path: `/opt/re7online/backups/converta-persistent/postgres/pre-cra-business-hours-20260915-001956.dump`
- size: `19737083`
- SHA-256: `1a0fa2daff91f5c290b7308782d10e274142be7a9a4833bea5b5a9315a6568ae`
- object count: `578`

Configuration applied to `cra-pr` only:

- timezone: `America/Sao_Paulo`;
- active departments configured: 6/6;
- each active department preserved its single concrete `Fila Geral` queue;
- regular hours: Monday-Friday 09:00-17:00;
- Saturday/Sunday: closed by absence of weekend intervals;
- exceptions: none;
- `closedHandoffPolicy` preserved unchanged with `action=QUEUE_FOR_NEXT_OPEN`.

Resolver validation with production code:

- Monday 10:00 local: `OPEN` for all six departments;
- Monday 16:59 local: `OPEN` for all six departments;
- Monday 17:00 local: `CLOSED` for all six departments;
- Monday 17:01 local: `CLOSED` for all six departments;
- Monday 20:00 local: `CLOSED` for all six departments;
- Saturday 10:00 local: `CLOSED` for all six departments.

Boundary semantics are `startMinute <= local minute < endMinute`; therefore 17:00 is outside the 09:00-17:00 interval.

Flow-aware validation used two independent CRA departments (`Cobrança` and `Fiscalização`) without mutating a customer conversation:

- inside hours: `resolveDepartmentAwareHandoff` returned `kind=open`, `availabilityStatus=OPEN`, concrete department and queue, `shouldAssign=true`;
- outside hours: `resolveDepartmentAwareHandoff` returned `kind=closed`, `availabilityStatus=CLOSED`, concrete department and queue, `shouldAssign=false`;
- Web Session policy handling remains `QUEUE_FOR_NEXT_OPEN`, so the closed-hours handoff path queues the conversation as `HUMAN/WAITING` with concrete department/queue, protocol and queue position, while skipping autoassign while the department is closed.

Self-service continuity is unchanged: menu navigation and informational chatbot responses remain available; only human handoff availability follows the department schedule.

No PM2 reload was required because the resolver reads department hours from the database at runtime.

## Provider Notes

- Web Session injects department availability into chatbot execution and applies `QUEUE_FOR_NEXT_OPEN` for closed handoff.
- Meta webhook resolves department-aware handoff after chatbot execution and blocks closed handoff with the node closed message.
- Webchat resolves department-aware handoff for pending handoff, but does not currently inject department availability into menu visibility in the same way as Web Session.
- Chatbot inactivity handoff reuses `resolveDepartmentAwareHandoff` and respects closed handoff policy.

No provider runtime change was made in this audit.

## Guided Builder

Guided Builder correctly communicates the current contract: it does not create a new schedule inside `ChatbotFlow.definition`; human hours are configured in Departments. Generated handoff definitions should carry department/queue references and let runtime resolve the live department schedule.

## Backlog Result

The historical "CRA flow-aware hours" item is not a product/runtime P1 anymore. The runtime mechanism already exists and SECULT uses the same core mechanism without tenant-specific code.

CRA configuration/operational validation is now closed. Future changes to CRA hours should use the same configuration-only path: backup first, change department schedule, validate resolver inside/outside hours, and preserve SECULT compatibility.
