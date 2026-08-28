import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTACT_LIFECYCLE_ACTIVE,
  CONTACT_LIFECYCLE_PROVISIONAL,
  promoteContactLifecycleToActive,
} from "../contacts/contactLifecycle.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import {
  CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
  CAMPAIGN_IMPORT_MAX_CSV_BYTES,
  CAMPAIGN_IMPORT_MAX_ROWS,
  parseCampaignCsv,
} from "../campaigns/campaignRecipientImport.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { persistEvent } from "../db/persist.js";
import {
  buildCrmWhatsappExternalUserHash,
  buildCrmWhatsappIdentityCandidates,
  normalizeCrmWhatsappIdentity,
} from "./crmWhatsappIdentity.js";

export const CRM_CONTACT_CREATED_EVENT = "crm.contact.created";
export const CRM_CONTACT_IMPORT_SUMMARY_EVENT = "crm.contact.import.summary";
export const CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID = "crm";
export const CRM_CONTACT_MANUAL_PROVIDER = "whatsapp";

export type CrmContactUpsertSource = "crm_manual" | "crm_import";

export type CrmContactCsvMapping = {
  phoneColumn?: string | null;
  nameColumn?: string | null;
};

export type CrmContactUpsertInput = {
  name?: unknown;
  phone: unknown;
};

export class CrmContactUpsertError extends Error {
  constructor(
    public code:
      | "bad_request"
      | "invalid_phone"
      | "missing_phone_column"
      | "csv_too_large"
      | "csv_empty"
      | "csv_malformed"
      | "csv_missing_rows"
      | "csv_too_many_rows"
      | "identity_conflict"
      | "contact_operationally_excluded"
      | "contact_already_provisional",
    message: string,
    public status = 400,
    public headers?: string[],
    public details?: CrmContactExistingMatch
  ) {
    super(message);
  }
}

type NormalizedCrmContactInput = {
  name: string | null;
  phone: string;
  waId: string;
  waIdCanonical: string;
  externalUserHash: string;
  identityCandidates: string[];
};

type ExistingCrmIdentity = {
  contact: { id: string; name: string | null; lifecycle: string | null; operationallyExcludedAt?: Date | string | null } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    contactChannelIdentityId: string | null;
  } | null;
};

type LeadContactChannelIdentitySnapshot = {
  id: string;
  contactId: string | null;
  externalUserHash: string | null;
  externalUserRef: string | null;
  legacyWaId: string | null;
};

export type CrmContactExistingMatch = {
  state: "active" | "excluded" | "provisional";
  contactId: string | null;
  leadId: string | null;
  name: string | null;
  phoneDisplay: string | null;
};

