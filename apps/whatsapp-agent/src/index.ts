import "./bootstrap-env.js";
import { createServer } from "./http/server.js";
import { logger } from "./logger/logger.js";

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

  const server = createServer();
  server.listen(env.PORT, () => {
    logger.info({ event: "server.started", port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error({ event: "bootstrap.failed", error: (error as Error).message });
});
