export type IdentityRepairContact = {
  id: string;
  role: "survivor" | "duplicate";
  identityCount: number;
  operationallyExcludedAt?: Date | string | null;
};

export type IdentityRepairLead = {
  id: string;
  role: "survivor" | "duplicate";
  status: string | null;
  contactChannelIdentityId?: string | null;
};

export type IdentityRepairChannelIdentity = {
  id: string;
  contactId: string | null;
  provider: string;
  channelAccountId: string;
  classification: "legitimate" | "duplicate_equivalent" | "legacy";
};

export type IdentityRepairSnapshot = {
  tenantKey: string;
  primaryContactId: string;
  secondaryContactId: string;
  survivingLeadId: string;
  duplicateLeadId: string;
  contacts: IdentityRepairContact[];
  leads: IdentityRepairLead[];
  channelIdentities: IdentityRepairChannelIdentity[];
  outboundCount: number;
  billingEventCount: number;
  campaignEventCount: number;
  openConversationCount: number;
};

export type IdentityRepairOperation = {
  kind:
    | "move_channel_identity"
    | "retain_duplicate_contact_without_canonical_identity"
    | "retain_duplicate_lead_without_canonical_identity"
    | "preserve_historical_references";
  targetId: string;
  description: string;
};

export type IdentityRepairPlan = {
  ready: boolean;
  noop: boolean;
  operations: IdentityRepairOperation[];
  expected: {
    activeContacts: number;
    canonicalLeads: number;
    billingChange: number;
    outboundChange: number;
    campaignHistoryChange: number;
  };
  blockers: string[];
};

export function planCanonicalIdentityRepair(snapshot: IdentityRepairSnapshot): IdentityRepairPlan {
  const blockers: string[] = [];
  if (snapshot.tenantKey !== "demo-converta") blockers.push("unexpected_tenant");
  if (snapshot.contacts.length !== 2) blockers.push("expected_exactly_two_contacts");
  if (snapshot.leads.length !== 2) blockers.push("expected_exactly_two_leads");
  if (snapshot.openConversationCount !== 1) blockers.push("expected_one_open_conversation");

  const secondaryIdentities = snapshot.channelIdentities.filter(
    (identity) => identity.contactId === snapshot.secondaryContactId
  );
  const survivorIdentities = snapshot.channelIdentities.filter(
    (identity) => identity.contactId === snapshot.primaryContactId
  );
  const duplicateLead = snapshot.leads.find((lead) => lead.id === snapshot.duplicateLeadId);
  const survivorLead = snapshot.leads.find((lead) => lead.id === snapshot.survivingLeadId);
  const duplicateContact = snapshot.contacts.find((contact) => contact.id === snapshot.secondaryContactId);

  if (!duplicateContact) blockers.push("secondary_contact_missing");
  if (!duplicateLead) blockers.push("duplicate_lead_missing");
  if (!survivorLead) blockers.push("surviving_lead_missing");
  if (secondaryIdentities.length > 1) blockers.push("secondary_has_more_than_one_identity");

  const operations: IdentityRepairOperation[] = [];
  for (const identity of secondaryIdentities) {
    operations.push({
      kind: "move_channel_identity",
      targetId: identity.id,
      description: `Move ${identity.provider}/${identity.channelAccountId} identity to primary contact ${snapshot.primaryContactId}.`,
    });
  }

  const alreadyMoved =
    secondaryIdentities.length === 0 &&
    survivorIdentities.some((identity) => identity.classification === "legitimate" && identity.provider === "meta");
  const duplicateContactAlreadyNeutralized =
    Boolean(duplicateContact?.operationallyExcludedAt) && secondaryIdentities.length === 0;
  const duplicateLeadAlreadyNeutralized = duplicateLead?.contactChannelIdentityId === null;

  if (!duplicateContactAlreadyNeutralized) {
    operations.push({
      kind: "retain_duplicate_contact_without_canonical_identity",
      targetId: snapshot.secondaryContactId,
      description:
        "Retain duplicate Contact row for chronology, but remove live canonical identity selectors and set operationallyExcludedAt.",
    });
  }
  if (!duplicateLeadAlreadyNeutralized) {
    operations.push({
      kind: "retain_duplicate_lead_without_canonical_identity",
      targetId: snapshot.duplicateLeadId,
      description:
        "Retain duplicate Lead row for chronology, but remove live canonical identity selectors and contactChannelIdentityId.",
    });
  }
  operations.push({
    kind: "preserve_historical_references",
    targetId: snapshot.primaryContactId,
    description:
      "Do not rewrite Event, Campaign, OutboundMessage, provider message IDs, billing, opt-out, consent, assignment or transfer history.",
  });

  return {
    ready: blockers.length === 0,
    noop: alreadyMoved && duplicateContactAlreadyNeutralized && duplicateLeadAlreadyNeutralized,
    operations,
    expected: {
      activeContacts: 1,
      canonicalLeads: 1,
      billingChange: 0,
      outboundChange: 0,
      campaignHistoryChange: 0,
    },
    blockers,
  };
}
