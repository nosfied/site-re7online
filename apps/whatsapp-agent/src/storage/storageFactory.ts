import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { jsonFileStorage } from "./jsonFileStorage.js";
import { Storage } from "./storage.js";
import { createDualWriteStorage } from "./dualWriteStorage.js";

type EffectiveStorageMode = "json" | "hybrid";

function resolveStorageMode(): {
  requestedMode: "json" | "hybrid" | "postgres";
  effectiveMode: EffectiveStorageMode;
  source: "default" | "legacy_flags" | "storage_mode";
  fallbackReason?: "postgres_not_implemented";
} {
  if (env.STORAGE_MODE_SET) {
    if (env.STORAGE_MODE === "postgres") {
      return {
        requestedMode: env.STORAGE_MODE,
        effectiveMode: "json",
        source: "storage_mode",
        fallbackReason: "postgres_not_implemented",
      };
    }
    return {
      requestedMode: env.STORAGE_MODE,
      effectiveMode: env.STORAGE_MODE,
      source: "storage_mode",
    };
  }

  if (env.CONV_STATE_DUAL_WRITE || env.CONV_STATE_SHADOW_COMPARE) {
    return {
      requestedMode: "hybrid",
      effectiveMode: "hybrid",
      source: "legacy_flags",
    };
  }

  return {
    requestedMode: "json",
    effectiveMode: "json",
    source: "default",
  };
}

export function createStorage(): Storage {
  const mode = resolveStorageMode();
  if (mode.fallbackReason) {
    logger.warn({
      event: "storage.mode.fallback",
      requestedMode: mode.requestedMode,
      effectiveMode: mode.effectiveMode,
      reason: mode.fallbackReason,
    });
  } else {
    logger.info({
      event: "storage.mode.resolved",
      requestedMode: mode.requestedMode,
      effectiveMode: mode.effectiveMode,
      source: mode.source,
    });
  }

  if (mode.effectiveMode === "hybrid") {
    return createDualWriteStorage(jsonFileStorage);
  }
  return jsonFileStorage;
}
