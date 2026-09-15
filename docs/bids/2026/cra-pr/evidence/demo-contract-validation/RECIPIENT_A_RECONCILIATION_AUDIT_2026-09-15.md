# Recipient A Manual Reconciliation Audit - 2026-09-15

Status: RECONCILED / NEVER RESENT / RECIPIENT B NOT ATTEMPTED.

Scope:

- Tenant: `demo-converta`
- Campaign: `d9874c03-10e8-4061-a92e-6caa7b3001c3`
- Template: `data_exame`
- Recipient A: `****9614`
- Recipient B: `****6787`

This audit started read-only. The owner later explicitly approved the constrained
Recipient A production reconciliation. No resend was executed for Recipient A,
and no send was executed for Recipient B.

## Evidence

Campaign state:

- name: `DEMO / CONTRACT VALIDATION / CRA CAPABILITY - data_exame - 2026-09-15`
- status: `failed`
- total recipients: 2
- sent count: 0
- blocked count: 0
- created at: `2026-09-15T19:38:31.834Z`
- failed/updated at: `2026-09-15T19:38:33.105Z`

Template state:

- template id: `cmth7nwd3020f4sxaxa9gmarh`
- name: `data_exame`
- category/submitted category: `UTILITY`
- language: `pt_BR`
- status: `approved`
- Meta template id: `4500583573512364`

Recipient resolution:

- `****9614`: resolved before send as recipient index 1.
- `****6787`: resolved before send as recipient index 2.

Provider evidence for Recipient A:

- Meta message id:
  `wamid.HBgMNTU4NDk5MDQ5NjE0FQIAERgUQ0UyMTA5OTg2OEQzODcwQjBBNkYA`
- Meta `sent` webhook recovered at `2026-09-15T19:38:43.031Z`.
- Meta `delivered` webhook recovered at `2026-09-15T19:38:43.146Z`.
- No `read` webhook was found.
- Owner confirmed real receipt by `****9614`.

Local persistence gap before repair:

- `OutboundMessage` rows for the campaign or Meta message id: 0.
- `billing.active_message.delivered` rows for the campaign or Meta message id: 0.
- There is no `CampaignRecipient` table in the current schema; per-recipient
  state is represented by campaign payload/events/outbound messages plus
  aggregate campaign counters.

Billing/window evidence:

- Last inbound for `****9614`: `2026-09-10T14:37:04Z`.
- Runtime last outbound provider id for `****9614`:
  `wamid.HBgMNTU4NDk5MDQ5NjE0FQIAERgUQ0UyMTA5OTg2OEQzODcwQjBBNkYA`.
- Campaign send time: `2026-09-15T19:38:33.007Z`.
- The send was outside the 24h customer-service window.
- No active opt-out event was found for `****9614`.
- The recovered Meta delivered webhook declares `pricing.billable=true`,
  `category=utility`, `pricing_model=PMP`.

## Pre-Repair Classification

Recipient A was classified as safe for a constrained manual reconciliation only
after explicit owner approval.

Safe reconstruction scope approved by the owner:

- one `OutboundMessage` for Recipient A using the exact recovered Meta message
  id, campaign id, template, tenant, recipient and send timestamp;
- one canonical active-message billing event by replaying the recovered
  `delivered` evidence through the existing idempotent billing rule;
- campaign aggregate `sentCount` from 0 to 1 while preserving campaign
  `status=failed`, because Recipient B was not attempted and the run did not
  complete;
- one reconciliation audit event marking the historical repair and evidence
  source.

Not safe:

- do not create synthetic delivery/read history;
- do not create synthetic Meta billing;
- do not resend Recipient A;
- do not send Recipient B without a fresh owner gate;
- do not mark the campaign `completed`;
- do not infer a `read` event;
- do not modify CRA tenant data.

## Proposed Exact Repair

The approved repair was one controlled production reconciliation script inside
a transaction, after a fresh backup and read-back preflight:

