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
- reference cost presented at the time: R$ 0,64, later reclassified as central
  planning reference pending billing-unit reconciliation

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

Total local ledger evidence from the original failed run: R$ 0,00.

The previous expected R$ 0,64 was not reached and must not be treated as final
CRA contractual evidence: billing-unit audit later traced R$ 0,32/message to the
internal central planning premise `R$ 3.200,00 / 10.000 mensagens ativas`, not
to Meta, tenant config or a final CRA proposal found in the repo.

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
- Recipient A local reconciliation: 1 reconciled / never resent
- Billable delivered ledger: 1
- Non-billable in local ledger: 1 remaining unattempted recipient for current
  evidence classification
- Duplicate billing: no evidence of duplication; production ledger not exercised
- CRA data used: no
- Isolation: Demo tenant only
- Real send scope expansion: no

## Recipient A Reconciliation Audit

Read-only audit on 2026-09-15 confirmed enough evidence for a constrained
owner-approved repair for `****9614` only:

- exact Meta message id recovered;
- Meta `sent` and `delivered` webhooks recovered;
- owner-confirmed receipt preserved;
- last inbound was `2026-09-10T14:37:04Z`, so the send was outside 24h;
- no active opt-out was found;
- no local OutboundMessage or delivered billing event exists for this Meta id.

Owner approved the constrained repair, and production reconciliation was applied
after backup. The repair reconstructed one local outbound
`1375f639-b3df-425a-987e-545d2ffcddd1`, replayed delivered Utility billing
through existing idempotent logic, set campaign `sentCount=1`, preserved
campaign `status=failed`, and added one manual reconciliation audit event.
`****9614` was not resent, `****6787` was not sent, no read history was created,
and the campaign was not marked completed.

Detailed audit:
`RECIPIENT_A_RECONCILIATION_AUDIT_2026-09-15.md`.

## Billing Unit Reconciliation - 2026-09-15

Real send remains stopped for Recipient B.

Findings:

- `R$ 0,32` source: internal commercial planning premise in
  `docs/bids/2026/cra-pr-90004-2026/proposta-comercial-premissas.md`, central
  recommendation `R$ 3.200,00/month / 10.000 active messages/month`.
- This value is not Meta cost, not stored in `billing.active_message.delivered`,
  not a tenant override, and not a final submitted CRA commercial proposal found
  in the repo.
- Commercial premise range from the same source:
  - minimum prudent: `R$ 37.800,00/year / 120.000 = R$ 0,315`;
  - central recommendation: `R$ 38.400,00/year / 120.000 = R$ 0,32`;
  - high recommendation: `R$ 39.600,00/year / 120.000 = R$ 0,33`;
  - edital maximum: `R$ 40.693,00/year / 120.000 = approximately R$ 0,339108`.
- Meta planning estimate recorded for A:
  `estimatedMetaUnitCostUsd=0.008`, `estimatedMetaCostUsd=0.008`,
  `rateCardVersion=meta-br-planning-2026-08`. Provider invoice amount is not
  available in local evidence.
- Tenant config read-only matrix: `demo-converta`, `cra-pr`, `secult-pe` and
  `syer-rodrigues` have no active BRL Utility unit override in
  `activeMessageBilling`, `billing` or `metaUsagePolicy`.

Classification:

- A ledger: correct as delivered Utility eligibility/count; BRL final unit NOT
  PROVEN.
- B expected contract cost: NOT PROVEN / PAUSED.
- Two-message expected total: NOT PROVEN / PAUSED.

## Recipient B Owner-Authorized Gate - 2026-09-15

Owner authorized exactly one B-only Meta Utility send to `****6787` after the
official Meta provider rate was proven as Brazil Utility BRL R$ 0,0350/message.

Execution stopped before Meta.

Preflight evidence:

- template `data_exame`: approved, Utility, `pt_BR`;
- variable `{{1}}`: approved harmless Demo value `21/03/2026`;
- B authorization: original campaign recipient resolution contained final
  `6787`, input length 13, winning resolved conversation length 12, final
  `6787`;
- B prior campaign outbound: none;
- B any `data_exame` outbound: none;
- last qualifying inbound for B: `2026-09-10T13:39:37.507Z`;
- preflight timestamp: `2026-09-15T23:47:04.544Z`;
- elapsed: approximately 130.12 hours;
- 24h: outside;
- opt-out events: none;
- contact operational exclusion: active contact, `operationallyExcludedAt=null`;
- A safety: one campaign outbound and one delivered billing ledger remain
  preserved for `****9614`; no resend attempted.

Blocker:

- `demo-converta` has `Atendimento Geral` with slug `atendimento-geral`, but it
  is inactive;
- `Fila Geral` exists under that inactive department;
- no active default operational `Atendimento Geral` + `Fila Geral` pair exists;
- original campaign is terminal `failed`, and `failed -> sending` is not a
  valid campaign transition.

Result:

- Meta calls for B: 0;
- local B OutboundMessage: none;
- B billing event: none;
- CRA data used: no;
- required next step: separate owner-approved config-only repair of Demo
  operational default, then a new controlled B-only campaign if still desired.

## Demo Operational Default Owner Gate - 2026-09-15

Read-only production audit determined the correct Demo operational default
should reuse existing tenant data:

- canonical source: `ensureDefaultOperationalDepartmentAndQueue`, which resolves
  active `Atendimento Geral` / `atendimento-geral` plus `Fila Geral`;
- existing department: `cmsiwk1o100014sdzl5cqd2ki` (`Atendimento Geral`,
  `atendimento-geral`);
- existing queue: `cmsiyb2k200n94sdpu5khkee0` (`Fila Geral`), same tenant and
  under that department;
- current blocker: department is inactive;
- proposed config mutation: reactivate that existing department only;
- not recommended: picking a SECULT/CRA thematic department as operational
  default or creating duplicate `Atendimento Geral` / `Fila Geral`;
- status: CONFIG PENDING / OWNER GATE;
- B: NOT ATTEMPTED;
- Meta send: NO.
