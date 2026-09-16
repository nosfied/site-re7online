# Phase D - Opt-out owner gate preparation - 2026-09-16

Status: READY FOR OWNER GATE / NO MUTATION / NO REAL META SEND.

## Production read-back

- Canonical production runtime head: `452d5826db42cc1b574eeff8fd8e0d038cd3491f`.
- Health: PASS (`/health` ok/db ok).
- Migrations: 58 found, database schema up to date.
- Production service read-back: `re7-whatsapp-agent` and web worker processes online by `ps`; `pm2` binary was not available in the non-interactive SSH PATH.
- Production git status: only known unrelated `apps/whatsapp-web-worker/.data/`.

## Template state

- `data_exame`: `approved`, Utility, `pt_BR`, Meta id `4500583573512364`.
- `atualizacao_protocolo`: `PENDING`, Utility, `pt_BR`, Meta id `1020351754389859`.
- `lembrete_vencimento_anuidade`: `PENDING`, Utility, `pt_BR`, Meta id `1074205602013519`.

The two new Utility templates are external Meta dependencies and were not used
for this gate.

## Canonical opt-out model

Current opt-out source of truth is event-sourced in `Event`, not a dedicated
OptOut table:

- active event: `contact.opt_out.recorded`;
- reversal event: `contact.opt_out.revoked`;
- campaign block event: `campaign.recipient.opt_out_blocked`.

Scope is `clientId` + canonical WhatsApp identity (`waIdCanonical`). The payload
stores channel, source, reason, requested/revoked timestamp, user id, campaign id
when provided and note. Active state is resolved from the latest recorded/revoked
event for the same tenant and canonical identity.

## Current behavior proven by audit/tests

- Campaign guard checks opt-out before Meta provider call.
- Campaign block reason/event: `campaign.recipient.opt_out_blocked`; export status
  renders `opt_out`, non-billing reason `opt_out`.
- Manual active/template send is blocked for opt-out with `active_send_blocked`
  before Meta.
- Canned reply/passive human send path is also blocked for active opt-out in the
  current implementation.
- CRM read model exposes `activeOptOut` and `templateSendBlockedReason=opt_out`.
- Reversal is supported through campaign opt-out revoke and CRM contact opt-out
  delete/revoke.
- Tenant isolation is by `clientId`; read-only production comparison found zero
  opt-out events for `****9614` and `****6787` across `demo-converta`, `cra-pr`,
  `secult-pe`, `syer-rodrigues` and `re7online`.

Focused local tests: `campaignsFeatureRoutes.test.ts` +
`crmCapabilityRoutes.test.ts` PASS, 130/130. Initial sandboxed run failed only
because local sandbox blocked `tsx` IPC pipe creation; escalated local run passed.

## Recipient recommendation

Recommended recipient for the future controlled E2E: B `****6787`.

Rationale:

- A `****9614` is the historical reconciliation case and should not be mutated
  for opt-out because it would obscure incident evidence.
- B `****6787` has successful controlled Utility evidence, no active opt-out,
  no cross-tenant opt-out events, and is already an authorized Demo/RE7 test
  recipient.

No opt-out mutation was executed.

## Future owner-approved E2E sequence

After explicit owner approval only:

1. Read back B `****6787` as currently eligible and not opted out.
2. Create canonical opt-out using existing mechanism:
   `contact.opt_out.recorded`, source `controlled_demo_validation`, channel
   `whatsapp`, reason `cra_demo_opt_out_e2e`.
3. Read back active opt-out = true.
4. Create one controlled campaign targeting only B.
5. Run campaign preflight/send path.
6. Expected result: blocked before Meta, Meta calls 0, real messages 0.
7. Capture campaign id, `campaign.recipient.opt_out_blocked`, `blockedCount=1`,
   export CSV status `opt_out`, timestamp and masked recipient.
8. Reversal after test is supported through `contact.opt_out.revoked`; whether to
   reverse should be explicitly approved in the same owner gate.

This preparation does not close CRA-specific E5/E6 acceptance.
