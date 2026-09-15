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
billing. This closes the generic product bug, but does not close CRA campaign
acceptance, recipient A reconciliation, recipient B send, opt-out E2E or
report/export/billing evidence.

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
| CRA-CAMP-003 | aderencia #38/#39 | Segmentation and deduplication | Product supports recipient records and dedupe semantics | Not evidenced for CRA | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | No CRA list/dedupe evidence | Validate duplicated sample recipient handling | RE7 | E4 |
| CRA-CAMP-004 | aderencia #40/#41 | Variables and supported attachments/media/links | Templates/media supported subject to Meta policy | No CRA template/list mapping | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | No CRA variable/media template proof | Validate one utility template with variables | RE7 + Meta | E4/E5 |
| CRA-CAMP-005 | aderencia #42/#43/#44 | Scheduling, test send, cancel/pause | Scheduling, cancel, pause, resume and test-send semantics exist; local lifecycle tests PASS | No CRA campaign evidence | E2 | IMPLEMENTED / NEEDS DEMO VALIDATION | C1 | P1 evidence | Contract evidence pending, not proven product gap | Validate exact lifecycle semantics on Demo controlled campaign before real send | RE7 | E4 |
| CRA-CAMP-006 | aderencia #45 | Delivery/error status and history | OutboundMessage/status handling exists | No CRA campaign messages | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | Needs CRA campaign sample | Validate accepted/delivered/failed status with template test | RE7 | E4 |
| CRA-OPT-001 | resposta esclarecimento item 10 | Opt-out with audit and campaign block | Operational event/blocking support documented | No CRA opt-out sample | E1/E2 | DOCUMENTATION/EVIDENCE GAP | C0 | P1 evidence | Contractual opt-out evidence missing | Execute redacted opt-out/campaign-block smoke | RE7 | E4/E6 |
| CRA-REP-001 | resposta esclarecimento item 11 | Export CSV/XLSX or equivalent; PDF report format | CSV reports exist; PDF where applicable; XLSX via equivalent/conversion | CRA reports enabled | E1/E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | CRA export samples missing | Generate redacted CSV/PDF/equivalent evidence | RE7 | E4/E6 |
| CRA-REP-002 | aderencia #50 | Monthly consumption report | Meta usage report/CSV documented | No CRA campaign usage | E1 | IMPLEMENTED / NEEDS CRA VALIDATION | C1 | P1 evidence | Needs CRA utility-delivered sample | Validate monthly report with controlled campaign | RE7 | E4 |
| CRA-BILL-001 | resposta esclarecimento items 1-6 | Bill only delivered utility templates outside 24h; read status no extra | Semantics documented in product docs | No CRA billing sample | E1 | DOCUMENTATION/EVIDENCE GAP | C0 | P1 evidence | Contract billing reconciliation not evidenced | Produce billing proof from controlled delivered utility template | RE7 | E6 |
| CRA-SLA-001 | aderencia #52; suporte SLA | Availability target 99.5% and operation except maintenance | Health/monitoring exists; SLA plan exists | Not acceptance-evidenced | E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Availability evidence and maintenance log missing | Prepare SLA evidence/runbook appendix | RE7 | E6 |
| CRA-SUP-001 | suporte SLA | Remote support, severity and response targets | Support process planned | Not customer-evidenced | E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Support channel/ticket evidence missing | Define channels and ticket register for CRA | RE7 + CRA | E6 |
| CRA-BKP-001 | proposta tecnica arquitetura | Backup/restore routine | Runbooks exist | CRA-specific restore evidence absent | E1 | DOCUMENTATION/EVIDENCE GAP | C2 | docs/ops | Backup cadence/retention proof not packaged | Attach backup/restore policy evidence | RE7 | E6 |
| CRA-USER-001 | aderencia #54/#55/#56/#77 | Up to 30 users, roles, auth/RBAC | Users/RBAC implemented | maxActiveAppUsers=30; 18 active users | E4 | CLOSED / REAL VALIDATED | C0 | closed | No capacity gap | Include snapshot in acceptance pack | RE7 | E6 |
| CRA-USER-002 | product governance | Active/inactive lifecycle safeguards | Users 2.0 and deactivation guard exist | No inactive CRA users | E2/E3 | IMPLEMENTED / NEEDS CRA VALIDATION | C2 | P2 evidence | CRA inactive/reactivation path not exercised | Validate user lifecycle when operationally safe | RE7 | E4 |
| CRA-LGPD-001 | declaracao LGPD | Tenant isolation, RBAC, privacy and redaction | Implemented/documented | CRA tenant-scoped data | E4 | CLOSED / REAL VALIDATED | C0 | closed | Signed declaration/evidence still needed | Attach LGPD/security declaration | RE7 | E6 |
| CRA-LGPD-002 | declaracao LGPD item 9 | Retention, export/deletion policy | Product docs exist | CRA-specific retention evidence absent | E1 | DOCUMENTATION/EVIDENCE GAP | C1 | docs/ops | Contractual retention appendix missing | Prepare CRA retention/export/deletion runbook | RE7 | E6 |
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

