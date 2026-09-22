import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  filterOptedOutCampaignRecipients,
  normalizeOptOutWaId,
  recordCampaignOptOutBlocks,
  type CampaignOptOutBlockedRecipient,
} from "./optOutRegistry.js";
import type { CampaignTemplateComponents } from "./campaignService.js";
import { buildTemplateComponentsFromVariables, extractTemplatePlaceholderKeys } from "../templates/templateRendering.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import {
  buildCrmWhatsappIdentityCandidates,
  normalizeCrmWhatsappIdentity,
} from "../crm/crmWhatsappIdentity.js";
import type { CrmBusinessStatusConfig } from "../config/tenantConfig.js";
import {
  buildPrivateCampaignSeedFields,
  readPrivateCampaignSeedFields,
} from "./campaignSeedPrivacy.js";
import {
  serializeOutboundReturnDestination,
  type OutboundReturnDestination,
} from "../routing/outboundReturnDestination.js";

export const CAMPAIGN_IMPORT_MAX_CSV_BYTES = 2 * 1024 * 1024;
export const CAMPAIGN_IMPORT_MAX_ROWS = 10_000;
export const CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT = 50;
export const CAMPAIGN_IMPORT_GENERIC_FIELD_COUNT = 10;

export type CampaignImportBlockedReason =
  | "invalid_whatsapp_identity"
  | "duplicate_recipient"
  | "existing_campaign_recipient"
  | "active_send_blocked"
  | "excluded_contact"
  | "provisional_contact"
  | "identity_conflict"
  | "variable_missing_value"
  | "crm_situation_unresolved";

export type CampaignImportMapping = {
  contactColumn?: string | null;
  field1Column?: string | null;
  field2Column?: string | null;
  field3Column?: string | null;
  genericFieldColumns?: Record<string, string | null | undefined> | null;
  phoneColumn?: string | null;
  nameColumn?: string | null;
  crmSituationColumn?: string | null;
  variableColumns?: Record<string, string | null | undefined> | null;
};

export type CampaignImportRecipientInput = {
  phone: string;
  name?: string | null;
  crmSituation?: string | null;
  variables?: Record<string, unknown> | null;
  rowNumber?: number | null;
};

export type CampaignImportSummary = {
  received: number;
  valid: number;
  invalid: number;
  duplicates: number;
  existingDuplicates: number;
  optOutBlocked: number;
  missingRequiredVariables: number;
  unresolvedCrmSituations: number;
  readyToImport: number;
  created: number;
  updated: number;
  unchanged: number;
  consolidated: number;
  blockedByReason: Array<{ reason: CampaignImportBlockedReason; label: string; count: number }>;
};

export type CampaignImportPreview = {
  ok: true;
  summary: CampaignImportSummary;
  recipients: Array<{
    rowNumber: number | null;
    phoneDisplay: string;
    identifierDisplay: string;
    variables: Record<string, string>;
    operation: "NOVO_NA_AUDIENCIA" | "JA_EXISTENTE";
    leadId: string | null;
    fieldsChanged: Array<"name" | "crmStatus">;
    crmSituation: {
      input: string | null;
      statusId: string | null;
      label: string | null;
      previousStatusId: string | null;
      previousLabel: string | null;
    };
  }>;
  errors: Array<{
    rowNumber: number | null;
    reason: CampaignImportBlockedReason;
    label: string;
    phoneDisplay: string | null;
  }>;
  truncatedErrors: boolean;
};

type ExistingSeed = {
  recipients: string[];
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
};

type TemplateContext = {
  templateId: string | null;
  templateName: string;
  category: string | null;
  templateContent: string | null;
};

type CampaignImportPlan = {
  preview: CampaignImportPreview;
  acceptedWaIds: string[];
  componentsByWaId: Record<string, CampaignTemplateComponents>;
  optOutBlocked: CampaignOptOutBlockedRecipient[];
  reportRows: CampaignImportReportRow[];
  acceptedRows: CampaignImportAcceptedRow[];
};

type CampaignImportAcceptedRow = {
  rowNumber: number | null;
  waIdCanonical: string;
  name: string | null;
  variables: Record<string, string>;
  crmSituationInput: string | null;
  crmStatusId: string | null;
  crmStatusLabel: string | null;
  existingLead: ExistingLeadSnapshot | null;
};

