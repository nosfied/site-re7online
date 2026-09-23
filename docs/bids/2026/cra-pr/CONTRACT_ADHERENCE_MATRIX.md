# CRA-PR Contract/TR Adherence Matrix

Status: canonical contractual readiness audit for Converta / CRA-PR.

Scope: Contract no. 20/2026/CRA-PR / PE 90004/2026 evidence available in the
repository plus read-only production snapshot collected on 2026-09-15.

Current execution front, updated on 2026-09-15: Utility/campaign readiness audit
is closed and the contract acceptance phase is open. The next blocker is
customer-approved CRA Utility copy plus explicit owner approval before any Meta
submission or real send. Instagram Direct, Facebook Messenger and
Website/Webchat remain contract-required, but are customer-deferred with
delivery window pending and are not active blockers for this phase.

Demo multitenant mirror update, 2026-09-15: Phase A validation plan is recorded
in `docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md`. `demo-converta`
is a behavioral/homologation tenant only, not a CRA clone. It can validate 36
of 52 requirements as generic product mechanics, while CRA-specific evidence,
external Meta/legal proof, customer actions and deferred channels remain
separate. No CRA data was used, no Meta submission was executed and no real
outbound send occurred.

Demo Phase C post-Meta persistence update, 2026-09-15: one authorized Demo
Utility send to `****9614` was accepted by Meta and owner-confirmed received;
Meta `sent`/`delivered` webhook evidence was recovered, but no local
OutboundMessage/ledger/report row existed because operational default bootstrap
failed after the external send. Recipient `****6787` was not attempted. This
does not close CRA campaign acceptance or billing evidence. Generic local repair
is deployed and non-destructive validated: pre-send operational default
validation, idempotent submit/accepted events, retry stop with
reconciliation-required evidence, and orphan status recording without synthetic
billing. Recipient A was later reconciled locally after owner approval, without
resend; however, billing-unit audit showed `R$ 0,32` is an internal central
planning reference (`R$ 3.200,00 / 10.000`) and not a proven final CRA contract
unit. This closes the generic product bug and A local reconciliation, but does
not close CRA campaign acceptance, opt-out E2E, report/export/billing evidence
or BRL unit-price acceptance. Recipient B Demo send was closed later through the
separate B-only controlled Utility gate.

Meta pricing narrow gate update, 2026-09-15: official WhatsApp Business
Platform Pricing / Meta Developers evidence proves the controlled Demo Utility
provider cost needed before Recipient B owner gate: Brazil, Utility, BRL,
effective 2026-07-01, tier 0-250,000 monthly messages, R$ 0,0350 per delivered
message. Generic Meta pricing source-of-truth automation is moved to P2 FinOps
hardening and must not consume the CRA adherence front. Historical Recipient B
preflight initially stopped before Meta because Demo lacked an active generic
human destination; this was superseded by the explicit destination gate and the
completed B controlled Utility send on 2026-09-16.

Outbound return destination hardening, deployed on 2026-09-16 at
`452d5826db42cc1b574eeff8fd8e0d038cd3491f`: new campaign
configuration no longer relies on implicit name-based operational defaults as
the canonical destination. Campaign drafts/imports/sends persist an explicit
response destination in `campaign.seed.saved`: human department with concrete
queue, or active principal automated flow. Direct CRM contact initiation uses
the initiating user's valid primary department and blocks before provider send
when absent. Status: CLOSED / DEPLOYED / OWNER APPROVED / PROD
NON-DESTRUCTIVE VALIDATED. This is generic multitenant product hardening, not
CRA data/config mutation, and it does not authorize Recipient B or any real
Meta send.

Campaign follow-up backlog reconciliation, 2026-09-16: keep the approved
outbound return destination delivery unchanged. Add two separate follow-ups:
CRM situation import/upsert/report as the next CRA campaign import enhancement,
and Marketing template media support as P2 product/Meta capability unless
explicit contract evidence promotes it. The CRM import front is not only an
optional column: it requires safe tenant-scoped upsert, no duplicate contacts,
blank-field preservation, deterministic same-tenant `Situação no CRM`
resolution and detailed downloadable import evidence. Neither item is part of
the current Utility controlled campaign or Recipient B gate.

Contacts campaign relationship view, updated 2026-09-18: the separate CRA
CAMPAIGN-CRM FOLLOW-UP now has CANONICALLY INTEGRATED / TEST VALIDATED / OWNER PASS / CLEAN DELIVERY PREPARED / PRODUCTION DEPLOY PENDING status.
It exposes campaign history/state inside Contacts without copying campaign
source-of-truth data into Contact. It supports traceability and acceptance
evidence, using existing campaign/outbound/event records, same-tenant
projection, aggregate list data and on-demand detail. Owner review, production
delivery and CRA customer acceptance remain pending.

This document separates four things that must not be conflated:

- contractual obligation;
- generic product capability;
- `cra-pr` tenant configuration;
- production/customer evidence for CRA.

## Source Inventory

| Source | Document Type | Date/Version | Authoritative For | Notes |
| --- | --- | --- | --- | --- |
| `docs/bids/2026/cra-pr-90004-2026/README.md` | bid pack summary | 2026 bid pack | object, channels, volumes, risks | Includes official clarification summary and readiness status. |
| `docs/bids/2026/cra-pr-90004-2026/aderencia-tecnica.md` | technical adherence matrix | post-clarification / Sprint 85I | detailed TR requirement list | Historical product-vs-TR matrix; not enough alone for CRA tenant evidence. |
| `docs/bids/2026/cra-pr-90004-2026/resposta-esclarecimento.md` | official clarification record | 2026 | billing semantics, IG/FB scope, export formats, Meta evidence | Contractual priority for interpretation. |
| `docs/bids/2026/cra-pr-90004-2026/proposta-tecnica-base.md` | technical proposal base | 2026 | product commitments and implementation assumptions | Confirms official API positioning, human-only IG/FB and training scope. |
| `docs/bids/2026/cra-pr-90004-2026/proposta-comercial-premissas.md` | commercial premises | 2026 | price model, volumes, active-message billing | Internal pricing; use only where consistent with clarification. |
| `docs/bids/2026/cra-pr-90004-2026/plano-implantacao-30-dias.md` | implementation plan | 2026 | implementation sequence, customer dependencies | Makes Meta assets, webchat embed and homologation dependencies explicit. |
| `docs/bids/2026/cra-pr-90004-2026/plano-suporte-sla.md` | support/SLA plan | 2026 | support window and severity targets | Operational plan, not uptime proof by itself. |
| `docs/bids/2026/cra-pr-90004-2026/declaracao-api-oficial-meta.md` | Meta/API declaration draft | 2026 | official API commitments and exclusions | Requires signed/external supporting evidence for acceptance. |
| `docs/bids/2026/cra-pr-90004-2026/declaracao-lgpd-seguranca.md` | LGPD/security declaration draft | 2026 | security/LGPD commitments | Draft declaration; evidence still required for acceptance package. |
| `docs/bids/2026/cra-pr/READINESS_NOTES.md` | CRA operational readiness notes | updated through 2026-09 | CRA production validation history | Source for already validated tenant-specific states. |
| `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md` | demo flow validation baseline | 2026-09-01 | flow source/content baseline | Demo evidence only; not CRA tenant ownership/data evidence. |

