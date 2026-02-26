import { logger } from "./logger/logger.js";

function exitSoon(code: number) {
  setTimeout(() => {
    process.exit(code);
  }, 50);
}

process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    logger.error({
      event: "process.unhandledRejection",
      reason: reason.message,
      stack: reason.stack,
    });
  } else {
    logger.error({
      event: "process.unhandledRejection",
      reason: String(reason),
      reasonType: typeof reason,
    });
  }
  exitSoon(1);
});

process.on("uncaughtException", (error) => {
  logger.error({
    event: "process.uncaughtException",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  exitSoon(1);
});
