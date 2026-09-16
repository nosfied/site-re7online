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
- Recipient B-only final destination configuration: on 2026-09-16 the owner
  selected existing Demo `Atendimento Geral`
  (`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
  (`cmsiyb2k200n94sdpu5khkee0`) for this campaign. Backup
  `pre-demo-b-destination-gate-20260916T130703Z.dump` was validated (20M, 593
  objects, SHA256
  `0b4a2d4006ccfa1c9a589a5926f277edae64d8fa5924985045708d5b8102f50d`).
  Draft campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214` was created with
  encrypted B-only seed and explicit human return destination. No Meta send
  occurred.
- Recipient B controlled Utility send: on 2026-09-16 the owner authorized one
  real Meta Utility send to B `****6787`. The send was accepted, delivered,
  billed once through `billing.active_message.delivered`, and recorded as
  sanitized evidence in:
  `PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md` and
  `PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.csv`.
- Opt-out E2E preparation: on 2026-09-16 the canonical opt-out model, guard
  order, manual-send behavior, tenant isolation and safe recipient choice were
  audited with no mutation and no Meta send. Evidence file:
  `PHASE_D_OPT_OUT_OWNER_GATE_PREPARATION_2026-09-16.md`.
- Opt-out E2E execution: on 2026-09-16 the owner authorized canonical opt-out
  creation for B `****6787`, one controlled campaign, block before Meta and
  canonical reversal. Result: `campaign.recipient.opt_out_blocked`, Meta calls
  0, real messages 0, outbound 0, billing 0, opt-out revoked, B eligible again
  and A untouched. Evidence files:
  `PHASE_D_OPT_OUT_E2E_2026-09-16.md` and
  `PHASE_D_OPT_OUT_E2E_2026-09-16.csv`.
- Reports/exports/billing Phase E: on 2026-09-16 a docs/evidence-only audit
  used existing Demo evidence and production read-only checks. Result: campaign
  reporting/export/billing product capability PASS on Demo; A remains truthful
  as failed/reconciled with one delivered billing event, B is completed with one
  delivered billing event, and opt-out block has zero outbound/billing.
  `demo-converta` and `cra-pr` both have `campaigns` and `reports` enabled.
  CSV/open-equivalent evidence is supported; native XLSX is not claimed. CRA
  customer report package and final contractual BRL billing unit remain pending.
  Evidence files:
  `PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md` and
  `PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.csv`.
- evidence: `PHASE_C_CONTROLLED_UTILITY_RESULT_2026-09-15.md`.
- reconciliation audit: `RECIPIENT_A_RECONCILIATION_AUDIT_2026-09-15.md`.