No direct contradiction was found. The main correction is evidentiary: older
documents often say "atende" for product capability, while this matrix only
marks CRA contractual readiness when the CRA tenant is configured and evidenced.

## Production Snapshot - CRA Tenant

Read-only production snapshot collected on 2026-09-15.

- Tenant: `cra-pr`, ACTIVE, profile `government`.
- Features enabled: Inbox, chatbot, reports, campaigns, templates, departments,
  protocols, satisfaction, operations board, government reports, Web Session,
  browser push. Webchat, training module, webhooks, scheduling and knowledge
  base are disabled.
- Runtime/user limit: `maxActiveAppUsers=30`.
- Users: 18 active, 0 inactive. Role split: 3 ADMIN, 5 SUPERVISOR, 10 AGENT.
- Departments: 6 active.
- Queues: 6, one `Fila Geral` per department.
- Department business hours: 30 rows, all 6 departments Mon-Fri 09:00-17:00
  (`America/Sao_Paulo` via tenant config). Weekends closed by absence of rows.
- Queue assignment policy: manual, department-scoped, disabled for auto-assign.
- Active flow: `cmtkhhxtq002p4spns3fp0yux`, `CRA-PR - Atendimento Institucional`,
  active=true, entryPoint=true, start=`consent`, 31 nodes,
  definition hash `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
- Flow visibility: CLOSED / CUSTOMER VALIDATED by CRA ADMIN Eduardo.
- Meta Cloud: phone `****7308`, WABA `****4194`, business `****8327`;
  readiness snapshot operational=true, phoneStatus=CONNECTED, objectAccess=true,
  platformType=CLOUD_API.
- Web Session: `****5595`, CONNECTED, owned authorization, durable auth secret
  configured.
- Webchat: no CRA webchat site/settings configured.
- Templates: none configured for CRA.
- Campaigns: none configured for CRA.
- Template requests: none configured for CRA.
- Approved CRA Utility copy found in repository/snapshot: no.
- Meta usage/billing/opt-out campaign evidence: no CRA campaign usage events,
  no `billing.active_message.delivered` events and no opt-out campaign events
  in the 2026-09-15 read-only snapshot.
- Production evidence: 4 WhatsApp conversations; 5 completed service snapshots;
  latest snapshot 2026-09-14; latest CSAT responded 2026-09-14.

## Evidence Levels

| Level | Meaning |
| --- | --- |
| E0 | no evidence |
| E1 | code/product capability only |
| E2 | automated/local test validated |
| E3 | tenant configured |
| E4 | production server-side validated |
| E5 | customer/user validated |
| E6 | contractual acceptance evidence |

## Readiness Scorecard

The scorecard below counts the original 52 CRA Contract/TR requirements. Rows
added later as follow-up backlog (`CRA-CAMP-002A`, `CRA-CAMP-002B`,
`CRA-MKT-001`) are tracked in the matrix but do not change the original
requirement denominator until owner decision or contract evidence promotes them.

| Status | Count |
| --- | ---: |
| TOTAL REQUIREMENTS | 52 |
| CLOSED / REAL VALIDATED | 14 |
| CLOSED / CUSTOMER VALIDATED | 1 |
| IMPLEMENTED / NEEDS CRA VALIDATION | 15 |
| CONTRACT ACCEPTANCE OPEN | 2 |
| CONFIG PENDING | 0 |
| CUSTOMER ACTION PENDING | 0 |
| CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING | 4 |
| EXTERNAL META DEPENDENCY | 4 |
| PRODUCT GAP | 1 |
| DOCUMENTATION/EVIDENCE GAP | 9 |
| NOT REQUIRED BY CONTRACT | 2 |

## Requirement Matrix

| REQ ID | SOURCE/CLAUSE | REQUIREMENT | CURRENT PRODUCT SUPPORT | CRA CONFIG | EVIDENCE | STATUS | CONTRACT PRIORITY | TECH PRIORITY | GAP | NEXT ACTION | OWNER | VALIDATION REQUIRED |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CRA-PLAT-001 | README objeto; proposta tecnica SaaS | Plataforma SaaS/web em nuvem | Next app, backend, PostgreSQL, PM2/VPS runbooks | Tenant ACTIVE | E4 | CLOSED / REAL VALIDATED | C1 | closed | No tenant gap | Keep health evidence in acceptance pack | RE7 | E6 acceptance artifact |
| CRA-WA-001 | README objeto; declaracao Meta | WhatsApp official / Meta Cloud API | Meta webhook, Cloud API, templates and status handling exist | Meta config present and operational | E4 | CLOSED / REAL VALIDATED | C0 | closed | Signed Meta evidence still separate | Attach official/API declaration and readiness evidence | RE7 | E6 |
| CRA-META-001 | resposta esclarecimento item 7 | Prove Meta official technical condition | Product supports official API operation | CRA has WABA/phone/business configured | E4 | EXTERNAL META DEPENDENCY | C1 | docs | Contractual proof package not signed/attached | Collect signed declaration, PJ verified/portfolio/access evidence | RE7 + Meta | E6 |
| CRA-CHAN-001 | README objeto; aderencia #4 | Centralized multichannel Inbox | Inbox supports channel origin and unified timeline | CRA only WhatsApp proven | E4 for WhatsApp, E1 for other channels | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 if source demands go-live | IG/FB/webchat not CRA-validated | Activate/validate each required channel | RE7 + CRA | E4/E5 per channel |
| CRA-WA-002 | aderencia #5 | WhatsApp receive/reply/history | Implemented | Configured | E4 | CLOSED / REAL VALIDATED | C0 | closed | None for WhatsApp | Keep smoke evidence | RE7 | E6 |
| CRA-IG-001 | resposta esclarecimento item 9 | Instagram Direct human-only in Inbox | Product capability documented | Not configured for CRA in snapshot | E1 | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING | C1 | deferred | CRA IG account connection absent by current customer sequencing | Reopen when customer confirms delivery window/assets | RE7 + CRA + Meta | E4/E5 |
| CRA-FB-001 | resposta esclarecimento item 9 | Facebook Messenger human-only in Inbox | Product capability documented | Not configured for CRA in snapshot | E1 | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING | C1 | deferred | CRA FB page/channel absent by current customer sequencing | Reopen when customer confirms delivery window/assets | RE7 + CRA + Meta | E4/E5 |
| CRA-WEB-001 | README objeto; plano implantacao | Site institutional / webchat widget | Product has webchat models/widget | No CRA webchat site/settings | E1 | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING | C1 | deferred | Tenant webchat disabled/unconfigured by current customer sequencing | Reopen when customer confirms site/embed delivery window | RE7 | E4 |
| CRA-WEB-002 | plano implantacao premise | Customer site must embed widget/script | Product can provide embed | Customer site action not evidenced | E0 | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING | C1 | deferred | CRA site deployment permission/action deferred | Provide embed package after customer delivery window | CRA | E5 |
| CRA-CHAN-002 | aderencia #9 | Identify channel of origin | Conversation channel/provider supported | WhatsApp evidence only | E4 WhatsApp | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P2 | Need multi-channel proof after IG/FB/webchat | Include channel filters in channel smoke | RE7 | E4 |
| CRA-HIST-001 | aderencia #10/#67 | Full history during term | Timeline and persistence implemented | WhatsApp conversations present | E4 | CLOSED / REAL VALIDATED | C1 | closed | Contract export evidence separate | Include timeline screenshot/export in acceptance pack | RE7 | E6 |
| CRA-HUM-001 | aderencia #11/#21 | Departments, queues and handoff sectors | Department/Queue/Handoff implemented | 6 departments, 6 queues | E4 | CLOSED / REAL VALIDATED | C0 | closed | None for configured departments | Preserve config snapshot | RE7 | E6 |
| CRA-HUM-002 | aderencia #12/#69 | Service status and SLA/current-state indicators | Runtime status and reports exist | CRA has operational conversations | E3/E4 partial | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | Specific CRA report screenshots/export missing | Validate report filters with CRA data | RE7 | E4/E5 |
| CRA-CHAT-001 | README objeto; aderencia #13/#16 | Chatbot menus and decision tree | ChatbotFlow supports structured menus/submenus | Active 31-node CRA flow | E4 | CLOSED / REAL VALIDATED | C0 | closed | Acceptance artifact still useful | Export final flow evidence | RE7 | E6 |
| CRA-CHAT-002 | aderencia #14/#15 | Buttons/lists/menu options | Product renders structured options; native list support depends channel | Flow configured | E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P2 | Native WhatsApp list/buttons not separately evidenced | Record exact channel rendering accepted by CRA | RE7 | E5 |
| CRA-CHAT-003 | aderencia #17 | Keywords/triggers for acionamento | Flow triggers/intents exist | Main flow starts at consent | E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C2 | P2 | Broad keyword catalog not configured/evidenced | Confirm whether source requires broad keyword list | CRA + RE7 | E5 |
| CRA-CHAT-004 | aderencia #18 | Automatic responses configured | Flow content configured | CRA flow active | E4 | CLOSED / REAL VALIDATED | C0 | closed | None for current flow | Preserve hash and source mapping | RE7 | E6 |
| CRA-CHAT-005 | proposta tecnica | No dependence on generative AI | Menu flow is deterministic | CRA flow deterministic | E4 | CLOSED / REAL VALIDATED | C2 | closed | None | State in acceptance pack | RE7 | E6 |
| CRA-CHAT-006 | production validation | Active flow visible/editable in tenant app | App/admin supports DB-backed flows | Customer validated by CRA ADMIN Eduardo | E5 | CLOSED / CUSTOMER VALIDATED | C0 | closed | None | Keep customer validation note | RE7 | E6 |
| CRA-HUM-003 | aderencia #20 | Human handoff and transfer to service | Handoff implemented | Flow routes to departments/queues | E4 | CLOSED / REAL VALIDATED | C0 | closed | None for WhatsApp | Preserve handoff smoke | RE7 | E6 |
| CRA-HUM-004 | aderencia #20/#22 | Claim/assign/transfer/reply/close | Inbox supports core operations | CRA production close/snapshots exist | E4 | CLOSED / REAL VALIDATED | C0 | closed | Transfer-specific CRA proof not isolated | Include transfer in next CRA smoke if required | RE7 | E4/E5 |
| CRA-PROT-001 | aderencia #24/#25/#26/#27/#28 | Protocol and continuation with anti-enumeration | Protocol/continuation implemented | Protocol snapshots exist | E4 | CLOSED / REAL VALIDATED | C1 | closed | Contractual evidence pack missing | Include protocol example with redaction | RE7 | E6 |
| CRA-AUD-001 | aderencia #30/#57 | Logs, events and audit trail | Events/logging/redaction implemented | CRA has events/snapshots | E3/E4 | IMPLEMENTED / NEEDS CRA VALIDATION | C2 | P2 | Formal audit trail export not packaged | Add redacted audit evidence to acceptance pack | RE7 | E6 |
| CRA-CAMP-001 | README objeto; aderencia #31 | Batch active WhatsApp dispatch | Campaign module exists; focused local campaign import/runner tests PASS | No CRA campaigns | E2 | CONTRACT ACCEPTANCE OPEN | C0 | P1 evidence | No CRA campaign configured/tested | Configure approved template and run controlled campaign only after owner approval | RE7 + CRA | E4/E5/E6 |
| CRA-TPL-001 | aderencia #32 | Official templates/HSM | Template request/admin/Meta submission pipeline audited | No CRA templates; approved copy not found | E1/E2 | CONTRACT ACCEPTANCE OPEN | C0 | P1 config | No CRA template/copy approved | Create request only after customer-approved Utility copy | RE7 + CRA + Meta | E4/E5/E6 |
| CRA-TPL-002 | aderencia #33 | Support creation/submission/follow-up | Product/process support exists; admin-only Meta submission path audited | Not evidenced for CRA | E1/E2 | EXTERNAL META DEPENDENCY | C1 | docs/ops | Meta approval process not executed for CRA | Run template submission tracker after copy approval | RE7 + Meta | E4/E6 |
| CRA-TPL-003 | resposta esclarecimento item 1/12 | Utility-only, no marketing | Product policy supports category controls; send paths re-check policy | CRA has no templates | E1/E2 | EXTERNAL META DEPENDENCY | C0 | P1 config | Utility classification depends Meta approval | Submit only approved Utility content; record category evidence | RE7 + Meta | E4/E6 |
| CRA-WA-003 | aderencia #35; declaracao Meta | No WhatsApp Web/API unofficial as main mechanism | Official Cloud API supported; Web Session is coexistence/ops below domain | Meta Cloud configured; Web Session connected separately | E4 | CLOSED / REAL VALIDATED | C0 | closed | Acceptance wording must explain coexistence | Include official API declaration and transport policy | RE7 | E6 |
| CRA-CAMP-002 | aderencia #36/#37 | Recipient import CSV/XLSX/API | Product has campaign/import-related capability documented | Not evidenced for CRA | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | CRA import workflow not proven | Run dry-run/import test with sanitized list | RE7 | E4 |
| CRA-CAMP-002A | follow-up owner requirement 2026-09-16; execution-truth correction 2026-09-22 | Campaign/contact import with optional `Situação no CRM`, no duplicate contacts and detailed import report | Contacts CSV remains the explicit CRM upsert/import path. Campaign CSV now resolves/validates same-tenant CRM situation for audience evidence but preview/draft/schedule/discard persists only campaign-owned private seed/components; Contact/Lead/CCI bootstrap and CRM status mutation are deferred until eligible effective campaign execution after preflight and provider attempt. Unknown/ambiguous status blocks row; detailed formula-safe report CSV remains exposed. Earlier production-deployed campaign-side CRM-upsert chronology is preserved, but current local follow-up changes it to execution-truth behavior before next deployment. | No real production CRA import and no CRA customer-data evidence yet | E3 local; E4 import not claimed | CONTACTS CSV IMPLEMENTED / CAMPAIGN CSV EXECUTION-TRUTH LOCAL FIX PREPARED / NOT DEPLOYED | C1 if CRA import acceptance needs CRM segmentation | P1 follow-up local pending owner/deploy; P2 sequential resolver performance remains | Chronology preserved: initial implementation; owner PARTIAL PASS; four-P1 principles block; corrective batch; principles audit PASS; owner revalidation PASS; canonical integration; production deploy; 2026-09-22 local execution-truth correction | Use only an approved sanitized CRA list for separately authorized evidence; do not claim CRA acceptance before deploy and controlled run | RE7 | E4/E6 |
| CRA-CAMP-002B | follow-up owner requirement 2026-09-16 | Contacts campaign relationship view: campaign count, last campaign/send/template, delivery/read/failure/skipped/blocked/opt-out state, CRM Situation and campaign/history navigation | Canonical integration complete: CRM list adds compact campaign summary and contact detail shows recent campaign history via canonical `Campaign`, `OutboundMessage` and campaign events; navigation reuses existing campaign detail route; no Contact shadow history, schema or migration; no financial fields in customer UX; focused regression 19/19 PASS plus backend/frontend builds PASS | Not deployed; no CRA customer evidence yet | E2/E3 local | CANONICALLY INTEGRATED / TEST VALIDATED / OWNER PASS / CLEAN DELIVERY PREPARED / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP | C1 evidence/supporting traceability | P1 local closed; production/CRA acceptance pending | Owner visual review PASS; controlled production delivery still pending | After owner pass, deploy through normal gate and validate Contacts traceability on approved CRA/Demo evidence without real send | RE7 | E4/E6 |
| CRA-CAMP-003 | aderencia #38/#39 | Segmentation and deduplication | Product supports recipient records and dedupe semantics | Not evidenced for CRA | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | No CRA list/dedupe evidence | Validate duplicated sample recipient handling | RE7 | E4 |
| CRA-CAMP-004 | aderencia #40/#41 | Variables and supported attachments/media/links | Templates/media supported subject to Meta policy | No CRA template/list mapping | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | No CRA variable/media template proof | Validate one utility template with variables | RE7 + Meta | E4/E5 |
| CRA-MKT-001 | follow-up owner requirement 2026-09-16 | Marketing template media support: MARKETING category, IMAGE/VIDEO headers, examples/media handles, buttons where supported, approval/rejection status/reason, send with approved template and current official Marketing pricing source | Not part of current Utility front; requires product/Meta audit | No CRA Marketing requirement evidenced for current acceptance | E0/E1 | P2 PRODUCT + META CAPABILITY / CONTRACT PROMOTION ONLY IF EVIDENCE REQUIRES | C3 unless contract evidence promotes | P2 | Do not mix Marketing media with Utility controlled campaign | Keep P2; if CRA Contract/TR explicitly requires Marketing media for acceptance, stop for owner decision and reclassify | RE7 + Meta | E2/E4 if promoted |
| CRA-CAMP-005 | aderencia #42/#43/#44 | Scheduling, test send, cancel/pause | Scheduling, cancel, pause, resume and test-send semantics exist; local lifecycle tests PASS | No CRA campaign evidence | E2 | IMPLEMENTED / NEEDS DEMO VALIDATION | C1 | P1 evidence | Contract evidence pending, not proven product gap | Validate exact lifecycle semantics on Demo controlled campaign before real send | RE7 | E4 |
| CRA-CAMP-006 | aderencia #45 | Delivery/error status and history | OutboundMessage/status handling exists; Demo B controlled Utility campaign created one local outbound, received Meta accepted/sent/delivered status and stored sanitized evidence | CRA real campaign messages not exercised; read status not observed | E4 Demo / E1 CRA | DEMO VALIDATED / CRA VALIDATION STILL NEEDED | C1 | P1 evidence | CRA customer sample still missing | Include Demo evidence in acceptance package; CRA real campaign only with customer-approved data/gate | RE7 | E4/E6 |
| CRA-OPT-001 | resposta esclarecimento item 10 | Opt-out with audit and campaign block | Demo E2E completed 2026-09-16: canonical `contact.opt_out.recorded`, blocked campaign before Meta, `campaign.recipient.opt_out_blocked`, `blockedCount=1`, Meta calls 0, real messages 0, outbound 0, billing 0, CSV evidence and canonical `contact.opt_out.revoked`; B restored eligible and A untouched | No CRA customer opt-out sample yet | E4 Demo / E1 CRA | DEMO VALIDATED / CRA VALIDATION STILL NEEDED | C0 | P1 evidence package | CRA customer acceptance still requires contract/customer package; do not overclaim from Demo test | Include Demo evidence in acceptance package; CRA-specific sample only with customer-approved scope | RE7 | E4/E6 |
| CRA-REP-001 | resposta esclarecimento item 11 | Export CSV/XLSX or equivalent; PDF report format | Phase E audit completed 2026-09-16: campaign CSV export, report CSV exports, usage/billing CSV reports and formatted report/PDF path audited; Demo A/B/opt-out evidence consolidated | CRA report package not customer-reviewed; native XLSX not claimed | E4 Demo / E1 CRA | DEMO REPORT/EXPORT EVIDENCE PACKAGE CREATED / CRA PACKAGE STILL NEEDED | C1 | P1 evidence | CRA acceptance export package still missing | Generate final redacted CRA acceptance pack; keep XLSX as CSV/open-equivalent conversion unless native support is proven | RE7 | E4/E6 |
| CRA-REP-002 | aderencia #50 | Monthly consumption report | Phase E audit confirmed Meta usage report/CSV and active-message report/CSV; Demo A=1 billable delivered Utility, B=1 billable delivered Utility, opt-out=0 billing | CRA monthly billing report not yet packaged/reviewed | E4 Demo / E1 CRA | DEMO MONTHLY USAGE/BILLING CAPABILITY VALIDATED / CRA REPORT STILL NEEDED | C1 | P1 evidence | CRA billing/report total not customer-approved | Build final monthly consumption evidence from CRA-approved scope and accepted unit price | RE7 | E4/E6 |
| CRA-BILL-001 | resposta esclarecimento items 1-6 | Bill only delivered utility templates outside 24h; read status no extra; Meta cost included in proposal; excedents same unit price with approval | Phase E read-only production evidence: A remains failed/reconciled with one outbound and one `billing.active_message.delivered`; B completed/delivered with one billing event; opt-out blocked before Meta with zero outbound/billing. Payload estimated Meta usage read-back showed `0.008` USD for A/B; prior narrow provider-rate evidence remains R$ 0,0350/message. Duplicate billing NO. | No CRA billing sample; CRA contractual BRL unit not proven; `R$ 0,32` is central planning reference, no tenant override/final proposal source found | E4 Demo / E1 CRA | DEMO DELIVERED BILLING ELIGIBILITY VALIDATED / CRA CONTRACT PRICE OPEN | C0 | P1 evidence | CRA contract billing unit and CRA report total not evidenced | Use Demo evidence for product capability; resolve CRA contract unit/report package separately; keep generic Meta pricing automation in P2 FinOps | RE7 | E6 |
| CRA-SLA-001 | aderencia #52; suporte SLA | Availability target 99.5% and operation except maintenance | Health/monitoring exists; SLA plan exists | Not acceptance-evidenced | E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Availability evidence and maintenance log missing | Prepare SLA evidence/runbook appendix | RE7 | E6 |
| CRA-SUP-001 | suporte SLA | Remote support, severity and response targets | Support process planned | Not customer-evidenced | E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Support channel/ticket evidence missing | Define channels and ticket register for CRA | RE7 + CRA | E6 |
| CRA-BKP-001 | proposta tecnica arquitetura | Backup/restore routine | Runbooks exist | CRA-specific restore evidence absent | E1 | DOCUMENTATION/EVIDENCE GAP | C2 | docs/ops | Backup cadence/retention proof not packaged | Attach backup/restore policy evidence | RE7 | E6 |
| CRA-USER-001 | aderencia #54/#55/#56/#77 | Up to 30 users, roles, auth/RBAC | Users/RBAC implemented | maxActiveAppUsers=30; 18 active users | E4 | CLOSED / REAL VALIDATED | C0 | closed | No capacity gap | Include snapshot in acceptance pack | RE7 | E6 |
| CRA-USER-002 | product governance | Active/inactive lifecycle safeguards | Users 2.0 and deactivation guard exist | No inactive CRA users | E2/E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C2 | P2 evidence | CRA inactive/reactivation path not exercised | Validate user lifecycle when operationally safe | RE7 | E4 |
| CRA-LGPD-001 | declaracao LGPD | Tenant isolation, RBAC, privacy and redaction | Implemented/documented | CRA tenant-scoped data | E4 | CLOSED / REAL VALIDATED | C0 | closed | Signed declaration/evidence still needed | Attach LGPD/security declaration | RE7 | E6 |
| CRA-LGPD-002 | declaracao LGPD item 9 | Retention, export/deletion policy | Product docs exist. Subject-level anonymization by canonical Contact and Lead-only subject is OWNER PASS / CLEAN DELIVERY DEPLOYED / PRODUCTION HEALTH VALIDATED with preview, strong confirmation, tenant scope, sanitized audit and privacy discovery that includes operationally excluded contacts without changing normal CRM visibility | CRA-specific retention/export/deletion evidence absent; no real anonymization was executed in production smoke and no CRA customer validation exists yet | E1/E2 product deployed | DOCUMENTATION/EVIDENCE GAP / SUBJECT ANONYMIZATION DEPLOYED / REAL ANONYMIZATION NOT EXECUTED | C1 | docs/ops | Contractual retention appendix, authenticated visual smoke and CRA customer evidence missing | Prepare CRA retention/export/deletion runbook; exercise approved non-destructive/authenticated smoke and do not claim CRA acceptance until validated on approved scope | RE7 | E6 |
| CRA-GOV-001 | declaracao LGPD/security | Internal/admin/support access governance | Admin/support access controls exist; hardening remains product watch | No CRA-specific support access evidence | E1 | DOCUMENTATION/EVIDENCE GAP | C2 | P2 docs | Least-privilege/audit evidence not packaged | Document current support access and residual hardening | RE7 | E6 |
| CRA-TRAIN-001 | plano implantacao | Remote training for users/key users | Training plan exists | Training evidence not in repo snapshot | E0/E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Attendance/material evidence missing | Record date, attendees, materials and acceptance | RE7 + CRA | E6 |
| CRA-IMPL-001 | plano implantacao | Implementation in up to 30 days | Plan exists | Tenant partially implemented | E3 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Formal implementation checklist/acceptance missing | Build go-live checklist from this matrix | RE7 | E6 |
| CRA-VOL-001 | comercial/readiness | 2,000 receptive conversations/month | Product expected to scale; tenant has 4 WhatsApp conversations | E1/E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | CRA volume not load/evidence validated | Run non-destructive capacity/readiness evidence | RE7 | E2/E6 |
| CRA-VOL-002 | comercial/readiness | 10,000 active utility messages/month | Campaign engine exists | No CRA templates/campaigns | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C0 | P1 evidence | Volume and cost controls not CRA-validated | Validate controlled campaign and monthly limit monitoring | RE7 | E4/E6 |
| CRA-META-002 | resposta esclarecimento item 8 | Meta assets operated by contractor and transferable to CRA | Operationally possible; depends Meta/business ownership | CRA Meta assets configured | E3 | EXTERNAL META DEPENDENCY | C1 | docs/legal | Transfer evidence/terms not attached | Formalize ownership/transfer clause and Meta evidence | RE7 + CRA + Meta | E6 |
| CRA-NO-MKT-001 | resposta esclarecimento item 12 | No marketing messages in scope | Product can avoid marketing | CRA no campaigns/templates | E3 | NOT REQUIRED BY CONTRACT | C3 | none | No marketing implementation needed for CRA readiness | Keep utility-only scope | RE7 | none |
| CRA-INACT-001 | Superseded interpretation | HUMAN waiting-on-customer 1h auto-close | Human conversations may remain open indefinitely under attendant control; no automatic 60-minute close is required | Not applicable | E2/E4 for BOT/flow lifecycle audit | NOT REQUIRED BY CONTRACT / SUPERSEDED | C3 | none | Old HUMAN 1h interpretation was stale; abandoned BOT/FLOW lifecycle already audited | Keep BOT/FLOW residuals as P2 hardening only | RE7 | none |

## Critical Contract Gaps

C0/C1 items that block declaring contractual readiness without qualification:

1. Active utility messaging is in CRA contract acceptance, not closed: Demo
   product evidence exists, but there is no approved CRA copy, no Meta-approved
   CRA template and no CRA customer sample.
2. Opt-out evidence is missing for CRA customer acceptance, even though Demo
   product capability is validated.
3. CRA customer reporting/export acceptance package is missing: Demo Phase E
   product evidence exists for CSV/open-equivalent exports, report/PDF path and
   billing quantity, but CRA samples and final contract billing reconciliation
   are not customer-reviewed.
4. Contract evidence package is incomplete for support/SLA, training attendance,
   backup/restore policy, LGPD/security declarations and Meta official proof.
5. Instagram, Facebook Messenger and site/webchat remain contract-required but
   are customer-deferred for the current execution phase.

## Channel Summary

| Channel | Required | Product Support | CRA Configured | Connected | Production Validated | Customer Validated | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WhatsApp | yes | yes | yes | yes | yes | operationally yes | CLOSED / REAL VALIDATED |
| Instagram Direct | yes, human-only | documented | no | no | no | no | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING |
| Facebook Messenger | yes, human-only | documented | no | no | no | no | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING |
| Site/Webchat | yes | yes | no | no | no | no | CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING |

## Chatbot / Flow Summary

- Active flow: `CRA-PR - Atendimento Institucional`.
- Flow ID: `cmtkhhxtq002p4spns3fp0yux`.
- Active/entryPoint: true/true.
- Definition hash: `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
- Guided/Advanced compatibility: product supports both; no corruption evidence
  for CRA-style flows.
