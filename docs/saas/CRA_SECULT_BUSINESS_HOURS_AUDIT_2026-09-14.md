# CRA/SECULT Business Hours Audit - 2026-09-14

Status: canonical audit complete, docs-only.

## Scope

Audit performed on canonical HEAD `56c4a392d1eb017ad8fcafffbad5fbd442e7152f`, matching production HEAD. No runtime code, schema, tenant configuration, production data mutation, deploy or service reload was performed.

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

Production tenant `cra-pr` currently has no timezone override and falls back to `America/Fortaleza`. Its six active departments each have one queue named `Fila Geral` and no department business hours configured.

Resolver probe using production code:

- Monday 2026-09-14 12:00 BRT: all CRA audited departments returned `NO_SCHEDULE`.
- Monday 2026-09-14 20:00 BRT: all CRA audited departments returned `NO_SCHEDULE`.

Under the current domain rule, `NO_SCHEDULE` means open/legacy-compatible handoff behavior. Therefore CRA's current production state does not enforce the 09:00-17:00 copy in `closedHandoffPolicy.offHoursMessage`; that message only becomes relevant when the selected department resolves as `CLOSED`.

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

Remaining CRA work is configuration/operational validation:

- configure CRA department hours in `/app/settings/departments`;
- validate representative inside-hours and outside-hours flow paths;
- keep no-schedule behavior as `NO_SCHEDULE` / open unless the customer explicitly configures hours.

