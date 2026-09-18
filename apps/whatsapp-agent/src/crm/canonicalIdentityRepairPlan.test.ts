import assert from "node:assert/strict";
import test from "node:test";
import { planCanonicalIdentityRepair, type IdentityRepairSnapshot } from "./canonicalIdentityRepairPlan.js";

const baseSnapshot: IdentityRepairSnapshot = {
  tenantKey: "demo-converta",
  primaryContactId: "e96d8299-b36f-4118-a406-f2a365c5630d",
  secondaryContactId: "97244912-0a78-48a7-8371-3c07b38dbf7b",
  survivingLeadId: "cmtvhkeo902u74s38b4pf9heg",
  duplicateLeadId: "cmta6bjio00jl4s045pf4rfna",
  contacts: [
    {
      id: "e96d8299-b36f-4118-a406-f2a365c5630d",
      role: "survivor",
      identityCount: 4,
    },
    {
      id: "97244912-0a78-48a7-8371-3c07b38dbf7b",
      role: "duplicate",
      identityCount: 1,
    },
  ],
  leads: [
    {
      id: "cmtvhkeo902u74s38b4pf9heg",
      role: "survivor",
      status: "QUALIFIED",
      contactChannelIdentityId: "cmu44rnp700014s4qch0qm6lx",
    },
    {
      id: "cmta6bjio00jl4s045pf4rfna",
      role: "duplicate",
      status: "NEW",
      contactChannelIdentityId: "cmtdan69c015d4sayre6kxi3u",
    },
  ],
  channelIdentities: [
    {
      id: "cmtdan69c015d4sayre6kxi3u",
      contactId: "e96d8299-b36f-4118-a406-f2a365c5630d",
      provider: "web_session",
      channelAccountId: "558491955328",
      classification: "legitimate",
    },
    {
      id: "cmu44rnp700014s4qch0qm6lx",
      contactId: "97244912-0a78-48a7-8371-3c07b38dbf7b",
      provider: "meta",
      channelAccountId: "1269775559552371",
      classification: "legitimate",
    },
  ],
  outboundCount: 86,
  billingEventCount: 2,
  campaignEventCount: 13,
  openConversationCount: 1,
};

test("plans non-destructive canonical identity repair for Demo 6787 duplicate graph", () => {
  const plan = planCanonicalIdentityRepair(baseSnapshot);

  assert.equal(plan.ready, true);
  assert.equal(plan.noop, false);
  assert.equal(plan.expected.activeContacts, 1);
  assert.equal(plan.expected.canonicalLeads, 1);
  assert.equal(plan.expected.billingChange, 0);
  assert.equal(plan.expected.outboundChange, 0);
  assert.equal(plan.expected.campaignHistoryChange, 0);
  assert.deepEqual(
    plan.operations.map((operation) => operation.kind),
    [
      "move_channel_identity",
      "retain_duplicate_contact_without_canonical_identity",
      "retain_duplicate_lead_without_canonical_identity",
      "preserve_historical_references",
    ]
  );
});

test("successful rerun becomes NOOP and keeps preserved counts unchanged", () => {
  const alreadyRepaired: IdentityRepairSnapshot = {
    ...baseSnapshot,
    contacts: baseSnapshot.contacts.map((contact) =>
      contact.id === baseSnapshot.secondaryContactId
        ? { ...contact, operationallyExcludedAt: "2026-09-18T12:00:00.000Z", identityCount: 0 }
        : contact
    ),
    leads: baseSnapshot.leads.map((lead) =>
      lead.id === baseSnapshot.duplicateLeadId ? { ...lead, contactChannelIdentityId: null } : lead
    ),
    channelIdentities: baseSnapshot.channelIdentities.map((identity) =>
      identity.id === "cmu44rnp700014s4qch0qm6lx" ? { ...identity, contactId: baseSnapshot.primaryContactId } : identity
    ),
  };

  const plan = planCanonicalIdentityRepair(alreadyRepaired);

  assert.equal(plan.ready, true);
  assert.equal(plan.noop, true);
  assert.equal(plan.expected.billingChange, 0);
  assert.equal(plan.expected.outboundChange, 0);
  assert.equal(plan.expected.campaignHistoryChange, 0);
});
