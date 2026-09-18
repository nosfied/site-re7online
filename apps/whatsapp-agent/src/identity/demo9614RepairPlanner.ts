import crypto from "node:crypto";

export const DEMO_9614_TARGETS = {
  tenantKey: "demo-converta",
  primaryContactId: "77c780bf-3501-4a55-9261-673b2c6cbbc4",
  primaryLeadId: "cmtg3jmq4011p4s7d4vhpk0sd",
  secondaryContactId: "ee236657-cb12-467d-aac7-b35ed41ff421",
  metaIdentityId: "cmu5rf8lp02lz4sawqc929bi1",
  historicalCampaignId: "0fb54d61-9f71-42ab-b89d-78ddb23bb694",
  runtimeStateId: "91bc59ab-d6e8-41cc-bec8-ca00c6244217",
  webSessionIdentityWaId: "558499049614",
  webSessionModernWaId: "5584999049614",
} as const;

export const DEMO_9614_SECONDARY_ARCHIVED_WA_ID = `archived:demo-9614-repair:${DEMO_9614_TARGETS.secondaryContactId}`;

export type Demo9614Contact = {
  id: string;
  clientId: string;
  waId: string;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalUserHash: string | null;
  externalUserRef: string | null;
  legacyWaId: string | null;
  lifecycle: string;
  operationallyExcludedAt: Date | string | null;
};

export type Demo9614Lead = {
  id: string;
  tenantId: string;
  waId: string;
  waIdCanonical: string | null;
  phone: string | null;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalUserHash: string | null;
  externalUserRef: string | null;
  legacyWaId: string | null;
  contactChannelIdentityId: string | null;
};

export type Demo9614Identity = {
  id: string;
  clientId: string;
  contactId: string | null;
  channel: string;
  provider: string;
  channelAccountId: string;
  externalUserHash: string;
  externalUserRef: string | null;
  legacyWaId: string | null;
};

export type Demo9614RuntimeState = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalUserHash: string | null;
  externalUserRef: string | null;
  legacyWaId: string | null;
  status: string | null;
  mode: string | null;
  closedAt: Date | string | null;
  departmentId: string | null;
  queueId: string | null;
  assignedUserId: string | null;
};

export type Demo9614Campaign = {
  id: string;
  clientId: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  blockedCount: number;
};

export type Demo9614Graph = {
  client: { id: string; clientKey: string; status: string };
  contacts: Demo9614Contact[];
  leads: Demo9614Lead[];
  identities: Demo9614Identity[];
  openConversations: Array<{ id: string }>;
  openRuntimeStates: Demo9614RuntimeState[];
  campaign: Demo9614Campaign | null;
  campaign9614OutboundCount: number;
  campaign9614ProviderCallCount: number;
  campaign9614BillingCount: number;
  campaign9614ImportBlockedCount: number;
  consentRecords: number;
  effectiveOptOut: boolean;
};

export type Demo9614RepairPlan = {
  ok: boolean;
  blockers: string[];
  primaryContact: Demo9614Contact | null;
  primaryLead: Demo9614Lead | null;
  secondaryContact: Demo9614Contact | null;
  secondaryLead: Demo9614Lead | null;
  metaIdentity: Demo9614Identity | null;
  liveSelectors: string[];
  liveReferencesToRelink: string[];
  runtimeImpact: "NOOP" | "EXPLICIT_RELINK";
  plannedActions: string[];
  expectedFinal: {
    canonicalContactId: string;
    canonicalLeadId: string;
    liveCanonicalContacts: number;
    liveCanonicalLeads: number;
    ambiguity: boolean;
    outboundDelta: number;
    billingDelta: number;
    campaignHistoryDelta: number;
    optOutHistoryDelta: number;
    providerCallDelta: number;
    hardDelete: boolean;
  };
  eligibility: {
    identity: "PASS" | "ISSUE";
    optOut: "PASS" | "ISSUE";
    template: "PASS" | "ISSUE";
    returnDestination: "PASS" | "ISSUE";
    relevance24h: "UTILITY_TEMPLATE_OK" | "ISSUE";
    overall: "PROJECTED_ELIGIBLE" | "ISSUE";
  };
};

