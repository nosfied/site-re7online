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
  buildCrmSituationResolver,
  buildStatusLabelById,
  parseCampaignCsv,
} from "../campaigns/campaignRecipientImport.js";
import type { CrmBusinessStatusConfig } from "../config/tenantConfig.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { persistEvent } from "../db/persist.js";
import { hashWhatsAppExternalUser } from "../channels/whatsappBackfillDryRun.js";
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
  crmSituationColumn?: string | null;
  companyColumn?: string | null;
  cityColumn?: string | null;
  emailColumn?: string | null;
  serviceColumn?: string | null;
};

export type CrmContactUpsertInput = {
  name?: unknown;
  phone: unknown;
  company?: unknown;
  city?: unknown;
  email?: unknown;
  service?: unknown;
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
    company: string | null;
    city: string | null;
    email: string | null;
    service: string | null;
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
  | "invalid_crm_status"
  | "excluded_contact"
  | "provisional_contact"
  | "identity_conflict";

type CrmContactImportIssue = {
  rowNumber: number;
  reason: CrmContactImportIssueReason;
  label: string;
  inputPhone: string | null;
  normalizedPhone: string | null;
  phoneDisplay: string | null;
  crmSituationInput: string | null;
  crmStatusId: string | null;
  crmStatusLabel: string | null;
};

type CrmContactImportReadyRow = {
  rowNumber: number;
  phone: string;
  waIdCanonical: string;
  identityCandidates: string[];
  name: string | null;
  company: string | null;
  city: string | null;
  email: string | null;
  service: string | null;
  crmSituationInput: string | null;
  crmStatusId: string | null;
  crmStatusLabel: string | null;
  existingContact: boolean;
  existingName: string | null;
  existingLead: {
    id: string;
    name: string | null;
    status: string;
    company: string | null;
    city: string | null;
    email: string | null;
    service: string | null;
  } | null;
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

function normalizeOptionalCrmText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalCrmEmail(value: unknown) {
  const normalized = normalizeOptionalCrmText(value, 180);
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized.toLowerCase() : null;
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
  const hashCandidates = Array.from(new Set(identityCandidates.flatMap((candidate) => [
    buildCrmWhatsappExternalUserHash(candidate),
    hashWhatsAppExternalUser(candidate),
  ])));
  const [identities, contacts, leads] = await Promise.all([
    prisma.contactChannelIdentity.findMany({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
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
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          company: true,
          city: true,
          email: true,
          service: true,
          contactChannelIdentityId: true,
        },
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
    case "invalid_crm_status":
      return "Situação no CRM não encontrada";
    case "excluded_contact":
      return "Contato fora da operação";
    case "provisional_contact":
      return "Este número já possui um contato associado";
    case "identity_conflict":
      return "Não foi possível determinar com segurança a identidade deste número";
  }
}

function normalizeImportIssueReason(reason: CrmContactImportIssueReason) {
  switch (reason) {
    case "invalid_phone":
      return "INVALID_PHONE";
    case "duplicate_in_file":
      return "DUPLICATE";
    case "invalid_crm_status":
      return "INVALID_CRM_STATUS";
    case "excluded_contact":
      return "EXCLUDED_CONTACT";
    case "provisional_contact":
      return "PROVISIONAL_CONTACT";
    case "identity_conflict":
      return "IDENTITY_CONFLICT";
  }
}

function sanitizeIssueInputPhone(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return normalized.length > 0 ? normalized : null;
}

function sanitizeOptionalImportText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized.length > 0 ? normalized : null;
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
    const inputCompany = normalizeOptionalCrmText(params.input.company, 120);
    const inputCity = normalizeOptionalCrmText(params.input.city, 120);
    const inputEmail = normalizeOptionalCrmEmail(params.input.email);
    const inputService = normalizeOptionalCrmText(params.input.service, 120);
    const previousLead = existing.lead
      ? {
          id: existing.lead.id,
          name: existing.lead.name,
          status: existing.lead.status,
          company: existing.lead.company,
          city: existing.lead.city,
          email: existing.lead.email,
          service: existing.lead.service,
        }
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
            ...(inputCompany ? { company: inputCompany } : {}),
            ...(inputCity ? { city: inputCity } : {}),
            ...(inputEmail ? { email: inputEmail } : {}),
            ...(inputService ? { service: inputService } : {}),
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
            company: inputCompany,
            city: inputCity,
            email: inputEmail,
            service: inputService,
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

export async function recordCrmConversationContactOrigin(params: {
  clientId: string;
  leadId: string;
  contactId?: string | null;
  waId: string;
  waIdCanonical?: string | null;
  conversationId?: string | null;
  requestId: string;
  source?: string | null;
}) {
  const canonical = params.waIdCanonical ?? normalizeWaIdDigits(params.waId) ?? params.waId;
  await persistEvent({
    clientId: params.clientId,
    conversationId: params.conversationId ?? null,
    waId: params.waId,
    waIdCanonical: canonical,
    requestId: `${CRM_CONTACT_CREATED_EVENT}:conversation:${params.leadId}`,
    eventName: CRM_CONTACT_CREATED_EVENT,
    payloadJson: {
      contactId: params.contactId ?? null,
      leadId: params.leadId,
      source: params.source ?? "conversation_inbound",
      createdContact: false,
      createdLead: true,
      waIdLast4: canonical.slice(-4),
      waIdLength: canonical.length,
      requestId: params.requestId,
    },
  });
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
  if (explicit === null) return null;
  const explicitTrimmed = explicit?.trim();
  if (explicit !== undefined && !explicitTrimmed) return null;
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

function resolveSafeAutoMappedColumn(headers: string[], aliases: string[]) {
  return resolveMappedColumn(headers, undefined, aliases);
}

export function inspectCrmContactCsvImport(csvText: string) {
  const parsed = parseCampaignCsv(csvText);
  if (!parsed.ok) {
    throw new CrmContactUpsertError(parsed.error, "Invalid CSV", 400);
  }
  return {
    ok: true as const,
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    totalRows: parsed.rows.length,
    mapping: {
      phoneColumn: resolveSafeAutoMappedColumn(parsed.headers, [
        "numero",
        "número",
        "telefone",
        "phone",
        "whatsapp",
      ]),
      nameColumn: resolveSafeAutoMappedColumn(parsed.headers, ["nome", "name"]),
      crmSituationColumn: resolveSafeAutoMappedColumn(parsed.headers, [
        "situacao no crm",
        "situação no crm",
        "situacao crm",
        "situação crm",
        "crm situation",
        "status crm",
        "crm status",
      ]),
      companyColumn: resolveSafeAutoMappedColumn(parsed.headers, [
        "empresa",
        "company",
        "organizacao",
        "organização",
      ]),
      cityColumn: resolveSafeAutoMappedColumn(parsed.headers, ["cidade", "city", "municipio", "município"]),
      emailColumn: resolveSafeAutoMappedColumn(parsed.headers, ["email", "e-mail"]),
      serviceColumn: resolveSafeAutoMappedColumn(parsed.headers, [
        "servico",
        "serviço",
        "interesse",
        "service",
        "interest",
      ]),
    },
  };
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
  const companyColumn = resolveMappedColumn(parsed.headers, params.mapping?.companyColumn, [
    "empresa",
    "company",
    "organizacao",
    "organização",
  ]);
  const cityColumn = resolveMappedColumn(parsed.headers, params.mapping?.cityColumn, ["cidade", "city", "municipio", "município"]);
  const emailColumn = resolveMappedColumn(parsed.headers, params.mapping?.emailColumn, ["email", "e-mail"]);
  const serviceColumn = resolveMappedColumn(parsed.headers, params.mapping?.serviceColumn, [
    "servico",
    "serviço",
    "interesse",
    "service",
    "interest",
  ]);
  const crmSituationColumn = resolveMappedColumn(parsed.headers, params.mapping?.crmSituationColumn, [
    "situacao no crm",
    "situação no crm",
    "situacao crm",
    "situação crm",
    "crm situation",
    "status crm",
    "crm status",
  ]);
  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    rows: parsed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      phone: getMappedValue(row.values, phoneColumn),
      name: getMappedValue(row.values, nameColumn),
      company: getMappedValue(row.values, companyColumn),
      city: getMappedValue(row.values, cityColumn),
      email: getMappedValue(row.values, emailColumn),
      service: getMappedValue(row.values, serviceColumn),
      crmSituation: getMappedValue(row.values, crmSituationColumn),
    })),
  };
}

async function classifyCrmContactImportRows(
  prisma: PrismaClient,
	  params: {
	    clientId: string;
	    csvText: string;
	    mapping?: CrmContactCsvMapping | null;
	    crmStatuses?: CrmBusinessStatusConfig[] | null;
	  }
	): Promise<CrmContactImportClassification> {
	  const parsed = buildCrmContactImportRowsFromCsv(params);
	  const issues: CrmContactImportIssue[] = [];
	  const seen = new Set<string>();
	  const accepted: CrmContactImportReadyRow[] = [];
	  const resolveCrmSituation = buildCrmSituationResolver(params.crmStatuses);
	  for (const row of parsed.rows) {
	    const crmSituationInput = sanitizeOptionalImportText(row.crmSituation, 80);
	    const crmSituation = resolveCrmSituation(crmSituationInput);
	    const normalized = normalizeCrmWhatsappPhone(row.phone);
	    if (!normalized) {
	      issues.push({
	        rowNumber: row.rowNumber,
	        reason: "invalid_phone",
	        label: getImportIssueLabel("invalid_phone"),
	        inputPhone: sanitizeIssueInputPhone(row.phone),
	        normalizedPhone: null,
	        phoneDisplay: row.phone,
	        crmSituationInput,
	        crmStatusId: null,
	        crmStatusLabel: null,
	      });
	      continue;
	    }
	    if (crmSituation.kind === "unknown" || crmSituation.kind === "ambiguous") {
	      issues.push({
	        rowNumber: row.rowNumber,
	        reason: "invalid_crm_status",
	        label: getImportIssueLabel("invalid_crm_status"),
	        inputPhone: sanitizeIssueInputPhone(row.phone),
	        normalizedPhone: normalized.waIdCanonical,
	        phoneDisplay: normalized.waIdCanonical,
	        crmSituationInput,
	        crmStatusId: null,
	        crmStatusLabel: null,
	      });
	      continue;
	    }
	    const identityCandidates = buildCrmWhatsappIdentityCandidates([row.phone, normalized.waIdCanonical]);
	    if (identityCandidates.some((candidate) => seen.has(candidate))) {
	      issues.push({
        rowNumber: row.rowNumber,
        reason: "duplicate_in_file",
        label: getImportIssueLabel("duplicate_in_file"),
	        inputPhone: sanitizeIssueInputPhone(row.phone),
	        normalizedPhone: normalized.waIdCanonical,
	        phoneDisplay: normalized.waIdCanonical,
	        crmSituationInput,
	        crmStatusId: crmSituation.kind === "matched" ? crmSituation.status.id : null,
	        crmStatusLabel: crmSituation.kind === "matched" ? crmSituation.status.label : null,
	      });
	      continue;
	    }
    for (const candidate of identityCandidates) seen.add(candidate);
    accepted.push({
      rowNumber: row.rowNumber,
      phone: normalized.phone,
      waIdCanonical: normalized.waIdCanonical,
	      identityCandidates,
	      name: normalizeOptionalName(row.name),
	      company: normalizeOptionalCrmText(row.company, 120),
	      city: normalizeOptionalCrmText(row.city, 120),
	      email: normalizeOptionalCrmEmail(row.email),
	      service: normalizeOptionalCrmText(row.service, 120),
	      crmSituationInput,
	      crmStatusId: crmSituation.kind === "matched" ? crmSituation.status.id : null,
	      crmStatusLabel: crmSituation.kind === "matched" ? crmSituation.status.label : null,
	      existingContact: false,
	      existingName: null,
	      existingLead: null,
	    });
	  }
  const keys = Array.from(new Set(accepted.flatMap((row) => row.identityCandidates)));
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
		            status: true,
		            company: true,
		            city: true,
		            email: true,
		            service: true,
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
    const rowIdentityCandidates = new Set(row.identityCandidates);
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
	        inputPhone: row.waIdCanonical,
	        normalizedPhone: row.waIdCanonical,
	        phoneDisplay: row.waIdCanonical,
	        crmSituationInput: row.crmSituationInput,
	        crmStatusId: row.crmStatusId,
	        crmStatusLabel: row.crmStatusLabel,
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
	        inputPhone: row.waIdCanonical,
	        normalizedPhone: row.waIdCanonical,
	        phoneDisplay: row.waIdCanonical,
	        crmSituationInput: row.crmSituationInput,
	        crmStatusId: row.crmStatusId,
	        crmStatusLabel: row.crmStatusLabel,
	      });
	      continue;
	    }
    if (contact?.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL) {
      provisionalRows.push(row);
	      issues.push({
	        rowNumber: row.rowNumber,
	        reason: "provisional_contact",
	        label: getImportIssueLabel("provisional_contact"),
	        inputPhone: row.waIdCanonical,
	        normalizedPhone: row.waIdCanonical,
	        phoneDisplay: row.waIdCanonical,
	        crmSituationInput: row.crmSituationInput,
	        crmStatusId: row.crmStatusId,
	        crmStatusLabel: row.crmStatusLabel,
	      });
	      continue;
	    }
	    if (contact || matchingLeads.length > 0) {
	      existingActiveRows.push({
	        ...row,
	        existingContact: Boolean(contact),
	        existingName: matchingLeads[0]?.name ?? contact?.name ?? null,
		        existingLead: matchingLeads[0]
		          ? {
		              id: matchingLeads[0].id,
		              name: matchingLeads[0].name,
		              status: matchingLeads[0].status,
		              company: matchingLeads[0].company,
		              city: matchingLeads[0].city,
		              email: matchingLeads[0].email,
		              service: matchingLeads[0].service,
		            }
		          : null,
	      });
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
	    crmStatuses?: CrmBusinessStatusConfig[] | null;
	  }
	) {
	  const classification = await classifyCrmContactImportRows(prisma, params);
	  const statusLabelById = buildStatusLabelById(params.crmStatuses);
		  const importableRows = [...classification.readyRows, ...classification.existingActiveRows];
		  const previewRows = importableRows.slice(0, 200).map((row) => {
		    const fieldChanges = [
		      row.name !== null && row.name !== row.existingName,
		      row.company !== null && row.company !== row.existingLead?.company,
		      row.city !== null && row.city !== row.existingLead?.city,
		      row.email !== null && row.email !== row.existingLead?.email,
		      row.service !== null && row.service !== row.existingLead?.service,
		      row.crmStatusId !== null && row.crmStatusId !== row.existingLead?.status,
		    ];
		    const changes = fieldChanges.some(Boolean);
		    return {
		      rowNumber: row.rowNumber,
		      name: row.name,
		      company: row.company,
		      city: row.city,
		      email: row.email,
		      service: row.service,
		      inputPhone: row.phone,
		      normalizedPhone: row.waIdCanonical,
		      phoneDisplay: row.waIdCanonical,
		      operation: !row.existingContact && !row.existingLead ? "CREATE" : changes ? "UPDATE" : "UNCHANGED",
		      leadId: row.existingLead?.id ?? null,
		      fieldsToUpdate: [
		        row.name !== null && row.name !== row.existingName ? "Nome" : null,
		        row.company !== null && row.company !== row.existingLead?.company ? "Empresa" : null,
		        row.city !== null && row.city !== row.existingLead?.city ? "Cidade" : null,
		        row.email !== null && row.email !== row.existingLead?.email ? "E-mail" : null,
		        row.service !== null && row.service !== row.existingLead?.service ? "Serviço / interesse" : null,
		        row.crmStatusId !== null && row.crmStatusId !== row.existingLead?.status ? "Situação no CRM" : null,
		      ].filter((field): field is string => Boolean(field)),
		      crmSituation: {
	        input: row.crmSituationInput,
	        statusId: row.crmStatusId,
	        label: row.crmStatusLabel,
	        previousStatusId: row.existingLead?.status ?? null,
	        previousLabel: row.existingLead?.status
	          ? statusLabelById.get(row.existingLead.status.toUpperCase()) ?? row.existingLead.status
	          : null,
	      },
	    };
	  });
		  const updatedRows = classification.existingActiveRows.filter((row) =>
		    [
		      row.name !== null && row.name !== row.existingName,
		      row.company !== null && row.company !== row.existingLead?.company,
		      row.city !== null && row.city !== row.existingLead?.city,
		      row.email !== null && row.email !== row.existingLead?.email,
		      row.service !== null && row.service !== row.existingLead?.service,
		      row.crmStatusId !== null && row.crmStatusId !== row.existingLead?.status,
		    ].some(Boolean)
	  ).length;
	  const unchangedRows = classification.existingActiveRows.length - updatedRows;
	  return {
	    ok: true as const,
	    headers: classification.parsed.headers,
	    delimiter: classification.parsed.delimiter,
	    totalRows: classification.parsed.rows.length,
	    validRows: classification.accepted.length,
	    invalidRows: classification.issues.filter((error) => error.reason === "invalid_phone" || error.reason === "invalid_crm_status").length,
	    invalidCrmStatuses: classification.issues.filter((error) => error.reason === "invalid_crm_status").length,
	    duplicatesInFile: classification.issues.filter((error) => error.reason === "duplicate_in_file").length,
	    excludedContacts: classification.excludedRows.length,
	    provisionalContacts: classification.provisionalRows.length,
	    identityConflicts: classification.conflictRows.length,
	    existingContacts: classification.existingActiveRows.length,
	    readyToImport: importableRows.length,
	    created: classification.readyRows.length,
	    updated: updatedRows,
	    unchanged: unchangedRows,
	    rows: previewRows,
	    sampleErrors: classification.issues.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT).map((issue) => ({
	      ...issue,
	      code: normalizeImportIssueReason(issue.reason),
      normalizedPhoneDisplay: issue.normalizedPhone,
    })),
    truncatedErrors: classification.issues.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
  };
}

