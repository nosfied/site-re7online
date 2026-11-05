export const OWNER_AUTHORIZED_DB_IDENTITY = "OWNER_AUTHORIZED_DB_IDENTITY" as const;
export const TENANT_OPERATIONAL_CONFIG_FIELD_SELECTION = ["baseConfig"] as const;
export type TenantOperationalConfigFieldSelection = typeof TENANT_OPERATIONAL_CONFIG_FIELD_SELECTION[number];

export type OwnerAuthorizedBaseConfig = {
  allowlist: string[];
  handoffAttendantWaid: string;
  defaultLanguage: string;
  disableAutoReply: boolean;
};

export type TenantOperationalConfigPlanDocument = {
  schemaVersion: 1;
  sourceSha256: string;
  tenants: Record<string, {
    provenance: typeof OWNER_AUTHORIZED_DB_IDENTITY;
    baseConfig: OwnerAuthorizedBaseConfig;
  }>;
};

const DOCUMENT_KEYS = ["schemaVersion", "sourceSha256", "tenants"];
const TENANT_KEYS = ["baseConfig", "provenance"];
const BASE_CONFIG_KEYS = ["allowlist", "defaultLanguage", "disableAutoReply", "handoffAttendantWaid"];

function exactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTenantOperationalConfigSelection(values: readonly string[]): string[] {
  if (values.length === 0) throw new Error("TENANT_OPERATIONAL_CONFIG_SELECTOR_EMPTY");
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error("TENANT_OPERATIONAL_CONFIG_SELECTOR_EMPTY");
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`TENANT_OPERATIONAL_CONFIG_SELECTOR_DUPLICATE:${[...new Set(duplicates)].sort().join(",")}`);
  }
  return [...normalized].sort();
}

export function normalizeTenantOperationalConfigFieldSelection(
  values: readonly string[]
): TenantOperationalConfigFieldSelection[] {
  if (values.length === 0) throw new Error("TENANT_OPERATIONAL_CONFIG_FIELD_SELECTOR_EMPTY");
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error("TENANT_OPERATIONAL_CONFIG_FIELD_SELECTOR_EMPTY");
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`TENANT_OPERATIONAL_CONFIG_FIELD_SELECTOR_DUPLICATE:${[...new Set(duplicates)].sort().join(",")}`);
  }
  const allowed = new Set<string>(TENANT_OPERATIONAL_CONFIG_FIELD_SELECTION);
  const unsupported = normalized.filter((value) => !allowed.has(value));
  if (unsupported.length > 0) {
    throw new Error(`TENANT_OPERATIONAL_CONFIG_FIELD_SELECTOR_UNSUPPORTED:${unsupported.sort().join(",")}`);
  }
  return normalized as TenantOperationalConfigFieldSelection[];
}

export function validateTenantOperationalConfigPlan(params: {
  document: unknown;
  expectedSourceSha256: string;
  sourceTenantKeys: readonly string[];
}): TenantOperationalConfigPlanDocument {
  if (!isRecord(params.document) || !exactKeys(params.document, DOCUMENT_KEYS)) {
    throw new Error("TENANT_OPERATIONAL_CONFIG_PLAN_SCHEMA_INVALID");
  }
  if (params.document.schemaVersion !== 1) throw new Error("TENANT_OPERATIONAL_CONFIG_PLAN_SCHEMA_INVALID");
  if (params.document.sourceSha256 !== params.expectedSourceSha256.toLowerCase()) {
    throw new Error("TENANT_OPERATIONAL_CONFIG_PLAN_SOURCE_SHA256_MISMATCH");
  }
  if (!isRecord(params.document.tenants)) throw new Error("TENANT_OPERATIONAL_CONFIG_PLAN_TENANTS_INVALID");
  const sourceTenantKeys = new Set(params.sourceTenantKeys);
  for (const [tenantKey, rawEntry] of Object.entries(params.document.tenants)) {
    if (tenantKey !== "cra-pr") throw new Error(`TENANT_OPERATIONAL_CONFIG_EXTERNAL_TENANT_DENY:${tenantKey}`);
    if (sourceTenantKeys.has(tenantKey)) throw new Error(`TENANT_OPERATIONAL_CONFIG_PLAN_TENANT_IN_SOURCE:${tenantKey}`);
    if (!isRecord(rawEntry) || !exactKeys(rawEntry, TENANT_KEYS)) {
      throw new Error(`TENANT_OPERATIONAL_CONFIG_PLAN_ENTRY_INVALID:${tenantKey}`);
    }
    if (rawEntry.provenance !== OWNER_AUTHORIZED_DB_IDENTITY) {
      throw new Error(`CRA_OPERATIONAL_CONFIG_PROVENANCE_DENY:${tenantKey}`);
    }
    if (!isRecord(rawEntry.baseConfig) || !exactKeys(rawEntry.baseConfig, BASE_CONFIG_KEYS)) {
      throw new Error(`CRA_OPERATIONAL_CONFIG_BASE_CONFIG_INVALID:${tenantKey}`);
    }
    const baseConfig = rawEntry.baseConfig;
    if (!Array.isArray(baseConfig.allowlist) ||
        baseConfig.allowlist.some((value) => typeof value !== "string" || !/^\d+$/.test(value)) ||
        new Set(baseConfig.allowlist).size !== baseConfig.allowlist.length) {
      throw new Error(`CRA_OPERATIONAL_CONFIG_BASE_CONFIG_INVALID:${tenantKey}`);
    }
    if (typeof baseConfig.handoffAttendantWaid !== "string" ||
        (baseConfig.handoffAttendantWaid !== "" && !/^\d+$/.test(baseConfig.handoffAttendantWaid)) ||
        typeof baseConfig.defaultLanguage !== "string" ||
        !/^[a-z]{2}_[A-Z]{2}$/.test(baseConfig.defaultLanguage) ||
        typeof baseConfig.disableAutoReply !== "boolean") {
      throw new Error(`CRA_OPERATIONAL_CONFIG_BASE_CONFIG_INVALID:${tenantKey}`);
    }
  }
  return params.document as TenantOperationalConfigPlanDocument;
}

export function selectedTenantOperationalConfigKeys(params: {
  sourceTenantKeys: readonly string[];
  plan?: TenantOperationalConfigPlanDocument;
  selectedTenants?: readonly string[];
}): string[] {
  if (!params.selectedTenants) return [...params.sourceTenantKeys];
  const selected = normalizeTenantOperationalConfigSelection(params.selectedTenants);
  const source = new Set(params.sourceTenantKeys);
  for (const tenantKey of selected) {
    if (source.has(tenantKey)) continue;
    if (tenantKey === "cra-pr" && params.plan?.tenants[tenantKey]?.provenance === OWNER_AUTHORIZED_DB_IDENTITY) continue;
    throw new Error(`TENANT_OPERATIONAL_CONFIG_TENANT_UNKNOWN:${tenantKey}`);
  }
  return selected;
}
