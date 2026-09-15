# Demo Contract Validation Evidence

Status: PHASE A INDEX ONLY / NO EXTERNAL SEND.
Phase B owner gate prepared on 2026-09-15; still no external send.
Phase C controlled Utility gate prepared on 2026-09-15; still no external send.
Phase C controlled Utility send attempted on 2026-09-15; partial Meta acceptance
occurred, but the campaign failed before persistence/ledger/report evidence.

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
- expected contractual reference cost: R$ 0,64 for 2 billable active Utility
  messages;
- real Meta outbound: not executed;
- owner approval remains required before Phase C.

Phase C gate summary:

- template: `data_exame`, Utility, `pt_BR`, approved;
- authorized recipient finals: `9614` and `6787`;
- final unique recipients: 2;
- 24h precheck: both outside 24h;
- opt-out precheck: pass;
- expected reference cost: R$ 0,64;
- real outbound: not executed;
- evidence: `PHASE_C_CONTROLLED_UTILITY_GATE_2026-09-15.md`.

Phase C send result summary:

- campaign: `d9874c03-10e8-4061-a92e-6caa7b3001c3`;
- authorized messages: 2;
- Meta accepted: 1 for `****9614`;
- not attempted: 1 for `****6787`;
- runner failure: `default_operational_department_missing`;
- delivered/read observed: 0;
- billable real evidence: 0;
- total contractual evidence: R$ 0,00;
- evidence: `PHASE_C_CONTROLLED_UTILITY_RESULT_2026-09-15.md`.
