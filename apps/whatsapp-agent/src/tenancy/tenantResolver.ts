import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";

export type TenantResolution = {
  clientId: string;
  clientKey: string;
  phoneNumberId?: string;
};

export class TenantResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_phone_number_id" | "unmapped_phone_number_id",
    public readonly phoneNumberId?: string
  ) {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export async function resolveTenant(
  phoneNumberId: string | undefined,
  meta?: { requestId?: string; route?: string; method?: string }
): Promise<TenantResolution> {
  const prisma = getPrisma();
  logger.info({
    event: "tenant.resolve.attempt",
    phoneNumberId,
    requestId: meta?.requestId,
    route: meta?.route,
    method: meta?.method,
  });

  if (!phoneNumberId) {
    logger.error({
      event: "tenant.resolve.blocked",
      reason: "missing_phone_number_id",
      phoneNumberId,
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
    });
    throw new TenantResolutionError(
      "missing phone_number_id in webhook payload",
      "missing_phone_number_id"
    );
  }

  const phone = await prisma.waPhoneNumber.findUnique({
    where: { phoneNumberId },
    include: { client: true },
  });

  if (phone?.client) {
    logger.info({
      event: "tenant.resolve.success",
      phoneNumberId,
      clientId: phone.client.id,
      clientKey: phone.client.clientKey,
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
    });
    return {
      clientId: phone.client.id,
      clientKey: phone.client.clientKey,
      phoneNumberId,
    };
  }

  logger.error({
    event: "tenant.resolve.blocked",
    reason: "unmapped_phone_number_id",
    phoneNumberId,
    requestId: meta?.requestId,
    route: meta?.route,
    method: meta?.method,
  });
  throw new TenantResolutionError(
    "phone_number_id not mapped to any client",
    "unmapped_phone_number_id",
    phoneNumberId
  );
}
