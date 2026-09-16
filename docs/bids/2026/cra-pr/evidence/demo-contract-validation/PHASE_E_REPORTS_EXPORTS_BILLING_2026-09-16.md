# Phase E - Reports / Exports / Billing Evidence

Status: COMPLETED FOR DEMO PRODUCT CAPABILITY / CRA CUSTOMER ACCEPTANCE STILL
PENDING.

Date: 2026-09-16.

Scope: documentation/evidence audit only. No campaign send, no opt-out mutation,
no ledger mutation, no deploy.

## Contract sources

- `docs/bids/2026/cra-pr-90004-2026/resposta-esclarecimento.md`
  - item 1: billable active message is a Utility template outside the 24h
    window and effectively delivered to the recipient.
  - item 2: accepted/processed but undelivered messages do not bill.
  - item 3: read status does not change measurement.
  - item 5: Meta/WhatsApp Business Platform costs must be included in the
    commercial proposal.
  - item 10: opt-out may be handled by operational control with record,
    date/channel, block and auditable history.
  - item 11: export must be CSV/XLSX or equivalent open/widely used format; PDF
    may be a formatted report.
  - item 12: Marketing messages are not in scope.
- `docs/bids/2026/cra-pr-90004-2026/proposta-comercial-premissas.md`
  - commercial volume assumptions: 10,000 active messages/month,
    120,000/year;
  - delivered/read + Utility is the conservative operating base for billable
    consumption evidence;
  - CRA final BRL contract unit remains separate from provider cost and was not
    proven by this Demo audit.

## Product support audited

- Campaign CSV export:
  - route: `GET /app/campaigns/:id/export`;
  - auth: tenant app session, active tenant, `campaigns` feature;
  - source: `Campaign`, `OutboundMessage`, opt-out events and campaign detail
    projection;
  - output: CSV with campaign id/name, template, category, contact, status,
    sent/delivered timestamps, billable flag, non-billing reason, Meta pricing
    billable flag and pricing model.
- Operational reports:
  - `/app/reports/conversations` and `/app/reports/conversations/export`;
  - `/app/reports/completed-services` and export;
  - `/app/reports/satisfaction` and export;
  - `/app/reports/sessions` and export.
  - These routes require app auth, active tenant, reports feature and scoped
    report access. Agents are denied report access.
- Usage/billing reports:
  - `/app/usage/meta/report` and `/app/usage/meta/report.csv`;
  - `/app/usage/receptive-sessions/report` and CSV;
  - `/app/usage/active-messages/report` and CSV.
  - Active-message billing report groups by campaign and counts processed,
    sent, delivered, read, failed, rejected, blocked, opt-out and
    billableDelivered. Unit price is an input/report parameter; it is not a
    tenant-global billing mutation.
- PDF:
  - report module supports formatted managerial PDF/print output for reports;
    campaign consumption evidence remains CSV/open-equivalent. Native XLSX is
    not claimed.

## Production read-only evidence

Tenant feature read-back:

- `demo-converta`: ACTIVE; `campaigns=true`, `reports=true`.
- `cra-pr`: ACTIVE; `campaigns=true`, `reports=true`,
  `governmentReports=true`, `templates=true`, `satisfaction=true`,
  `departments=true`.

No production mutation was performed during this audit.

### Recipient A historical/reconciled Utility

- Campaign: `d9874c03-10e8-4061-a92e-6caa7b3001c3`.
- Name: `DEMO / CONTRACT VALIDATION / CRA CAPABILITY - data_exame - 2026-09-15`.
- Status truth: `failed`.
- Template: `data_exame`.
- Recipients: `totalRecipients=2`, `sentCount=1`, `blockedCount=0`.
- Local outbound: 1, id `1375f639-b3df-425a-987e-545d2ffcddd1`.
- Masked recipient: `****9614`.
- Current Meta status projection: `read`.
- Estimated Meta usage payload: `0.008` USD, category `utility`.
- Billing events: exactly 1 `billing.active_message.delivered`.
- Duplicate billing: no evidence of duplicate.
- Classification: valid delivered Utility eligibility/count evidence after
  owner-approved reconciliation; campaign status remains failed and must not be
  represented as a clean campaign success.