1. Active utility messaging is in contract acceptance, not closed: no approved
   CRA copy, no Meta-approved CRA template, no controlled campaign sample and
   no billing evidence for delivered utility template outside 24h.
2. Opt-out evidence is missing for CRA acceptance, even though the product has
   an operational path.
3. Reporting/export acceptance package is missing: CRA samples for CSV/PDF and
   XLSX-equivalent workflow, plus monthly consumption/billing reconciliation.
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

## Current Execution Order

1. Utility template and controlled campaign acceptance.
2. Opt-out evidence.
3. Reports, exports and billing evidence.
4. Acceptance pack.
5. Deferred channels only after customer delivery window is confirmed:
   Instagram Direct, Facebook Messenger and Website/Webchat.

No broad campaign, Meta template submission or real Meta outbound is authorized
by this document without approved customer copy and explicit owner approval. A
real send requires approval covering template, recipients, send window, expected
cost, campaign name and number of messages.

## Next Contractual Actions

| # | REQ ID | Action | Why Now | Blocker | Code? | Config? | Customer Action? | Meta Action? | Done Criteria |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | CRA-TPL-001 / CRA-CAMP-001 / CRA-BILL-001 | Configure one Utility template and run controlled campaign/billing smoke | Current owner-approved execution front | Customer-approved CRA copy, Meta approval and explicit send approval | no, unless missing control proven | yes | content/recipient/window/cost approval | yes | Delivered Utility template evidence and billing report |
| 2 | CRA-OPT-001 | Produce opt-out and campaign-block evidence | Official clarification accepts operational opt-out if auditable | Test contact/list | no, unless block path fails | yes/test data | approve test | no | Opt-out event, block before campaign, exportable evidence |
| 3 | CRA-REP-001 / CRA-REP-002 | Generate CRA report/export package | Acceptance needs evidence, not only code capability | Representative sample data | no | no | review | no | CSV/PDF/equivalent exports with filters and billing report |
| 4 | CRA-SLA-001 / CRA-TRAIN-001 / CRA-LGPD-002 | Close documentary acceptance pack | Contractual readiness requires signed/evidenced operations | Dates/attendees/signatures | no | no | yes | possible Meta docs | SLA, support, training, LGPD/security, backup and Meta proof attached |
| 5 | CRA-IG-001 / CRA-FB-001 / CRA-WEB-001 | Activate and validate Instagram, Facebook and webchat | Contract-required but customer-deferred | Customer delivery window/assets/site access | no, unless bug found | yes | yes | yes for Meta channels | E4/E5 evidence per channel |

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
  2. Expected reference cost: R$ 0,64. Evidence remains gate-level until real
  outbound is explicitly approved and executed.
- CRA Demo Phase C controlled send: PARTIAL REAL META ACCEPTANCE / PRODUCT
  ISSUE FOUND / STOP. Campaign `d9874c03-10e8-4061-a92e-6caa7b3001c3` accepted
  one Meta Utility template for `****9614`, then failed with
  `default_operational_department_missing` before OutboundMessage, ledger and
  report persistence; `****6787` was not sent. Recipient A reconciliation audit
  on 2026-09-15 found a safe constrained repair path pending owner approval:
  reconstruct only A's local outbound from exact Meta evidence, replay delivered
  billing idempotently, set aggregate `sentCount=1`, and keep campaign
  `status=failed`. This was not applied and does not elevate billing/reporting
  rows to closed evidence. Separate owner gate required before any repair or
  remaining send.
- Residual CRA contract readiness must now be tracked through this matrix.
- The remaining highest-risk gaps are contractual/configuration/evidence gaps,
  not a reason to reopen already closed flow or business-hours fronts.