- Menu structure: 31 nodes, consent start, hierarchical institutional menus.
- Human handoff: configured and production validated.
- Business hours: CONFIGURED / OPERATIONALLY VALIDATED, 6 departments Mon-Fri
  09:00-17:00.
- Flow visibility: CLOSED / CUSTOMER VALIDATED.
- Superseded flow interpretation: HUMAN waiting-on-customer 1h auto-close is
  not a product requirement. Human conversations may remain open indefinitely
  under attendant control. The actual abandoned automation front is BOT/FLOW
  lifecycle: resetAfterMinutes, stale pending question reset and Web Session
  inactivity handoff have been validated; residual cross-provider hardening and
  Guided lifecycle-policy exposure remain P2.

Recipient B-only Utility gate, 2026-09-16: COMPLETED AS DEMO PRODUCT CAPABILITY
VALIDATION. The owner explicitly authorized exactly one Utility send to B
`****6787`. Campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214` used persisted
tenant-scoped IDs for `Atendimento Geral` -> `Fila Geral`; no name-based routing
rule was introduced. Result: one Meta call, accepted, sent webhook 1, delivered
webhook 1, read 0, failed 0, one local OutboundMessage, one
`billing.active_message.delivered`, no duplicate billing, no A resend. Evidence:
`PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md` and `.csv`.

## Current Execution Order

1. Campaign/CRM import `Situação no CRM` upsert/report follow-up.
2. Contacts campaign relationship view owner pass and production gate.
3. Final reports/exports/billing package with CRA-approved scope and unit price.
4. Acceptance pack.
5. Deferred channels only after customer delivery window is confirmed:
   Instagram Direct, Facebook Messenger and Website/Webchat.

Marketing media template support remains a parallel P2 unless contract evidence
promotes it to the CRA contract front.

No broad campaign, Meta template submission or real Meta outbound is authorized
by this document without approved customer copy and explicit owner approval. A
real send requires approval covering template, recipients, send window, expected
cost, campaign name and number of messages.

## Next Contractual Actions

| # | REQ ID | Action | Why Now | Blocker | Code? | Config? | Customer Action? | Meta Action? | Done Criteria |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | CRA-TPL-001 / CRA-CAMP-001 / CRA-BILL-001 | Configure one Utility template and run controlled campaign/billing smoke | Current owner-approved execution front | Customer-approved CRA copy, Meta approval and explicit send approval | no, unless missing control proven | yes | content/recipient/window/cost approval | yes | Delivered Utility template evidence and billing report |
| 2 | CRA-REP-001 / CRA-REP-002 | Generate CRA report/export package | Acceptance needs evidence, not only code capability | Representative sample data | no | no | review | no | CSV/PDF/equivalent exports with filters and billing report |
| 3 | CRA-CAMP-002A | Controlled production deployment preparation for owner-approved CRM situation import/upsert/report support | CRA campaign import enhancement after core Utility/report gates | Local implementation, principles audit, focused tests and owner revalidation PASS | no | no | production change gate; CRA evidence remains separate | no | Deploy the preserved audited delta, then verify existing contact update, blank preservation, unknown-status blocking, repeated-row consolidation and downloadable report without real send |
| 4 | CRA-CAMP-002B | Owner-review and deliver Contacts campaign relationship view | Campaign/contact traceability and acceptance evidence | Canonical integration and focused tests PASS | no unless owner finds issue | no | owner PASS; CRA evidence review after deploy | no | Contact list shows aggregate campaign state without N+1; expanded/detail shows campaign history from canonical records; no Contact shadow history; no financial UX |

Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
PASS / NO DEPLOY. This does not reopen CRA-CAMP-002B or campaign
result-truth acceptance. It reduces redundant CRM/Campaigns UI: clickable rows,
compact right-aligned actions, full phone in authenticated same-tenant CRM,
switch-based active-send block, one expandable related-campaign group, row-only
Contact list Delete with no detail-level Delete action, Campaigns tab counts,
row-click detail, distinct detail counters and no technical
provider/persistence note. Campaign detail filters result rows by result
status, same-tenant CRM Situation and name/phone, supports filtered copy and can
prefill a new draft through the existing composer from current canonical
contacts only; historical rows without current reusable contact are excluded
with explicit count. Dynamic CRM-filter scheduled campaigns are documented as
OWNER PASS / LOCAL VALIDATED / NOT DEPLOYED in
`docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`: schedule-time stores the
CRM Situation filter and execution-time creates one immutable snapshot. No
schema/migration, no real send, no financial UX and no campaign/history rewrite.

Contacts/Campaigns phone/import finishing, 2026-09-19: OWNER PASS / DEPLOYED /
PRODUCTION NON-DESTRUCTIVE VALIDATED. Contact list delete keeps the active-conversation guard
with closable toast; Contact detail no longer repeats the active-conversation
warning/action block; `Abrir campanha` opens the exact campaign detail. Contact
CSV preview/confirm now exposes detailed totals and row-level error evidence.
Permanent invariant recorded for CRA readiness: NO NEW CONTACT/RECIPIENT PHONE
MAY BE PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION. This strengthens
CRA import/result-truth evidence but does not change formal CRA acceptance status
without an approved CRA run. Contacts CSV now supports `Situação no CRM` locally,
resolved only against existing same-tenant CRM statuses, with invalid values
blocked before persistence and blank values preserving/defaulting by canonical
CRM semantics.

Production validation was non-destructive on `demo-converta`: Contact CSV preview
and Campaign CSV preview left Contact, Lead, Campaign and Outbound counts
unchanged, with no real send, provider call or billing mutation. This improves
CRA readiness evidence but does not replace a CRA-approved customer acceptance
run.

Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
VALIDATED / NOT DEPLOYED. The local Contacts import workflow now matches the
Campaign CSV visual/import language and records preview validity against the
exact selected columns for phone, name and same-tenant CRM Situation. Mapping
changes keep the old preview visible but stale, block import, and require
`Atualizar prévia` before any persistence path is enabled. No schema, migration,
provider call, real send, cross-tenant CRM status, duplicate-contact creation or
invalid-phone persistence is introduced.
| 5 | CRA-SLA-001 / CRA-TRAIN-001 / CRA-LGPD-002 | Close documentary acceptance pack | Contractual readiness requires signed/evidenced operations | Dates/attendees/signatures | no | no | yes | possible Meta docs | SLA, support, training, LGPD/security, backup and Meta proof attached |
| 6 | CRA-IG-001 / CRA-FB-001 / CRA-WEB-001 | Activate and validate Instagram, Facebook and webchat | Contract-required but customer-deferred | Customer delivery window/assets/site access | no, unless bug found | yes | yes | yes for Meta channels | E4/E5 evidence per channel |

## Backlog Reconciliation

- CRA active flow visibility: CLOSED / CUSTOMER VALIDATED. Do not reopen.
- CRA business hours: CONFIGURED / OPERATIONALLY VALIDATED. Do not reopen.
- CRA WhatsApp/handoff/Inbox/close/CSAT validation: CLOSED / REAL VALIDATED.
- CRA Utility readiness audit: CLOSED; contract acceptance remains OPEN pending
  customer-approved copy, Meta approval, controlled recipient approval and
  evidence capture. No real send executed.
- CRA Demo contract validation: PHASE B OWNER GATE PREPARED / NO REAL SEND.
  Demo is a
  multitenant product mirror for generic capability evidence only; it does not
  close CRA customer acceptance, CRA billing acceptance, CRA template approval
  or customer-deferred channels.
- CRA Demo Phase C controlled Utility gate: PREPARED / OWNER REAL-SEND APPROVAL
  PENDING / NO REAL SEND. Owner authorized known Demo/RE7 recipient finals
  `9614` and `6787`; read-back confirms Demo ACTIVE, template `data_exame`
  approved, Meta config present, Web Session connected, migrations up to date,
  both recipients outside 24h and no active opt-out found. Final unique targets:
  2. Expected reference cost is now PAUSED FOR BILLING UNIT RECONCILIATION; the
  previous R$ 0,64 was a central planning reference, not a proven final CRA
  contract unit. Evidence remains gate-level until real outbound, billing unit
  and execution window are explicitly approved. This broad two-recipient gate was
  superseded for B by the owner-approved one-recipient controlled send below.
- CRA Demo Phase C controlled send: PARTIAL REAL META ACCEPTANCE / PRODUCT
  ISSUE FOUND / STOP. Campaign `d9874c03-10e8-4061-a92e-6caa7b3001c3` accepted
  one Meta Utility template for `****9614`, then failed with
  `default_operational_department_missing` before OutboundMessage, ledger and
  report persistence; `****6787` was not sent. Recipient A reconciliation audit
  on 2026-09-15 found a safe constrained repair path and the owner approved the
  data repair. Production repair created exactly one local outbound for A from
  exact Meta evidence, replayed delivered Utility billing idempotently, set
  aggregate `sentCount=1`, kept campaign `status=failed`, and recorded a manual
  audit event. A was never resent. Recipient B was later sent only through the
  separate B-only campaign approved on 2026-09-16. This closes Recipient A local
  reconciliation and Demo B product capability evidence; CRA campaign
  reporting/export acceptance and CRA contract billing unit still require
  separate gates. A ledger is correct as delivered Utility eligibility/count,
  but the BRL amount must not be treated as final CRA contractual unit until the
  commercial source is reconciled.
- Residual CRA contract readiness must now be tracked through this matrix.
- The remaining highest-risk gaps are contractual/configuration/evidence gaps,
  not a reason to reopen already closed flow or business-hours fronts.

## Canonical identity delivery gate - 2026-09-17

The Meta inbound/capture and campaign CRM bootstrap exact-identity bypasses are
deployed and production non-destructive validated through the existing
tenant-scoped canonical resolver. Production advanced by FF-only from
`cad9489c` to `ed329ec8`; backend build, targeted agent reload, health/DB and
read-only endpoint/module checks passed. The delivery contains no Queue
implementation, schema, migration, backfill or production data repair. A real
post-deploy identity event remains pending natural or separately authorized
evidence.

Operational Queue is CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.
Campaign UX remains owner PASS; Department-only destination and exact internal
Queue persistence are deployed. The 54-department matrix and final owner
decisions are documented in
`docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md` and
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`. Production
rollout on 2026-09-18 advanced by FF-only to
`b166bcac8bf443d34ba7f3821016b6bae8069728`, applied migration
`20260917213000_add_department_operational_queue`, reconciled 44 explicit
mappings, created/linked 2 owner-approved internal queues and ended with 0
active unresolved departments. Demo `****6787` remains a separate repair gate.
This is product evidence, not CRA customer acceptance of duplicate prevention.

