import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTACT_LIFECYCLE_ACTIVE,
  CONTACT_LIFECYCLE_PROVISIONAL,
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
    status: string;
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

type CrmContactImportIssueReason =
  | "invalid_phone"
  | "duplicate_in_file"
  | "excluded_contact"
  | "provisional_contact"
  | "identity_conflict";

type CrmContactImportIssue = {
  rowNumber: number;
  reason: CrmContactImportIssueReason;
  label: string;
  phoneDisplay: string | null;
};

type CrmContactImportReadyRow = {
  rowNumber: number;
  phone: string;
  waIdCanonical: string;
  name: string | null;
};

type CrmContactImportClassification = {
  parsed: ReturnType<typeof buildCrmContactImportRowsFromCsv>;
  accepted: CrmContactImportReadyRow[];
  readyRows: CrmContactImportReadyRow[];
  issues: CrmContactImportIssue[];
  existingActiveRows: CrmContactImportReadyRow[];
  excludedRows: CrmContactImportReadyRow[];
  provisionalRows: CrmContactImportReadyRow[];
  conflictRows: CrmContactImportReadyRow[];
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
      select: { id: true, name: true, phone: true, status: true, contactChannelIdentityId: true },
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

export async function resolveCrmContactIdentity(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: { clientId: string; phone: unknown }
) {
  const normalized = normalizeCrmContactInput({ phone: params.phone });
  const existing = await findExistingCrmIdentity(prisma, {
    clientId: params.clientId,
    waIdCanonical: normalized.waIdCanonical,
    externalUserHash: normalized.externalUserHash,
    identityCandidates: normalized.identityCandidates,
  });
  return {
    waIdCanonical: normalized.waIdCanonical,
    identityCandidates: normalized.identityCandidates,
    contact: existing.contact,
    lead: existing.lead,
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

function getImportIssueLabel(reason: CrmContactImportIssueReason) {
  switch (reason) {
    case "invalid_phone":
      return "Número de WhatsApp inválido";
    case "duplicate_in_file":
      return "Este número aparece mais de uma vez no arquivo";
    case "excluded_contact":
      return "Contato fora da operação";
    case "provisional_contact":
      return "Este número já possui um contato associado";
    case "identity_conflict":
      return "Não foi possível determinar com segurança a identidade deste número";
  }
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

type CrmContactUpsertParams = {
  clientId: string;
  input: CrmContactUpsertInput;
  actorUserId: string;
  requestId: string;
  source: CrmContactUpsertSource;
  audit?: boolean;
  crmStatusId?: string | null;
};

export async function upsertCrmContactInTransaction(
  tx: Prisma.TransactionClient,
  params: CrmContactUpsertParams
) {
  const normalized = normalizeCrmContactInput(params.input);
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
    if (existing.contact?.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL) {
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
    const updateExistingName = params.source === "crm_import";
    const contactName = existing.contact
      ? updateExistingName
        ? normalized.name ?? existing.contact.name ?? existing.lead?.name ?? null
        : existing.contact.name ?? existing.lead?.name ?? normalized.name
      : normalized.name;
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
    const leadName = existing.lead
      ? updateExistingName
        ? normalized.name ?? existing.lead.name ?? contact.name ?? null
        : existing.lead.name ?? contact.name ?? normalized.name
      : contact.name ?? normalized.name;
    const leadContactChannelIdentityId = existing.lead
      ? await resolveLeadContactChannelIdentityId(tx, {
          clientId: params.clientId,
          existingIdentityId: existing.lead.contactChannelIdentityId,
          operationalIdentityId: identity.id,
        })
      : identity.id;
    const previousLead = existing.lead
      ? { id: existing.lead.id, name: existing.lead.name, status: existing.lead.status }
      : null;
    const leadStatus = params.crmStatusId ?? existing.lead?.status ?? "NEW";
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
            ...(params.crmStatusId ? { status: params.crmStatusId } : {}),
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
            status: leadStatus,
          },
          select: { id: true },
        });
    return {
      contactId: contact.id,
      leadId: lead.id,
      createdContact: !existing.contact,
      createdLead: !existing.lead,
      promotedProvisional: false,
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
      previousLead,
      leadName,
      leadStatus,
    };
}

export async function upsertCrmContact(
  prisma: PrismaClient,
  params: CrmContactUpsertParams
) {
  const result = await prisma.$transaction((tx) => upsertCrmContactInTransaction(tx, params));

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

async function classifyCrmContactImportRows(
  prisma: PrismaClient,
  params: {
    clientId: string;
    csvText: string;
    mapping?: CrmContactCsvMapping | null;
  }
): Promise<CrmContactImportClassification> {
  const parsed = buildCrmContactImportRowsFromCsv(params);
  const issues: CrmContactImportIssue[] = [];
  const seen = new Set<string>();
  const accepted: CrmContactImportReadyRow[] = [];
  for (const row of parsed.rows) {
    const normalized = normalizeCrmWhatsappPhone(row.phone);
    if (!normalized) {
      issues.push({
        rowNumber: row.rowNumber,
        reason: "invalid_phone",
        label: getImportIssueLabel("invalid_phone"),
        phoneDisplay: maskPhone(row.phone),
      });
      continue;
    }
    if (seen.has(normalized.waIdCanonical)) {
      issues.push({
        rowNumber: row.rowNumber,
        reason: "duplicate_in_file",
        label: getImportIssueLabel("duplicate_in_file"),
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
  const keys = Array.from(new Set(accepted.flatMap((row) => buildCrmWhatsappIdentityCandidates([row.waIdCanonical]))));
  const hashKeys = keys.map(buildCrmWhatsappExternalUserHash);
  const [existingContacts, existingIdentities, existingLeads] = keys.length
    ? await Promise.all([
        prisma.contact.findMany({
          where: {
            clientId: params.clientId,
            OR: [
              { waId: { in: keys } },
              { externalUserRef: { in: keys } },
              { legacyWaId: { in: keys } },
              { externalUserHash: { in: hashKeys } },
            ],
          },
          select: {
            id: true,
            name: true,
            lifecycle: true,
            operationallyExcludedAt: true,
            waId: true,
            externalUserHash: true,
            externalUserRef: true,
            legacyWaId: true,
          },
        }),
        prisma.contactChannelIdentity.findMany({
          where: {
            clientId: params.clientId,
            channel: "whatsapp",
            provider: CRM_CONTACT_MANUAL_PROVIDER,
            channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
            OR: [
              { externalUserHash: { in: hashKeys } },
              { externalUserRef: { in: keys } },
              { legacyWaId: { in: keys } },
            ],
          },
          select: {
            externalUserHash: true,
            externalUserRef: true,
            legacyWaId: true,
            contact: {
              select: {
                id: true,
                name: true,
                lifecycle: true,
                operationallyExcludedAt: true,
              },
            },
          },
        }),
        prisma.lead.findMany({
          where: {
            tenantId: params.clientId,
            OR: [
              { waId: { in: keys } },
              { waIdCanonical: { in: keys } },
              { externalUserRef: { in: keys } },
              { legacyWaId: { in: keys } },
              { externalUserHash: { in: hashKeys } },
            ],
          },
          select: {
            id: true,
            name: true,
            phone: true,
            waId: true,
            waIdCanonical: true,
            externalUserHash: true,
            externalUserRef: true,
            legacyWaId: true,
          },
        }),
      ])
    : [[], [], []] as const;
  const excludedKeys = await loadOperationallyExcludedWaIds(prisma, {
    clientId: params.clientId,
    waIds: keys,
  });
  const readyRows: CrmContactImportReadyRow[] = [];
  const existingActiveRows: CrmContactImportReadyRow[] = [];
  const excludedRows: CrmContactImportReadyRow[] = [];
  const provisionalRows: CrmContactImportReadyRow[] = [];
  const conflictRows: CrmContactImportReadyRow[] = [];

  const matchesIdentity = (
    source: {
      waId?: string | null;
      waIdCanonical?: string | null;
      externalUserHash?: string | null;
      externalUserRef?: string | null;
      legacyWaId?: string | null;
    },
    identityCandidates: Set<string>,
    hashCandidates: Set<string>
  ) =>
    [source.waId, source.waIdCanonical, source.externalUserRef, source.legacyWaId].some(
      (value) => Boolean(value) && identityCandidates.has(String(value))
    ) || (Boolean(source.externalUserHash) && hashCandidates.has(String(source.externalUserHash)));

  for (const row of accepted) {
    const rowIdentityCandidates = new Set(buildCrmWhatsappIdentityCandidates([row.waIdCanonical]));
    const rowHashCandidates = new Set(Array.from(rowIdentityCandidates).map(buildCrmWhatsappExternalUserHash));
    const matchingContacts = existingContacts.filter((contact) =>
      matchesIdentity(contact, rowIdentityCandidates, rowHashCandidates)
    );
    const matchingIdentityContacts = existingIdentities
      .filter((identity) => matchesIdentity(identity, rowIdentityCandidates, rowHashCandidates))
      .map((identity) => identity.contact)
      .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
    const matchingLeads = existingLeads.filter((lead) => matchesIdentity(lead, rowIdentityCandidates, rowHashCandidates));
    const contactIds = new Set([...matchingContacts.map((contact) => contact.id), ...matchingIdentityContacts.map((contact) => contact.id)]);
    const leadIds = new Set(matchingLeads.map((lead) => lead.id));
    const contact = matchingIdentityContacts[0] ?? matchingContacts[0] ?? null;
    if (contactIds.size > 1 || leadIds.size > 1) {
      conflictRows.push(row);
      issues.push({
        rowNumber: row.rowNumber,
        reason: "identity_conflict",
        label: getImportIssueLabel("identity_conflict"),
        phoneDisplay: maskPhone(row.waIdCanonical),
      });
      continue;
    }
    if (
      Array.from(rowIdentityCandidates).some((candidate) => excludedKeys.has(candidate)) ||
      Boolean(contact?.operationallyExcludedAt)
    ) {
      excludedRows.push(row);
      issues.push({
        rowNumber: row.rowNumber,
        reason: "excluded_contact",
        label: getImportIssueLabel("excluded_contact"),
        phoneDisplay: maskPhone(row.waIdCanonical),
      });
      continue;
    }
    if (contact?.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL) {
      provisionalRows.push(row);
      issues.push({
        rowNumber: row.rowNumber,
        reason: "provisional_contact",
        label: getImportIssueLabel("provisional_contact"),
        phoneDisplay: maskPhone(row.waIdCanonical),
      });
      continue;
    }
    if (contact || matchingLeads.length > 0) {
      existingActiveRows.push(row);
      continue;
    }
    readyRows.push(row);
  }
  return {
    parsed,
    accepted,
    readyRows,
    issues,
    existingActiveRows,
    excludedRows,
    provisionalRows,
    conflictRows,
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
  const classification = await classifyCrmContactImportRows(prisma, params);
  return {
    ok: true as const,
    headers: classification.parsed.headers,
    delimiter: classification.parsed.delimiter,
    totalRows: classification.parsed.rows.length,
    validRows: classification.accepted.length,
    invalidRows: classification.issues.filter((error) => error.reason === "invalid_phone").length,
    duplicatesInFile: classification.issues.filter((error) => error.reason === "duplicate_in_file").length,
    excludedContacts: classification.excludedRows.length,
    provisionalContacts: classification.provisionalRows.length,
    identityConflicts: classification.conflictRows.length,
    existingContacts: classification.existingActiveRows.length,
    readyToImport: classification.readyRows.length,
    sampleErrors: classification.issues.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT),
    truncatedErrors: classification.issues.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
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
    audit?: boolean;
  }
) {
  const classification = await classifyCrmContactImportRows(prisma, params);
  let created = 0;
  let reused = classification.existingActiveRows.length;
  let excludedContacts = classification.excludedRows.length;
  let provisionalContacts = classification.provisionalRows.length;
  let identityConflicts = classification.conflictRows.length;
  let failed = 0;
  for (const row of classification.readyRows) {
    try {
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
    } catch (error) {
      if (error instanceof CrmContactUpsertError) {
        if (error.code === "contact_operationally_excluded") excludedContacts += 1;
        else if (error.code === "contact_already_provisional") provisionalContacts += 1;
        else if (error.code === "identity_conflict") identityConflicts += 1;
        else failed += 1;
        continue;
      }
      if (getPrismaErrorCode(error) === "P2002") {
        identityConflicts += 1;
        continue;
      }
      throw error;
    }
  }
  if (params.audit !== false) {
    await persistEvent({
      clientId: params.clientId,
      requestId: `${CRM_CONTACT_IMPORT_SUMMARY_EVENT}:${params.requestId}`,
      eventName: CRM_CONTACT_IMPORT_SUMMARY_EVENT,
      payloadJson: {
        actorUserId: params.actorUserId,
        source: "crm_import",
        received: classification.parsed.rows.length,
        created,
        reused,
        invalid: classification.issues.filter((error) => error.reason === "invalid_phone").length,
        duplicates: classification.issues.filter((error) => error.reason === "duplicate_in_file").length,
        excludedContacts,
        provisionalContacts,
        identityConflicts,
        failed,
        promotedProvisional: 0,
      },
    });
  }
  return {
    ok: true as const,
    received: classification.parsed.rows.length,
    created,
    reused,
    updated: reused,
    duplicates: classification.issues.filter((error) => error.reason === "duplicate_in_file").length,
    invalid: classification.issues.filter((error) => error.reason === "invalid_phone").length,
    excludedContacts,
    provisionalContacts,
    identityConflicts,
    failed,
    readyToImport: classification.readyRows.length,
    promotedProvisional: 0,
  };
}

function resultlessHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getPrismaErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : null;
}

export { CAMPAIGN_IMPORT_MAX_CSV_BYTES as CRM_IMPORT_MAX_CSV_BYTES, CAMPAIGN_IMPORT_MAX_ROWS as CRM_IMPORT_MAX_ROWS };