function normalizeOptionalName(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCrmWhatsappPhone(value: unknown): NormalizedCrmContactInput | null {
  const normalized = normalizeCrmWhatsappIdentity(value);
  if (!normalized) return null;
  return {
    name: null,
    phone: normalized.crmCanonicalPhone,
    waId: normalized.crmCanonicalPhone,
    waIdCanonical: normalized.crmCanonicalPhone,
    externalUserHash: normalized.externalUserHash,
    identityCandidates: buildCrmWhatsappIdentityCandidates([value as string, normalized.crmCanonicalPhone]),
  };
}

export function normalizeCrmContactInput(input: CrmContactUpsertInput): NormalizedCrmContactInput {
  const normalized = normalizeCrmWhatsappPhone(input.phone);
  if (!normalized) {
    throw new CrmContactUpsertError("invalid_phone", "Invalid WhatsApp number", 400);
  }
  return {
    ...normalized,
    name: normalizeOptionalName(input.name),
  };
}

function maskPhone(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (!digits) return null;
  if (digits.length <= 4) return `***${digits}`;
  const prefix = digits.length >= 12 ? digits.slice(0, 4) : digits.slice(0, 2);
  return `${prefix}*****${digits.slice(-4)}`;
}

async function findExistingCrmIdentity(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: { clientId: string; waIdCanonical: string; externalUserHash: string; identityCandidates?: string[] }
): Promise<ExistingCrmIdentity> {
  const identityCandidates = Array.from(
    new Set([...(params.identityCandidates ?? []), ...buildCrmWhatsappIdentityCandidates([params.waIdCanonical])])
  );
  const hashCandidates = identityCandidates.map(buildCrmWhatsappExternalUserHash);
  const [identities, contacts, leads] = await Promise.all([
    prisma.contactChannelIdentity.findMany({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
        provider: CRM_CONTACT_MANUAL_PROVIDER,
        channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
        OR: [
          { externalUserHash: { in: hashCandidates } },
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: {
        contact: { select: { id: true, name: true, lifecycle: true, operationallyExcludedAt: true } },
      },
    }),
    prisma.contact.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          { waId: { in: identityCandidates } },
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
          { externalUserHash: { in: hashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: { id: true, name: true, lifecycle: true, operationallyExcludedAt: true },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [
          { waId: { in: identityCandidates } },
          { waIdCanonical: { in: identityCandidates } },
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
          { externalUserHash: { in: hashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: { id: true, name: true, phone: true, contactChannelIdentityId: true },
    }),
  ]);
  const contactIds = new Set([
    ...identities.map((identity) => identity.contact?.id).filter((value): value is string => Boolean(value)),
    ...contacts.map((contact) => contact.id),
  ]);
  const leadIds = new Set(leads.map((lead) => lead.id));
  if (contactIds.size > 1 || leadIds.size > 1) {
    throw new CrmContactUpsertError(
      "identity_conflict",
      "Multiple possible WhatsApp identities found",
      409
    );
  }
  const identity = identities[0] ?? null;
  const contact = contacts[0] ?? null;
  const lead = leads[0] ?? null;
  return {
    contact: identity?.contact ?? contact,
    lead,
  };
}

function buildExistingMatch(params: {
  contact: ExistingCrmIdentity["contact"];
  lead: { id: string; name?: string | null } | null;
  state: CrmContactExistingMatch["state"];
  phone: string;
}): CrmContactExistingMatch {
  return {
    state: params.state,
    contactId: params.contact?.id ?? null,
    leadId: params.lead?.id ?? null,
    name: params.lead?.name ?? params.contact?.name ?? null,
    phoneDisplay: maskPhone(params.phone),
  };
}

function isAnonymizedIdentityHash(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("anon:") || normalized.startsWith("hash:anon:") || normalized.includes("******");
}

function shouldRebindLeadContactChannelIdentity(identity: LeadContactChannelIdentitySnapshot | null) {
  if (!identity) return true;
  return (
    !identity.contactId &&
    !identity.externalUserRef &&
    !identity.legacyWaId &&
    isAnonymizedIdentityHash(identity.externalUserHash)
  );
}

async function resolveLeadContactChannelIdentityId(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    clientId: string;
    existingIdentityId: string | null | undefined;
    operationalIdentityId: string;
  }
) {
  if (!params.existingIdentityId) return params.operationalIdentityId;
  if (params.existingIdentityId === params.operationalIdentityId) return params.existingIdentityId;
  const currentIdentity = await prisma.contactChannelIdentity.findFirst({
    where: { clientId: params.clientId, id: params.existingIdentityId },
    select: {
      id: true,
      contactId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
    },
  });
  return shouldRebindLeadContactChannelIdentity(currentIdentity)
    ? params.operationalIdentityId
    : params.existingIdentityId;
}

export async function upsertCrmContact(
  prisma: PrismaClient,
  params: {
    clientId: string;
    input: CrmContactUpsertInput;
    actorUserId: string;
    requestId: string;
    source: CrmContactUpsertSource;
    audit?: boolean;
  }
) {
  const normalized = normalizeCrmContactInput(params.input);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await findExistingCrmIdentity(tx, {
      clientId: params.clientId,
      waIdCanonical: normalized.waIdCanonical,
      externalUserHash: normalized.externalUserHash,
      identityCandidates: normalized.identityCandidates,
    });
    if (existing.contact?.operationallyExcludedAt) {
      throw new CrmContactUpsertError(
        "contact_operationally_excluded",
        "Contact was previously excluded from operations",
        409,
        undefined,
        buildExistingMatch({
          contact: existing.contact,
          lead: existing.lead,
          state: "excluded",
          phone: normalized.waIdCanonical,
        })
      );
    }
    const excluded = await loadOperationallyExcludedWaIds(tx as PrismaClient, {
      clientId: params.clientId,
      waIds: normalized.identityCandidates,
    });
    if (normalized.identityCandidates.some((candidate) => excluded.has(candidate))) {
      throw new CrmContactUpsertError(
        "contact_operationally_excluded",
        "Contact was previously excluded from operations",
        409,
        undefined,
        buildExistingMatch({
          contact: existing.contact,
          lead: existing.lead,
          state: "excluded",
          phone: normalized.waIdCanonical,
        })
      );
    }
    if (params.source === "crm_manual" && existing.contact?.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL) {
      throw new CrmContactUpsertError(
        "contact_already_provisional",
        "Contact already exists as a provisional contact",
        409,
        undefined,
        buildExistingMatch({
          contact: existing.contact,
          lead: existing.lead,
          state: "provisional",
          phone: normalized.waIdCanonical,
        })
      );
    }
    const contactName = existing.contact?.name ?? normalized.name;
    const contact = existing.contact
      ? await tx.contact.update({
          where: { id: existing.contact.id },
          data: {
            name: contactName,
            channel: "whatsapp",
            provider: CRM_CONTACT_MANUAL_PROVIDER,
            channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
            externalUserHash: normalized.externalUserHash,
            externalUserRef: normalized.waIdCanonical,
            legacyWaId: normalized.waIdCanonical,
          },
          select: { id: true, name: true, lifecycle: true },
        })
      : await tx.contact.create({
          data: {
            clientId: params.clientId,
            waId: normalized.waId,
            name: normalized.name,
            channel: "whatsapp",
            provider: CRM_CONTACT_MANUAL_PROVIDER,
            channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
            externalUserHash: normalized.externalUserHash,
            externalUserRef: normalized.waIdCanonical,
            legacyWaId: normalized.waIdCanonical,
            lifecycle: CONTACT_LIFECYCLE_ACTIVE,
          },
          select: { id: true, name: true, lifecycle: true },
        });
    const shouldPromoteProvisional = contact.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL;
    if (shouldPromoteProvisional) {
      await promoteContactLifecycleToActive({
        prisma: tx as PrismaClient,
        clientId: params.clientId,
        contactId: contact.id,
        requestId: params.requestId,
        source: params.source,
      });
    }
    const identity = await tx.contactChannelIdentity.upsert({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: CRM_CONTACT_MANUAL_PROVIDER,
          channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
          externalUserHash: normalized.externalUserHash,
        },
      },
      update: {
        contactId: contact.id,
        legacyWaId: normalized.waIdCanonical,
        externalUserRef: normalized.waIdCanonical,
        displayName: contact.name ?? normalized.name,
      },
      create: {
        clientId: params.clientId,
        contactId: contact.id,
        channel: "whatsapp",
        provider: CRM_CONTACT_MANUAL_PROVIDER,
        channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
        externalUserHash: normalized.externalUserHash,
        externalUserRef: normalized.waIdCanonical,
        legacyWaId: normalized.waIdCanonical,
        displayName: contact.name ?? normalized.name,
      },
      select: { id: true },
    });
    const leadName = existing.lead?.name ?? contact.name ?? normalized.name;
    const leadContactChannelIdentityId = existing.lead
      ? await resolveLeadContactChannelIdentityId(tx, {
          clientId: params.clientId,
          existingIdentityId: existing.lead.contactChannelIdentityId,
          operationalIdentityId: identity.id,
        })
      : identity.id;
    const lead = existing.lead
      ? await tx.lead.update({
          where: { id: existing.lead.id },
          data: {
            waIdCanonical: normalized.waIdCanonical,
            channel: "whatsapp",
            provider: CRM_CONTACT_MANUAL_PROVIDER,
            channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
            externalUserHash: normalized.externalUserHash,
            externalUserRef: normalized.waIdCanonical,
            legacyWaId: normalized.waIdCanonical,
            contactChannelIdentityId: leadContactChannelIdentityId,
            phone: normalized.phone,
            name: leadName,
          },
          select: { id: true },
        })
      : await tx.lead.create({
          data: {
            tenantId: params.clientId,
            waId: normalized.waId,
            waIdCanonical: normalized.waIdCanonical,
            channel: "whatsapp",
            provider: CRM_CONTACT_MANUAL_PROVIDER,
            channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
            externalUserHash: normalized.externalUserHash,
            externalUserRef: normalized.waIdCanonical,
            legacyWaId: normalized.waIdCanonical,
            contactChannelIdentityId: identity.id,
            name: contact.name ?? normalized.name,
            phone: normalized.phone,
            status: "NEW",
          },
          select: { id: true },
        });
    return {
      contactId: contact.id,
      leadId: lead.id,
      createdContact: !existing.contact,
      createdLead: !existing.lead,
      promotedProvisional: shouldPromoteProvisional,
      existingMatch: existing.contact
        ? buildExistingMatch({
            contact: existing.contact,
            lead,
            state: "active",
            phone: normalized.waIdCanonical,
          })
        : null,
      waId: normalized.waId,
      waIdCanonical: normalized.waIdCanonical,
    };
  });

  if (params.audit !== false) {
    await persistEvent({
      clientId: params.clientId,
      waId: result.waId,
      waIdCanonical: result.waIdCanonical,
      requestId: `${CRM_CONTACT_CREATED_EVENT}:${result.leadId}:${params.requestId}`,
      eventName: CRM_CONTACT_CREATED_EVENT,
      payloadJson: {
        contactId: result.contactId,
        leadId: result.leadId,
        actorUserId: params.actorUserId,
        source: params.source,
        createdContact: result.createdContact,
        createdLead: result.createdLead,
        promotedProvisional: result.promotedProvisional,
        waIdLast4: result.waIdCanonical.slice(-4),
        waIdLength: result.waIdCanonical.length,
      },
    });
  }
  return result;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveMappedColumn(headers: string[], explicit: string | null | undefined, aliases: string[]) {
  const normalizedByHeader = new Map(headers.map((header) => [normalizeHeader(header), header] as const));
  const explicitTrimmed = explicit?.trim();
  if (explicitTrimmed) {
    if (headers.includes(explicitTrimmed)) return explicitTrimmed;
    return normalizedByHeader.get(normalizeHeader(explicitTrimmed)) ?? null;
  }
  for (const alias of aliases) {
    const match = normalizedByHeader.get(normalizeHeader(alias));
    if (match) return match;
  }
  return null;
}

function getMappedValue(row: Record<string, string>, column: string | null) {
  return column ? row[column] ?? "" : "";
}

export function buildCrmContactImportRowsFromCsv(params: {
  csvText: string;
  mapping?: CrmContactCsvMapping | null;
}) {
  const parsed = parseCampaignCsv(params.csvText);
  if (!parsed.ok) {
    throw new CrmContactUpsertError(parsed.error, "Invalid CSV", 400);
  }
  const phoneColumn = resolveMappedColumn(params.csvText ? parsed.headers : [], params.mapping?.phoneColumn, [
    "numero",
    "número",
    "telefone",
    "phone",
    "whatsapp",
  ]);
  if (!phoneColumn) {
    throw new CrmContactUpsertError("missing_phone_column", "Missing phone column", 400, parsed.headers);
  }
  const nameColumn = resolveMappedColumn(parsed.headers, params.mapping?.nameColumn, ["nome", "name"]);
  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    rows: parsed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      phone: getMappedValue(row.values, phoneColumn),
      name: getMappedValue(row.values, nameColumn),
    })),
  };
}