Campaign UX / result truth integration, 2026-09-18: INTEGRATED LOCAL / OWNER
REVALIDATION PENDING / NO DEPLOY. The recovered approved delta now sits on the
canonical Operational Queue baseline. Standard campaign UX remains
Department-only, with Queue internal via `Department.operationalQueueId`;
customer-facing campaign and Inbox template screens do not expose price/cost
tariff data; persisted lifecycle tabs include `Enviando`, `Agendadas` and
`Concluídas`; campaign detail renders recipient-level blocked/skipped/pending
and opt-out result states from persisted events/data. No CRA customer send,
no production deploy, no schema/migration and no `****6787` mutation occurred.
Final local audit of Demo `Campanha teste set.2` proved that its repeated
recipient line was a detail projection/fallback issue, not a duplicate send.
The corrected authenticated detail reconciles one current result per intended
recipient where possible, exposes the full phone, preserves draft/review
masking and classifies delivered plus blocked as partial delivery.
Read-only end-to-end closure also proved why `****9614` did not send: the
canonical resolver found two Demo Contact candidates and one Lead and blocked
before provider with `identity_conflict`. This is historical duplicate residue
from the campaign bootstrap that predates Identity P1, not a template,
opt-out, routing or provider failure. Current code did not reproduce a new
duplicate factory, but the recipient remains ineligible until a separately
authorized transactional repair. Canonical expected counters are total 2,
delivered 1, blocked 1, pending 0 and technical failures 0. Validation: UI
contract 9/9 PASS, `campaignsFeatureRoutes.test.ts` 115/115 PASS and focused
identity-path matrix 106/106 PASS. No CRA send, production mutation or deploy.

