import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { jsonFileStorage } from "./jsonFileStorage.js";
import { Storage } from "./storage.js";
import { createDualWriteStorage } from "./dualWriteStorage.js";

type EffectiveStorageMode = "json" | "hybrid";
type EffectiveReadSource = "json" | "hybrid";

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

function resolveConversationReadSource(): {
  requestedReadSource: "json" | "hybrid" | "postgres";
  effectiveReadSource: EffectiveReadSource;
  source: "default" | "legacy_flags" | "read_source";
  fallbackReason?: "postgres_not_authoritative_yet";
} {
  if (env.CONV_STATE_READ_SOURCE_SET) {
    if (env.CONV_STATE_READ_SOURCE === "postgres") {
      return {
        requestedReadSource: env.CONV_STATE_READ_SOURCE,
        effectiveReadSource: "hybrid",
        source: "read_source",
        fallbackReason: "postgres_not_authoritative_yet",
      };
    }
    return {
      requestedReadSource: env.CONV_STATE_READ_SOURCE,
      effectiveReadSource: env.CONV_STATE_READ_SOURCE,
      source: "read_source",
    };
  }

  if (env.CONV_STATE_SHADOW_COMPARE) {
    return {
      requestedReadSource: "hybrid",
      effectiveReadSource: "hybrid",
      source: "legacy_flags",
    };
  }

  return {
    requestedReadSource: "json",
    effectiveReadSource: "json",
    source: "default",
  };
}

export function createStorage(): Storage {
  const mode = resolveStorageMode();
  const readSource = resolveConversationReadSource();
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

  if (readSource.fallbackReason) {
    logger.warn({
      event: "storage.read_source.fallback",
      requestedReadSource: readSource.requestedReadSource,
      effectiveReadSource: readSource.effectiveReadSource,
      reason: readSource.fallbackReason,
    });
  } else {
    logger.info({
      event: "storage.read_source.resolved",
      requestedReadSource: readSource.requestedReadSource,
      effectiveReadSource: readSource.effectiveReadSource,
      source: readSource.source,
    });
  }

  if (mode.effectiveMode === "hybrid" || readSource.effectiveReadSource === "hybrid") {
    return createDualWriteStorage(jsonFileStorage, {
      readSource: readSource.effectiveReadSource,
    });
  }
  return jsonFileStorage;
}
