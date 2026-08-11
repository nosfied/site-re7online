import "dotenv/config";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import { runWhatsAppWebSessionWorker } from "./whatsappWebSessionWorker.js";
import { startWebSessionControlServer } from "./webSessionControlServer.js";

const abortController = new AbortController();
const controlPort = Number(process.env.WHATSAPP_WEB_WORKER_CONTROL_PORT ?? "");
const controlServer = Number.isInteger(controlPort) && controlPort > 0
  ? startWebSessionControlServer({
      port: controlPort,
      host: process.env.WHATSAPP_WEB_WORKER_CONTROL_HOST || "127.0.0.1",
      token: process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN,
    })
  : null;

function shutdown() {
  abortController.abort();
  controlServer?.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

runWhatsAppWebSessionWorker({ abortSignal: abortController.signal }).catch((error) => {
  logger.error({
    event: "whatsapp.web.worker.error",
    message: error instanceof Error ? error.message : "unknown_error",
  });
  process.exitCode = 1;
});
