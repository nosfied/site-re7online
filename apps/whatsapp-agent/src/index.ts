import "dotenv/config";
import { createServer } from "./http/server.js";
import { env } from "./config/env.js";
import { logger } from "./logger/logger.js";

const server = createServer();

server.listen(env.PORT, () => {
  logger.info(`whatsapp-agent running on :${env.PORT}`);
});