Campaign composition lifecycle, 2026-09-18: IMPLEMENTED LOCAL / OWNER REVIEW
PENDING / NO DEPLOY. Abandoning an unsaved CRM/CSV/manual composition now
clears all client-transient campaign data through one dirty/reset contract.
Preview does not persist server records. Explicit drafts and Campaigns already
scheduled, sending or completed remain protected, and closing progress does
not stop execution. CSV CRM upserts occur only at explicit draft creation and
remain canonical. This strengthens CRA campaign operational traceability; it
does not constitute CRA customer acceptance or a real send.

Campaign Result Truth P1 12/13 reconciliation, 2026-09-18: VALIDATED LOCAL AND
READ-ONLY / OWNER REVIEW READY / NO DEPLOY. The earlier synthetic gate missed
the real persisted representation and production validation exposed a false
missing-history failure for `****6787`. The corrected read model reuses the
canonical Identity P1 candidate set and leaves all history unchanged. Replay
of the actual Demo campaign records returns exactly 2 outcomes: delivered
`****6787`, blocked `****9614`, 0 technical failures and `Entrega parcial`.
This strengthens CRA recipient traceability evidence but is not CRA customer
acceptance. Backend 118/118, complementary matrices 56/56 and 72/72 PASS;
schema unchanged, migration none, no send, repair or deploy.

