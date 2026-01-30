import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./http/server.js";
import { logger } from "./logger/logger.js";

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const { config } = await import("dotenv");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envPath = path.resolve(__dirname, "../.env");
    config({ path: envPath, override: false });
  }

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