1. Verify the campaign is still
   `d9874c03-10e8-4061-a92e-6caa7b3001c3`, tenant `demo-converta`,
   `status=failed`, `sentCount=0`, `blockedCount=0`.
2. Verify no `OutboundMessage` exists for the recovered Meta message id.
3. Verify no `billing.active_message.delivered` event exists for the recovered
   Meta message id.
4. Insert exactly one `OutboundMessage` for `****9614`:
   - `type=TEMPLATE`
   - `status=SENT`
   - `templateName=data_exame`
   - `templateLang=pt_BR`
   - `messageId=campaign.d9874c03-10e8-4061-a92e-6caa7b3001c3.1`
   - `metaMessageId` set to the recovered Meta message id
   - `createdAt=2026-09-15T19:38:33.007Z`
   - `rawPayload.source=campaign`
   - `rawPayload.campaignId=d9874c03-10e8-4061-a92e-6caa7b3001c3`
   - `rawPayload.templateCategory=utility`
   - include sanitized reconciliation metadata pointing to this audit.
5. Re-apply the recovered delivered status through the existing
   `recordActiveMessageDeliveryIfNeeded` rule, producing at most one
   `billing.active_message.delivered` event with idempotency key
   `billing:active_message:delivered:<demo-client-id>:whatsapp:meta_cloud:<meta-message-id>`.
6. Update the campaign aggregate to `sentCount=1`, `blockedCount=0`,
   preserving `status=failed`.
7. Insert one explicit audit event such as
   `campaign.message.manual_reconciliation_applied` with no personal data beyond
   masked recipient and exact evidence references.
8. Read back OutboundMessage, billing event, campaign counters and reports.

Stop conditions:

- any preflight mismatch;
- any existing OutboundMessage or billing event for the Meta message id;
- any ambiguity in tenant, recipient, campaign, template or webhook evidence;
- any attempt to send Meta outbound traffic.

## Applied Repair

Applied on 2026-09-15 after fresh persistent PostgreSQL backup.

Backup:

- path:
  `/opt/re7online/backups/recipient-a-reconciliation-20260915/pre-recipient-a-reconciliation-20260915T213115Z.dump`
- size: `20M`
- objects: `593`
- SHA256:
  `d0957043bcf2a137bbe700c7517606ac0d716ec85da24b89d2bd68d897d43122`

Production result:

- OutboundMessage id: `1375f639-b3df-425a-987e-545d2ffcddd1`
- Outbound message id:
  `campaign.d9874c03-10e8-4061-a92e-6caa7b3001c3.1`
- request id: `476858d4-57bf-4074-9325-84bd7daa724b`
- status: `SENT`; delivered evidence is stored as Meta status/billing evidence.
- Meta status: `delivered`
- delivered at: `2026-09-15T19:38:42Z`
- read: no
- billing event: exactly one `billing.active_message.delivered`
- campaign status: `failed`
- campaign sentCount: `1`
- campaign blockedCount: `0`
- manual reconciliation audit event: exactly one
- idempotency re-run: `NOOP_ALREADY_RECONCILED`
- Recipient B: not attempted
- multitenant isolation: no matching repair event outside `demo-converta`

This closes only Recipient A local reconciliation. It does not close the
campaign as completed, does not authorize Recipient B, and does not replace
remaining report/export/customer acceptance evidence.

## Billing Unit Follow-Up

Later on 2026-09-15, the owner questioned whether `R$ 0,32/message` was the
correct CRA Utility unit. Read-only audit classified:

- `billing.active_message.delivered`: correct canonical eligibility/count event
  for A; it does not persist a BRL amount.
- `R$ 0,32`: internal central planning reference from
  `R$ 3.200,00/month / 10.000 mensagens ativas`, not Meta cost and not a tenant
  override.
- Meta estimate for A: local planning estimate USD `0.008`, not provider
  invoice evidence.
- Final CRA BRL contract unit: NOT PROVEN in the current repository evidence.
- Recipient B: remains NOT ATTEMPTED and paused for billing-unit reconciliation.
