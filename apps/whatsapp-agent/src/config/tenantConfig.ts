import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";
import { logger } from "../logger/logger.js";

export type TenantConfig = {
  id: string;
  name: string;
  metaPhoneNumberId: string;
  allowlist: string[];
  handoffAttendantWaid: string;
  defaultLanguage: string;
  templates: {
    manualHandoff: string;
  };
};

export type TenantConfigMap = Record<string, TenantConfig>;

let cachedTenants: TenantConfigMap | null = null;

function getTenantsPath() {
  return path.join(process.cwd(), ".data", "tenants.json");
}

function buildDefaultTenant(): TenantConfigMap {
  const tenant: TenantConfig = {
    id: "default",
    name: "Re7 Demo",
    metaPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    allowlist: env.WHATSAPP_ALLOWLIST ?? [],
    handoffAttendantWaid: env.HANDOFF_ATTENDANT_WAID ?? "",
    defaultLanguage: env.OUTBOUND_TEMPLATE_DEFAULT_LANG ?? "pt_BR",
    templates: {
      manualHandoff: env.HANDOFF_TEMPLATE_NAME || "re7_atendente_manual_v1",
    },
  };
  return { default: tenant };
}

async function loadTenantsFromFile(): Promise<TenantConfigMap | null> {
  try {
    const raw = await fs.readFile(getTenantsPath(), "utf-8");
    const data = JSON.parse(raw) as TenantConfigMap;
    return data;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.warn({
        event: "tenant.loaded",
        source: "env_fallback",
        reason: "invalid_file",
        message: (error as Error).message,
      });
    }
    return null;
  }
}

export async function getTenants(): Promise<TenantConfigMap> {
  if (cachedTenants) return cachedTenants;
  const fromFile = await loadTenantsFromFile();
  cachedTenants = fromFile ?? buildDefaultTenant();
  logger.info({
    event: "tenant.loaded",
    tenantCount: Object.keys(cachedTenants).length,
    source: fromFile ? "file" : "env_fallback",
  });
  return cachedTenants;
}

export async function getTenant(tenantId: string) {
  const tenants = await getTenants();
  return tenants[tenantId];
}

export async function getDefaultTenant() {
  const tenants = await getTenants();
  return tenants.default ?? Object.values(tenants)[0] ?? null;
}