export async function confirmCrmContactCsvImport(
  prisma: PrismaClient,
	  params: {
	    clientId: string;
	    csvText: string;
	    mapping?: CrmContactCsvMapping | null;
	    crmStatuses?: CrmBusinessStatusConfig[] | null;
	    actorUserId: string;
	    requestId: string;
	    audit?: boolean;
	  }
	) {
	  const classification = await classifyCrmContactImportRows(prisma, params);
	  let created = 0;
	  let updated = 0;
	  let unchanged = 0;
	  let excludedContacts = classification.excludedRows.length;
	  let provisionalContacts = classification.provisionalRows.length;
	  let identityConflicts = classification.conflictRows.length;
  let failed = 0;
  const rowErrors = classification.issues.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT).map((issue) => ({
    ...issue,
    code: normalizeImportIssueReason(issue.reason),
	    normalizedPhoneDisplay: issue.normalizedPhone,
	  }));
	  const importableRows = [...classification.readyRows, ...classification.existingActiveRows];
	  for (const row of importableRows) {
	    try {
		      const result = await upsertCrmContact(prisma, {
		        clientId: params.clientId,
		        input: {
		          phone: row.phone,
		          name: row.name,
		          company: row.company,
		          city: row.city,
		          email: row.email,
		          service: row.service,
		        },
	        actorUserId: params.actorUserId,
	        requestId: `${params.requestId}:${resultlessHash(row.phone)}`,
	        source: "crm_import",
	        crmStatusId: row.crmStatusId,
	        audit: params.audit,
	      });
	      if (result.createdContact || result.createdLead) created += 1;
	      else if (
	        [
		          row.name !== null && row.name !== result.previousLead?.name,
		          row.company !== null && row.company !== result.previousLead?.company,
		          row.city !== null && row.city !== result.previousLead?.city,
		          row.email !== null && row.email !== result.previousLead?.email,
		          row.service !== null && row.service !== result.previousLead?.service,
		          row.crmStatusId !== null && row.crmStatusId !== result.previousLead?.status,
	        ].some(Boolean)
	      ) updated += 1;
	      else unchanged += 1;
	    } catch (error) {
      if (error instanceof CrmContactUpsertError) {
        if (error.code === "contact_operationally_excluded") excludedContacts += 1;
        else if (error.code === "contact_already_provisional") provisionalContacts += 1;
        else if (error.code === "identity_conflict") identityConflicts += 1;
        else {
          failed += 1;
          rowErrors.push({
            rowNumber: row.rowNumber,
            reason: "invalid_phone",
            code: "OTHER_VALIDATION_ERROR",
            label: "Falha de validação ao importar esta linha",
            inputPhone: row.waIdCanonical,
	            normalizedPhone: row.waIdCanonical,
	            normalizedPhoneDisplay: row.waIdCanonical,
	            phoneDisplay: row.waIdCanonical,
	            crmSituationInput: row.crmSituationInput,
	            crmStatusId: row.crmStatusId,
	            crmStatusLabel: row.crmStatusLabel,
	          });
	        }
        continue;
      }
      if (getPrismaErrorCode(error) === "P2002") {
        identityConflicts += 1;
        rowErrors.push({
          rowNumber: row.rowNumber,
          reason: "identity_conflict",
          code: "IDENTITY_CONFLICT",
          label: getImportIssueLabel("identity_conflict"),
          inputPhone: row.waIdCanonical,
	          normalizedPhone: row.waIdCanonical,
	          normalizedPhoneDisplay: row.waIdCanonical,
	          phoneDisplay: row.waIdCanonical,
	          crmSituationInput: row.crmSituationInput,
	          crmStatusId: row.crmStatusId,
	          crmStatusLabel: row.crmStatusLabel,
	        });
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
	        updated,
	        unchanged,
	        reused: updated + unchanged,
	        invalid: classification.issues.filter((error) => error.reason === "invalid_phone").length,
	        invalidCrmStatuses: classification.issues.filter((error) => error.reason === "invalid_crm_status").length,
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
	    reused: updated + unchanged,
	    updated,
	    unchanged,
	    duplicates: classification.issues.filter((error) => error.reason === "duplicate_in_file").length,
	    invalid: classification.issues.filter((error) => error.reason === "invalid_phone").length,
	    invalidCrmStatuses: classification.issues.filter((error) => error.reason === "invalid_crm_status").length,
	    excludedContacts,
    provisionalContacts,
    identityConflicts,
    failed,
	    readyToImport: importableRows.length,
    promotedProvisional: 0,
    skipped:
      classification.issues.filter((error) => error.reason === "duplicate_in_file").length +
      excludedContacts +
      provisionalContacts +
      identityConflicts,
    errors: rowErrors,
    truncatedErrors:
      classification.issues.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT ||
      rowErrors.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
  };
}

function resultlessHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getPrismaErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : null;
}

export { CAMPAIGN_IMPORT_MAX_CSV_BYTES as CRM_IMPORT_MAX_CSV_BYTES, CAMPAIGN_IMPORT_MAX_ROWS as CRM_IMPORT_MAX_ROWS };