type ExistingLeadSnapshot = {
  id: string;
  name: string | null;
  status: string;
};

type CampaignImportReportRow = {
  sourceRow: number | null;
  maskedIdentity: string | null;
  operation:
    | "ELEGIVEL"
    | "JA_EXISTENTE"
    | "NOVO_NA_AUDIENCIA"
    | "ERRO"
    | "DUPLICADO_CONSOLIDADO"
    | "IGNORADO";
  leadId: string | null;
  contactId: string | null;
  fieldsChanged: string[];
  oldCrmSituation: string | null;
  newCrmSituation: string | null;
  oldCrmSituationLabel: string | null;
  newCrmSituationLabel: string | null;
  nameUpdated: boolean;
  duplicate: boolean;
  errorCode: string | null;
  reason: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function labelForImportReason(reason: CampaignImportBlockedReason) {
  switch (reason) {
    case "active_send_blocked":
      return "Envio ativo bloqueado";
    case "duplicate_recipient":
      return "Destinatario duplicado no arquivo";
    case "existing_campaign_recipient":
      return "Destinatario ja importado nesta campanha";
    case "excluded_contact":
      return "Contato excluído da operação";
    case "invalid_whatsapp_identity":
      return "Telefone invalido";
    case "identity_conflict":
      return "Nao foi possivel determinar a identidade com seguranca";
    case "provisional_contact":
      return "Contato pendente de consentimento";
    case "crm_situation_unresolved":
      return "Situacao no CRM nao encontrada";
    case "variable_missing_value":
      return "Variavel obrigatoria ausente";
  }
}

function addBlockedCount(counts: Map<CampaignImportBlockedReason, number>, reason: CampaignImportBlockedReason) {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function formatCampaignImportRecipient(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (digits) return digits;
  const fallback = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return fallback || null;
}

function sanitizeVariableValue(input: unknown) {
  return String(input ?? "").trim().slice(0, 240);
}

function sanitizeOptionalImportText(input: unknown, maxLength: number) {
  const normalized = String(input ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized.length > 0 ? normalized : null;
}

function normalizeVariableMap(input: unknown) {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), sanitizeVariableValue(value)] as const)
      .filter(([key]) => Boolean(key))
  );
}

function extractComponents(value: unknown): CampaignTemplateComponents | undefined {
  if (!Array.isArray(value)) return undefined;
  const components = value.filter((component): component is CampaignTemplateComponents[number] => {
    if (!isRecord(component) || component.type !== "body" || !Array.isArray(component.parameters)) return false;
    return component.parameters.every((parameter) => {
      return isRecord(parameter) && parameter.type === "text" && typeof parameter.text === "string";
    });
  });
  return components.length > 0 ? components : undefined;
}

