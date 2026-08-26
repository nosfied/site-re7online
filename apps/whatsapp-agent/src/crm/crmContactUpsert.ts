import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTACT_LIFECYCLE_ACTIVE,
  CONTACT_LIFECYCLE_PROVISIONAL,
  promoteContactLifecycleToActive,
} from "../contacts/contactLifecycle.js";
import {
  CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
  CAMPAIGN_IMPORT_MAX_CSV_BYTES,
  CAMPAIGN_IMPORT_MAX_ROWS,
  parseCampaignCsv,
} from "../campaigns/campaignRecipientImport.js";
import { normalizeOptOutWaId } from "../campaigns/optOutRegistry.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { persistEvent } from "../db/persist.js";

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
      | "csv_too_many_rows",
    message: string,
    public status = 400,
    public headers?: string[]
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
};

type ExistingCrmIdentity = {
  contact: { id: string; name: string | null; lifecycle: string | null } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    contactChannelIdentityId: string | null;
  } | null;
};

function normalizeOptionalName(value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCrmWhatsappPhone(value: unknown): NormalizedCrmContactInput | null {
  const normalized = normalizeOptOutWaId(value);
  if (!normalized) return null;
  return {
    name: null,
    phone: normalized.waIdCanonical,
    waId: normalized.waIdCanonical,
    waIdCanonical: normalized.waIdCanonical,
    externalUserHash: buildCrmWhatsappExternalUserHash(normalized.waIdCanonical),
  };
}

export function buildCrmWhatsappExternalUserHash(waIdCanonical: string) {
  return `whatsapp:${crypto.createHash("sha256").update(waIdCanonical).digest("hex").slice(0, 32)}`;
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
  params: { clientId: string; waIdCanonical: string; externalUserHash: string }
): Promise<ExistingCrmIdentity> {
  const [identity, contact, lead] = await Promise.all([
    prisma.contactChannelIdentity.findUnique({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: CRM_CONTACT_MANUAL_PROVIDER,
          channelAccountId: CRM_CONTACT_MANUAL_CHANNEL_ACCOUNT_ID,
          externalUserHash: params.externalUserHash,
        },
      },
      select: {
        contact: { select: { id: true, name: true, lifecycle: true } },
      },
    }),
    prisma.contact.findFirst({
      where: {
        clientId: params.clientId,
        OR: [
          { waId: params.waIdCanonical },
          { externalUserRef: params.waIdCanonical },
          { legacyWaId: params.waIdCanonical },
          { externalUserHash: params.externalUserHash },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, name: true, lifecycle: true },
    }),
    prisma.lead.findFirst({
      where: {
        tenantId: params.clientId,
        OR: [
          { waId: params.waIdCanonical },
          { waIdCanonical: params.waIdCanonical },
          { externalUserHash: params.externalUserHash },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, name: true, phone: true, contactChannelIdentityId: true },
    }),
  ]);
  return {
    contact: identity?.contact ?? contact,
    lead,
  };
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
    });
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
    if (contact.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL) {
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
            contactChannelIdentityId: existing.lead.contactChannelIdentityId ?? identity.id,
            phone: existing.lead.phone ?? normalized.phone,
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
      promotedProvisional: contact.lifecycle === CONTACT_LIFECYCLE_PROVISIONAL,
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
  const errors: Array<{ rowNumber: number; reason: "invalid_phone" | "duplicate_in_file"; label: string; phoneDisplay: string | null }> = [];
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
  const keys = accepted.map((row) => row.waIdCanonical);
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
  const existingCount = accepted.filter((row) => existingKeys.has(row.waIdCanonical)).length;
  return {
    ok: true as const,
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    totalRows: parsed.rows.length,
    validRows: accepted.length,
    invalidRows: errors.filter((error) => error.reason === "invalid_phone").length,
    duplicatesInFile: errors.filter((error) => error.reason === "duplicate_in_file").length,
    existingContacts: existingCount,
    readyToImport: accepted.length,
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
  const readyRows = parsed.rows.flatMap((row) => {
    const normalized = normalizeCrmWhatsappPhone(row.phone);
    if (!normalized || seen.has(normalized.waIdCanonical)) return [];
    seen.add(normalized.waIdCanonical);
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
    readyToImport: preview.readyToImport,
    promotedProvisional,
  };
}

function resultlessHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export { CAMPAIGN_IMPORT_MAX_CSV_BYTES as CRM_IMPORT_MAX_CSV_BYTES, CAMPAIGN_IMPORT_MAX_ROWS as CRM_IMPORT_MAX_ROWS };