### Recipient B controlled Utility

- Campaign: `bb1d30e2-3a98-471a-9531-1f5e5d76a214`.
- Name: `Demo contrato CRA - data_exame B-only - final 6787 - 2026-09-16`.
- Status truth: `completed`.
- Template: `data_exame`.
- Recipients: `totalRecipients=1`, `sentCount=1`, `blockedCount=0`.
- Local outbound: 1, id `076910ef-ce6f-43d6-bfc2-2f30c4b41930`.
- Masked recipient: `****6787`.
- Current Meta status projection: `delivered`.
- Estimated Meta usage payload: `0.008` USD, category `utility`.
- Billing events: exactly 1 `billing.active_message.delivered`.
- Duplicate billing: no.
- Classification: clean Demo product evidence for delivered Utility campaign
  reporting/export/billing mechanics.

### Recipient B opt-out block

- Campaign: `d260bdc6-326f-4487-8d15-21c2a98dd741`.
- Name: `CRA Demo opt-out E2E - B blocked - 2026-09-16T14:19:33.003Z`.
- Status truth: `completed`.
- Template: `data_exame`.
- Recipients: `totalRecipients=1`, `sentCount=0`, `blockedCount=1`.
- Outbound rows: 0.
- Billing events: 0.
- Opt-out block event: `80d6ca1d-94f2-4465-81b7-74888c1d0edc`.
- Masked recipient: `****6787`.
- Classification: opt-out report/export/billing evidence; blocked before Meta,
  zero provider calls, zero real messages, zero billing.

## Matrix

| Requirement | Product support | Demo evidence | CRA validation |
| --- | --- | --- | --- |
| Campaign status/history | `Campaign`, `OutboundMessage`, Meta status projection and campaign export | A failed/reconciled, B completed/delivered, opt-out blocked | pending CRA customer sample |
| CSV/open export | Campaign export, operational report exports, usage/billing CSV reports | Sanitized Phase C/D evidence and Phase E read-back | pending acceptance package review |
| XLSX/equivalent | Contract allows CSV/XLSX or equivalent open/widely used format | CSV/open-equivalent evidence only | native XLSX not claimed |
| PDF/formatted report | Reports module has formatted managerial PDF/print path | audited by docs/code, not generated for this Demo phase | include in acceptance package if requested |
| Monthly active usage | Meta usage report/CSV and active-message report/CSV | delivered Utility evidence exists for A and B; opt-out generates no billing | CRA month/report still pending |
| Billing quantity | `billing.active_message.delivered` events | A=1, B=1, opt-out=0 | CRA invoice/contract unit pending |
| Read status | Read does not create extra billing by contract; active-message report separates read from billableDelivered | A is read with one billing event; B delivered with one billing event | pending CRA sample |
| Opt-out report evidence | `contact.opt_out.*`, `campaign.recipient.opt_out_blocked`, campaign export `opt_out` | B block has 0 outbound and 0 billing | pending CRA customer sample |
| Multitenant isolation | routes use authenticated client id and tenant-scoped queries | Demo evidence remained under Demo; CRA features audited separately | pass by product design, CRA package pending |
| Audit trail | events/logs and report/export routes log access/action | event IDs captured for billing/opt-out | final customer audit package pending |

## Billing classification

- Provider cost and contract price remain separate.
- Product payload read-back stored estimated Meta usage as `0.008` USD for A
  and B outbounds.
- Prior narrow official Brazil Utility provider-rate evidence remains documented
  separately as R$ 0.0350/message.
- CRA final contractual BRL unit remains NOT PROVEN in repository evidence.
- `billing.active_message.delivered` is an eligibility/count event. It must not
  be treated as final invoice amount without the accepted contract unit.

## Result

- Reports/export/billing product capability: PASS on Demo evidence.
- CRA customer acceptance: pending.
- CRA final billing unit: pending.
- No real send in this phase.
- No opt-out mutation in this phase.
- No ledger mutation in this phase.
