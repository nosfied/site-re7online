import { normalizeTenantOperationalConfigSelection } from "./tenantOperationalConfigMigrationPlan.js";

export type TenantJsonRetirementOptions = {
  tenants?: string[];
};

export function parseTenantJsonRetirementOptions(argv: readonly string[]): TenantJsonRetirementOptions {
  const tenants: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--tenant") {
      throw new Error(`TENANTS_JSON_RETIREMENT_ARGUMENT_UNKNOWN:${argument}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("TENANT_OPERATIONAL_CONFIG_SELECTOR_EMPTY");
    }
    tenants.push(value);
    index += 1;
  }
  return tenants.length > 0
    ? { tenants: normalizeTenantOperationalConfigSelection(tenants) }
    : {};
}

export function selectTenantJsonRetirementTenants<T extends { clientKey: string }>(params: {
  tenants: readonly T[];
  selectedTenants?: readonly string[];
}): T[] {
  if (!params.selectedTenants) return [...params.tenants];
  const selected = normalizeTenantOperationalConfigSelection(params.selectedTenants);
  const tenantsByKey = new Map(params.tenants.map((tenant) => [tenant.clientKey, tenant]));
  return selected.map((tenantKey) => {
    const tenant = tenantsByKey.get(tenantKey);
    if (!tenant) throw new Error(`TENANTS_JSON_RETIREMENT_TENANT_UNKNOWN:${tenantKey}`);
    return tenant;
  });
}

export function tenantJsonRetirementReady(params: {
  databaseReachable: boolean;
  blockingUsageCount: number;
  incompleteTenantCount: number;
}) {
  return params.databaseReachable && params.blockingUsageCount === 0 && params.incompleteTenantCount === 0;
}
