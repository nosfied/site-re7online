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
import { buildCrmWhatsappIdentityCandidates } from "../crm/crmWhatsappIdentity.js";
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

export type CampaignImportBlockedReason =
  | "invalid_whatsapp_identity"
  | "duplicate_recipient"
  | "existing_campaign_recipient"
  | "active_send_blocked"
  | "excluded_contact"
  | "provisional_contact"
  | "variable_missing_value";

export type CampaignImportMapping = {
  phoneColumn?: string | null;
  nameColumn?: string | null;
  variableColumns?: Record<string, string | null | undefined> | null;
};

export type CampaignImportRecipientInput = {
  phone: string;
  name?: string | null;
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
  readyToImport: number;
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
    case "provisional_contact":
      return "Contato pendente de consentimento";
    case "variable_missing_value":
      return "Variavel obrigatoria ausente";
  }
}

function addBlockedCount(counts: Map<CampaignImportBlockedReason, number>, reason: CampaignImportBlockedReason) {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function maskRecipient(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (!digits) return null;
  if (digits.length <= 4) return `***${digits}`;
  const prefix = digits.length >= 12 ? digits.slice(0, 4) : digits.slice(0, 2);
  return `${prefix}*****${digits.slice(-4)}`;
}

function sanitizeVariableValue(input: unknown) {
  return String(input ?? "").trim().slice(0, 240);
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

export function buildCampaignImportRecipientsFromCsv(params: {
  csvText: string;
  mapping: CampaignImportMapping;
}) {
  const parsed = parseCampaignCsv(params.csvText);
  if (!parsed.ok) return parsed;
  const phoneColumn = params.mapping.phoneColumn?.trim();
  if (!phoneColumn || !parsed.headers.includes(phoneColumn)) {
    return { ok: false as const, error: "missing_phone_column" as const, headers: parsed.headers };
  }
  const variableColumns = params.mapping.variableColumns ?? {};
  return {
    ok: true as const,
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    recipients: parsed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      phone: getMappedColumn(row.values, phoneColumn),
      name: getMappedColumn(row.values, params.mapping.nameColumn),
      variables: Object.fromEntries(
        Object.entries(variableColumns)
          .map(([position, column]) => [position, getMappedColumn(row.values, column)] as const)
          .filter(([position]) => Boolean(position))
      ),
    })),
  };
}

export async function resolveCampaignRecipientImportPlan(
  prisma: PrismaClient,
  params: {
    clientId: string;
    campaignId?: string | null;
    template: TemplateContext;
    recipients: CampaignImportRecipientInput[];
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
    identityCandidates: string[];
  }> = [];
  const blocked: CampaignImportPreview["errors"] = [];
  const blockedCounts = new Map<CampaignImportBlockedReason, number>();
  const seen = new Set<string>();

  for (const input of params.recipients.slice(0, CAMPAIGN_IMPORT_MAX_ROWS)) {
    const rowNumber = input.rowNumber ?? null;
    const normalized = normalizeOptOutWaId(input.phone);
    if (!normalized) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "invalid_whatsapp_identity", phone: input.phone });
      continue;
    }
    if (seen.has(normalized.waIdCanonical)) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "duplicate_recipient", phone: normalized.waIdCanonical });
      continue;
    }
    seen.add(normalized.waIdCanonical);
    const identityCandidates = buildCrmWhatsappIdentityCandidates([input.phone, normalized.waIdCanonical]);
    if (identityCandidates.some((candidate) => existing.has(candidate))) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "existing_campaign_recipient", phone: normalized.waIdCanonical });
      continue;
    }
    const variables = normalizeVariableMap(input.variables);
    const missing = requiredKeys.some((key) => !variables[key]);
    if (missing) {
      addBlocked(blocked, blockedCounts, { rowNumber, reason: "variable_missing_value", phone: normalized.waIdCanonical });
      continue;
    }
    normalizedCandidates.push({
      waId: normalized.waIdCanonical,
      waIdCanonical: normalized.waIdCanonical,
      rowNumber,
      variables,
      name: input.name?.trim() || null,
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
  const ready = lifecycleReady.filter((item) => {
    if (!optOutBlocked.has(item.waIdCanonical)) return true;
    addBlocked(blocked, blockedCounts, { rowNumber: item.rowNumber, reason: "active_send_blocked", phone: item.waIdCanonical });
    return false;
  });
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  for (const item of ready) {
    const components = buildTemplateComponentsFromVariables({ requiredKeys, variables: item.variables });
    if (components) componentsByWaId[item.waIdCanonical] = components;
  }

  const blockedByReason = Array.from(blockedCounts.entries()).map(([reason, count]) => ({
    reason,
    label: labelForImportReason(reason),
    count,
  }));
  return {
    preview: {
      ok: true,
      summary: {
        received: params.recipients.length,
        valid: ready.length,
        invalid: blockedCounts.get("invalid_whatsapp_identity") ?? 0,
        duplicates: blockedCounts.get("duplicate_recipient") ?? 0,
        existingDuplicates: blockedCounts.get("existing_campaign_recipient") ?? 0,
        optOutBlocked: blockedCounts.get("active_send_blocked") ?? 0,
        missingRequiredVariables: blockedCounts.get("variable_missing_value") ?? 0,
        readyToImport: ready.length,
        blockedByReason,
      },
      recipients: ready.slice(0, 200).map((item) => ({
        rowNumber: item.rowNumber,
        phoneDisplay: maskRecipient(item.waIdCanonical) ?? "WhatsApp User",
        identifierDisplay: item.name || maskRecipient(item.waIdCanonical) || "WhatsApp User",
        variables: item.variables,
      })),
      errors: blocked.slice(0, CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT),
      truncatedErrors: blocked.length > CAMPAIGN_IMPORT_ERROR_SAMPLE_LIMIT,
    },
    acceptedWaIds: ready.map((item) => item.waIdCanonical),
    componentsByWaId,
    optOutBlocked: optOutFiltered.blocked,
  };
}

export async function previewCampaignRecipientImport(
  prisma: PrismaClient,
  params: {
    clientId: string;
    campaignId?: string | null;
    template: TemplateContext;
    recipients: CampaignImportRecipientInput[];
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
    phoneDisplay: maskRecipient(String(params.phone ?? "")),
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
    returnDestination?: OutboundReturnDestination | null;
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
    existingSeed,
  });
  const preview = plan.preview;
  const existingComponents = existingSeed.componentsByWaId ?? {};
  const nextRecipients = [...existingSeed.recipients];
  const componentsByWaId: Record<string, CampaignTemplateComponents> = { ...existingComponents, ...plan.componentsByWaId };

  for (const waIdCanonical of plan.acceptedWaIds) {
    if (!nextRecipients.includes(waIdCanonical)) nextRecipients.push(waIdCanonical);
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        totalRecipients: nextRecipients.length,
        blockedCount: preview.summary.optOutBlocked + preview.summary.invalid + preview.summary.missingRequiredVariables,
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
          importedCount: preview.summary.readyToImport,
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
  return { ok: true as const, campaign: updated, preview, importedCount: preview.summary.readyToImport };
}
