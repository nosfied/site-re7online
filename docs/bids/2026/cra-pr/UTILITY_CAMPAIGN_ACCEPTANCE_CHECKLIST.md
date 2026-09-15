# CRA-PR Utility Campaign Acceptance Checklist

Status: LOCAL / CONTROLLED CAMPAIGN READINESS. This document does not authorize
real outbound traffic.

Last updated: 2026-09-15.

## Purpose

Prepare CRA-PR for the first controlled real WhatsApp Utility-template campaign
without sending a broad campaign and without bypassing Meta, tenant isolation,
opt-out, billing or owner approval gates.

## Current Production Snapshot

Read-only production snapshot on 2026-09-15:

- tenant: `cra-pr`, ACTIVE, profile `government`;
- features: `campaigns=true`, `templates=true`, `reports=true`,
  `protocols=true`, `satisfaction=true`;
- Meta/WhatsApp: `TenantMetaConfig` present, business token configured,
  phone `****7308`, WABA `****4194`, business `****8327`;
- templates: 0;
- template requests: 0;
- campaigns: 0;
- campaign-related Meta usage events: 0;
- active-message billing events: 0;
- opt-out campaign events: 0;
- outbound records exist for CRA operational history, but not as controlled
  Utility campaign acceptance evidence.

## Hard Gate

No real Meta outbound may be sent until the owner explicitly approves all of:

- template name and language;
- final Utility template text and variables;
- recipient list;
- send window;
- expected cost exposure;
- campaign name;
- exact number of messages.

If any item is missing, the correct status is `WAITING OWNER APPROVAL` and the
campaign must remain unsent.

## Controlled Campaign Contract

| Area | Required Result | Current Status |
| --- | --- | --- |
| Utility template | Approved Meta template for CRA | PENDING META/CONFIG |
| Template category | Utility only; no marketing | REQUIRED |
| Recipient source | Sanitized and approved list | WAITING OWNER/CRA |
| Import validation | Normalize phones, dedupe, reject invalid/provisional/excluded/opt-out contacts | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Variables | Required placeholders mapped per recipient or blocked | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Draft | Campaign can be created without sending | PRODUCT SUPPORTED / NEEDS CRA RUN |
| Test send | Formal test-send excluded from contractual active-message billing | TESTED LOCALLY |
| Schedule/send | Explicit operator action only | PRODUCT SUPPORTED / NEEDS OWNER APPROVAL |
| Pause/resume/cancel | Supported by campaign lifecycle and app API | TESTED LOCALLY FOR LIFECYCLE |
| Opt-out | Active opt-out blocks campaign recipient and records event | PRODUCT SUPPORTED / NEEDS CRA EVIDENCE |
| Delivery status | Meta webhook updates status/history | PRODUCT SUPPORTED / NEEDS CRA SAMPLE |
| Billing | Delivered/read Utility campaign outside 24h creates one billable event; read replay does not bill again | TESTED LOCALLY |
| Reports/export | CSV/monthly evidence available; PDF/equivalent acceptance pack still required | PRODUCT SUPPORTED / NEEDS CRA SAMPLE |

## Required Evidence Sequence

1. Create or request the CRA Utility template.
2. Wait for Meta approval and record category/language/name.
3. Prepare a small recipient list approved by owner/CRA.
4. Preview/import recipients and resolve invalid, duplicate, opt-out,
   excluded or missing-variable rows before send.
5. Create draft only.
6. Execute test-send only if approved.
7. Obtain explicit owner approval for the real controlled send.
8. Send only the approved number of messages in the approved window.
9. Capture delivered/read/failed status, opt-out blocks and campaign export.
10. Capture monthly billing/usage report and acceptance evidence.

## Deferred Channels

Instagram Direct, Facebook Messenger and Website/Webchat are contract-required,
but customer-deferred for this phase. They must not be treated as active
blockers for the Utility campaign front, and must be reopened only when CRA
confirms assets, site access and delivery window.

## Current Classification

```text
CRA-PR UTILITY CAMPAIGN:
LOCAL / CONTROLLED CAMPAIGN READINESS

REAL SEND:
NOT EXECUTED

OWNER APPROVAL FOR REAL SEND:
REQUIRED

TEMPLATE:
PENDING

RECIPIENT COUNT:
0 APPROVED FOR REAL SEND
```
