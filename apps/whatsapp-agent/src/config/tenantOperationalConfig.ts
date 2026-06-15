import type { Prisma, PrismaClient } from "@prisma/client";
import {
  normalizeCrmBusinessStatuses,
  type CrmBusinessStatusConfig,
  type TenantConfig,
} from "./tenantConfig.js";

export type TenantOperationalConfigValue = {
  crmBusinessStatuses?: CrmBusinessStatusConfig[];
};

export type TenantOperationalConfigSource = "db" | "json_fallback";

export type ResolvedCrmBusinessStatuses = {
  statuses: CrmBusinessStatusConfig[];
  source: TenantOperationalConfigSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseOperationalConfig(value: unknown): TenantOperationalConfigValue {
  if (!isRecord(value)) return {};
  const config: TenantOperationalConfigValue = {};
  if (Object.prototype.hasOwnProperty.call(value, "crmBusinessStatuses")) {
    config.crmBusinessStatuses = normalizeCrmBusinessStatuses(value.crmBusinessStatuses);
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
