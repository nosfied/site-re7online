import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemo9614RepairPlan,
  DEMO_9614_TARGETS,
  type Demo9614Graph,
} from "./demo9614RepairPlanner.js";

function graph(overrides: Partial<Demo9614Graph> = {}): Demo9614Graph {
  const client = { id: "tenant-1", clientKey: DEMO_9614_TARGETS.tenantKey, status: "ACTIVE" };
  return {
    client,
    contacts: [
      {
        id: DEMO_9614_TARGETS.primaryContactId,
        clientId: client.id,
        waId: DEMO_9614_TARGETS.webSessionModernWaId,
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "558491955328",
        externalUserHash: "web-hash",
        externalUserRef: DEMO_9614_TARGETS.webSessionIdentityWaId,
        legacyWaId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        lifecycle: "ACTIVE",
        operationallyExcludedAt: null,
      },
      {
        id: DEMO_9614_TARGETS.secondaryContactId,
        clientId: client.id,
        waId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "1269775559552371",
        externalUserHash: "meta-hash",
        externalUserRef: null,
        legacyWaId: null,
        lifecycle: "ACTIVE",
        operationallyExcludedAt: null,
      },
    ],
    leads: [
      {
        id: DEMO_9614_TARGETS.primaryLeadId,
        tenantId: client.id,
        waId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        waIdCanonical: DEMO_9614_TARGETS.webSessionIdentityWaId,
        phone: DEMO_9614_TARGETS.webSessionIdentityWaId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "1269775559552371",
        externalUserHash: "meta-hash",
        externalUserRef: DEMO_9614_TARGETS.webSessionIdentityWaId,
        legacyWaId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        contactChannelIdentityId: "web-identity",
      },
    ],
    identities: [
      {
        id: DEMO_9614_TARGETS.metaIdentityId,
        clientId: client.id,
        contactId: DEMO_9614_TARGETS.secondaryContactId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "1269775559552371",
        externalUserHash: "meta-hash",
        externalUserRef: null,
        legacyWaId: DEMO_9614_TARGETS.webSessionIdentityWaId,
      },
    ],
    openConversations: [],
    openRuntimeStates: [
      {
        id: DEMO_9614_TARGETS.runtimeStateId,
        waId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        waIdCanonical: DEMO_9614_TARGETS.webSessionIdentityWaId,
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "558491955328",
        externalUserHash: "web-hash",
        externalUserRef: DEMO_9614_TARGETS.webSessionIdentityWaId,
        legacyWaId: DEMO_9614_TARGETS.webSessionIdentityWaId,
        status: "WAITING",
        mode: "HUMAN",
        closedAt: null,
        departmentId: "department-1",
        queueId: "queue-1",
        assignedUserId: null,
      },
    ],
    campaign: {
      id: DEMO_9614_TARGETS.historicalCampaignId,
      clientId: client.id,
      status: "completed",
      totalRecipients: 2,
      sentCount: 1,
      blockedCount: 1,
    },
    campaign9614OutboundCount: 0,
    campaign9614ProviderCallCount: 0,
    campaign9614BillingCount: 0,
    campaign9614ImportBlockedCount: 1,
    consentRecords: 2,
    effectiveOptOut: false,
    ...overrides,
  };
}

test("demo 9614 planner accepts the verified production graph and projects canonical repair", () => {
  const plan = buildDemo9614RepairPlan(graph());

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.primaryContact?.id, DEMO_9614_TARGETS.primaryContactId);
  assert.equal(plan.primaryLead?.id, DEMO_9614_TARGETS.primaryLeadId);
  assert.equal(plan.secondaryContact?.id, DEMO_9614_TARGETS.secondaryContactId);
  assert.equal(plan.secondaryLead, null);
  assert.equal(plan.metaIdentity?.id, DEMO_9614_TARGETS.metaIdentityId);
  assert.equal(plan.runtimeImpact, "NOOP");
  assert.equal(plan.expectedFinal.canonicalContactId, DEMO_9614_TARGETS.primaryContactId);
  assert.equal(plan.expectedFinal.canonicalLeadId, DEMO_9614_TARGETS.primaryLeadId);
  assert.equal(plan.expectedFinal.liveCanonicalContacts, 1);
  assert.equal(plan.expectedFinal.liveCanonicalLeads, 1);
  assert.equal(plan.expectedFinal.outboundDelta, 0);
  assert.equal(plan.expectedFinal.billingDelta, 0);
  assert.equal(plan.expectedFinal.providerCallDelta, 0);
  assert.equal(plan.expectedFinal.hardDelete, false);
  assert.equal(plan.eligibility.overall, "PROJECTED_ELIGIBLE");
});

test("demo 9614 planner blocks unexpected secondary lead and historical outbound mutation risk", () => {
  const base = graph();
  const plan = buildDemo9614RepairPlan({
    ...base,
    leads: [
      ...base.leads,
      {
        ...base.leads[0],
        id: "unexpected-secondary-lead",
        contactChannelIdentityId: DEMO_9614_TARGETS.metaIdentityId,
      },
    ],
    campaign9614OutboundCount: 1,
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.blockers.includes("unexpected_secondary_lead"), true);
  assert.equal(plan.blockers.includes("historical_campaign_9614_outbound_exists"), true);
  assert.equal(plan.expectedFinal.ambiguity, true);
});

test("demo 9614 planner requires explicit relink when runtime uses the secondary Meta selector", () => {
  const base = graph();
  const plan = buildDemo9614RepairPlan({
    ...base,
    openRuntimeStates: [
      {
        ...base.openRuntimeStates[0],
        provider: "meta",
        channelAccountId: "1269775559552371",
        externalUserHash: "meta-hash",
      },
    ],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.runtimeImpact, "EXPLICIT_RELINK");
  assert.deepEqual(plan.liveReferencesToRelink, [`runtime:${DEMO_9614_TARGETS.runtimeStateId}`]);
});
