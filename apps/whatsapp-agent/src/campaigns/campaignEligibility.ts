import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCrmWhatsappIdentityCandidates, classifyCrmWhatsappIdentity, isAnonymizedMarker } from "../crm/crmWhatsappIdentity.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import { filterOptedOutCampaignRecipients } from "./optOutRegistry.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import { normalizeWaIdDigits } from "../utils/waid.js";

export function normalizeCampaignRecipientIdentity(value: unknown) {
  const raw = String(value ?? "").trim();
  if (isAnonymizedMarker(raw) || !/^\+?[\d\s().-]+$/.test(raw)) return "";
  const classified = classifyCrmWhatsappIdentity(raw);
  return classified.status === "SUPPORTED" ? classified.identity.crmCanonicalPhone : "";
}

export type EligibilityReason = "anonymized_contact" | "invalid_whatsapp_identity" | "unsupported_international_identity" |
  "operationally_excluded_contact" | "active_send_blocked" | "non_whatsapp_channel" | "identity_conflict" | "provisional_contact";
export function crmOperationalBlockedReason(item: {
  isAnonymized: boolean; isOperationallyExcluded: boolean; activeOptOut: boolean;
  channel?: string | null;
}): Exclude<EligibilityReason, "invalid_whatsapp_identity" | "unsupported_international_identity" | "identity_conflict" | "provisional_contact"> | null {
  if (item.isAnonymized) return "anonymized_contact";
  if (item.isOperationallyExcluded) return "operationally_excluded_contact";
  if (item.activeOptOut) return "active_send_blocked";
  if (item.channel && item.channel.toLowerCase() !== "whatsapp") return "non_whatsapp_channel";
  return null;
}

