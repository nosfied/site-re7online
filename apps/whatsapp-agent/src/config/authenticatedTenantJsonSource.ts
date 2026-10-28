import type { TenantConfig } from "./tenantConfig.js";
import { readAuthenticatedPrivateJsonSource } from "./authenticatedPrivateJsonSource.js";

export async function readAuthenticatedTenantJsonSource(params: {
  source: string;
  expectedSha256: string;
}): Promise<Record<string, TenantConfig>> {
  return readAuthenticatedPrivateJsonSource<Record<string, TenantConfig>>(params);
}
