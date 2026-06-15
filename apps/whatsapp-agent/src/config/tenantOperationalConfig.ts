import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import {
  normalizeCrmBusinessStatuses,
  type CrmBusinessStatusConfig,
  type TenantConfig,
} from "./tenantConfig.js";

export type TenantOperationalConfigValue = {
  crmBusinessStatuses?: CrmBusinessStatusConfig[];
  templates?: {
    manualHandoff?: string;
  };
  followUp?: FollowUpSettings;
};

export type TenantOperationalConfigSource = "db" | "json_fallback";

export type ResolvedCrmBusinessStatuses = {
  statuses: CrmBusinessStatusConfig[];
  source: TenantOperationalConfigSource;
};

export type ResolvedManualHandoffTemplate = {
  templateName: string | null;
  source: TenantOperationalConfigSource;
};

export type FollowUpSettings = {
  enabled: boolean;
  delayMinutes: number;
  maxCount: number;
  useTemplate: boolean;
  templateName: string;
  templateLang: string;
};

export type ResolvedFollowUpSettings = {
  settings: FollowUpSettings;
  source: TenantOperationalConfigSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeManualHandoffTemplate(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value.slice(0, 120) : null;
}

function normalizePositiveInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(1, Math.floor(input));
}

function normalizeNonNegativeInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(0, Math.floor(input));
}

function normalizeTemplateName(input: unknown) {
  if (typeof input !== "string") return "";
  const value = input.trim();
  return /^[a-z0-9_]+$/.test(value) ? value.slice(0, 120) : "";
}

function normalizeTemplateLang(input: unknown, fallback?: string | null) {
  const value = typeof input === "string" ? input.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(value)) return value;
  const fallbackValue = typeof fallback === "string" ? fallback.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(fallbackValue)) return fallbackValue;
  return env.OUTBOUND_TEMPLATE_DEFAULT_LANG;
}

function normalizeFollowUpSettings(input: unknown, fallbackTenant?: Pick<TenantConfig, "defaultLanguage"> | null): FollowUpSettings {
  const record = isRecord(input) ? input : {};
  return {
    enabled: record.enabled === true,
    delayMinutes: normalizePositiveInteger(record.delayMinutes, env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: normalizeNonNegativeInteger(record.maxCount, env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: record.useTemplate === true,
    templateName: normalizeTemplateName(record.templateName),
    templateLang: normalizeTemplateLang(record.templateLang, fallbackTenant?.defaultLanguage),
  };
}

function normalizeFollowUpSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null
): FollowUpSettings {
  return {
    enabled: tenant?.followUpEnabled === true,
    delayMinutes: normalizePositiveInteger(tenant?.followUpDelayMinutes, env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: normalizeNonNegativeInteger(tenant?.followUpMaxCount, env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: tenant?.followUpUseTemplate === true,
    templateName: normalizeTemplateName(tenant?.followUpTemplateName),
    templateLang: normalizeTemplateLang(tenant?.followUpTemplateLang, tenant?.defaultLanguage),
  };
}

function parseOperationalConfig(value: unknown): TenantOperationalConfigValue {
  if (!isRecord(value)) return {};
  const config: TenantOperationalConfigValue = {};
  if (Object.prototype.hasOwnProperty.call(value, "crmBusinessStatuses")) {
    config.crmBusinessStatuses = normalizeCrmBusinessStatuses(value.crmBusinessStatuses);
  }
  if (isRecord(value.templates)) {
    const manualHandoff = normalizeManualHandoffTemplate(value.templates.manualHandoff);
    if (manualHandoff) {
      config.templates = { manualHandoff };
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "followUp")) {
    config.followUp = normalizeFollowUpSettings(value.followUp);
  }
  return config;
}

export async function resolveCrmBusinessStatuses(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "crmBusinessStatuses"> | null;
}): Promise<ResolvedCrmBusinessStatuses> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.crmBusinessStatuses) {
    return {
      statuses: dbConfig.crmBusinessStatuses,
      source: "db",
    };
  }
  return {
    statuses: normalizeCrmBusinessStatuses(params.tenant?.crmBusinessStatuses),
    source: "json_fallback",
  };
}

export async function resolveManualHandoffTemplate(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "templates"> | null;
}): Promise<ResolvedManualHandoffTemplate> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.templates?.manualHandoff) {
    return {
      templateName: dbConfig.templates.manualHandoff,
      source: "db",
    };
  }
  return {
    templateName: normalizeManualHandoffTemplate(params.tenant?.templates?.manualHandoff),
    source: "json_fallback",
  };
}

export async function resolveFollowUpSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null;
}): Promise<ResolvedFollowUpSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.followUp) {
    return {
      settings: dbConfig.followUp,
      source: "db",
    };
  }
  return {
    settings: normalizeFollowUpSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveFollowUpSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<FollowUpSettings>;
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentFollowUp = parseOperationalConfig(existing?.config).followUp
    ?? normalizeFollowUpSettingsFromTenant(params.tenant);
  const nextFollowUp = normalizeFollowUpSettings({
    ...currentFollowUp,
    ...params.settings,
  }, params.tenant);
  const nextConfig = {
    ...existingConfig,
    followUp: nextFollowUp,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextFollowUp,
  };
}

export async function saveCrmBusinessStatuses(params: {
  prisma: PrismaClient;
  clientId: string;
  statuses: CrmBusinessStatusConfig[];
}) {
  const normalized = normalizeCrmBusinessStatuses(params.statuses);
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const nextConfig = {
    ...existingConfig,
    crmBusinessStatuses: normalized,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    statuses: normalized,
  };
}