function hasLiveSecondarySelector(record: {
  waId?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  externalUserRef?: string | null;
  legacyWaId?: string | null;
}) {
  const knownWaIds: string[] = [DEMO_9614_TARGETS.webSessionIdentityWaId, DEMO_9614_TARGETS.webSessionModernWaId];
  return Boolean(
    knownWaIds.includes(record.waId ?? "") ||
      record.channel ||
      record.provider ||
      record.channelAccountId ||
      record.externalUserHash ||
      record.externalUserRef ||
      record.legacyWaId
  );
}

export function isDemo9614SecondaryNeutralized(contact: Demo9614Contact | null | undefined) {
  return Boolean(
    contact &&
      contact.operationallyExcludedAt &&
      contact.waId === DEMO_9614_SECONDARY_ARCHIVED_WA_ID &&
      !hasLiveSecondarySelector(contact)
  );
}

export function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildDemo9614RepairPlan(graph: Demo9614Graph): Demo9614RepairPlan {
  const blockers: string[] = [];
  const targets = DEMO_9614_TARGETS;
  if (graph.client.clientKey !== targets.tenantKey) blockers.push("tenant_mismatch");
  if (graph.client.status !== "ACTIVE") blockers.push("tenant_not_active");

  const primaryContact = graph.contacts.find((contact) => contact.id === targets.primaryContactId) ?? null;
  const secondaryContact = graph.contacts.find((contact) => contact.id === targets.secondaryContactId) ?? null;
  const primaryLead = graph.leads.find((lead) => lead.id === targets.primaryLeadId) ?? null;
  const metaIdentity = graph.identities.find((identity) => identity.id === targets.metaIdentityId) ?? null;
  const secondaryLead =
    graph.leads.find(
      (lead) => lead.id !== targets.primaryLeadId && lead.contactChannelIdentityId === targets.metaIdentityId
    ) ?? null;

  if (!primaryContact) blockers.push("primary_contact_missing");
  if (!secondaryContact) blockers.push("secondary_contact_missing");
  if (!primaryLead) blockers.push("primary_lead_missing");
  if (!metaIdentity) blockers.push("meta_identity_missing");
  if (secondaryLead) blockers.push("unexpected_secondary_lead");

  if (primaryContact && primaryContact.clientId !== graph.client.id) blockers.push("primary_contact_tenant_mismatch");
  if (secondaryContact && secondaryContact.clientId !== graph.client.id) blockers.push("secondary_contact_tenant_mismatch");
  if (primaryLead && primaryLead.tenantId !== graph.client.id) blockers.push("primary_lead_tenant_mismatch");
  if (metaIdentity && metaIdentity.clientId !== graph.client.id) blockers.push("meta_identity_tenant_mismatch");
  const metaIdentityOnSecondary = metaIdentity?.contactId === targets.secondaryContactId;
  const metaIdentityOnPrimary = metaIdentity?.contactId === targets.primaryContactId;
  if (metaIdentity && !metaIdentityOnSecondary && !metaIdentityOnPrimary) blockers.push("meta_identity_unexpected_owner");

  if (graph.openConversations.length > 0) blockers.push("open_conversation_requires_manual_review");
  if (!graph.campaign) blockers.push("historical_campaign_missing");
  if (graph.campaign && graph.campaign.clientId !== graph.client.id) blockers.push("historical_campaign_tenant_mismatch");
  if (graph.campaign9614OutboundCount !== 0) blockers.push("historical_campaign_9614_outbound_exists");
  if (graph.campaign9614ProviderCallCount !== 0) blockers.push("historical_campaign_9614_provider_call_exists");
  if (graph.campaign9614BillingCount !== 0) blockers.push("historical_campaign_9614_billing_exists");
  if (graph.campaign9614ImportBlockedCount < 1) blockers.push("historical_campaign_9614_identity_conflict_not_found");

  const runtimeNeedsRelink = graph.openRuntimeStates.some(
    (state) =>
      state.id === targets.runtimeStateId &&
      (state.provider === "meta" ||
        state.channelAccountId === metaIdentity?.channelAccountId ||
        state.externalUserHash === metaIdentity?.externalUserHash)
  );

  const liveSelectors: string[] = [];
  const secondaryNeutralized = isDemo9614SecondaryNeutralized(secondaryContact);
  if (secondaryContact && !secondaryNeutralized && hasLiveSecondarySelector(secondaryContact)) {
    liveSelectors.push("secondary_contact_identity_selectors");
  }
  if (metaIdentityOnSecondary) {
    liveSelectors.push("meta_contact_channel_identity");
  }
  if (primaryLead && primaryLead.contactChannelIdentityId !== targets.metaIdentityId) {
    liveSelectors.push("primary_lead_current_web_session_identity");
  }

  const plannedActions: string[] = [];
  if (metaIdentityOnSecondary) {
    plannedActions.push(`move identity ${targets.metaIdentityId} to contact ${targets.primaryContactId}`);
  }
  plannedActions.push(`preserve lead ${targets.primaryLeadId}`);
  if (!secondaryNeutralized) {
    plannedActions.push(`neutralize secondary contact ${targets.secondaryContactId} selectors without hard delete`);
  }
  plannedActions.push("preserve historical campaign, outbound, billing, opt-out and consent records");
  if (runtimeNeedsRelink) {
    plannedActions.push(`relink runtime state ${targets.runtimeStateId} to canonical selectors`);
  }
  if (metaIdentityOnPrimary && secondaryNeutralized && !runtimeNeedsRelink) {
    plannedActions.push("noop: repair already applied");
  }

  const eligibility = {
    identity: blockers.length === 0 ? ("PASS" as const) : ("ISSUE" as const),
    optOut: graph.effectiveOptOut ? ("ISSUE" as const) : ("PASS" as const),
    template: graph.campaign?.status === "completed" ? ("PASS" as const) : ("ISSUE" as const),
    returnDestination: graph.openRuntimeStates.some((state) => state.departmentId && state.queueId)
      ? ("PASS" as const)
      : ("ISSUE" as const),
    relevance24h: "UTILITY_TEMPLATE_OK" as const,
    overall: "ISSUE" as "PROJECTED_ELIGIBLE" | "ISSUE",
  };
  eligibility.overall =
    eligibility.identity === "PASS" &&
    eligibility.optOut === "PASS" &&
    eligibility.template === "PASS" &&
    eligibility.returnDestination === "PASS"
      ? "PROJECTED_ELIGIBLE"
      : "ISSUE";

  return {
    ok: blockers.length === 0,
    blockers,
    primaryContact,
    primaryLead,
    secondaryContact,
    secondaryLead,
    metaIdentity,
    liveSelectors,
    liveReferencesToRelink: runtimeNeedsRelink ? [`runtime:${targets.runtimeStateId}`] : [],
    runtimeImpact: runtimeNeedsRelink ? "EXPLICIT_RELINK" : "NOOP",
    plannedActions,
    expectedFinal: {
      canonicalContactId: targets.primaryContactId,
      canonicalLeadId: targets.primaryLeadId,
      liveCanonicalContacts: 1,
      liveCanonicalLeads: 1,
      ambiguity: blockers.length > 0,
      outboundDelta: 0,
      billingDelta: 0,
      campaignHistoryDelta: 0,
      optOutHistoryDelta: 0,
      providerCallDelta: 0,
      hardDelete: false,
    },
    eligibility,
  };
}
