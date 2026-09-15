# Demo Contract Validation - Phase C Controlled Utility Result

Date: 2026-09-15

Scope: DEMO PRODUCT CAPABILITY VALIDATION, not CRA real campaign.

Tenant: `demo-converta`

Campaign id: `d9874c03-10e8-4061-a92e-6caa7b3001c3`

Campaign name: `DEMO / CONTRACT VALIDATION / CRA CAPABILITY - data_exame - 2026-09-15`

## Authorization

Owner authorization was explicit for exactly:

- tenant: `demo-converta`
- template: `data_exame`
- transport: `META_CLOUD`
- message count: 2
- recipients: the two previously prepared Demo/RE7 test recipients ending `9614` and `6787`
- reference contractual cost: R$ 0,64

No CRA data was used.

## Immediate Pre-Send Recheck

- canonical head before send: `c831e9a689af6fd804eb415f5db8c8f500b3e963`
- production runtime head: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`
- health: PASS
- migrations: PASS, 58 found and schema up to date
- Demo tenant: ACTIVE / business
- features: `campaigns=true`, `templates=true`
- Meta Cloud: configured
- template: `data_exame`, `UTILITY`, `approved`, `pt_BR`, variable `{{1}}`

Recipients:

- `****9614`: authorization preserved, last inbound 2026-09-10 14:37Z, outside 24h, no active opt-out found.
- `****6787`: authorization preserved, duplicate historical provider records normalized to one intended target, last inbound 2026-09-10 13:39Z, outside 24h, no active opt-out found.

Final unique intended recipients: 2.

## Execution Result

The real send did not complete the approved 2-message scope.

Observed runtime sequence:

1. Campaign created as `sending`.
2. Runner resolved both recipients.
3. First Meta template request to `****9614` was accepted by Meta Cloud.
4. Owner later confirmed real receipt by `****9614`.
5. Runner failed immediately after Meta acceptance with:
   `default_operational_department_missing`.
6. Campaign was marked `failed`.
7. Second recipient `****6787` was not sent.

Production DB read-back:

- campaign status: `failed`
- totalRecipients: 2
- sentCount: 0
- blockedCount: 0
- OutboundMessage rows for this campaign: 0
- `billing.active_message.delivered` events for this campaign: 0
- campaign events persisted: recipient conversation resolution for both masked recipients

Runtime event file read-back:

- one outbound template event for `data_exame`
- recipient: `****9614`
- status: `sent`
- Meta message id: recovered and preserved in forensic notes, masked here as
  `******************************************************QjBBNkYA`
- campaign run id present
- DB webhook event evidence later recovered: Meta status `sent` and
  `delivered` for the same Meta message id; `read` was not found.
- Because no OutboundMessage row existed, those webhook statuses had no local
  outbound record to correlate to in product reporting/billing.

## Billing Classification

- `****9614`: Meta accepted; owner confirmed receipt; Meta `delivered` webhook
  was later recovered. Local OutboundMessage and billing ledger are missing, so
  product billing/report evidence must not be invented.
- `****6787`: not submitted; not billable.

Total contractual evidence from this run: R$ 0,00.

Expected R$ 0,64 was not reached because both messages did not complete through
the local persisted billing/reporting pipeline, and the controlled campaign
failed before the second send.

## Report / Export

Campaign report/export validation: ISSUE.

Reason: no persisted OutboundMessage, no delivered/read status and no billing ledger rows exist for this campaign, so CSV/report/billing evidence cannot be validated from this failed run.

## Test Evidence

Focused local tests after the failed run:

```text
activeMessageBilling.test.ts
metaUsagePreview.test.ts
campaignLifecycle.test.ts

10/10 PASS
```

These tests prove the expected idempotency and billing rules in test scope:

- delivered Utility outside 24h creates one active billing event;
- duplicate delivery and read after delivered do not duplicate billing;
- failed, inside-window and non-Utility sends are not billable;
- lifecycle transitions remain constrained.

This is TEST evidence, not real Meta delivery evidence.

## Blocking Finding

Blocking runtime finding:

`ensureCampaignOutboundConversation` / campaign outbound bootstrap can fail after Meta template acceptance when Demo has no default operational department/queue configured.

The failure occurred after the first Meta acceptance and before campaign outbound persistence/ledger creation. This exposes an ordering/preflight gap for controlled campaign sends:

- missing operational defaults were not detected before external Meta mutation;
- the accepted Meta message was not persisted as an OutboundMessage;
- no campaign ledger/report evidence was generated for the accepted send.

A separate forensic/repair gate later implemented a local generic fix without
tenant hardcode and without real outbound:

- preflight `ensureDefaultOperationalDepartmentAndQueue` before Meta send;
- deterministic `campaign.message.submit_started` event before external call;
- deterministic `campaign.message.provider_accepted` event immediately after
  Meta acceptance;
- retry hard-stop with `campaign.message.reconciliation_required` when an
  accepted provider event exists without OutboundMessage;
- `webhook.status.orphaned` event when Meta status cannot find an
  OutboundMessage, with no synthetic billing.

Focused validation after repair:

```text
campaignRunner.test.ts: 5/5 PASS
campaignsFeatureRoutes.test.ts: 113/113 PASS
backend build: PASS
```

The generic repair was deployed on 2026-09-15 by FF-only production update to
`b8c8f616`, after persistent PostgreSQL backup. Production validation was
non-destructive: no retry, no resend to `****9614`, no send to `****6787`, no
synthetic OutboundMessage and no synthetic billing. Only `re7-whatsapp-agent`
was reloaded; frontend and `re7-whatsapp-web-worker` were preserved.

## Result Summary

- Requested by authorization: 2
- Attempted against Meta: 1
- Accepted by Meta: 1
- Submit failed: 0
- Not attempted due to runner failure: 1
- Owner-confirmed receipt: 1
- Delivered webhook recovered: 1
- Read: 0 observed
- Failed webhook: 0 observed
- Pending local reconciliation: 1 Meta-accepted message without OutboundMessage
- Billable: 0
- Non-billable in local ledger: 2 for current evidence classification
- Duplicate billing: no evidence of duplication; production ledger not exercised
- CRA data used: no
- Isolation: Demo tenant only
- Real send scope expansion: no
