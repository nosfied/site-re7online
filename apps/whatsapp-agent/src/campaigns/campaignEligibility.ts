import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCrmWhatsappIdentityCandidates, isAnonymizedMarker, normalizeCrmWhatsappIdentity } from "../crm/crmWhatsappIdentity.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import { filterOptedOutCampaignRecipients } from "./optOutRegistry.js";

export function normalizeCampaignRecipientIdentity(value: unknown) {
  const raw = String(value ?? "").trim();
  if (isAnonymizedMarker(raw) || !/^\+?[\d\s().-]+$/.test(raw)) return "";
  const digits = normalizeWaIdDigits(raw);
  const brazil = normalizeCrmWhatsappIdentity(raw);
  if (brazil) return brazil.crmCanonicalPhone;
  // Preserve international E.164 identities; never salvage arbitrary text/hashes.
  return !digits.startsWith("55") && /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
}

export type EligibilityReason = "anonymized_contact" | "invalid_whatsapp_identity" |
  "operationally_excluded_contact" | "active_send_blocked" | "non_whatsapp_channel" | "identity_conflict";
export function crmOperationalBlockedReason(item: {
  isAnonymized: boolean; isOperationallyExcluded: boolean; activeOptOut: boolean;
  channel?: string | null;
}): Exclude<EligibilityReason, "invalid_whatsapp_identity" | "identity_conflict"> | null {
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
  const identities = values.map(normalizeCampaignRecipientIdentity);
  if (identities.some(value => !value)) return "invalid_whatsapp_identity";
  const candidates = buildCrmWhatsappIdentityCandidates(identities);
  // Old immutable snapshots can contain digits extracted from anonymized markers.
  // Matching that lossy transform only DENIES; it never grants identity ownership.
  const markers = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "Lead" WHERE "tenantId" = ${clientId}::uuid AND (
      ((lower("waId") LIKE 'anon:%' OR lower("waId") LIKE 'hash:anon:%') AND
        regexp_replace("waId", '[^0-9]', '', 'g') IN (${Prisma.join(candidates)})) OR
      ((lower("waIdCanonical") LIKE 'anon:%' OR lower("waIdCanonical") LIKE 'hash:anon:%') AND
        regexp_replace("waIdCanonical", '[^0-9]', '', 'g') IN (${Prisma.join(candidates)}))
    ) LIMIT 1`);
  if (markers.length) return "anonymized_contact";
  const leads = await prisma.lead.findMany({ where: { tenantId: clientId, OR: [
    { waId: { in: candidates } }, { waIdCanonical: { in: candidates } },
  ] }, select: { waId: true, waIdCanonical: true, name: true, phone: true, externalUserHash: true, channel: true } });
  if (leads.some(l => [l.waId, l.waIdCanonical, l.name, l.phone, l.externalUserHash].some(isAnonymizedMarker))) return "anonymized_contact";
  if (leads.some(l => l.channel && l.channel.toLowerCase() !== "whatsapp")) return "non_whatsapp_channel";
  const contacts = await prisma.contact.findMany({ where: { clientId, OR: [
    { waId: { in: candidates } }, { externalUserRef: { in: candidates } }, { legacyWaId: { in: candidates } },
  ] }, select: { waId: true, name: true, externalUserHash: true, channel: true, operationallyExcludedAt: true } });
  if (contacts.some(c => [c.waId, c.name, c.externalUserHash].some(isAnonymizedMarker))) return "anonymized_contact";
  if (contacts.some(c => (c.channel ?? "whatsapp").toLowerCase() !== "whatsapp")) return "non_whatsapp_channel";
  const excluded = await loadOperationallyExcludedWaIds(prisma, { clientId, waIds: candidates });
  if (excluded.size) return "operationally_excluded_contact";
  const optOut = await filterOptedOutCampaignRecipients(prisma, { clientId, waIds: identities });
  return optOut.blocked.length ? "active_send_blocked" : null;
}