// Read-only, same-tenant revalidation. Candidate equivalence is a lookup, not a merge.
export async function campaignRecipientEligibility(prisma: PrismaClient, clientId: string,
  values: string[], channel?: string | null): Promise<EligibilityReason | null> {
  if (values.some(isAnonymizedMarker)) return "anonymized_contact";
  if (channel && channel.toLowerCase() !== "whatsapp") return "non_whatsapp_channel";
  const classifications = values.map(classifyCrmWhatsappIdentity);
  const identities = values.map(normalizeCampaignRecipientIdentity);
  const markerCandidates = Array.from(new Set(values.map(value => normalizeWaIdDigits(value)).filter(Boolean)));
  const candidates = identities.every(Boolean) ? buildCrmWhatsappIdentityCandidates(identities) : markerCandidates;
  const markerQueryCandidates = candidates.length > 0 ? candidates : ["__no_marker_identity__"];
  // Old immutable snapshots can contain digits extracted from anonymized markers.
  // Matching that lossy transform only DENIES; it never grants identity ownership.
  const markers = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "Lead" WHERE "tenantId" = ${clientId}::uuid AND (
      ((lower("waId") LIKE 'anon:%' OR lower("waId") LIKE 'hash:anon:%') AND
        regexp_replace("waId", '[^0-9]', '', 'g') IN (${Prisma.join(markerQueryCandidates)})) OR
      ((lower("waIdCanonical") LIKE 'anon:%' OR lower("waIdCanonical") LIKE 'hash:anon:%') AND
        regexp_replace("waIdCanonical", '[^0-9]', '', 'g') IN (${Prisma.join(markerQueryCandidates)}))
    ) LIMIT 1`);
  if (markers.length) return "anonymized_contact";
  if (classifications.some(value => value.status === "UNSUPPORTED_INTERNATIONAL")) return "unsupported_international_identity";
  if (identities.some(value => !value)) return "invalid_whatsapp_identity";
  const leads = await prisma.lead.findMany({ where: { tenantId: clientId, OR: [
    { waId: { in: candidates } }, { waIdCanonical: { in: candidates } },
  ] }, select: { waId: true, waIdCanonical: true, name: true, phone: true, externalUserHash: true, channel: true } });
  if (leads.some(l => [l.waId, l.waIdCanonical, l.name, l.phone, l.externalUserHash].some(isAnonymizedMarker))) return "anonymized_contact";
  if (leads.some(l => l.channel && l.channel.toLowerCase() !== "whatsapp")) return "non_whatsapp_channel";
  const contacts = await prisma.contact.findMany({ where: { clientId, OR: [
    { waId: { in: candidates } }, { externalUserRef: { in: candidates } }, { legacyWaId: { in: candidates } },
  ] }, select: { waId: true, name: true, externalUserHash: true, channel: true, lifecycle: true, operationallyExcludedAt: true } });
  if (contacts.some(c => [c.waId, c.name, c.externalUserHash].some(isAnonymizedMarker))) return "anonymized_contact";
  if (contacts.some(c => (c.channel ?? "whatsapp").toLowerCase() !== "whatsapp")) return "non_whatsapp_channel";
  const excluded = await loadOperationallyExcludedWaIds(prisma, { clientId, waIds: candidates });
  if (excluded.size) return "operationally_excluded_contact";
  if (contacts.some(c => !isOperationalContactLifecycle(c.lifecycle))) return "provisional_contact";
  const optOut = await filterOptedOutCampaignRecipients(prisma, { clientId, waIds: identities });
  return optOut.blocked.length ? "active_send_blocked" : null;
}

export async function campaignRecipientEligibilityBatch(
  prisma: PrismaClient,
  clientId: string,
  recipients: Array<{ values: string[]; channel?: string | null }>
): Promise<Array<EligibilityReason | null>> {
  const normalized = recipients.map((recipient) => {
    const classifications = recipient.values.map(classifyCrmWhatsappIdentity);
    const identities = recipient.values.map(normalizeCampaignRecipientIdentity);
    return {
      ...recipient,
      classifications,
      identities,
      markerCandidates: Array.from(new Set(recipient.values.map(value => normalizeWaIdDigits(value)).filter(Boolean))),
      candidates: identities.every(Boolean) ? buildCrmWhatsappIdentityCandidates(identities) : [],
    };
  });
  const allCandidates = Array.from(new Set(normalized.flatMap((recipient) => recipient.candidates)));
  const allMarkerCandidates = Array.from(new Set(normalized.flatMap((recipient) => recipient.markerCandidates)));
  const operationalCandidates = allCandidates.length ? allCandidates : ["__no_supported_identity__"];
  const markerQueryCandidates = allMarkerCandidates.length ? allMarkerCandidates : ["__no_marker_identity__"];

  const [markerRows, leads, contacts, excluded, optOut] = await Promise.all([
    prisma.$queryRaw<Array<{ markerDigits: string }>>(Prisma.sql`
      SELECT DISTINCT regexp_replace(marker, '[^0-9]', '', 'g') AS "markerDigits"
      FROM "Lead", LATERAL (VALUES ("waId"), ("waIdCanonical")) values(marker)
      WHERE "tenantId" = ${clientId}::uuid
        AND (lower(marker) LIKE 'anon:%' OR lower(marker) LIKE 'hash:anon:%')
        AND regexp_replace(marker, '[^0-9]', '', 'g') IN (${Prisma.join(markerQueryCandidates)})
    `),
    prisma.lead.findMany({
      where: {
        tenantId: clientId,
        OR: [{ waId: { in: operationalCandidates } }, { waIdCanonical: { in: operationalCandidates } }],
      },
      select: {
        waId: true,
        waIdCanonical: true,
        name: true,
        phone: true,
        externalUserHash: true,
        channel: true,
      },
    }),
    prisma.contact.findMany({
      where: {
        clientId,
        OR: [
          { waId: { in: operationalCandidates } },
          { externalUserRef: { in: operationalCandidates } },
          { legacyWaId: { in: operationalCandidates } },
        ],
      },
      select: {
        waId: true,
        externalUserRef: true,
        legacyWaId: true,
        name: true,
        externalUserHash: true,
        channel: true,
        lifecycle: true,
        operationallyExcludedAt: true,
      },
    }),
    loadOperationallyExcludedWaIds(prisma, { clientId, waIds: operationalCandidates }),
    filterOptedOutCampaignRecipients(prisma, { clientId, waIds: operationalCandidates }),
  ]);
  const markerDigits = new Set(markerRows.map((row) => row.markerDigits).filter(Boolean));
  const blockedOptOuts = new Set(optOut.blocked.map((item) => item.waIdCanonical).filter(Boolean));

  return normalized.map((recipient) => {
    if (recipient.values.some(isAnonymizedMarker)) return "anonymized_contact";
    if (recipient.channel && recipient.channel.toLowerCase() !== "whatsapp") return "non_whatsapp_channel";
    if (recipient.markerCandidates.some((candidate) => markerDigits.has(candidate))) return "anonymized_contact";
    if (recipient.classifications.some(value => value.status === "UNSUPPORTED_INTERNATIONAL")) return "unsupported_international_identity";
    if (recipient.identities.some((identity) => !identity)) return "invalid_whatsapp_identity";
    const candidates = new Set(recipient.candidates);
    if ([...candidates].some((candidate) => markerDigits.has(candidate))) return "anonymized_contact";

    const matchingLeads = leads.filter((lead) =>
      [lead.waId, lead.waIdCanonical].some((value) => value && candidates.has(value))
    );
    if (
      matchingLeads.some((lead) =>
        [lead.waId, lead.waIdCanonical, lead.name, lead.phone, lead.externalUserHash].some(isAnonymizedMarker)
      )
    ) return "anonymized_contact";
    if (matchingLeads.some((lead) => lead.channel && lead.channel.toLowerCase() !== "whatsapp")) {
      return "non_whatsapp_channel";
    }

    const matchingContacts = contacts.filter((contact) =>
      [contact.waId, contact.externalUserRef, contact.legacyWaId].some(
        (value) => value && candidates.has(value)
      )
    );
    if (
      matchingContacts.some((contact) =>
        [contact.waId, contact.name, contact.externalUserHash].some(isAnonymizedMarker)
      )
    ) return "anonymized_contact";
    if (matchingContacts.some((contact) => (contact.channel ?? "whatsapp").toLowerCase() !== "whatsapp")) {
      return "non_whatsapp_channel";
    }
    if ([...candidates].some((candidate) => excluded.has(candidate))) return "operationally_excluded_contact";
    if (matchingContacts.some((contact) => contact.operationallyExcludedAt)) return "operationally_excluded_contact";
    if (matchingContacts.some((contact) => !isOperationalContactLifecycle(contact.lifecycle))) return "provisional_contact";
    if ([...candidates].some((candidate) => blockedOptOuts.has(candidate))) return "active_send_blocked";
    return null;
  });
}