function extractComponentsByWaId(value: unknown): Record<string, CampaignTemplateComponents> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([waId, components]) => {
      const normalized = normalizeOptOutWaId(waId);
      return [normalized?.waIdCanonical ?? "", extractComponents(components)] as const;
    })
    .filter((entry): entry is [string, CampaignTemplateComponents] => Boolean(entry[0] && entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function extractSeedPayload(payload: unknown): ExistingSeed {
  if (!isRecord(payload)) return { recipients: [] };
  const privateSeed = readPrivateCampaignSeedFields(payload);
  const recipients = privateSeed.recipients
    .map((value) => normalizeOptOutWaId(value)?.waIdCanonical ?? "")
    .filter(Boolean);
  return {
    recipients: Array.from(new Set(recipients)),
    componentsByWaId: extractComponentsByWaId(privateSeed.componentsByWaId),
  };
}

async function getExistingSeed(
  prisma: PrismaClient,
  params: { clientId: string; campaignId: string }
): Promise<ExistingSeed> {
  const event = await prisma.event.findFirst({
    where: {
      clientId: params.clientId,
      eventName: "campaign.seed.saved",
      messageId: params.campaignId,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  return extractSeedPayload(event?.payloadJson);
}

export async function resolveCampaignImportTemplate(
  prisma: PrismaClient,
  params: { clientId: string; campaignId?: string | null; templateId?: string | null }
): Promise<TemplateContext | null> {
  if (params.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.campaignId, clientId: params.clientId },
      select: { templateId: true, templateName: true },
    });
    if (!campaign?.templateId) return null;
    const template = await prisma.template.findFirst({
      where: { id: campaign.templateId, clientId: params.clientId },
      select: { id: true, name: true, category: true, content: true },
    });
    if (!template) return null;
    return { templateId: template.id, templateName: template.name, category: template.category, templateContent: template.content };
  }
  if (!params.templateId) return null;
  const template = await prisma.template.findFirst({
    where: { id: params.templateId, clientId: params.clientId, status: "approved" },
    select: { id: true, name: true, category: true, content: true },
  });
  if (!template) return null;
  return { templateId: template.id, templateName: template.name, category: template.category, templateContent: template.content };
}

export function parseCampaignCsv(text: string) {
  const raw = String(text ?? "");
  if (Buffer.byteLength(raw, "utf8") > CAMPAIGN_IMPORT_MAX_CSV_BYTES) {
    return { ok: false as const, error: "csv_too_large" as const };
  }
  const content = raw.replace(/^\uFEFF/, "");
  if (!content.trim()) return { ok: false as const, error: "csv_empty" as const };
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      current = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    current += char;
  }
  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (quoted) return { ok: false as const, error: "csv_malformed" as const };
  if (rows.length < 2) return { ok: false as const, error: "csv_missing_rows" as const };
  if (rows.length - 1 > CAMPAIGN_IMPORT_MAX_ROWS) return { ok: false as const, error: "csv_too_many_rows" as const };
  const headers = rows[0].map((header) => header.trim());
  return {
    ok: true as const,
    delimiter,
    headers,
    rows: rows.slice(1).map((cells, rowIndex) => ({
      rowNumber: rowIndex + 2,
      values: Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
    })),
  };
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") quoted = !quoted;
    if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

function getMappedColumn(row: Record<string, string>, column: string | null | undefined) {
  if (!column) return "";
  return row[column] ?? "";
}

function normalizeCrmSituationLookupKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCrmSituationResolver(statuses: CrmBusinessStatusConfig[] | null | undefined) {
  const byKey = new Map<string, CrmBusinessStatusConfig[]>();
  for (const status of statuses ?? []) {
    if (status.isActive === false) continue;
    for (const value of [status.id, status.label]) {
      const key = normalizeCrmSituationLookupKey(value);
      if (!key) continue;
      const current = byKey.get(key) ?? [];
      if (!current.some((item) => item.id === status.id)) current.push(status);
      byKey.set(key, current);
    }
  }
  return (input: string | null) => {
    const key = normalizeCrmSituationLookupKey(input);
    if (!key) return { kind: "blank" as const };
    const matches = byKey.get(key) ?? [];
    if (matches.length === 1) return { kind: "matched" as const, status: matches[0] };
    if (matches.length > 1) return { kind: "ambiguous" as const };
    return { kind: "unknown" as const };
  };
}

export function buildStatusLabelById(statuses: CrmBusinessStatusConfig[] | null | undefined) {
  return new Map(
    (statuses ?? [])
      .map((status) => [String(status.id ?? "").trim().toUpperCase(), status.label] as const)
      .filter(([id]) => Boolean(id))
  );
}

export function buildCampaignImportRecipientsFromCsv(params: {
  csvText: string;
  mapping: CampaignImportMapping;
}) {
  const parsed = parseCampaignCsv(params.csvText);
  if (!parsed.ok) return parsed;
  const contactColumn = (params.mapping.contactColumn ?? params.mapping.phoneColumn)?.trim();
  if (!contactColumn || !parsed.headers.includes(contactColumn)) {
    return { ok: false as const, error: "missing_phone_column" as const, headers: parsed.headers };
  }
  const fieldColumns = Object.fromEntries(
    Array.from({ length: CAMPAIGN_IMPORT_GENERIC_FIELD_COUNT }, (_, index) => {
      const position = String(index + 1);
      const legacyKey = `field${position}Column` as keyof CampaignImportMapping;
      const legacyValue = params.mapping[legacyKey];
      const genericValue = params.mapping.genericFieldColumns?.[position];
      return [
        `field${position}`,
        typeof genericValue === "string"
          ? genericValue.trim() || null
          : typeof legacyValue === "string"
            ? legacyValue.trim() || null
            : null,
      ];
    })
  ) as Record<string, string | null>;
  const variableColumns = params.mapping.variableColumns ?? {};
  return {
    ok: true as const,
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    recipients: parsed.rows.map((row) => {
      const fields = {
        ...Object.fromEntries(
          Object.entries(fieldColumns).map(([key, column]) => [key, getMappedColumn(row.values, column)])
        ),
      };
      return {
        rowNumber: row.rowNumber,
        phone: getMappedColumn(row.values, contactColumn),
        name: null,
        crmSituation: null,
        variables: Object.fromEntries(
          Object.entries(variableColumns)
            .map(([position, source]) => {
              const normalizedSource = String(source ?? "").trim();
              const genericValue =
                normalizedSource.startsWith("field") && fields[normalizedSource] !== undefined
                  ? fields[normalizedSource]
                  : getMappedColumn(row.values, normalizedSource);
              return [position, genericValue] as const;
            })
            .filter(([position]) => Boolean(position))
        ),
      };
    }),
  };
}

export async function resolveCampaignRecipientImportPlan(
  prisma: PrismaClient,
  params: {
    clientId: string;
    campaignId?: string | null;
    template: TemplateContext;
    recipients: CampaignImportRecipientInput[];
    crmStatuses?: CrmBusinessStatusConfig[] | null;
    existingSeed?: ExistingSeed | null;
  }
): Promise<CampaignImportPlan> {
  const requiredKeys = extractTemplatePlaceholderKeys(params.template.templateContent);
  const existingSeed = params.existingSeed ?? (params.campaignId ? await getExistingSeed(prisma, {
    clientId: params.clientId,
    campaignId: params.campaignId,
  }) : { recipients: [] });
  const existing = new Set(existingSeed.recipients);
  const normalizedCandidates: Array<{
    waId: string;
    waIdCanonical: string;
    rowNumber: number | null;
    variables: Record<string, string>;
    name: string | null;
    crmSituationInput: string | null;
    crmStatusId: string | null;
    crmStatusLabel: string | null;
    identityCandidates: string[];
  }> = [];
  const blocked: CampaignImportPreview["errors"] = [];
  const blockedCounts = new Map<CampaignImportBlockedReason, number>();
  const resolveCrmSituation = buildCrmSituationResolver(params.crmStatuses);
  const statusLabelById = buildStatusLabelById(params.crmStatuses);

  for (const input of params.recipients.slice(0, CAMPAIGN_IMPORT_MAX_ROWS)) {
    const rowNumber = input.rowNumber ?? null;
    const normalized = normalizeCrmWhatsappIdentity(input.phone);
    if (!normalized) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "invalid_whatsapp_identity", phone: input.phone });
      continue;
    }
    const waIdCanonical = normalized.crmCanonicalPhone;
    const crmSituationInput = sanitizeOptionalImportText(input.crmSituation, 80);
    const crmSituation = resolveCrmSituation(crmSituationInput);
    if (crmSituation.kind === "unknown" || crmSituation.kind === "ambiguous") {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "crm_situation_unresolved", phone: waIdCanonical });
      continue;
    }
    const identityCandidates = buildCrmWhatsappIdentityCandidates([input.phone, waIdCanonical]);
    if (identityCandidates.some((candidate) => existing.has(candidate))) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "existing_campaign_recipient", phone: waIdCanonical });
      continue;
    }
    const variables = normalizeVariableMap(input.variables);
    const missing = requiredKeys.some((key) => !variables[key]);
    if (missing) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "variable_missing_value", phone: waIdCanonical });
      continue;
    }
    normalizedCandidates.push({
      waId: waIdCanonical,
      waIdCanonical,
      rowNumber,
      variables,
      name: sanitizeOptionalImportText(input.name, 120),
      crmSituationInput,
      crmStatusId: crmSituation.kind === "matched" ? crmSituation.status.id : null,
      crmStatusLabel: crmSituation.kind === "matched" ? crmSituation.status.label : null,
      identityCandidates,
    });
  }

  const lifecycleLookupKeys = Array.from(new Set(normalizedCandidates.flatMap((item) => item.identityCandidates).filter(Boolean)));
  const existingContacts = lifecycleLookupKeys.length
    ? await prisma.contact.findMany({
        where: {
          clientId: params.clientId,
          OR: [
            { waId: { in: lifecycleLookupKeys } },
            { externalUserRef: { in: lifecycleLookupKeys } },
            { legacyWaId: { in: lifecycleLookupKeys } },
          ],
        },
        select: { waId: true, externalUserRef: true, legacyWaId: true, lifecycle: true, operationallyExcludedAt: true },
      })
    : [];
  const operationallyExcludedWaIds = await loadOperationallyExcludedWaIds(prisma, {
    clientId: params.clientId,
    waIds: lifecycleLookupKeys,
  });
  const blockedByProvisionalContact = new Set(
    existingContacts
      .filter((contact) => !isOperationalContactLifecycle(contact.lifecycle))
      .flatMap((contact) => [contact.waId, contact.externalUserRef, contact.legacyWaId].filter(Boolean))
  );
  const lifecycleReady = normalizedCandidates.filter((item) => {
    if (item.identityCandidates.some((candidate) => operationallyExcludedWaIds.has(candidate))) {
      addBlocked(blocked, blockedCounts, { rowNumber: item.rowNumber, reason: "excluded_contact", phone: item.waIdCanonical });
      return false;
    }
    if (!item.identityCandidates.some((candidate) => blockedByProvisionalContact.has(candidate))) return true;
    addBlocked(blocked, blockedCounts, { rowNumber: item.rowNumber, reason: "provisional_contact", phone: item.waIdCanonical });
    return false;
  });

  const optOutFiltered = await filterOptedOutCampaignRecipients(prisma, {
    clientId: params.clientId,
    waIds: lifecycleReady.map((item) => item.waIdCanonical),
  });
  const optOutBlocked = new Set(optOutFiltered.blocked.map((item) => item.waIdCanonical));
  const eligible = lifecycleReady.filter((item) => {
    if (!optOutBlocked.has(item.waIdCanonical)) return true;
    addBlocked(blocked, blockedCounts, { rowNumber: item.rowNumber, reason: "active_send_blocked", phone: item.waIdCanonical });
    return false;
  });
  const { CrmContactUpsertError, resolveCrmContactIdentity } = await import("../crm/crmContactUpsert.js");
  const seen = new Set<string>();
  const acceptedRows: CampaignImportAcceptedRow[] = [];
  for (const item of eligible) {
    let identity;
    try {
      identity = await resolveCrmContactIdentity(prisma, {
        clientId: params.clientId,
        phone: item.waIdCanonical,
      });
    } catch (error) {
      if (error instanceof CrmContactUpsertError && error.code === "identity_conflict") {
        addBlocked(blocked, blockedCounts, {
          rowNumber: item.rowNumber,
          reason: "identity_conflict",
          phone: item.waIdCanonical,
        });
        continue;
      }
      throw error;
    }
    if (identity.contact?.operationallyExcludedAt) {
      addBlocked(blocked, blockedCounts, {
        rowNumber: item.rowNumber,
        reason: "excluded_contact",
        phone: item.waIdCanonical,
      });
      continue;
    }
    if (identity.contact && !isOperationalContactLifecycle(identity.contact.lifecycle)) {
      addBlocked(blocked, blockedCounts, {
        rowNumber: item.rowNumber,
        reason: "provisional_contact",
        phone: item.waIdCanonical,
      });
      continue;
    }
    if (seen.has(identity.waIdCanonical)) {
      addBlocked(blocked, blockedCounts, {
        rowNumber: item.rowNumber,
        reason: "duplicate_recipient",
        phone: item.waIdCanonical,
      });
      continue;
    }
    seen.add(identity.waIdCanonical);
    acceptedRows.push({
      rowNumber: item.rowNumber,
      waIdCanonical: identity.waIdCanonical,
      name: item.name,
      variables: item.variables,
      crmSituationInput: item.crmSituationInput,
      crmStatusId: item.crmStatusId,
      crmStatusLabel: item.crmStatusLabel,
      existingLead: identity.lead
        ? { id: identity.lead.id, name: identity.lead.name, status: identity.lead.status }
        : null,
    });
  }
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  for (const item of acceptedRows) {
    const components = buildTemplateComponentsFromVariables({ requiredKeys, variables: item.variables });
    if (components) componentsByWaId[item.waIdCanonical] = components;
  }

  const blockedByReason = Array.from(blockedCounts.entries()).map(([reason, count]) => ({
    reason,
    label: labelForImportReason(reason),
    count,
  }));
  let newAudienceCount = 0;
  let existingAudienceCount = 0;
  for (const row of acceptedRows) {
    if (row.existingLead) existingAudienceCount += 1;
    else newAudienceCount += 1;
  }
  const errorReportRows: CampaignImportReportRow[] = blocked.map((item) => ({
    sourceRow: item.rowNumber,
    maskedIdentity: item.phoneDisplay,
    operation: item.reason === "duplicate_recipient" ? "DUPLICADO_CONSOLIDADO" : "ERRO",
    leadId: null,
    contactId: null,
    fieldsChanged: [],
    oldCrmSituation: null,
    newCrmSituation: null,
    oldCrmSituationLabel: null,
    newCrmSituationLabel: null,
    nameUpdated: false,
    duplicate: item.reason === "duplicate_recipient",
    errorCode: item.reason,
    reason: item.label,
  }));
  return {
    preview: {
      ok: true,
      summary: {
        received: params.recipients.length,
        valid: acceptedRows.length,
        invalid:
          (blockedCounts.get("invalid_whatsapp_identity") ?? 0) +
          (blockedCounts.get("identity_conflict") ?? 0),
        duplicates: blockedCounts.get("duplicate_recipient") ?? 0,
        existingDuplicates: blockedCounts.get("existing_campaign_recipient") ?? 0,
        optOutBlocked: blockedCounts.get("active_send_blocked") ?? 0,
        missingRequiredVariables: blockedCounts.get("variable_missing_value") ?? 0,
        unresolvedCrmSituations: blockedCounts.get("crm_situation_unresolved") ?? 0,
        readyToImport: acceptedRows.length,
        created: newAudienceCount,
        updated: 0,
        unchanged: existingAudienceCount,
        consolidated: blockedCounts.get("duplicate_recipient") ?? 0,
        blockedByReason,
      },
      recipients: acceptedRows.slice(0, 200).map((item) => ({
        rowNumber: item.rowNumber,
        phoneDisplay: formatCampaignImportRecipient(item.waIdCanonical) ?? "WhatsApp User",
        identifierDisplay: formatCampaignImportRecipient(item.waIdCanonical) || "WhatsApp User",
        variables: item.variables,
        operation: item.existingLead ? "JA_EXISTENTE" : "NOVO_NA_AUDIENCIA",
        leadId: item.existingLead?.id ?? null,
        fieldsChanged: [
          item.name !== null && item.name !== item.existingLead?.name ? "name" : null,
          item.crmStatusId !== null && item.crmStatusId !== item.existingLead?.status ? "crmStatus" : null,
        ].filter((field): field is "name" | "crmStatus" => Boolean(field)),
        crmSituation: {
          input: item.crmSituationInput,
          statusId: item.crmStatusId,
          label: item.crmStatusLabel,
          previousStatusId: item.existingLead?.status ?? null,
          previousLabel: item.existingLead?.status ? statusLabelById.get(item.existingLead.status.toUpperCase()) ?? item.existingLead.status : null,
        },
      })),
      errors: blocked.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT),
      truncatedErrors: blocked.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
    },
    acceptedWaIds: acceptedRows.map((item) => item.waIdCanonical),
    componentsByWaId,
    optOutBlocked: optOutFiltered.blocked,
    reportRows: errorReportRows,
    acceptedRows,
  };
}