Campaign flow integrity review, 2026-09-21: IMPLEMENTED LOCAL / VALIDATED /
NO DEPLOY. The campaign CSV contract is now operator-stable and CRA-auditable:
`Contato` identifies the recipient, `Campo 1`, `Campo 2` and `Campo 3` carry
template values, and those generic fields do not update CRM name or CRM
situation. Authenticated preview/report uses full normalized WhatsApp numbers
and one table for ready, blocked and error rows, with copy/export evidence.
Campaign names are unique inside each tenant after normalized comparison.
Persisted seed truth governs draft reopen, explicit send, scheduling and
runner execution. Test sends for variable templates require explicit values for
non-recipient test numbers and stop before provider calls when incomplete. CRM
campaign history remains based on real send evidence only; draft/import/test
and scheduled-not-run records are excluded. This supports CRA traceability and
operator evidence, but remains local product validation, not formal CRA
acceptance.

Campaign flow follow-up, 2026-09-22: LOCAL FIX PREPARED / NOT DEPLOYED. Owner
feedback expanded the generic Campaign CSV fields to `Campo 1` through
`Campo 10`, with `Contato` remaining required. Only mapped generic fields can
source template variables, CSV column mapping is visually separated from
message-variable mapping, preview errors/blocks have copyable evidence, and
authenticated draft detail shows full WhatsApp identifiers. Static CSV seeds
with complete per-recipient `componentsByWaId` and empty
`templateVariableMappings` are valid for send/schedule without repairing
historical DB rows; dynamic CRM-filter campaigns still require canonical
variable mappings. This keeps CRA-CAMP-002/004 as product-local readiness and
does not claim CRA formal acceptance.

