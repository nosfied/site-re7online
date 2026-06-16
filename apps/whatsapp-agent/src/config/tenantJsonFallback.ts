import { getTenants, type TenantConfigMap } from "./tenantConfig.js";
import { logger } from "../logger/logger.js";

export async function loadTenantsJsonFallback(params: {
  route: string;
  reason: string;
  requestId?: string;
}): Promise<TenantConfigMap> {
  logger.warn({
    event: "tenants_json.legacy_fallback_used",
    route: params.route,
    requestId: params.requestId ?? null,
    reason: params.reason,
  });
  return getTenants();
}
