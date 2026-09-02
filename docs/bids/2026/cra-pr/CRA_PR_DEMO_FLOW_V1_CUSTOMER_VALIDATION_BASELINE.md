# CRA-PR Demo Flow V1 - Customer Validation Baseline

Status: frozen evidence for CRA-PR customer validation.

Captured from production on: 2026-09-01T01:23:44.023Z

Local time reference: 2026-08-31 22:23 America/Fortaleza

## Flow

- Tenant: `demo-converta`
- Tenant name: Converta Demo
- Tenant status: ACTIVE
- Flow: CRA-PR - Atendimento Institucional (Demo)
- Flow ID: `cmtg2g15t003d4sjghwhina8b`
- Active: true
- Entry point: true
- Start node: `consent`
- Node count: 31
- Persisted flow updatedAt: 2026-09-01T01:18:59.823Z

## Fingerprint

Canonical definition file:

`docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`

CRA Demo V1 SHA-256:

`f8660e5ee50fac947ed905b84acc9597c15e7d4c10cd66b2fd672f5f4092e486`

The hash is computed over the sanitized canonical flow definition JSON with deterministic key ordering.

## Source Manifest

Source priority:

1. Latest CRA spreadsheet.
2. CRA written clarification.
3. Supplemental flow PDF.
4. Manually collected legacy CRA flow content and UX.
5. Existing Demo approximation.

Sources used:

- CRA spreadsheet: `Usuários Converta DEA (1).xlsx`, latest local copy available during capture. The requested `(2)` copy was not found locally.
- CRA supplemental PDF: `Usuários Converta DEA - Fluxo.pdf`.
- CRA written clarification: Eventos maps to Relações Institucionais.
- Legacy collected flow evidence: visual conventions, Registro links/guidance, Cobrança menu structure, out-of-hours semantics, known legacy bug list.
- Converta UX adaptation: structured menu rendering, LGPD prompt behavior, deterministic navigation/state handling.

Latest CRA material overrides recorded in the flow metadata:

- Fiscalização option 2 uses latest supplied `Acerto Técnico, Atestado e RCA` wording.
- Cobrança option 4 routes to Cobrança, not the legacy Eventos bug.
- Eventos routes to Relações Institucionais per CRA clarification.

Legacy content intentionally discarded:

- Global `#` back command, to avoid hidden navigation/state drift.
- Manual menu option blocks, because the engine renders structured options.
- Cobrança option 4 to Eventos, known legacy bug.
- Generic inactivity workaround; waiting-on-customer 1h remains a product gap.

## Acceptance Manifest

Current PASS state:

- LGPD consent prompt.
- First inbound initializes consent once and does not validate the same inbound as a menu answer.
- Main menu.
- Registro PF.
- Registro PJ.
- Registro PF/PJ automatic messages match latest CRA spreadsheet/PDF content.
- Fiscalização.
- Cobrança.
- Cobrança > Emissão de boleto matches latest approved automatic response.
- Eventos routes to Relações Institucionais.
- Concurso Público matches latest approved Instituto Consulplan guidance.
- Licitações contact information matches supplied CRA material.
- Jurídico contact information matches supplied CRA material.
- RH contact information matches supplied CRA material.
- Contábil contact information matches supplied CRA material.
- TI handoff.
- Gabinete handoff.
- `0` navigation to Main Menu.
- `9` navigation to previous menu where explicitly configured.
- `9` on Registro terminal informational pages routes to Registro human handoff.
- Invalid input stays on the displayed menu and redisplays the same options.
- State synchronization across repeated transitions.
- Out-of-hours semantics: self-service remains available and human service is communicated as Mon-Fri 09:00-17:00.
- Known legacy bug removal.
- Multitenant isolation.

## Known Gap

WAITING-ON-CUSTOMER 1H: NOT IMPLEMENTED.

Reason: the current generic product behavior does not safely distinguish responsibility on the citizen from generic inactivity. V1 does not emulate this with a generic inactivity workaround.

## Scope Confirmation

- Flow configuration mutation during freeze: none.
- CRA real tenant: unchanged.
- SECULT: unchanged.
- Code: unchanged.
- Database business data: unchanged, except this document is a repository evidence artifact.
- No secrets, tokens, credentials, channel auth state, customer phone data, or production message data are included in the canonical export.
