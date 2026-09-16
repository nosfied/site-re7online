# Demo Contract Validation Evidence

Status: PHASE A INDEX ONLY / NO EXTERNAL SEND.
Phase B owner gate prepared on 2026-09-15; still no external send.
Phase C controlled Utility send attempted on 2026-09-15; partial Meta acceptance
occurred, owner later confirmed receipt for `****9614`, but the campaign failed
before local persistence/ledger/report evidence.

This directory is reserved for sanitized evidence from Demo-based validation of
CRA-PR contract capabilities.

Planned structure:

- `01-chatbot/`
- `02-human-service/`
- `03-users-rbac/`
- `04-utility-campaign/`
- `05-opt-out/`
- `06-reports/`
- `07-exports/`
- `08-billing/`
- `09-security-lgpd/`
- `10-backup-support-sla/`

Do not store secrets, raw tokens, unmasked phone numbers, CRA customer data or
unnecessary personal data here. Demo evidence proves product mechanics only; it
does not replace CRA customer acceptance or CRA invoice evidence.

Phase B gate summary:

- template candidate: `data_exame`, Utility/pt_BR/approved;
- recipient count proposed: 2 authorized Demo/RE7 numbers;
- expected cost reference: PAUSED. Prior R$ 0,64 was central planning reference
  only, pending billing-unit reconciliation;
- real Meta outbound: not executed;
- owner approval remains required before Phase C.

Phase C gate summary:

- template: `data_exame`, Utility, `pt_BR`, approved;
- authorized recipient finals: `9614` and `6787`;
- final unique recipients: 2;
- 24h precheck: both outside 24h;
- opt-out precheck: pass;
- expected reference cost: paused for billing-unit reconciliation;
- real outbound: executed later only for the approved Phase C send;
- evidence: `PHASE_C_CONTROLLED_UTILITY_GATE_2026-09-15.md`.

Phase C send result summary:

- campaign: `d9874c03-10e8-4061-a92e-6caa7b3001c3`;
- authorized messages: 2;
- Meta accepted: 1 for `****9614`;
- owner-confirmed receipt: 1 for `****9614`;
- Meta technical webhook recovered: `sent` and `delivered`, no `read`;
- not attempted: 1 for `****6787`;
- runner failure: `default_operational_department_missing`;
- local OutboundMessage/ledger evidence for Recipient A: reconciled;
- local billable delivered ledger evidence: 1 for Recipient A;
- BRL contractual unit evidence: NOT PROVEN. Prior R$ 0,32 for Recipient A is
  central planning reference only;
- generic repair: tested and deployed on 2026-09-15 by FF-only backend update,
  no retry and no further real outbound;
- Recipient A reconciliation audit: owner-approved constrained repair applied;
  A reconciled and never resent;
- Recipient B owner-authorized gate: attempted on 2026-09-15, stopped before
  Meta because Demo operational default was invalid (`Atendimento Geral`
  inactive, no active default `Atendimento Geral` + `Fila Geral` pair);
  B remains not attempted externally;
- Recipient B-only explicit human return gate: read-only pre-send gate on
  2026-09-16 confirmed B `****6787` still authorized, outside 24h, no active
  opt-out, one canonical target, no previous B `data_exame` outbound and Meta
  provider cost R$ 0.0350 if delivered. It stopped before campaign creation
  because no single safe human return destination could be selected without
  owner input: `Setor Teste` has zero queues, `Atendimento Geral` is inactive
  and other active queued departments are thematic. No real send occurred.
- evidence: `PHASE_C_CONTROLLED_UTILITY_RESULT_2026-09-15.md`.
- reconciliation audit: `RECIPIENT_A_RECONCILIATION_AUDIT_2026-09-15.md`.