export async function previewCampaignRecipientImport(
  prisma: PrismaClient,
  params: {
    clientId: string;
    campaignId?: string | null;
    template: TemplateContext;
    recipients: CampaignImportRecipientInput[];
    crmStatuses?: CrmBusinessStatusConfig[] | null;
    existingSeed?: ExistingSeed | null;
  }
): Promise<CampaignImportPreview> {
  return (await resolveCampaignRecipientImportPlan(prisma, params)).preview;
}

function addBlocked(
  blocked: CampaignImportPreview["errors"],
  counts: Map<CampaignImportBlockedReason, number>,
  params: { rowNumber: number | null; reason: CampaignImportBlockedReason; phone: unknown }
) {
  addBlockedCount(counts, params.reason);
  blocked.push({
    rowNumber: params.rowNumber,
    reason: params.reason,
    label: labelForImportReason(params.reason),
    phoneDisplay: formatCampaignImportRecipient(String(params.phone ?? "")),
  });
}

export async function importCampaignRecipients(
  prisma: PrismaClient,
  params: {
    clientId: string;
    campaignId: string;
    actorId?: string | null;
    requestId: string;
    recipients: CampaignImportRecipientInput[];
    source: "csv" | "public_api" | "manual";
    crmStatuses?: CrmBusinessStatusConfig[] | null;
    returnDestination?: OutboundReturnDestination | null;
    testHooks?: {
      beforeCampaignSeedPersist?: () => void | Promise<void>;
    };
  }
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.campaignId, clientId: params.clientId },
    select: { id: true, clientId: true, templateId: true, templateName: true, name: true, status: true },
  });
  if (!campaign) return { ok: false as const, status: 404 as const, error: "campaign_not_found" as const };
  if (campaign.status !== "draft") {
    return { ok: false as const, status: 409 as const, error: "campaign_not_editable" as const };
  }
  if (!campaign.templateId) {
    return { ok: false as const, status: 400 as const, error: "template_required" as const };
  }
  const template = await resolveCampaignImportTemplate(prisma, {
    clientId: params.clientId,
    campaignId: campaign.id,
  });
  if (!template) return { ok: false as const, status: 404 as const, error: "template_not_found" as const };
  const existingSeed = await getExistingSeed(prisma, { clientId: params.clientId, campaignId: campaign.id });
  const plan = await resolveCampaignRecipientImportPlan(prisma, {
    clientId: params.clientId,
    campaignId: campaign.id,
    template,
    recipients: params.recipients,
    crmStatuses: params.crmStatuses,
    existingSeed,
  });
  const preview = plan.preview;
  const existingComponents = existingSeed.componentsByWaId ?? {};
  let nextRecipients = [...existingSeed.recipients];
  let componentsByWaId: Record<string, CampaignTemplateComponents> = { ...existingComponents };

  const statusLabelById = buildStatusLabelById(params.crmStatuses);
  const importReportRows: CampaignImportReportRow[] = [...plan.reportRows];
  let newAudienceCount = 0;
  let existingAudienceCount = 0;
  let acceptedCount = 0;
  for (const row of plan.acceptedRows) {
    nextRecipients = nextRecipients.includes(row.waIdCanonical)
      ? [...nextRecipients]
      : [...nextRecipients, row.waIdCanonical];
    const rowComponents = plan.componentsByWaId[row.waIdCanonical];
    if (rowComponents) componentsByWaId = { ...componentsByWaId, [row.waIdCanonical]: rowComponents };
    acceptedCount += 1;
    if (row.existingLead) existingAudienceCount += 1;
    else newAudienceCount += 1;
    importReportRows.push({
      sourceRow: row.rowNumber,
      maskedIdentity: formatCampaignImportRecipient(row.waIdCanonical),
      operation: row.existingLead ? "JA_EXISTENTE" : "NOVO_NA_AUDIENCIA",
      leadId: row.existingLead?.id ?? null,
      contactId: null,
      fieldsChanged: [],
      oldCrmSituation: row.existingLead?.status ?? null,
      newCrmSituation: row.crmStatusId ?? row.existingLead?.status ?? null,
      oldCrmSituationLabel: row.existingLead?.status
        ? statusLabelById.get(row.existingLead.status.toUpperCase()) ?? row.existingLead.status
        : null,
      newCrmSituationLabel:
        row.crmStatusLabel ??
        (row.existingLead?.status
          ? statusLabelById.get(row.existingLead.status.toUpperCase()) ?? row.existingLead.status
          : null),
      nameUpdated: false,
      duplicate: false,
      errorCode: null,
      reason: null,
    });
  }
  const reportSummary = {
    total: preview.summary.received,
    created: newAudienceCount,
    updated: 0,
    unchanged: existingAudienceCount,
    ignored: preview.summary.existingDuplicates + preview.summary.optOutBlocked,
    errors: preview.errors.filter((item) => item.reason !== "duplicate_recipient").length,
    duplicatesConsolidated: preview.summary.duplicates,
  };

  await prisma.$transaction(async (tx) => {
    await params.testHooks?.beforeCampaignSeedPersist?.();
    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        totalRecipients: nextRecipients.length,
        blockedCount:
          preview.summary.optOutBlocked +
          preview.summary.invalid +
          preview.summary.missingRequiredVariables +
          preview.summary.unresolvedCrmSituations,
      },
    });
    await tx.event.create({
      data: {
        clientId: params.clientId,
        messageId: campaign.id,
        requestId: `campaign-seed:${campaign.id}:${crypto.randomUUID()}`,
        eventName: "campaign.seed.saved",
        payloadJson: {
          campaignId: campaign.id,
          templateId: campaign.templateId,
          name: campaign.name,
          templateName: campaign.templateName,
          ...buildPrivateCampaignSeedFields({
            clientId: params.clientId,
            waIds: nextRecipients,
            componentsByWaId,
          }),
          manualRecipientInputCount: params.recipients.length,
          templateParams: [],
          templateVariableMappings: [],
          returnDestination: serializeOutboundReturnDestination(params.returnDestination ?? null),
          source: `recipient_import:${params.source}`,
          summary: preview.summary,
        } satisfies Prisma.JsonObject,
      },
    });
    await tx.event.create({
      data: {
        clientId: params.clientId,
        messageId: campaign.id,
        requestId: `${params.requestId}:campaign-import-completed:${campaign.id}`,
        eventName: "campaign.import.completed",
        payloadJson: {
          campaignId: campaign.id,
          source: params.source,
          actorId: params.actorId ?? null,
          rowCount: preview.summary.received,
          validCount: preview.summary.valid,
          invalidCount: preview.summary.invalid,
          duplicateCount: preview.summary.duplicates + preview.summary.existingDuplicates,
          optOutBlockedCount: preview.summary.optOutBlocked,
          importedCount: acceptedCount,
          audience: {
            accepted: acceptedCount,
            newToAudience: newAudienceCount,
            alreadyKnown: existingAudienceCount,
          },
          crmUpsert: {
            created: 0,
            updated: 0,
            unchanged: 0,
            deferredUntilExecution: true,
          },
          reportRows: importReportRows.slice(0, 500),
          timestamp: new Date().toISOString(),
        } satisfies Prisma.JsonObject,
      },
    });
  });
  if (plan.optOutBlocked.length > 0) {
    await recordCampaignOptOutBlocks({
      clientId: params.clientId,
      campaignId: campaign.id,
      templateName: campaign.templateName,
      blocked: plan.optOutBlocked,
    });
  }
  const updated = await prisma.campaign.findFirst({ where: { id: campaign.id, clientId: params.clientId } });
  return {
    ok: true as const,
    campaign: updated,
    preview: {
      ...preview,
      summary: {
        ...preview.summary,
        created: newAudienceCount,
        updated: 0,
        unchanged: existingAudienceCount,
        readyToImport: acceptedCount,
      },
    },
    importedCount: acceptedCount,
    report: {
      summary: reportSummary,
      rows: importReportRows,
      csv: buildCampaignImportReportCsv({ summary: reportSummary, rows: importReportRows }),
    },
  };
}

function csvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildCampaignImportReportCsv(params: {
  summary: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    ignored: number;
    errors: number;
    duplicatesConsolidated: number;
  };
  rows: CampaignImportReportRow[];
}) {
  const header = [
    "sourceRow",
    "maskedIdentity",
    "operation",
    "leadId",
    "contactId",
    "fieldsChanged",
    "oldCrmSituation",
    "newCrmSituation",
    "oldCrmSituationLabel",
    "newCrmSituationLabel",
    "nameUpdated",
    "duplicate",
    "errorCode",
    "reason",
  ];
  const lines = [header.join(",")];
  for (const row of params.rows) {
    lines.push(
      [
        row.sourceRow ?? "",
        row.maskedIdentity,
        row.operation,
        row.leadId,
        row.contactId,
        row.fieldsChanged.join("|"),
        row.oldCrmSituation,
        row.newCrmSituation,
        row.oldCrmSituationLabel,
        row.newCrmSituationLabel,
        row.nameUpdated,
        row.duplicate,
        row.errorCode,
        row.reason,
      ].map(csvCell).join(",")
    );
  }
  lines.push(
    [
      "SUMMARY",
      "",
      "",
      "",
      "",
      `total=${params.summary.total}|created=${params.summary.created}|updated=${params.summary.updated}|unchanged=${params.summary.unchanged}|ignored=${params.summary.ignored}|errors=${params.summary.errors}|duplicates=${params.summary.duplicatesConsolidated}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ].map(csvCell).join(",")
  );
  return `${lines.join("\n")}\n`;
}
