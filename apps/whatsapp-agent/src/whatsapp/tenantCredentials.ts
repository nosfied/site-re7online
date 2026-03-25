import { env } from "../config/env.js";
import { getTenants } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";

export type TenantOutboundCredentials = {
  accessToken: string;
  phoneNumberId: string;
  source: "tenant_meta" | "tenant_config" | "env";
};

export async function resolveTenantOutboundCredentials(params: {
  clientId: string;
  clientKey: string;
}): Promise<TenantOutboundCredentials | null> {
  const prisma = getPrisma();
  const [tenantMetaConfig, tenants] = await Promise.all([
    prisma.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: {
        businessToken: true,
        phoneNumberId: true,
      },
    }),
    getTenants(),
  ]);

  const tenantConfigPhoneNumberId = String(
    tenants[params.clientKey]?.metaPhoneNumberId ?? ""
  ).trim();
  const tenantMetaPhoneNumberId = String(tenantMetaConfig?.phoneNumberId ?? "").trim();
  const tenantMetaBusinessToken = String(tenantMetaConfig?.businessToken ?? "").trim();
  const envPhoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const envAccessToken = String(env.WHATSAPP_ACCESS_TOKEN ?? "").trim();

  if (tenantMetaBusinessToken && tenantMetaPhoneNumberId) {
    return {
      accessToken: tenantMetaBusinessToken,
      phoneNumberId: tenantMetaPhoneNumberId,
      source: "tenant_meta",
    };
  }

  if (envAccessToken && tenantConfigPhoneNumberId) {
    return {
      accessToken: envAccessToken,
      phoneNumberId: tenantConfigPhoneNumberId,
      source: "tenant_config",
    };
  }

  if (envAccessToken && envPhoneNumberId) {
    return {
      accessToken: envAccessToken,
      phoneNumberId: envPhoneNumberId,
      source: "env",
    };
  }

  return null;
}
