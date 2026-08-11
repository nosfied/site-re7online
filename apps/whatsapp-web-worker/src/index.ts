import "dotenv/config";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import { runWhatsAppWebSessionWorker } from "./whatsappWebSessionWorker.js";

const abortController = new AbortController();

process.once("SIGTERM", () => abortController.abort());
process.once("SIGINT", () => abortController.abort());

runWhatsAppWebSessionWorker({ abortSignal: abortController.signal }).catch((error) => {
  logger.error({
    event: "whatsapp.web.worker.error",
    message: error instanceof Error ? error.message : "unknown_error",
  });
  process.exitCode = 1;
});
