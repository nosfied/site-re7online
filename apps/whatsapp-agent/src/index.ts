import "./bootstrap-env.js";
import { createServer } from "./http/server.js";
import { logger } from "./logger/logger.js";
import { prisma } from "./db.js";

async function bootstrap() {
  const { env } = await import("./config/env.js");

  if (!env.verifyTokenPresent) {
    logger.error({ event: "env.missing", key: "WHATSAPP_VERIFY_TOKEN" });
  }
  if (!env.outboundEnabled) {
    if (!env.accessTokenPresent) {
      logger.error({
        event: "env.missing",
        key: "WHATSAPP_ACCESS_TOKEN",
        note: "outbound_disabled",
      });
    }
    if (!env.phoneNumberIdPresent) {
      logger.error({
        event: "env.missing",
        key: "WHATSAPP_PHONE_NUMBER_ID",
        note: "outbound_disabled",
      });
    }
  }

  try {
    const client = await prisma.client.upsert({
      where: { clientKey: "default" },
      update: {},
      create: { clientKey: "default", name: "Default" },
    });
    if (env.WHATSAPP_PHONE_NUMBER_ID) {
      const phone = await prisma.waPhoneNumber.upsert({
        where: { phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID },
        update: {
          clientId: client.id,
          display: env.WHATSAPP_PHONE_NUMBER_ID,
        },
        create: {
          clientId: client.id,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          display: env.WHATSAPP_PHONE_NUMBER_ID,
        },
      });
      logger.info({
        event: "bootstrap.tenant.ready",
        clientId: client.id,
        phoneNumberId: phone.phoneNumberId,
      });
    } else {
      logger.warn({
        event: "bootstrap.tenant.skipped",
        reason: "missing_phone_number_id",
      });
    }
  } catch (error) {
    logger.error({
      event: "bootstrap.tenant.error",
      message: (error as Error).message,
    });
  }

  const server = createServer();
  server.listen(env.PORT, () => {
    logger.info({ event: "server.started", port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error({ event: "bootstrap.failed", error: (error as Error).message });
});
