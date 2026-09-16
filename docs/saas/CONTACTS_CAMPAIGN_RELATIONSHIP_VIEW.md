# Contacts Campaign Relationship View

Status: OPEN / CRA CAMPAIGN-CRM FOLLOW-UP.

Last updated: 2026-09-16.

This document defines a future product contract. It does not implement code,
change runtime behavior, add a schema or authorize real sends.

## Goal

Expose campaign-related history and state inside the Contacts/CRM area without
duplicating campaign source-of-truth data.

For each contact, when applicable, show:

- campaign count;
- last campaign;
- last campaign send timestamp;
- template used;
- delivery status;
- read status, if available;
- failed reason, if applicable;
- opt-out status;
- skipped/blocked reason;
- CRM Situation;
- campaign/history detail navigation.

## Canonical Source

Use campaign, outbound, billing, opt-out and event records already persisted by
the platform.

Do not create a shadow campaign-history model inside Contact.

The Contacts surface may expose a projection/read model, but campaign source of
truth remains in the existing campaign/outbound/billing/opt-out records.

## Multitenant Rules

Mandatory:

- same tenant only;
- no cross-tenant campaign aggregation;
- no cross-tenant opt-out lookup;
- no cross-tenant contact matching;
- never expose another tenant's campaign, template, billing or delivery data.

## Performance Contract

Avoid N+1 per contact row.

Preferred shape:

- aggregate/list projection for the contact list;
- on-demand expanded detail for campaign history;
- reuse existing indexes and query patterns where possible;
- defer heavy detail joins until the operator expands or navigates.

## UX Contract

Use the approved expandable administrative-row pattern where appropriate:

- compact contact row with high-signal campaign summary;
- expanded/detail area for campaign history;
- one-row expansion rules where consistent with existing CRM UX;
- navigation from contact to campaign/history detail.

Do not duplicate full campaign management UI inside Contacts.

## CRA Relevance

This supports campaign/contact traceability and acceptance evidence:

- proving which campaigns touched a contact;
- seeing delivery/read/failure/skipped/blocked context;
- reconciling opt-out and CRM Situation;
- navigating from contact evidence to campaign evidence.

This is separate from:

- approved outbound return destination delivery;
- Recipient B controlled Utility validation;
- opt-out E2E;
- reports / exports / billing closure;
- CRM import/upsert/report with `Situação no CRM`.
