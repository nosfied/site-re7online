import { env } from "../config/env.js";
import { loadTenantsJsonFallback } from "../config/tenantJsonFallback.js";
import {
  isWhatsappTransportEnabledForRouting,
  resolveWhatsappTransportRoutingSettings,
} from "../config/tenantOperationalConfig.js";
import { getPrisma } from "../db.js";

export type TenantOutboundCredentials = {
  accessToken: string;
  phoneNumberId: string;
  source: "tenant_meta" | "tenant_config" | "env";
  credentialGeneration?: string;
};

export async function resolveTenantOutboundCredentials(params: {
  clientId: string;
  clientKey: string;
}): Promise<TenantOutboundCredentials | null> {
  const prisma = getPrisma();
  const [tenantMetaConfig, waPhoneNumber, routingSettings] = await Promise.all([
    prisma.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: {
        businessToken: true,
        phoneNumberId: true,
        updatedAt: true,
      },
    }),
    prisma.waPhoneNumber.findFirst({
      where: { clientId: params.clientId },
      select: { phoneNumberId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    resolveWhatsappTransportRoutingSettings({
      prisma,
      clientId: params.clientId,
    }),
  ]);

  const tenantMetaPhoneNumberId = String(tenantMetaConfig?.phoneNumberId ?? "").trim();
  const tenantMetaBusinessToken = String(tenantMetaConfig?.businessToken ?? "").trim();
  const dbPhoneNumberId = String(waPhoneNumber?.phoneNumberId ?? "").trim();
  const envPhoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const envAccessToken = String(env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  if (
    !isWhatsappTransportEnabledForRouting(
      routingSettings.settings,
      "meta",
      true
    )
  ) {
    return null;
  }

  if (tenantMetaBusinessToken && tenantMetaPhoneNumberId) {
    return {
      accessToken: tenantMetaBusinessToken,
      phoneNumberId: tenantMetaPhoneNumberId,
      source: "tenant_meta",
      credentialGeneration: `tenant_meta:${tenantMetaConfig?.updatedAt.toISOString() ?? "unknown"}`,
    };
  }

  if (envAccessToken && dbPhoneNumberId) {
    return {
      accessToken: envAccessToken,
      phoneNumberId: dbPhoneNumberId,
      source: "tenant_config",
      credentialGeneration: `tenant_config:${waPhoneNumber?.createdAt.toISOString() ?? "unknown"}`,
    };
  }

  if (env.ENABLE_TENANTS_JSON_FALLBACK) {
    const tenants = await loadTenantsJsonFallback({
      route: "whatsapp/tenantCredentials",
      reason: "db_phone_number_missing",
    });
    const tenantConfigPhoneNumberId = String(
      tenants[params.clientKey]?.metaPhoneNumberId ?? ""
    ).trim();
    if (envAccessToken && tenantConfigPhoneNumberId) {
      return {
        accessToken: envAccessToken,
        phoneNumberId: tenantConfigPhoneNumberId,
        source: "tenant_config",
        credentialGeneration: "tenant_json:process",
      };
    }
  }

  if (envAccessToken && envPhoneNumberId) {
    return {
      accessToken: envAccessToken,
      phoneNumberId: envPhoneNumberId,
      source: "env",
      credentialGeneration: "env:process",
    };
  }

  return null;
}
