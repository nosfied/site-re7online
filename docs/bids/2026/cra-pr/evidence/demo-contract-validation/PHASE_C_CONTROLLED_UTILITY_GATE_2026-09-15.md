# Demo Contract Validation - Phase C Controlled Utility Gate

Date: 2026-09-15

Scope: DEMO PRODUCT CAPABILITY VALIDATION, not CRA real campaign.

Tenant: `demo-converta`

Production runtime HEAD: `ce55574469aa7a5e07bf3c01015f520a5a8fb9cb`

Canonical docs HEAD at start: `759edcd20b0b4ed1e3187204a6bc76b1d874c74f`

## Preflight

- Health: PASS (`/agent-api/health` returned `ok=true`, `db=ok`).
- Production processes: backend agent, frontend Next and Web Session worker are running.
- Prisma migrations: PASS, 58 migrations found, database schema up to date.
- Demo tenant: ACTIVE / business.
- Demo features: `campaigns=true`, `templates=true`, `whatsappWebSession=true`.
- Demo Meta config: present.
- Demo Web Session channel: connected for `****5328`.
- Demo campaign count before gate: 0.

## Template Read-Back

- Name: `data_exame`
- Category: `UTILITY`
- Submitted category: `UTILITY`
- Language: `pt_BR`
- Status: `approved`
- Recategorized: no
- Body: `Paciente, seu exame foi marcado para {{1}}. Compareça com pelo menos 1 hora de antecedência.`
- Variables: `{{1}} = Data`, example `21/03/2026`
- Meta template id: masked, ending `2364`

Result: PASS. No substitute template selected.

## Recipient Gate

Owner authorized two known Demo/RE7 test recipients by final digits:

- Recipient A: `****9614`
- Recipient B: `****6787`

No full recipient numbers are stored in this evidence file.

Deduplication/normalization:

- `****9614`: one canonical target found.
- `****6787`: duplicate historical lead records found across provider history; normalized campaign target must be one final recipient.
- Final unique intended targets: 2.

## 24h Window Check

Current check time: 2026-09-15 19:06Z.

- `****9614`: last inbound 2026-09-10 14:37Z, outside 24h.
- `****6787`: last inbound 2026-09-10 13:39Z, outside 24h.

Result: PASS for controlled billing-validation intent. Recheck immediately before any real send.

## Opt-Out Pre-Send Check

No active opt-out events were found for the two masked recipients using the current campaign/contact opt-out event model:

- `contact.opt_out.recorded`
- `contact.opt_out.revoked`
- `campaign.recipient.opt_out_blocked`

Result: PASS for this pre-send gate. Recheck immediately before any real send.

## Campaign Preview

- Campaign name: `Demo CRA Phase C - Utility data_exame - 2026-09-15`
- Template: `data_exame`
- Recipient count: 2 authorized masked recipients
- Final unique count: 2
- Message count: 2
- Variables: Demo-safe dates only, one resolved value per recipient
- Transport: `META_CLOUD`
- Expected contractual reference cost: `2 x R$ 0,32 = R$ 0,64`

## Send Gate

CONTROLLED DEMO CAMPAIGN - READY TO SEND was reached as a documentation/evidence gate only.

Real Meta outbound was not executed in this step because the prompt authorized the two known numbers but did not include explicit approval for the exact real send after the final preview.

Required before sending:

- owner approves this exact campaign name;
- owner approves the exact template;
- owner approves the two masked recipients;
- owner approves message count 2;
- owner approves expected cost R$ 0,64;
- operator rechecks 24h window and opt-out immediately before send.

## Lifecycle Evidence Classification

Schedule, pause and cancel remain implemented and locally tested, but Demo production lifecycle evidence is still pending. Do not risk the two-message billing validation just to exercise every lifecycle state at once.

- Schedule: IMPLEMENTED / DEMO PRODUCTION EVIDENCE PENDING
- Pause: IMPLEMENTED FOR RUNNING / DEMO PRODUCTION EVIDENCE PENDING
- Cancel: IMPLEMENTED / DEMO PRODUCTION EVIDENCE PENDING

## Result

- Real send: NO
- Accepted: 0
- Delivered: 0
- Read: 0
- Failed: 0
- Billable: 0
- Ledger: NOT EXERCISED
- CRA data used: NO
- Tenant isolation: PASS by tenant-scoped read-back
