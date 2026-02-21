import { env } from "../config/env.js";
import { jsonFileStorage } from "./jsonFileStorage.js";
import { Storage } from "./storage.js";
import { createDualWriteStorage } from "./dualWriteStorage.js";

export function createStorage(): Storage {
  if (env.CONV_STATE_DUAL_WRITE || env.CONV_STATE_SHADOW_COMPARE) {
    return createDualWriteStorage(jsonFileStorage);
  }
  return jsonFileStorage;
}