export async function previewCrmContactCsvImport(
  prisma: PrismaClient,
  params: {
    clientId: string;
    csvText: string;
    mapping?: CrmContactCsvMapping | null;
  }
) {
  const parsed = buildCrmContactImportRowsFromCsv(params);
  const errors: Array<{ rowNumber: number; reason: "invalid_phone" | "duplicate_in_file" | "excluded_contact"; label: string; phoneDisplay: string | null }> = [];
  const accepted: Array<{ rowNumber: number; phone: string; waIdCanonical: string; name: string | null }> = [];
  const seen = new Set<string>();
  for (const row of parsed.rows) {
    const normalized = normalizeCrmWhatsappPhone(row.phone);
    if (!normalized) {
      errors.push({
        rowNumber: row.rowNumber,
        reason: "invalid_phone",
        label: "Telefone invalido",
        phoneDisplay: maskPhone(row.phone),
      });
      continue;
    }
    if (seen.has(normalized.waIdCanonical)) {
      errors.push({
        rowNumber: row.rowNumber,
        reason: "duplicate_in_file",
        label: "Duplicado no arquivo",
        phoneDisplay: maskPhone(normalized.waIdCanonical),
      });
      continue;
    }
    seen.add(normalized.waIdCanonical);
    accepted.push({
      rowNumber: row.rowNumber,
      phone: normalized.phone,
      waIdCanonical: normalized.waIdCanonical,
      name: normalizeOptionalName(row.name),
    });
  }
  const keys = Array.from(
    new Set(accepted.flatMap((row) => buildCrmWhatsappIdentityCandidates([row.waIdCanonical])))
  );
  const existingContacts = keys.length
    ? await prisma.contact.findMany({
        where: {
          clientId: params.clientId,
          OR: [
            { waId: { in: keys } },
            { externalUserRef: { in: keys } },
            { legacyWaId: { in: keys } },
          ],
        },
        select: { waId: true, externalUserRef: true, legacyWaId: true },
      })
    : [];
  const existingKeys = new Set(
    existingContacts.flatMap((contact) => [contact.waId, contact.externalUserRef, contact.legacyWaId].filter(Boolean))
  );
  const excludedKeys = await loadOperationallyExcludedWaIds(prisma, {
    clientId: params.clientId,
    waIds: keys,
  });
  for (const row of accepted) {
    if (buildCrmWhatsappIdentityCandidates([row.waIdCanonical]).some((candidate) => excludedKeys.has(candidate))) {
      errors.push({
        rowNumber: row.rowNumber,
        reason: "excluded_contact",
        label: "Contato excluído da operação",
        phoneDisplay: maskPhone(row.waIdCanonical),
      });
    }
  }
  const excludedCount = accepted.filter((row) =>
    buildCrmWhatsappIdentityCandidates([row.waIdCanonical]).some((candidate) => excludedKeys.has(candidate))
  ).length;
  const existingCount = accepted.filter((row) =>
    buildCrmWhatsappIdentityCandidates([row.waIdCanonical]).some((candidate) => existingKeys.has(candidate))
  ).length;
  return {
    ok: true as const,
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    totalRows: parsed.rows.length,
    validRows: accepted.length,
    invalidRows: errors.filter((error) => error.reason === "invalid_phone").length,
    duplicatesInFile: errors.filter((error) => error.reason === "duplicate_in_file").length,
    excludedContacts: excludedCount,
    existingContacts: existingCount,
    readyToImport: accepted.length - excludedCount,
    sampleErrors: errors.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT),
    truncatedErrors: errors.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
  };
}

