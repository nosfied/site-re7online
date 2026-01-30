import "dotenv/config";
import { createServer } from "./http/server.js";
import { env } from "./config/env.js";
import { logger } from "./logger/logger.js";

if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
  logger.warn("whatsapp: access token or phone number id not set");
}

const server = createServer();

server.listen(env.PORT, () => {
  logger.info(`whatsapp-agent running on :${env.PORT}`);
});
