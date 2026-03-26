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
  disableAutoReply?: boolean;
  planName?: string;
  messagesLimit?: number;
  quotaMonthlyConversations?: number;
  quotaWarnAtPct?: number;
  quotaBlockedReplyText?: string;
  quotaExcludeWaIds?: string[];
  templates: {
    manualHandoff: string;
  };
};

export type TenantConfigMap = Record<string, TenantConfig>;

let cachedTenants: TenantConfigMap | null = null;

function getTenantsPath() {
  return path.join(process.cwd(), ".data", "tenants.json");
}

function getBackupPath() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
  return path.join(process.cwd(), ".data", `tenants.json.bak.${stamp}`);
}

async function ensureTenantsDir() {
  await fs.mkdir(path.dirname(getTenantsPath()), { recursive: true });
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
    const data = normalizeTenantConfigMap(JSON.parse(raw));
    assertTenantConfigMap(data);
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

function normalizeTenantConfigMap(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const tenants = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tenants)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      normalized[key] = value;
      continue;
    }
    const tenant = value as Record<string, unknown>;
    const nextTenant: Record<string, unknown> = { ...tenant };
    if (tenant.disableAutoReply === undefined && (key === "justa-advocacia" || tenant.id === "justa-advocacia")) {
      nextTenant.disableAutoReply = true;
    }
    if (Array.isArray(tenant.quotaExcludeWaIds)) {
      nextTenant.quotaExcludeWaIds = tenant.quotaExcludeWaIds.map((waId) =>
        typeof waId === "string" ? waId.replace(/\D/g, "") : waId
      );
    }
    normalized[key] = nextTenant;
  }
  return normalized;
}

function assertTenantConfigMap(input: unknown): asserts input is TenantConfigMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("invalid_tenants_root");
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("empty_tenants");
  }
  for (const [key, value] of entries) {
    if (!key.trim()) {
      throw new Error("invalid_tenant_key");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid_tenant:${key}`);
    }
    const tenant = value as Record<string, unknown>;
    if (typeof tenant.id !== "string" || !tenant.id.trim()) {
      throw new Error(`invalid_tenant_id:${key}`);
    }
    if (typeof tenant.name !== "string" || !tenant.name.trim()) {
      throw new Error(`invalid_tenant_name:${key}`);
    }
    if (typeof tenant.metaPhoneNumberId !== "string") {
      throw new Error(`invalid_tenant_phone:${key}`);
    }
    if (!Array.isArray(tenant.allowlist) || tenant.allowlist.some((item) => typeof item !== "string")) {
      throw new Error(`invalid_tenant_allowlist:${key}`);
    }
    if (typeof tenant.handoffAttendantWaid !== "string") {
      throw new Error(`invalid_tenant_handoff:${key}`);
    }
    if (typeof tenant.defaultLanguage !== "string" || !tenant.defaultLanguage.trim()) {
      throw new Error(`invalid_tenant_language:${key}`);
    }
    if (tenant.disableAutoReply !== undefined && typeof tenant.disableAutoReply !== "boolean") {
      throw new Error(`invalid_tenant_disable_auto_reply:${key}`);
    }
    if (
      tenant.planName !== undefined &&
      (typeof tenant.planName !== "string" || !tenant.planName.trim())
    ) {
      throw new Error(`invalid_tenant_plan_name:${key}`);
    }
    if (
      tenant.messagesLimit !== undefined &&
      (typeof tenant.messagesLimit !== "number" ||
        !Number.isFinite(tenant.messagesLimit) ||
        tenant.messagesLimit < 0)
    ) {
      throw new Error(`invalid_tenant_messages_limit:${key}`);
    }
    if (
      tenant.quotaMonthlyConversations !== undefined &&
      (typeof tenant.quotaMonthlyConversations !== "number" ||
        !Number.isFinite(tenant.quotaMonthlyConversations) ||
        tenant.quotaMonthlyConversations < 0)
    ) {
      throw new Error(`invalid_tenant_quota_monthly:${key}`);
    }
    if (
      tenant.quotaWarnAtPct !== undefined &&
      (typeof tenant.quotaWarnAtPct !== "number" ||
        !Number.isFinite(tenant.quotaWarnAtPct) ||
        tenant.quotaWarnAtPct < 0 ||
        tenant.quotaWarnAtPct > 1)
    ) {
      throw new Error(`invalid_tenant_quota_warn:${key}`);
    }
    if (
      tenant.quotaBlockedReplyText !== undefined &&
      (typeof tenant.quotaBlockedReplyText !== "string" || !tenant.quotaBlockedReplyText.trim())
    ) {
      throw new Error(`invalid_tenant_quota_blocked_reply:${key}`);
    }
    if (
      tenant.quotaExcludeWaIds !== undefined &&
      (!Array.isArray(tenant.quotaExcludeWaIds) ||
        tenant.quotaExcludeWaIds.some(
          (waId) =>
            typeof waId !== "string" || !waId.trim() || !/^\d+$/.test(waId)
        ))
    ) {
      throw new Error(`invalid_tenant_quota_exclude_waids:${key}`);
    }
    const templates = tenant.templates as Record<string, unknown> | undefined;
    if (!templates || typeof templates !== "object" || Array.isArray(templates)) {
      throw new Error(`invalid_tenant_templates:${key}`);
    }
    if (typeof templates.manualHandoff !== "string" || !templates.manualHandoff.trim()) {
      throw new Error(`invalid_tenant_manual_handoff:${key}`);
    }
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

export async function getTenantByClientKeyOrPhoneNumberId(
  clientKey?: string | null,
  phoneNumberId?: string | null
) {
  const tenants = await getTenants();
  const key = (clientKey ?? "").trim();
  if (key && tenants[key]) {
    return { tenant: tenants[key], hasTenantConfig: true };
  }

  const resolvedPhoneNumberId = (phoneNumberId ?? "").trim();
  if (resolvedPhoneNumberId) {
    const matchedTenant =
      Object.values(tenants).find(
        (tenant) => tenant.metaPhoneNumberId === resolvedPhoneNumberId
      ) ?? null;
    if (matchedTenant) {
      return { tenant: matchedTenant, hasTenantConfig: true };
    }
  }

  return {
    tenant: tenants.default ?? Object.values(tenants)[0] ?? null,
    hasTenantConfig: false,
  };
}

export async function getDefaultTenant() {
  const tenants = await getTenants();
  return tenants.default ?? Object.values(tenants)[0] ?? null;
}

export async function saveTenants(nextTenants: unknown) {
  const normalizedTenants = normalizeTenantConfigMap(nextTenants);
  assertTenantConfigMap(normalizedTenants);
  await ensureTenantsDir();
  const tenantsPath = getTenantsPath();
  const backupPath = getBackupPath();
  try {
    const current = await fs.readFile(tenantsPath, "utf-8");
    await fs.writeFile(backupPath, current, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const payload = JSON.stringify(normalizedTenants, null, 2);
  const tempPath = `${tenantsPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, payload, "utf-8");
  await fs.rename(tempPath, tenantsPath);
  cachedTenants = normalizedTenants;
  return {
    tenants: cachedTenants,
    backupPath,
  };
}