export async function confirmCrmContactCsvImport(
  prisma: PrismaClient,
  params: {
    clientId: string;
    csvText: string;
    mapping?: CrmContactCsvMapping | null;
    actorUserId: string;
    requestId: string;
  }
) {
  const preview = await previewCrmContactCsvImport(prisma, params);
  const parsed = buildCrmContactImportRowsFromCsv(params);
  const seen = new Set<string>();
  const excludedKeys = await loadOperationallyExcludedWaIds(prisma, {
    clientId: params.clientId,
    waIds: Array.from(
      new Set(
        parsed.rows.flatMap((row) => {
          const normalized = normalizeCrmWhatsappPhone(row.phone);
          return normalized ? buildCrmWhatsappIdentityCandidates([normalized.waIdCanonical]) : [];
        })
      )
    ),
  });
  const readyRows = parsed.rows.flatMap((row) => {
    const normalized = normalizeCrmWhatsappPhone(row.phone);
    if (!normalized || seen.has(normalized.waIdCanonical)) return [];
    seen.add(normalized.waIdCanonical);
    if (buildCrmWhatsappIdentityCandidates([normalized.waIdCanonical]).some((candidate) => excludedKeys.has(candidate))) {
      return [];
    }
    return [{ phone: normalized.waIdCanonical, name: normalizeOptionalName(row.name) }];
  });
  let created = 0;
  let reused = 0;
  let promotedProvisional = 0;
  for (const row of readyRows) {
    const result = await upsertCrmContact(prisma, {
      clientId: params.clientId,
      input: row,
      actorUserId: params.actorUserId,
      requestId: `${params.requestId}:${resultlessHash(row.phone)}`,
      source: "crm_import",
      audit: false,
    });
    if (result.createdContact || result.createdLead) created += 1;
    else reused += 1;
    if (result.promotedProvisional) promotedProvisional += 1;
  }
  await persistEvent({
    clientId: params.clientId,
    requestId: `${CRM_CONTACT_IMPORT_SUMMARY_EVENT}:${params.requestId}`,
    eventName: CRM_CONTACT_IMPORT_SUMMARY_EVENT,
    payloadJson: {
      actorUserId: params.actorUserId,
      source: "crm_import",
      received: preview.totalRows,
      created,
      reused,
      invalid: preview.invalidRows,
      duplicates: preview.duplicatesInFile,
      excludedContacts: preview.excludedContacts,
      promotedProvisional,
    },
  });
  return {
    ok: true as const,
    received: preview.totalRows,
    created,
    reused,
    updated: reused,
    duplicates: preview.duplicatesInFile,
    invalid: preview.invalidRows,
    excludedContacts: preview.excludedContacts,
    readyToImport: preview.readyToImport,
    promotedProvisional,
  };
}

function resultlessHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export { CAMPAIGN_IMPORT_MAX_CSV_BYTES as CRM_IMPORT_MAX_CSV_BYTES, CAMPAIGN_IMPORT_MAX_ROWS as CRM_IMPORT_MAX_ROWS };
