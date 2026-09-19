# Phase F Dynamic CRM-filter E2E - 2026-09-19

Status: DEMO PRODUCT CAPABILITY VALIDATION / REAL DYNAMIC EXECUTION COMPLETED.

This evidence is from `demo-converta`. It is not a CRA real campaign and does
not use CRA customer recipient data.

## Scope

- Tenant: `demo-converta`.
- Campaign: `c621ee16-d9b5-4805-bbec-365d8bd22e98`.
- Campaign name:
  `DEMO E4 dynamic CRM filter - dynamic-crm-e4-2026-09-19T18-10-27-011Z`.
- Template: `data_exame`, Utility, `pt_BR`.
- Dynamic filter: CRM Situation `QUALIFIED` / `Qualificado`.
- Scheduled for: `2026-09-19T18:12:32.328Z`.
- Return destination: `Atendimento Geral` -> `Fila Geral`.

## Pre-execution Control

- Before campaign creation, the matching CRM Situation set contained
  `****6787`.
- The new campaign had no snapshot, no outbound rows and no billing rows before
  execution.
- Before execution, `****6787` was moved out of the filter and `****9614` was
  moved into the filter.
- The matching CRM Situation set immediately before execution contained
  `****9614`.

## Execution Evidence

- Scheduler naturally claimed the due campaign without PM2 restart.
- `campaign.scheduled.started`: present.
- Snapshot event: `campaign.dynamic_snapshot.created`.
- Snapshot event id: `c3a4d089-58b0-4083-863f-d9c80ba9f27d`.
- Snapshot time: `2026-09-19T18:12:49.373Z`.
- Matched recipients: 1.
- Eligible recipients: 1.
- Blocked recipients: 0.
- Snapshot recipient: `****9614`.
- Snapshot hash:
  `b6c78d6ae8936966dc9c9ae842327305edea67506f58cf2bc2791dd8299ee6a5`.

## Immutability And Idempotency

- After snapshot creation, CRM statuses were restored:
  - `****6787`: `QUALIFIED`;
  - `****9614`: `NEW`.
- Snapshot changed after restoration: no.
- Replay/polling after completion returned no additional claimed campaign.
- Snapshot count remained 1.
- Outbound count remained 1.
- Billing count remained 1.
- Duplicate outbound recipient rows: 0.

## Provider And Billing

- Provider calls: 1.
- Meta message id:
  `wamid.HBgMNTU4NDk5MDQ5NjE0FQIAERgUQ0U4NTAzNTUzMjYxMDZGNUMxNDMA`.
- Final campaign status: `completed`.
- Total recipients: 1.
- Delivered evidence: 1.
- Blocked: 0.
- Failed: 0.
- Pending: 0.
- Canonical billing event: one `billing.active_message.delivered`.
- Billing provider: `meta_cloud`.
- Billing template category: `utility`.

## Safety

- CRA tenant send: no.
- Web Session restart: no.
- Transport configuration change: no.
- Vercel action: no.
- Real send count: 1, limited to the controlled Demo campaign above.
- Unrelated data mutation: no. Temporary CRM status changes on `****6787` and
  `****9614` were restored after snapshot validation.
