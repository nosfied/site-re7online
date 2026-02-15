import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";

export type TenantResolution = {
  clientId: string;
  clientKey: string;
  phoneNumberId?: string;
};

export async function resolveTenant(
  phoneNumberId: string | undefined,
  meta?: { requestId?: string; route?: string; method?: string }
): Promise<TenantResolution> {
  const prisma = getPrisma();
  if (phoneNumberId) {
    const phone = await prisma.waPhoneNumber.findUnique({
      where: { phoneNumberId },
      include: { client: true },
    });
    if (phone?.client) {
      return {
        clientId: phone.client.id,
        clientKey: phone.client.clientKey,
        phoneNumberId,
      };
    }
  }

  const fallbackClient = await prisma.client.findUnique({
    where: { clientKey: "default" },
  });
  if (fallbackClient) {
    // Fail-soft: fallback default para não perder mensagens; admin deve cadastrar phone_number_id.
    logger.warn({
      event: "tenant.missing",
      phoneNumberId,
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
    });
    return {
      clientId: fallbackClient.id,
      clientKey: fallbackClient.clientKey,
      phoneNumberId,
    };
  }

  // Sem fallback: mantém clientId vazio e loga erro para evitar hard-fail em produção.
  logger.error({
    event: "tenant.missing",
    phoneNumberId,
    requestId: meta?.requestId,
    route: meta?.route,
    method: meta?.method,
  });
  return {
    clientId: "",
    clientKey: "default",
    phoneNumberId,
  };
}
