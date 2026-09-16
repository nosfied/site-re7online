# Phase D - Opt-out E2E - 2026-09-16

Status: COMPLETED / DEMO PRODUCT CAPABILITY VALIDATED / NOT CRA CUSTOMER SAMPLE.

Owner authorization: EXPLICIT PASS.

Tenant: `demo-converta`.

Controlled recipient: B `****6787`.

Recipient A `****9614` was not touched.

## Preflight

- Canonical docs/code head before execution: `39472eb3c343fb12733597d7a7c0b0d2c534dd6a`.
- Production runtime head: `452d5826db42cc1b574eeff8fd8e0d038cd3491f`.
- Health: PASS (`/health` ok/db ok).
- Migrations: 58 found, DB schema up to date.
- Runtime process read-back: `re7-whatsapp-agent` and web worker Node processes online by `ps`.
- Production git status after temporary script removal: only known unrelated
  `apps/whatsapp-web-worker/.data/`.

## Opt-out record

- Canonical path: `recordContactOptOut`.
- Event id: `88361d0f-89df-41fc-852b-ce84cbb43cc4`.
- Event type: `contact.opt_out.recorded`.
- Source: `controlled_demo_validation`.
- Reason: `cra_demo_opt_out_e2e`.
- Created at: `2026-09-16T14:19:33.216Z`.
- Effective after record: YES.
- Tenant/identity scope: `demo-converta`, B `****6787`.

## Blocked campaign

- Campaign id: `d260bdc6-326f-4487-8d15-21c2a98dd741`.
- Campaign name: `CRA Demo opt-out E2E - B blocked - 2026-09-16T14:19:33.003Z`.
- Template: `data_exame`, Utility, `pt_BR`, approved.
- Intended recipient count: 1.
- Actual provider-eligible recipients: 0 after opt-out filter.
- Status: `completed`.
- `totalRecipients`: 1.
- `sentCount`: 0.
- `blockedCount`: 1.
- Campaign run id: `dde6aba0-d09f-4b9c-bd06-892ecb48ebcb`.

## Block evidence

- Event id: `80d6ca1d-94f2-4465-81b7-74888c1d0edc`.
- Event type: `campaign.recipient.opt_out_blocked`.
- Request id: `campaign-opt-out:d260bdc6-326f-4487-8d15-21c2a98dd741:558494786787`.
- Created at: `2026-09-16T14:19:33.276Z`.
- Masked recipient: `****6787`.
- Template: `data_exame`.
- Opt-out recorded at: `2026-09-16T14:19:33.216Z`.

## Provider and billing proof

- Meta submit/provider-accepted event delta for this campaign: 0.
- Provider accepted marker: absent.
- `wamid`: absent.
- OutboundMessage rows for this campaign: 0.
- `billing.active_message.delivered` events for this campaign: 0.
- Provider cost: R$ 0.00.
- Real messages: 0.

## Reversal

- Canonical path: `revokeContactOptOut`.
- Event id: `a5b58132-79fe-49dd-8aff-49fb78bf4566`.
- Event type: `contact.opt_out.revoked`.
- Source: `controlled_demo_validation`.
- Reason: `cra_demo_opt_out_e2e_reversal`.
- Created at: `2026-09-16T14:19:33.530Z`.
- Effective after revoke: NO active opt-out.
- History preserved: PASS. The recorded event was not deleted.

## Safety

- A outbounds before/after: 125 / 125.
- A delivered billing before/after: 1 / 1.
- A opt-out events before/after: 0 / 0.
- CRA data used: NO.
- Cross-tenant B opt-out event count after execution:
  - `cra-pr`: 0.
  - `secult-pe`: 0.
  - `syer-rodrigues`: 0.
  - `re7online`: 0.

## Export/evidence row

Sanitized CSV evidence:

- `PHASE_D_OPT_OUT_E2E_2026-09-16.csv`

The row records B as `opt_out`, non-billing, with no Meta id, no outbound id and
no billing event.

## Classification

Demo opt-out capability evidence level: E4.

CRA-specific acceptance remains E5/E6 pending customer/contract acceptance
package.