Campaign execution truth + CRM UX follow-up, 2026-09-22: LOCAL FIX PREPARED /
NOT DEPLOYED. Campaign CSV no longer performs CRM upsert during preview, draft
creation, scheduling or discard; it persists only campaign-owned private seed
and components until eligible runtime execution. Contact/Lead/CCI bootstrap is
deferred to effective send execution after preflight and provider attempt, so
blocked-before-send and never-sent campaigns do not create contacts or campaign
history. CRM-filter preview is eligible-only, hides blocked contacts from
counts/table, removes the operator-facing "Envio ativo" selector and shows full
authenticated identifiers. Result filters, mapping controls, campaign reuse and
Contacts CSV preview alignment were locally corrected. CRA formal acceptance is
not claimed before deployment and controlled CRA evidence.

CRM origin + Contacts CSV + campaign block guards, 2026-09-23: DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING. The CRM read model
records inbound-origin contacts as
`Atendimento / conversa` through existing provenance events, Contacts CSV maps
phone plus optional name, CRM situation, company, city, email and
service/interest, and blank/unmapped optional values preserve existing data.
`NEW` is a mandatory active CRM status and does not create campaign
ineligibility by itself. Campaign manual/CSV and Inbox template paths preserve
pre-provider active-send/opt-out guards and remove customer billing notices.
This strengthens CRA-CAMP-002, CRA-OPT-001 and CRM traceability readiness;
formal CRA acceptance still requires controlled CRA evidence. Production deploy
reached head `2a652e693a4bce5cfaa7e0a1fa5ef667537f154a` with health PASS and
no smoke provider call or real campaign send; authenticated owner UI and real
CRA CSV/campaign evidence remain not exercised.

P1 campaign delivery truth + alias-safe blocking, 2026-09-23: LOCAL FIX
VALIDATED / NOT DEPLOYED. CRA campaign evidence must distinguish provider
accepted/submitted from delivered/read. Inbox Conversation/Runtime
materialization is now gated by delivered/read webhook evidence; provider
acceptance alone is not enough to classify a recipient as delivered or
Inbox-ready. Campaign CSV phone mapping preserves arbitrary headers and requires
explicit mapping when no safe alias is detected. Opt-out/send-block evaluation
is alias-safe across Brazilian 12/13 digit identities, and Meta reaction-only
webhooks are non-content events. `Campaign.sentCount` remains legacy
submitted/accepted count, not delivered/read/final success evidence. Real
`****6683` controlled repair remains pending for campaign
`ad354ce4-35dc-4fca-85e5-3108cc9a2332` and conversation
`9a07b043-6657-4dc3-9e7f-2b904caf939c`. Campaign RBAC/active-send
authorization is a separate P1 backlog item, not implemented here. This
strengthens CRA-CAMP/CRA-OPT evidence rules but does not claim formal CRA
acceptance, production repair, provider call, real send or deploy.
