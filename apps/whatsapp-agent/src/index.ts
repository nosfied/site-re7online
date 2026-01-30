import "./bootstrap-env.js";
import { createServer } from "./http/server.js";
import { logger } from "./logger/logger.js";

async function bootstrap() {
  const { env } = await import("./config/env.js");

  if (!env.verifyTokenPresent) {
    logger.error("whatsapp: missing WHATSAPP_VERIFY_TOKEN");
  }
  if (!env.outboundEnabled) {
    if (!env.accessTokenPresent) {
      logger.error("whatsapp: missing WHATSAPP_ACCESS_TOKEN (outbound disabled)");
    }
    if (!env.phoneNumberIdPresent) {
      logger.error("whatsapp: missing WHATSAPP_PHONE_NUMBER_ID (outbound disabled)");
    }
  }

  const server = createServer();
  server.listen(env.PORT, () => {
    logger.info(`whatsapp-agent running on :${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error(`bootstrap failed: ${(error as Error).message}`);
});
