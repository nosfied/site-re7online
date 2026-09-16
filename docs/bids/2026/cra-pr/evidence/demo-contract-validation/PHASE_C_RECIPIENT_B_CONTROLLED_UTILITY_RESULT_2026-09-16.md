# Phase C Recipient B Controlled Utility Result - 2026-09-16

Status: DEMO PRODUCT CAPABILITY VALIDATION / REAL META SEND COMPLETED.

This evidence is from `demo-converta`. It is not a CRA real campaign and does
not use CRA customer recipient data.

## Authorization

- Owner authorization: explicit PASS.
- Scope: exactly one Utility template send to Recipient B `****6787`.
- Recipient A `****9614`: never resent in this run.
- Campaign: `bb1d30e2-3a98-471a-9531-1f5e5d76a214`.
- Campaign name: `Demo contrato CRA - data_exame B-only - final 6787 - 2026-09-16`.
- Template: `data_exame`, Utility, `pt_BR`, approved.
- Variable value used for `{{1}}`: harmless Demo value `21/03/2026`.

## Pre-Send

- Campaign status before send: `draft`.
- Audience: B only, one canonical recipient, masked final `6787`.
- A included: no.
- Active opt-out: no.
- Last B inbound: 2026-09-10T13:39:37.000Z.
- Send preflight timestamp: 2026-09-16T13:22:32.596Z.
- Elapsed since inbound: 143.72h, outside 24h.
- Business hours for selected department at send: OPEN.
- Return destination: HUMAN, `Atendimento Geral` -> `Fila Geral`.
- Destination IDs:
  - department: `cmsiwk1o100014sdzl5cqd2ki`
  - queue: `cmsiyb2k200n94sdpu5khkee0`
- Official Meta provider rate reference: Brazil / Utility / BRL 0.0350 if
  delivered.
- CRA contract amount: NOT PROVEN / separate.

## Backup

- Path:
  `/opt/re7online/backups/demo-b-controlled-send-20260916/pre-demo-b-controlled-send-20260916T132038Z.dump`
- Size: 20M.
- Objects: 593.
- SHA256:
  `e73be155604ae0c7e7fe42b44dc87a1213755030cfa1c0d5d585f33e0319253a`

## Send Result

- Requested: 1.
- Meta calls: 1.
- Meta accepted: yes.
- Meta message id:
  `wamid.HBgMNTU4NDk0Nzg2Nzg3FQIAERgUQ0UzOTE0Q0UyNUY0QjQ3OUZCQ0EA`
- Campaign run id: `2925aad8-e3c8-4404-80d7-5266e6dda77e`.
- Local OutboundMessage id: `076910ef-ce6f-43d6-bfc2-2f30c4b41930`.
- Local message id:
  `campaign.bb1d30e2-3a98-471a-9531-1f5e5d76a214.1`.
- `campaign.message.submit_started`: present.
- `campaign.message.provider_accepted`: present.
- `campaign.message.reconciliation_required`: absent.

## Meta Status

- Webhook `sent`: yes, count 1.
- Webhook `delivered`: yes, count 1.
- Webhook `read`: no, count 0.
- Webhook `failed`: no, count 0.
- Delivered timestamp: 2026-09-16T13:22:42.000Z.

## Billing

- Canonical event: `billing.active_message.delivered`.
- B billing event count: 1.
- Duplicate billing: no.
- Classification:
  - template category: utility;
  - customer service window open at send: false;
  - provider: meta_cloud;
  - billing classification version: `active-message-billing-v1`.
- Provider cost reference: R$ 0.0350 if delivered.
- CRA contract amount: NOT PROVEN.

## Campaign State

- Final campaign status: `completed`.
- Total recipients: 1.
- Sent count: 1.
- Blocked count: 0.
- Outbound status row: `SENT`.
- Delivery/read evidence is represented by webhook/status and billing events.

## Return Destination

Persisted on both seed and outbound payload:

```json
{
  "type": "human_department",
  "departmentId": "cmsiwk1o100014sdzl5cqd2ki",
  "departmentName": "Atendimento Geral",
  "queueId": "cmsiyb2k200n94sdpu5khkee0",
  "queueName": "Fila Geral"
}
```

No natural B reply was observed during the monitored window. If B replies while
the selected department is open, canonical routing should place the conversation
in the configured human destination. If closed, the selected target remains
preserved and department-hours behavior applies.

## A Safety

- A external sends in this run: 0.
- A reconciled campaign outbound count: 1.
- A delivered billing event count: 1.
- Raw historical `data_exame` outbounds for A may include older non-campaign
  inbox/human sends; that is not part of this run and was not resent.

## Multitenant

- CRA data used: no.
- `cra-pr`: no campaign/outbound mutation in this run window.
- `syer-rodrigues`: no campaign/outbound mutation in this run window.
- `re7online`: no campaign/outbound mutation in this run window.
- `secult-pe`: unrelated outbound activity existed in the run window; no
  campaign mutation from this gate.

## Export Evidence

Supported product path: `GET /app/campaigns/:id/export` returns CSV.

Sanitized contract evidence CSV for this result:

- `PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.csv`

Native XLSX is not claimed. Contract clarification remains CSV/export evidence
or equivalent conversion path, not fake native XLSX support.
