import type { PrismaClient } from "@prisma/client";
import type { TenantConfig } from "../config/tenantConfig.js";
import {
  applyAiAssistantConfigToTenant,
  applyAiIntentQualificationToTenant,
  resolveAiAssistantConfigSettings,
  resolveAiIntentQualificationSettings,
  resolveAutomationFlagsSettings,
  resolveHandoffLeadNotificationSettings,
  resolveMediaHandoffPolicy,
  resolvePlanLimitsSettings,
  resolveTenantBaseConfigSettings,
} from "../config/tenantOperationalConfig.js";

export type WhatsappMetaRuntimeReadinessReason =
  | "client_missing"
  | "client_inactive"
  | "phone_mapping_missing"
  | "phone_mapping_mismatch"
  | "tenant_base_config_missing"
  | "tenant_ai_config_missing"
  | "channel_account_missing";

export async function resolveWhatsappMetaTenantRuntimeConfig(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  phoneNumberId: string;
}) {
  const [client, phone, metaConfig, channelAccount, base, ai, aiIntent, automation, handoff, media, planLimits] =
    await Promise.all([
      params.prisma.client.findUnique({
        where: { id: params.clientId },
        select: { id: true, clientKey: true, name: true, status: true },
      }),
      params.prisma.waPhoneNumber.findUnique({
        where: { phoneNumberId: params.phoneNumberId },
        select: { clientId: true, phoneNumberId: true },
      }),
      params.prisma.tenantMetaConfig.findFirst({
        where: { phoneNumberId: params.phoneNumberId },
        select: { clientId: true, phoneNumberId: true },
      }),
      params.prisma.channelAccount.findFirst({
        where: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: "meta",
          OR: [
            { channelAccountId: params.phoneNumberId },
            { aliases: { some: { alias: params.phoneNumberId } } },
          ],
        },
        select: {
          enabled: true,
          automationEnabled: true,
          runtimeEnabled: true,
          inboundPersistenceEnabled: true,
          outboundEnabled: true,
          aiEnabled: true,
          handoffEnabled: true,
          status: true,
        },
      }),
      resolveTenantBaseConfigSettings({ prisma: params.prisma, clientId: params.clientId }),
      resolveAiAssistantConfigSettings({ prisma: params.prisma, clientId: params.clientId }),
      resolveAiIntentQualificationSettings({ prisma: params.prisma, clientId: params.clientId }),
      resolveAutomationFlagsSettings({ prisma: params.prisma, clientId: params.clientId }),
      resolveHandoffLeadNotificationSettings({ prisma: params.prisma, clientId: params.clientId }),
      resolveMediaHandoffPolicy({ prisma: params.prisma, clientId: params.clientId }),
      resolvePlanLimitsSettings({ prisma: params.prisma, clientId: params.clientId }),
    ]);

  const reasons: WhatsappMetaRuntimeReadinessReason[] = [];
  if (!client) reasons.push("client_missing");
  else if (client.status !== "ACTIVE") reasons.push("client_inactive");
  if (!phone && !metaConfig) reasons.push("phone_mapping_missing");
  else if (phone?.clientId !== params.clientId && metaConfig?.clientId !== params.clientId) {
    reasons.push("phone_mapping_mismatch");
  }
  if (base.source !== "db") reasons.push("tenant_base_config_missing");
  if (ai.source !== "db") reasons.push("tenant_ai_config_missing");
  if (!channelAccount) reasons.push("channel_account_missing");

  const tenantBase: Partial<TenantConfig> = {
    id: params.clientKey,
    name: client?.name ?? params.clientKey,
    metaPhoneNumberId: params.phoneNumberId,
    ...base.settings,
  };
  const tenant = applyAiIntentQualificationToTenant(
    applyAiAssistantConfigToTenant(tenantBase, ai.settings),
    aiIntent.settings
  );

  return {
    tenant,
    readiness: { ready: reasons.length === 0, reasons },
    channel: {
      enabled: channelAccount?.enabled === true && channelAccount.status === "connected",
      automationEnabled: channelAccount?.automationEnabled === true,
      runtimeEnabled: channelAccount?.runtimeEnabled === true,
      inboundPersistenceEnabled: channelAccount?.inboundPersistenceEnabled === true,
      outboundEnabled: channelAccount?.outboundEnabled === true,
      aiEnabled: channelAccount?.aiEnabled === true,
      handoffEnabled: channelAccount?.handoffEnabled === true,
    },
    automationFlags: automation.settings,
    handoffLeadNotification: handoff.settings,
    mediaHandoffPolicy: media.policy,
    planLimits: planLimits.settings,
  };
}
